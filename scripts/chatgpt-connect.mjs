import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer, request } from "node:http";
import { pathToFileURL } from "node:url";

const validPort = (port) =>
  Number.isInteger(port) && port >= 1024 && port <= 65535;
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function parseForwardedPort(output, { serviceId, remotePort }) {
  const text = output.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
  const match = new RegExp(
    `Service '${escapeRegex(serviceId)}' port ${remotePort} \\([^\\n)]*\\) is exposed locally on 127\\.0\\.0\\.1:(\\d+)(?=\\s|$)`,
  ).exec(text);
  const port = match ? Number(match[1]) : undefined;
  return validPort(port) ? port : undefined;
}

function reply(res, status, message) {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(message);
}

export function createBridgeServer({
  getTargetPort,
  upstreamTimeoutMs = 45000,
}) {
  const server = createServer((req, res) => {
    const host = `127.0.0.1:${server.address().port}`;
    if (
      req.headers.host !== host ||
      !req.url?.startsWith("/") ||
      req.url.startsWith("//")
    ) {
      reply(res, 400, "Chỉ chấp nhận địa chỉ loopback của công cụ kết nối.");
      return;
    }
    if (req.method !== "GET") {
      reply(res, 405, "Chỉ hỗ trợ GET.");
      return;
    }
    const pathname = req.url.split("?")[0];
    const target = getTargetPort();
    if (pathname === "/health") {
      res.writeHead(validPort(target) ? 200 : 503, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify({ ready: validPort(target) }));
      return;
    }
    if (!["/chatgpt/authorize", "/chatgpt/callback"].includes(pathname)) {
      reply(res, 404, "Công cụ chỉ phục vụ kết nối ChatGPT.");
      return;
    }
    if (!validPort(target)) {
      reply(res, 503, "Đang chờ forwarding tới API production.");
      return;
    }
    const headers = { host };
    if (req.headers.cookie) {
      const bindingCookies = req.headers.cookie
        .split(";")
        .map((value) => value.trim())
        .filter((value) => value.startsWith("kb_chatgpt_"))
        .join("; ");
      if (bindingCookies) headers.cookie = bindingCookies;
    }
    const upstream = request(
      {
        hostname: "127.0.0.1",
        port: target,
        method: "GET",
        path: req.url,
        headers,
      },
      (incoming) => {
        // Preserve Location and Set-Cookie; never inspect or log OAuth values.
        res.writeHead(incoming.statusCode ?? 502, incoming.headers);
        incoming.on("error", () => res.destroy());
        incoming.pipe(res);
      },
    );
    upstream.setTimeout(upstreamTimeoutMs, () => upstream.destroy());
    upstream.on("error", () =>
      reply(
        res,
        503,
        "Đường hầm chưa sẵn sàng hoặc đã ngắt. Chạy lại npm run chatgpt:connect.",
      ),
    );
    res.on("close", () => upstream.destroy());
    req.resume();
    upstream.end();
  });
  // Node's normal HTTP timeout bounds slow/unfinished local requests.
  server.requestTimeout = 15000;
  return server;
}

async function stopChild(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null)
    return;
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 3000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

function validateConfig(config) {
  const web = new URL(config.webOrigin);
  if (
    web.protocol !== "https:" ||
    web.username ||
    web.password ||
    web.pathname !== "/" ||
    web.search ||
    web.hash
  )
    throw new Error("Địa chỉ giao diện production phải là một origin HTTPS.");
  if (!validPort(config.localPort) || !validPort(config.remotePort))
    throw new Error("Cổng kết nối phải nằm trong khoảng 1024–65535.");
  if (
    ![config.projectId, config.serviceId].every(
      (value) => typeof value === "string" && /^[a-zA-Z0-9][\w-]*$/.test(value),
    )
  )
    throw new Error("Project/service Northflank không hợp lệ.");
}

export async function startConnector(
  config,
  {
    spawnForwarder = () =>
      spawn(
        process.env.NORTHFLANK_BIN || "northflank",
        [
          "forward",
          "service",
          "--projectId",
          config.projectId,
          "--serviceId",
          config.serviceId,
          "--skipHostnames",
        ],
        { shell: false, stdio: ["ignore", "pipe", "pipe"] },
      ),
    startupTimeoutMs = 45000,
  } = {},
) {
  validateConfig(config);
  let targetPort,
    child,
    stopping = false,
    checking = false,
    output = "";
  let resolveReady, rejectReady, resolveClosed;
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  // A child can fail before startConnector's caller attaches its await.
  void ready.catch(() => {});
  const closed = new Promise((resolve) => {
    resolveClosed = resolve;
  });
  const server = createBridgeServer({ getTargetPort: () => targetPort });
  const healthAbort = new AbortController();
  await new Promise((resolve, reject) => {
    server.once("error", (error) =>
      reject(
        new Error(
          error.code === "EADDRINUSE"
            ? `Cổng ${config.localPort} đang được sử dụng. Tắt công cụ kết nối cũ rồi thử lại.`
            : "Không mở được cổng kết nối local.",
        ),
      ),
    );
    server.listen(config.localPort, "127.0.0.1", resolve);
  });
  const stop = (error) => {
    if (stopping) return closed;
    stopping = true;
    targetPort = undefined;
    healthAbort.abort();
    clearTimeout(startupTimer);
    rejectReady(error || new Error("Đã dừng công cụ trước khi sẵn sàng."));
    server.closeAllConnections();
    void Promise.all([
      new Promise((resolve) => server.close(resolve)),
      stopChild(child),
    ]).finally(() => resolveClosed({ error }));
    return closed;
  };
  const startupTimer = setTimeout(
    () =>
      void stop(
        new Error(
          "Hết thời gian chờ forwarding. Kiểm tra Northflank CLI và kết nối mạng.",
        ),
      ),
    startupTimeoutMs,
  );
  server.on("error", () => void stop(new Error("Cổng kết nối local gặp lỗi.")));
  try {
    child = spawnForwarder();
    child.once(
      "error",
      () =>
        void stop(
          new Error(
            "Không chạy được Northflank CLI. Cài CLI và chạy northflank login trước.",
          ),
        ),
    );
    child.once(
      "exit",
      () =>
        void stop(
          new Error(
            "Northflank forwarding đã dừng. Kiểm tra đăng nhập bằng northflank login rồi chạy lại công cụ.",
          ),
        ),
    );
    const read = (chunk) => {
      // CLI output may be chunked, coloured, or contain several forwarded ports.
      output = (output + chunk.toString()).slice(-16384);
      if (checking || stopping) return;
      // Wait for a complete line so a split port number is not misread.
      const lastLine = output.lastIndexOf("\n");
      const found = parseForwardedPort(output.slice(0, lastLine + 1), config);
      if (!found) return;
      checking = true;
      void (async () => {
        try {
          const health = await fetch(`http://127.0.0.1:${found}/health`, {
            redirect: "error",
            signal: AbortSignal.any([
              healthAbort.signal,
              AbortSignal.timeout(8000),
            ]),
          });
          if (!health.ok || (await health.json()).ok !== true)
            throw new Error();
          if (stopping) return;
          targetPort = found;
          clearTimeout(startupTimer);
          resolveReady();
        } catch {
          void stop(
            new Error(
              "Forwarding chưa kết nối được tới API production. Kiểm tra service và chạy lại.",
            ),
          );
        }
      })();
    };
    child.stdout.on("data", read);
    // Consume stderr without copying CLI authentication details to logs.
    child.stderr.on("data", () => {});
  } catch {
    void stop(
      new Error(
        "Không khởi động được Northflank CLI. Cài CLI và chạy northflank login trước.",
      ),
    );
  }
  return { server, ready, closed, stop };
}

async function openWeb(origin) {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "linux"
        ? "xdg-open"
        : undefined;
  if (!command) return;
  await new Promise((resolve) => {
    const browser = spawn(command, [origin], { shell: false, stdio: "ignore" });
    browser.once("error", resolve);
    browser.once("exit", resolve);
  });
}

async function main() {
  if (process.argv.includes("--help")) {
    console.log(
      "npm run chatgpt:connect [-- --no-open]\nMở kết nối ChatGPT cá nhân qua cổng local cố định. Cần northflank login trước.",
    );
    return;
  }
  if (process.argv.slice(2).some((arg) => arg !== "--no-open"))
    throw new Error("Chỉ hỗ trợ tùy chọn --no-open hoặc --help.");
  const config = JSON.parse(
    readFileSync(
      new URL("../config/chatgpt-forwarding.json", import.meta.url),
      "utf8",
    ),
  );
  const connector = await startConnector(config);
  let interrupted = false;
  const interrupt = () => {
    interrupted = true;
    void connector.stop();
  };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  try {
    console.log("Đang mở kết nối tới API production…");
    await connector.ready;
    console.log(
      `Sẵn sàng tại 127.0.0.1:${config.localPort}. Mở ${config.webOrigin}, chọn Tiếp tục với ChatGPT.\nGiữ terminal này mở tới khi đăng nhập xong. Nhấn Ctrl+C để dừng.`,
    );
    if (!process.argv.includes("--no-open")) await openWeb(config.webOrigin);
    const result = await connector.closed;
    if (result.error) throw result.error;
  } catch (error) {
    if (!interrupted) {
      console.error(error.message);
      process.exitCode = 1;
    }
  } finally {
    await connector.stop();
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
  }
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, request } from "node:http";
import { spawn } from "node:child_process";
import { test } from "node:test";
import {
  createBridgeServer,
  parseForwardedPort,
  startConnector,
} from "./chatgpt-connect.mjs";

const settings = {
  localPort: 18080,
  remotePort: 4000,
  projectId: "default",
  serviceId: "interview-kb",
  webOrigin: "https://app.interviewbase.site",
};
const announcement = (port) =>
  `> Service 'interview-kb' port 4000 (p01 - HTTP) is exposed locally on 127.0.0.1:${port}\n`;
async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}
async function close(server) {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
async function freePort() {
  const server = createServer();
  const port = await listen(server);
  await close(server);
  return port;
}
function forwarder(output, exit = false) {
  return () =>
    spawn(
      process.execPath,
      [
        "-e",
        `process.stdout.write(${JSON.stringify(output)});${exit ? "" : "setInterval(()=>{},1000);"}`,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
}

test("reads the intended service/port only, including ANSI formatting", () => {
  assert.equal(
    parseForwardedPort(`\x1b[32m${announcement(61132)}\x1b[0m`, settings),
    61132,
  );
  assert.equal(
    parseForwardedPort(announcement(61132).slice(0, 65), settings),
    undefined,
  );
  for (const line of [
    announcement(61132).replace("interview-kb", "other-service"),
    announcement(61132).replace("port 4000", "port 5432"),
    announcement(61132).replace("127.0.0.1", "0.0.0.0"),
    announcement(80),
    announcement(65536),
  ])
    assert.equal(parseForwardedPort(line, settings), undefined);
});

test("proxies OAuth redirects and cookies with the fixed loopback Host", async () => {
  const seen = [];
  const upstream = createServer((req, res) => {
    seen.push({
      url: req.url,
      host: req.headers.host,
      cookie: req.headers.cookie,
    });
    res.writeHead(302, {
      Location: "https://auth.openai.com/example",
      "Set-Cookie":
        "kb_chatgpt_state=binding; Path=/chatgpt/callback; HttpOnly; SameSite=Lax",
    });
    res.end();
  });
  const target = await listen(upstream);
  const bridge = createBridgeServer({ getTargetPort: () => target });
  const port = await listen(bridge);
  try {
    const auth = await fetch(
      `http://127.0.0.1:${port}/chatgpt/authorize?ticket=opaque`,
      { redirect: "manual" },
    );
    assert.equal(auth.status, 302);
    assert.equal(
      auth.headers.get("location"),
      "https://auth.openai.com/example",
    );
    assert.match(auth.headers.get("set-cookie"), /HttpOnly/);
    await fetch(`http://127.0.0.1:${port}/chatgpt/callback?state=opaque`, {
      redirect: "manual",
      headers: { Cookie: "unrelated=local-secret; kb_chatgpt_state=binding" },
    });
    assert.deepEqual(seen, [
      {
        url: "/chatgpt/authorize?ticket=opaque",
        host: `127.0.0.1:${port}`,
        cookie: undefined,
      },
      {
        url: "/chatgpt/callback?state=opaque",
        host: `127.0.0.1:${port}`,
        cookie: "kb_chatgpt_state=binding",
      },
    ]);
  } finally {
    await close(bridge);
    await close(upstream);
  }
});

test("does not expose a general API proxy and rejects foreign Host headers", async () => {
  const bridge = createBridgeServer({ getTargetPort: () => 65530 });
  const port = await listen(bridge);
  try {
    const root = `http://127.0.0.1:${port}`;
    assert.equal((await fetch(root + "/notes")).status, 404);
    assert.equal(
      (await fetch(root + "/chatgpt/authorize", { method: "POST" })).status,
      405,
    );
    const foreignHost = await new Promise((resolve) => {
      const req = request(
        {
          hostname: "127.0.0.1",
          port,
          path: "/health",
          headers: { Host: "evil.test" },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      );
      req.end();
    });
    assert.equal(foreignHost, 400);
  } finally {
    await close(bridge);
  }
});

test("reports not-ready and unavailable upstream without leaking the request URL", async () => {
  let target;
  const bridge = createBridgeServer({ getTargetPort: () => target });
  const port = await listen(bridge);
  try {
    assert.equal((await fetch(`http://127.0.0.1:${port}/health`)).status, 503);
    target = await freePort();
    const failure = await fetch(
      `http://127.0.0.1:${port}/chatgpt/callback?code=private-code`,
    );
    assert.equal(failure.status, 503);
    assert.doesNotMatch(await failure.text(), /private-code/);
  } finally {
    await close(bridge);
  }
});

test("fails on an occupied fixed port before starting a tunnel", async () => {
  const occupied = createServer();
  const port = await listen(occupied);
  let spawned = false;
  try {
    await assert.rejects(
      startConnector(
        { ...settings, localPort: port },
        {
          spawnForwarder: () => {
            spawned = true;
            throw new Error("not called");
          },
        },
      ),
      /đang được sử dụng/,
    );
    assert.equal(spawned, false);
  } finally {
    await close(occupied);
  }
});

test("discovers a split announcement, verifies health and shuts down cleanly", async () => {
  const upstream = createServer((_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end('{"ok":true}');
  });
  const target = await listen(upstream);
  const port = await freePort();
  const text = announcement(target);
  let child;
  const connector = await startConnector(
    { ...settings, localPort: port },
    {
      spawnForwarder: () => {
        child = spawn(
          process.execPath,
          [
            "-e",
            `process.stdout.write(${JSON.stringify(text.slice(0, 40))});setTimeout(()=>process.stdout.write(${JSON.stringify(text.slice(40))}),10);setInterval(()=>{},1000);`,
          ],
          { stdio: ["ignore", "pipe", "pipe"] },
        );
        return child;
      },
    },
  );
  try {
    await connector.ready;
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ready: true });
  } finally {
    await connector.stop();
    await connector.stop();
    await close(upstream);
  }
  assert.ok(child.exitCode !== null || child.signalCode !== null);
  const replacement = createServer();
  replacement.listen(port, "127.0.0.1");
  await once(replacement, "listening");
  await close(replacement);
});

test("closes the bridge when CLI exits before readiness", async () => {
  const port = await freePort();
  const connector = await startConnector(
    { ...settings, localPort: port },
    {
      spawnForwarder: forwarder("No CLI context present", true),
    },
  );
  await assert.rejects(connector.ready, /Northflank/);
  assert.ok((await connector.closed).error);
  assert.equal(connector.server.listening, false);
});

test("times out an unready tunnel and terminates it", async () => {
  const connector = await startConnector(
    { ...settings, localPort: await freePort() },
    {
      spawnForwarder: forwarder("waiting"),
      startupTimeoutMs: 80,
    },
  );
  await assert.rejects(connector.ready, /thời gian/);
  await connector.closed;
  assert.equal(connector.server.listening, false);
});

test("cleans up when an established tunnel process exits", async () => {
  const upstream = createServer((_req, res) => res.end('{"ok":true}'));
  const target = await listen(upstream);
  let child;
  const connector = await startConnector(
    { ...settings, localPort: await freePort() },
    {
      spawnForwarder: () => {
        child = forwarder(announcement(target))();
        return child;
      },
    },
  );
  try {
    await connector.ready;
    child.kill("SIGTERM");
    assert.ok((await connector.closed).error);
    assert.equal(connector.server.listening, false);
  } finally {
    await connector.stop();
    await close(upstream);
  }
});

test("handles a missing CLI executable without leaving the fixed port open", async () => {
  const connector = await startConnector(
    { ...settings, localPort: await freePort() },
    {
      spawnForwarder: () => spawn("/nonexistent-northflank-test", []),
    },
  );
  await assert.rejects(connector.ready, /Northflank CLI/);
  await connector.closed;
  assert.equal(connector.server.listening, false);
});

test("cancels an in-flight readiness request when stopped", async () => {
  const upstream = createServer(() => {});
  const target = await listen(upstream);
  const received = once(upstream, "request");
  const connector = await startConnector(
    { ...settings, localPort: await freePort() },
    {
      spawnForwarder: forwarder(announcement(target)),
    },
  );
  const stopped = assert.rejects(connector.ready, /dừng/);
  try {
    await received;
    await connector.stop();
    await stopped;
    assert.equal(connector.server.listening, false);
  } finally {
    await connector.stop();
    await close(upstream);
  }
});

test("rejects an unsafe production origin before starting", async () => {
  await assert.rejects(
    startConnector({ ...settings, webOrigin: "http://evil.test" }),
    /HTTPS/,
  );
});

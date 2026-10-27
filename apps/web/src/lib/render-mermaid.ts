import { loadMermaid } from "./load-mermaid";
/** Mermaid maintains global configuration; serialize renders and isolate temporary DOM. */
let queue: Promise<unknown> = Promise.resolve();
let nextId = 0;
export function renderMermaid(
  source: string,
  signal: AbortSignal,
): Promise<string> {
  const task = queue.then(async () => {
    if (signal.aborted) throw new Error("Render cancelled");
    if (source.length > 20000)
      throw new Error("Sơ đồ quá dài (tối đa 20.000 ký tự).");
    if (/%%\s*\{|^\s*---/.test(source))
      throw new Error("Không hỗ trợ cấu hình nhúng trong sơ đồ.");
    const [mermaid, { default: DOMPurify }] = await Promise.all([
      loadMermaid(),
      import("dompurify"),
    ]);
    if (signal.aborted) throw new Error("Render cancelled");
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "dark",
      fontFamily: "Arial, sans-serif",
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      suppressErrorRendering: true,
      maxTextSize: 20000,
      maxEdges: 200,
      secure: [
        "secure",
        "securityLevel",
        "startOnLoad",
        "maxTextSize",
        "maxEdges",
        "suppressErrorRendering",
        "htmlLabels",
        "fontFamily",
      ],
    });
    const host = document.createElement("div");
    host.setAttribute("aria-hidden", "true");
    host.style.cssText =
      "position:fixed;left:-100000px;top:0;pointer-events:none;";
    document.body.appendChild(host);
    try {
      const { svg } = await mermaid.render(
        `kb-mermaid-${++nextId}`,
        source,
        host,
      );
      return DOMPurify.sanitize(svg, {
        USE_PROFILES: { svg: true, svgFilters: true },
        FORBID_TAGS: ["foreignObject", "script", "image", "a"],
      });
    } finally {
      host.remove();
    }
  });
  queue = task.catch(() => {});
  return task;
}

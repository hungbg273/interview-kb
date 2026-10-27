"use client";
import { Children, isValidElement, useEffect, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { renderMermaid } from "@/lib/render-mermaid";

function MermaidDiagram({ source }: { source: string }) {
  const [state, setState] = useState<{
    source: string;
    svg?: string;
    error?: string;
  }>({ source });
  useEffect(() => {
    const abort = new AbortController();
    void renderMermaid(source, abort.signal)
      .then((svg) => {
        if (!abort.signal.aborted) setState({ source, svg });
      })
      .catch((error) => {
        if (!abort.signal.aborted)
          setState({
            source,
            error: error instanceof Error ? error.message : "Lỗi sơ đồ",
          });
      });
    return () => abort.abort();
  }, [source]);
  const current = state.source === source ? state : { source };
  return (
    <div className="mermaid-preview">
      {current.svg ? (
        <img
          alt="Sơ đồ Mermaid"
          src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(current.svg)}`}
        />
      ) : current.error ? (
        <>
          <p role="alert">
            Không thể hiển thị sơ đồ. Kiểm tra cú pháp Mermaid.
          </p>
          <details open>
            <summary>Mã sơ đồ</summary>
            <pre>
              <code>{source}</code>
            </pre>
          </details>
        </>
      ) : (
        <p role="status">Đang vẽ sơ đồ…</p>
      )}
    </div>
  );
}
const components: Components = {
  pre({ children }) {
    const child = Children.toArray(children)[0];
    if (
      isValidElement<{ className?: string; children?: React.ReactNode }>(
        child,
      ) &&
      /(?:^|\s)language-mermaid(?:\s|$)/i.test(child.props.className ?? "")
    )
      return (
        <MermaidDiagram
          source={String(child.props.children ?? "").replace(/\n$/, "")}
        />
      );
    return <pre>{children}</pre>;
  },
};
export function MarkdownPreview({ markdown }: { markdown: string }) {
  return (
    <div className="markdown-content markdown-preview">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

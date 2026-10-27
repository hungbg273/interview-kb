import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
const { renderDiagram, initialize } = vi.hoisted(() => ({
  renderDiagram: vi.fn(),
  initialize: vi.fn(),
}));
vi.mock("@/lib/load-mermaid", () => ({
  loadMermaid: async () => ({ initialize, render: renderDiagram }),
}));
import { MarkdownPreview } from "./MarkdownPreview";
afterEach(() => {
  cleanup();
  renderDiagram.mockReset();
});
test("renders Markdown headings, tables, and ordinary code", () => {
  render(
    <MarkdownPreview
      markdown={
        "# Heading\n\n| A | B |\n| --- | --- |\n| one | two |\n\n```ts\nconst n = 1;\n```"
      }
    />,
  );
  expect(screen.getByRole("heading", { name: "Heading" })).toBeInTheDocument();
  expect(screen.getByRole("table")).toBeInTheDocument();
  expect(screen.getByText("const n = 1;")).toBeInTheDocument();
  expect(renderDiagram).not.toHaveBeenCalled();
});
test("renders a mermaid fence as sanitized SVG with strict configuration", async () => {
  renderDiagram.mockResolvedValue({
    svg: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><text>API</text></svg>',
  });
  render(
    <MarkdownPreview
      markdown={'```mermaid\nflowchart LR\n A["API"] --> B["Queue"]\n```'}
    />,
  );
  const diagram = await screen.findByRole("img", { name: "Sơ đồ Mermaid" });
  const svg = decodeURIComponent(
    diagram.getAttribute("src")!.split(",").slice(1).join(","),
  );
  expect(svg).toContain("<svg");
  expect(svg).not.toContain("<script");
  expect(initialize).toHaveBeenCalledWith(
    expect.objectContaining({ securityLevel: "strict", startOnLoad: false }),
  );
});
test("shows invalid diagram source without breaking other Markdown", async () => {
  renderDiagram.mockRejectedValue(new Error("Parse error"));
  render(
    <MarkdownPreview markdown={"# Note\n\n```mermaid\ninvalid diagram\n```"} />,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Không thể hiển thị sơ đồ",
  );
  expect(screen.getByText("invalid diagram")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Note" })).toBeInTheDocument();
});
test("ignores a stale render when the source changes", async () => {
  let finish: (value: { svg: string }) => void = () => {};
  renderDiagram
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue({ svg: "<svg><text>New</text></svg>" });
  const view = render(
    <MarkdownPreview markdown={"```mermaid\nflowchart LR\n A-->B\n```"} />,
  );
  await waitFor(() => expect(renderDiagram).toHaveBeenCalledOnce());
  view.rerender(
    <MarkdownPreview markdown={"```mermaid\nflowchart LR\n C-->D\n```"} />,
  );
  finish({ svg: "<svg><text>Old</text></svg>" });
  await waitFor(() =>
    expect(
      decodeURIComponent(screen.getByRole("img").getAttribute("src")!),
    ).toContain("New"),
  );
  expect(screen.queryByText("Old")).toBeNull();
});

test.each(['%%{init: {"securityLevel":"loose"}}%%\nflowchart LR\nA-->B','---\nconfig:\n securityLevel: loose\n---\nflowchart LR\nA-->B','x'.repeat(20001)])('rejects embedded configuration and oversized diagram sources',async(source)=>{
 render(<MarkdownPreview markdown={'```mermaid\n'+source+'\n```'} />);
 expect(await screen.findByRole('alert')).toHaveTextContent('Không thể hiển thị sơ đồ');
 expect(renderDiagram).not.toHaveBeenCalled();
});

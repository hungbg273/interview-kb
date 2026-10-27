"use client";

import { useEffect, useId, useRef, useState } from "react";
import { WorkspaceIcon } from "./WorkspaceIcon";
import { WorkspaceLink } from "./WorkspaceNavigation";

/** Shared note chrome; collapsing a panel never unmounts unsaved editor state. */
export function NoteWorkspace({
  title,
  dirty = false,
  left,
  right,
  children,
}: {
  title: string;
  dirty?: boolean;
  left: React.ReactNode;
  right: React.ReactNode;
  children: React.ReactNode;
}) {
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [narrow, setNarrow] = useState(false);
  const stage = useRef<HTMLElement>(null);
  const leftPanel = useRef<HTMLElement>(null);
  const rightPanel = useRef<HTMLElement>(null);
  const id = useId();
  const leftToggle = useRef<HTMLButtonElement>(null);
  const rightToggle = useRef<HTMLButtonElement>(null);
  const lastPanel = useRef<"left" | "right">("left");
  useEffect(() => {
    const media = window.matchMedia?.("(max-width: 900px)");
    if (!media) return;
    const update = ({ matches }: { matches: boolean }) => {
      setNarrow(matches);
      if (matches) {
        setLeftOpen(false);
        setRightOpen(false);
      }
    };
    update(media);
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  useEffect(() => {
    const overlay = narrow && (leftOpen || rightOpen);
    stage.current?.toggleAttribute("inert", overlay);
    if (overlay) (leftOpen ? leftPanel : rightPanel).current?.focus();
  }, [narrow, leftOpen, rightOpen]);
  function toggle(side: "left" | "right") {
    lastPanel.current = side;
    if (side === "left") {
      setLeftOpen((value) => !value);
      if (narrow) setRightOpen(false);
    } else {
      setRightOpen((value) => !value);
      if (narrow) setLeftOpen(false);
    }
  }
  function closePanels() {
    setLeftOpen(false);
    setRightOpen(false);
    (lastPanel.current === "left" ? leftToggle : rightToggle).current?.focus();
  }
  return (
    <main
      className={`board note-board${leftOpen ? "" : " left-closed"}${rightOpen ? "" : " right-closed"}`}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          closePanels();
        }
      }}
    >
      <div className="workspace-tabbar note-toolbar">
        <button
          ref={leftToggle}
          type="button"
          className="icon-button"
          aria-label={
            leftOpen ? "Ẩn danh sách ghi chú" : "Hiện danh sách ghi chú"
          }
          title="Danh sách ghi chú"
          aria-expanded={leftOpen}
          aria-controls={`${id}-left`}
          onClick={() => toggle("left")}
        >
          <WorkspaceIcon name="panel" />
        </button>
        <div className="note-location">
          <WorkspaceIcon name="note" />
          <span title={title}>{title || "Ghi chú mới"}</span>
          {dirty && (
            <span className="unsaved-dot" aria-label="Có thay đổi chưa lưu" />
          )}
        </div>
        <WorkspaceLink
          href="/notes/new"
          className="tab-new"
          aria-label="Tạo ghi chú mới"
          title="Tạo ghi chú mới"
        >
          <WorkspaceIcon name="plus" />
        </WorkspaceLink>
        <button
          ref={rightToggle}
          type="button"
          className="icon-button right-toggle"
          aria-label={
            rightOpen ? "Ẩn đồ thị và công cụ" : "Hiện đồ thị và công cụ"
          }
          title="Đồ thị và công cụ"
          aria-expanded={rightOpen}
          aria-controls={`${id}-right`}
          onClick={() => toggle("right")}
        >
          <WorkspaceIcon name="panel" />
        </button>
      </div>
      {narrow && (leftOpen || rightOpen) && (
        <button
          type="button"
          className="workspace-scrim"
          tabIndex={-1}
          aria-label="Đóng bảng bên"
          onClick={closePanels}
        />
      )}
      <aside
        ref={leftPanel}
        tabIndex={-1}
        id={`${id}-left`}
        className="rail"
        aria-label="Danh sách ghi chú"
        hidden={!leftOpen}
      >
        {left}
      </aside>
      <section ref={stage} className="stage" aria-label="Nội dung ghi chú">
        {children}
      </section>
      <aside
        ref={rightPanel}
        tabIndex={-1}
        id={`${id}-right`}
        className="quiz note-workspace-sidebar"
        aria-label="Đồ thị và công cụ"
        hidden={!rightOpen}
      >
        {right}
      </aside>
      <footer className="workspace-status">
        <span role="status">
          {dirty ? "Chưa lưu thay đổi" : "Không có thay đổi chưa lưu"}
        </span>
        <span>Không gian kiến thức</span>
      </footer>
    </main>
  );
}

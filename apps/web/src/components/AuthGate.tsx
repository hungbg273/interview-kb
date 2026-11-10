"use client";

import { WorkspaceLink, useCanNavigate } from "./WorkspaceNavigation";
import { WorkspaceIcon } from "./WorkspaceIcon";
import { getMe } from "@/lib/auth";
import { api } from "@/lib/api";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const canNavigate = useCanNavigate();
  const path = usePathname();
  const replaceRef = useRef(router.replace);
  replaceRef.current = router.replace;
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuToggle = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => { setMenuOpen(false); }, [path]);
  const pageTitle = path.startsWith('/practice') ? 'Luyện tập' : path.startsWith('/community') ? 'Cộng đồng' : path.startsWith('/interview') ? 'Phỏng vấn thử' : 'Ghi chú';

  useEffect(() => {
    let cancelled = false;
    let revision = 0;
    let hasSession = false;
    const check = async () => {
      const request = ++revision;
      try {
        const me = await getMe();
        if (cancelled || request !== revision) return;
        hasSession = !!me;
        setEmail(me?.email ?? null);
        if (!me) replaceRef.current("/login");
      } catch {
        if (!cancelled && request === revision && !hasSession) {
          setEmail(null);
          replaceRef.current("/login");
        }
      } finally {
        if (!cancelled && request === revision) setReady(true);
      }
    };
    const focus = () => {
      if (!document.hidden) void check();
    };
    void check();
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, []);

  if (!ready || !email) return <main className="empty">Đang tải…</main>;

  async function logout() {
    if (!canNavigate()) return;
    await api("/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <div className="workspace-shell" key={email}>
      <a className="skip-link" href="#workspace-content" onClick={() => content.current?.focus()}>Đến nội dung chính</a>
      <nav className="workspace-ribbon" aria-label="Điều hướng chính">
        <WorkspaceLink
          className="vault-mark"
          href="/"
          aria-label="Interview Knowledge Base"
          title="Interview Knowledge Base"
        >
          ◇
        </WorkspaceLink>
        <WorkspaceLink
          href="/"
          aria-label="Đồ thị kiến thức"
          title="Đồ thị kiến thức"
          aria-current={path === "/" ? "page" : undefined}
        >
          <WorkspaceIcon name="graph" />
        </WorkspaceLink>
        <WorkspaceLink
          href="/notes/new"
          aria-label="Ghi chú mới"
          title="Ghi chú mới"
        >
          <WorkspaceIcon name="note" />
        </WorkspaceLink>
        <WorkspaceLink
          href="/practice"
          aria-label="Mở luyện tập"
          title="Mở luyện tập"
          aria-current={path.startsWith("/practice") ? "page" : undefined}
        >
          <WorkspaceIcon name="practice" />
        </WorkspaceLink>
        <button
          className="ribbon-logout"
          type="button"
          aria-label="Đăng xuất"
          title="Đăng xuất"
          onClick={logout}
        >
          <WorkspaceIcon name="logout" />
        </button>
      </nav>
      <header className="topbar" onKeyDown={event => {
        if (event.key === 'Escape' && menuOpen) { setMenuOpen(false); menuToggle.current?.focus(); }
      }} onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setMenuOpen(false);
      }}>
        <button ref={menuToggle} type="button" className="mobile-nav-toggle" aria-expanded={menuOpen} aria-controls="main-links" aria-label="Mở điều hướng" onClick={() => setMenuOpen(value => !value)}><WorkspaceIcon name="panel" /></button>
        <span className="mobile-page-title">{pageTitle}</span>
        <WorkspaceLink className="mobile-create" href="/notes/new" aria-label="Viết ghi chú"><WorkspaceIcon name="plus" /></WorkspaceLink>
        <nav id="main-links" onClick={event => { if (!event.defaultPrevented && (event.target as HTMLElement).closest('a')) setMenuOpen(false); }} aria-label="Các trang" className={`main-links${menuOpen ? ' is-open' : ''}`}>

        <WorkspaceLink
          href="/"
          className={`brand${path === "/" ? " active" : ""}`}
        >
          Ghi chú
        </WorkspaceLink>
        <WorkspaceLink
          href="/practice"
          className={path.startsWith("/practice") ? "active" : undefined}
        >
          Luyện tập
        </WorkspaceLink>
        <WorkspaceLink
          href="/community"
          className={path.startsWith("/community") ? "active" : undefined}
        >
          Cộng đồng
        </WorkspaceLink>
        <WorkspaceLink href="/interview" className={path.startsWith('/interview') ? 'active' : undefined}>
          Phỏng vấn thử
        </WorkspaceLink>
        <button className="mobile-logout ghost" type="button" onClick={() => void logout()}>Đăng xuất tài khoản</button>
        </nav>
        <span className="who" title={email}>{email}</span>
        <span className="session-dot" title="Đã đăng nhập" />
      </header>
      <div id="workspace-content" ref={content} tabIndex={-1}>{children}</div>
    </div>
  );
}

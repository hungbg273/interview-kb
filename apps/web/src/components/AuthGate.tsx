'use client';

import { WorkspaceLink, useCanNavigate } from './WorkspaceNavigation';
import { WorkspaceIcon } from './WorkspaceIcon';
import { getMe } from '@/lib/auth';
import { api } from '@/lib/api';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const canNavigate = useCanNavigate();
  const path = usePathname();
  const replaceRef = useRef(router.replace);
  replaceRef.current = router.replace;
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((me) => {
        if (cancelled) return;
        if (!me) replaceRef.current('/login');
        else setEmail(me.email);
      })
      .catch(() => {
        if (!cancelled) replaceRef.current('/login');
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => { cancelled = true; };
  }, []);

  if (!ready || !email) return <main className="empty">Đang tải…</main>;

  async function logout() {
    if (!canNavigate()) return;
    await api('/auth/logout', { method: 'POST' });
    router.replace('/login');
  }

  return (
    <div className="workspace-shell">
      <nav className="workspace-ribbon" aria-label="Điều hướng chính">
        <WorkspaceLink className="vault-mark" href="/" aria-label="Interview Knowledge Base" title="Interview Knowledge Base">◇</WorkspaceLink>
        <WorkspaceLink href="/" aria-label="Đồ thị kiến thức" title="Đồ thị kiến thức" aria-current={path === '/' ? 'page' : undefined}><WorkspaceIcon name="graph" /></WorkspaceLink>
        <WorkspaceLink href="/notes/new" aria-label="Ghi chú mới" title="Ghi chú mới"><WorkspaceIcon name="note" /></WorkspaceLink>
        <WorkspaceLink href="/practice" aria-label="Mở luyện tập" title="Mở luyện tập" aria-current={path.startsWith('/practice') ? 'page' : undefined}><WorkspaceIcon name="practice" /></WorkspaceLink>
        <button className="ribbon-logout" type="button" aria-label="Đăng xuất" title="Đăng xuất" onClick={logout}><WorkspaceIcon name="logout" /></button>
      </nav>
      <header className="topbar">
        <WorkspaceLink href="/" className={`brand${path === '/' ? ' active' : ''}`}>
          Ghi chú
        </WorkspaceLink>
        <WorkspaceLink href="/practice" className={path.startsWith('/practice') ? 'active' : undefined}>
          Luyện tập
        </WorkspaceLink>
        <span className="who">{email}</span>
        <span className="session-dot" title="Đã đăng nhập" />
      </header>
      {children}
    </div>
  );
}

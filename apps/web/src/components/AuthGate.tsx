'use client';

import { getMe } from '@/lib/auth';
import { api } from '@/lib/api';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getMe()
      .then((me) => {
        if (!me) router.replace('/login');
        else setEmail(me.email);
      })
      .catch(() => {
        router.replace('/login');
      })
      .finally(() => {
        setReady(true);
      });
  }, [router]);

  if (!ready || !email) return <main className="empty">Đang tải…</main>;

  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    router.replace('/login');
  }

  return (
    <>
      <header className="topbar">
        <a href="/" className={`brand${path === '/' ? ' active' : ''}`}>
          Ghi chú
        </a>
        <a href="/practice" className={path.startsWith('/practice') ? 'active' : undefined}>
          Luyện tập
        </a>
        <span className="who">{email}</span>
        <button type="button" onClick={logout}>
          Đăng xuất
        </button>
      </header>
      {children}
    </>
  );
}

'use client';

import { getMe } from '@/lib/auth';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
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

  if (!ready || !email) return <main>Đang tải…</main>;

  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    router.replace('/login');
  }

  return (
    <>
      <header className="row" style={{ padding: 16, borderBottom: '1px solid #ddd' }}>
        <a href="/">Ghi chú</a>
        <a href="/topics">Chủ đề</a>
        <span style={{ marginLeft: 'auto' }}>{email}</span>
        <button type="button" onClick={logout}>
          Đăng xuất
        </button>
      </header>
      {children}
    </>
  );
}

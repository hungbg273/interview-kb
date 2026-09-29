'use client';

import { API_URL } from '@/lib/api';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function LoginInner() {
  const params = useSearchParams();
  const forbidden = params.get('error') === 'forbidden';

  return (
    <main className="login-wrap">
      <section className="login-card">
      <h1>Đăng nhập</h1>
      <p className="lede">Sổ ghi chú phỏng vấn, chỉ dành cho email trong whitelist.</p>
      {forbidden && (
        <p className="error">Email Google không nằm trong whitelist.</p>
      )}
      <a href={`${API_URL}/auth/google`}>
        <button type="button">Đăng nhập bằng Google</button>
      </a>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
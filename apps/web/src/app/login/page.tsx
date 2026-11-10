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
      <p className="login-brand">Interview Knowledge Base</p>
      <h1>Đăng nhập</h1>
      <p className="lede">Ghi chú kiến thức và luyện tập phỏng vấn. Sử dụng email đã được cấp quyền để tiếp tục.</p>
      {forbidden && (
        <p className="error" role="alert">Email Google này chưa được cấp quyền truy cập.</p>
      )}
      <a className="login-action" href={`${API_URL}/auth/google`}>Đăng nhập bằng Google</a>
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
'use client';

import { API_URL } from '@/lib/api';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function LoginInner() {
  const params = useSearchParams();
  const forbidden = params.get('error') === 'forbidden';

  return (
    <main>
      <h1>Đăng nhập</h1>
      {forbidden && (
        <p className="error">Email Google không nằm trong whitelist.</p>
      )}
      <a href={`${API_URL}/auth/google`}>
        <button type="button">Đăng nhập bằng Google</button>
      </a>
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
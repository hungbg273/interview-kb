import { AuthGate } from '@/components/AuthGate';

export default function HomePage() {
  return (
    <AuthGate>
      <main>
        <h1>Ghi chú</h1>
        <p>Danh sách sẽ có ở bước 11.</p>
      </main>
    </AuthGate>
  );
}

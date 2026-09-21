import './globals.css';

export const metadata = {
  title: 'Interview Knowledge Base',
  description: 'Private notes, topics, and interview questions',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}

import { IBM_Plex_Sans } from 'next/font/google';
import './globals.css';

const sans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
});

export const metadata = {
  title: 'Interview Knowledge Base',
  description: 'Private notes, topics, and interview questions',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className={sans.variable}>{children}</body>
    </html>
  );
}

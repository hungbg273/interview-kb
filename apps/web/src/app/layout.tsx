import { Be_Vietnam_Pro, Source_Serif_4 } from 'next/font/google';
import './globals.css';

const sans = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
});

const display = Source_Serif_4({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '600', '700'],
  variable: '--font-display',
});

export const metadata = {
  title: 'Interview Knowledge Base',
  description: 'Private notes, topics, and interview questions',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className={`${sans.variable} ${display.variable}`}>{children}</body>
    </html>
  );
}

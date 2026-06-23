import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CRM THACO Auto',
  description: 'Quan ly lead da kenh',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CRM THACO Auto',
  description: 'Quản lý lead đa kênh',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}

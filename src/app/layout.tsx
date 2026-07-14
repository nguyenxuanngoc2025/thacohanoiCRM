import type { Metadata, Viewport } from 'next';
import './globals.css';
import RegisterSW from './RegisterSW';

export const metadata: Metadata = {
  title: 'CRM THACO Auto',
  description: 'Quản lý lead đa kênh',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'CRM System',
  },
  icons: {
    icon: '/icon-192.png',
    apple: '/apple-touch-icon.png',
  },
};

// Chặn pinch-zoom để giao diện cảm giác như app native (không zoom được).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#004B9B',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <RegisterSW />
        {children}
      </body>
    </html>
  );
}

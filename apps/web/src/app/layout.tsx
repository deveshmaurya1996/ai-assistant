import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Assistant Dashboard',
  description: 'Manage agents, memory, and automations',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif' }}>{children}</body>
    </html>
  );
}

import type { Metadata } from 'next';
import './admin.css';
import RootDocument from '@/components/RootDocument';
export const metadata: Metadata = {
  title: 'ניהול אתר | יפיע מוטורס',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <RootDocument>{children}</RootDocument>;
}

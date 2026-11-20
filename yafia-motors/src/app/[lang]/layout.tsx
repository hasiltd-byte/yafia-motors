import type { Metadata } from 'next';
import RootDocument from '@/components/RootDocument';
import { ORIGIN } from '@/lib/model';
export const metadata: Metadata = { metadataBase: new URL(ORIGIN) };
export default async function PublicLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  return <RootDocument locale={lang}>{children}</RootDocument>;
}

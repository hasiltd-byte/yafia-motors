import RootDocument from '@/components/RootDocument';
export default function EntryLayout({ children }: { children: React.ReactNode }) {
  return <RootDocument>{children}</RootDocument>;
}

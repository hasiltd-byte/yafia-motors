export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="cms" dir="rtl">
      {children}
    </div>
  );
}

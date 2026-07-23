export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="portal-root">
      <div className="portal-wrap">{children}</div>
    </div>
  );
}
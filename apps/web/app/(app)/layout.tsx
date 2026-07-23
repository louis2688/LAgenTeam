"use client";
import { usePathname } from "next/navigation";

const NAV = [
  { grp: "Operator", items: [
    { href: "/", ico: "▤", label: "Dashboard" },
    { href: "/jobs", ico: "▦", label: "Jobs" },
    { href: "/agents", ico: "◉", label: "Agents" },
    { href: "/review", ico: "✓", label: "Review Gate" },
    { href: "/monitoring", ico: "◔", label: "Monitoring" },
    { href: "/settings", ico: "⚙", label: "Settings" },
  ]},
  { grp: "More", items: [
    { label: "Projects", ico: "▧", soon: true },
    { label: "Workflows", ico: "⇄", soon: true },
    { label: "Knowledge", ico: "◫", soon: true },
  ]},
  { grp: "Client View", items: [
    { href: "/portal", ico: "◈", label: "Client Portal" },
    { label: "Onboarding", ico: "→", soon: true },
  ]},
];

function Logo() {
  return (
    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="20" cy="9" r="4.2" stroke="#34d399" strokeWidth="2.2" />
      <circle cx="9" cy="29" r="4.2" stroke="#34d399" strokeWidth="2.2" />
      <circle cx="31" cy="29" r="4.2" stroke="#34d399" strokeWidth="2.2" />
      <path d="M20 13.2V22M20 22l-8 5M20 22l8 5" stroke="#10b981" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="20" cy="22" r="2.2" fill="#34d399" />
    </svg>
  );
}

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="app">
      <aside className="side">
        <a href="/" className="brand">
          <Logo />
          <div>
            <div className="sub">Autonomous Eng</div>
            <div className="name">L<b>Agen</b>Team</div>
          </div>
        </a>
        {NAV.map((g) => (
          <div key={g.grp}>
            <div className="grp">{g.grp}</div>
            {g.items.map((it: any) => (
              <a key={it.label} href={it.soon ? undefined : it.href}
                 className={`${path === it.href ? "active" : ""} ${it.soon ? "disabled" : ""}`}>
                <span className="ico">{it.ico}</span>{it.label}
                {it.soon && <span className="soon">soon</span>}
              </a>
            ))}
          </div>
        ))}
        <div className="live"><span className="d" /> Live</div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
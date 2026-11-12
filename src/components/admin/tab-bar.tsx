"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  {
    href: "/admin",
    label: "Agenda",
    icon: "M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",
  },
  {
    href: "/admin/recordatorios",
    label: "Recordatorios",
    icon: "M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2ZM10 21h4",
  },
  {
    href: "/admin/clientas",
    label: "Clientas",
    icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0",
  },
  {
    href: "/admin/servicios",
    label: "Servicios",
    icon: "M4 6h16M4 12h16M4 18h10",
  },
  {
    href: "/admin/ajustes",
    label: "Ajustes",
    icon: "M4 7h9M17 7h3M4 17h3M11 17h9M15 4.5v5M9 14.5v5",
  },
] as const;

// La pestaña tocada responde al instante, aunque la pantalla tarde en llegar.
function TabLabel({ label }: { label: string }) {
  const { pending } = useLinkStatus();
  return (
    <span
      className={`max-w-full truncate ${pending ? "animate-pulse font-semibold text-primary" : ""}`}
    >
      {label}
    </span>
  );
}

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Secciones"
      className="sticky bottom-0 border-t border-border bg-background pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-2xl">
        {TABS.map((tab) => {
          const active =
            tab.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(tab.href);
          return (
            <li key={tab.href} className="min-w-0 flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[10.5px] tracking-tight ${
                  active ? "font-semibold text-primary" : "text-muted"
                }`}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="size-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={active ? 2 : 1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={tab.icon} />
                </svg>
                <TabLabel label={tab.label} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

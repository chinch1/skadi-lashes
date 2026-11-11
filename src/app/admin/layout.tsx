import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Skadi Lashes · Administración",
  // Al instalarla desde aquí, la app abre directo en la Agenda.
  manifest: "/admin.webmanifest",
  appleWebApp: { capable: true, title: "Skadi Admin", statusBarStyle: "default" },
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  return children;
}

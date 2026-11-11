import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Skadi Lashes · Administración",
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  return children;
}

import { TabBar } from "@/components/admin/tab-bar";
import { requireAdminPage } from "@/lib/auth";

export default async function PanelLayout({ children }: LayoutProps<"/admin">) {
  await requireAdminPage();

  return (
    <>
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-6">
        {children}
      </main>
      <TabBar />
    </>
  );
}

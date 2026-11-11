import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth";
import type { Section } from "@/lib/services";
import { ServiceForm } from "../service-form";

export default async function Page(
  props: PageProps<"/admin/servicios/nuevo">,
) {
  const { seccion } = await props.searchParams;
  const { supabase, studioId } = await requireAdminPage();

  const { data } = await supabase
    .from("sections")
    .select("id, name, position")
    .eq("studio_id", studioId)
    .order("position")
    .order("name");
  const sections: Section[] = data ?? [];
  if (sections.length === 0) redirect("/admin/servicios");

  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Nuevo servicio</h1>
      <ServiceForm
        sections={sections}
        defaultSectionId={typeof seccion === "string" ? seccion : undefined}
      />
    </>
  );
}

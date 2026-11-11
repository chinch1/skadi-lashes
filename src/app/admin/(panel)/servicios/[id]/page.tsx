import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth";
import {
  photoUrl,
  SERVICE_COLUMNS,
  type Section,
  type Service,
} from "@/lib/services";
import { DeleteServiceForm, ServiceForm } from "../service-form";

export default async function Page(
  props: PageProps<"/admin/servicios/[id]">,
) {
  const { id } = await props.params;
  const { foto } = await props.searchParams;
  const { supabase, studioId } = await requireAdminPage();

  const [sectionsResult, serviceResult] = await Promise.all([
    supabase
      .from("sections")
      .select("id, name, position")
      .eq("studio_id", studioId)
      .order("position")
      .order("name"),
    supabase
      .from("services")
      .select(SERVICE_COLUMNS)
      .eq("id", id)
      .eq("studio_id", studioId)
      .maybeSingle(),
  ]);
  const sections: Section[] = sectionsResult.data ?? [];
  const service: Service | null = serviceResult.data;
  if (!service) notFound();

  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Editar servicio</h1>
      {foto === "error" && (
        <p role="alert" className="mb-5 rounded-xl bg-tint p-4">
          El servicio se guardó, pero la foto no se pudo subir. Intenta de nuevo.
        </p>
      )}
      <ServiceForm
        sections={sections}
        service={service}
        currentPhotoUrl={photoUrl(service.photo_path)}
      />
      <DeleteServiceForm id={service.id} />
    </>
  );
}

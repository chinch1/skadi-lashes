import { requireAdminPage } from "@/lib/auth";
import { SERVICE_COLUMNS, type Section, type Service } from "@/lib/services";
import { ServicesBoard } from "./board";
import { NewSectionForm } from "./section-forms";

export default async function Page() {
  const { supabase, studioId } = await requireAdminPage();

  const [sectionsResult, servicesResult] = await Promise.all([
    supabase
      .from("sections")
      .select("id, name, position")
      .eq("studio_id", studioId)
      .order("position")
      .order("name"),
    supabase
      .from("services")
      .select(SERVICE_COLUMNS)
      .eq("studio_id", studioId)
      .order("position")
      .order("created_at"),
  ]);
  const sections: Section[] = sectionsResult.data ?? [];
  const services: Service[] = servicesResult.data ?? [];

  return (
    <>
      <h1 className="text-2xl font-semibold">Servicios</h1>
      <p className="mt-1 text-muted">
        Arrastra los puntos de la derecha para ordenar. Las clientas ven este
        mismo orden.
      </p>

      {(sectionsResult.error || servicesResult.error) && (
        <p role="alert" className="mt-4 text-red-800">
          No se pudieron cargar los servicios. Recarga la página.
        </p>
      )}

      <div className="mt-6">
        <ServicesBoard sections={sections} services={services} />
      </div>

      <div className="mt-6">
        <NewSectionForm />
      </div>
    </>
  );
}

import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { SERVICE_COLUMNS, type Section, type Service } from "@/lib/services";
import { STUDIO_SLUG } from "@/lib/studio";
import { supabaseEnv } from "@/lib/supabase/env";
import { addDays, zonedParts } from "@/lib/time";
import { BookingFlow } from "./booking-flow";

// Los servicios cambian desde el panel: la página se arma en cada visita.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Agendar una cita · Skadi Lashes",
};

export default async function Page() {
  const { url, anonKey } = supabaseEnv();
  // Llave pública: las políticas solo dejan leer el estudio, las secciones y los servicios visibles.
  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false },
  });

  const { data: studio, error: studioError } = await supabase
    .from("studios")
    .select("id, timezone, booking_window_weeks")
    .eq("slug", STUDIO_SLUG)
    .maybeSingle();
  if (studioError) throw new Error(studioError.message);
  if (!studio) throw new Error("No se encontró el estudio.");

  const [sectionsRes, servicesRes] = await Promise.all([
    supabase
      .from("sections")
      .select("id, name, position")
      .eq("studio_id", studio.id)
      .order("position")
      .order("name"),
    supabase
      .from("services")
      .select(SERVICE_COLUMNS)
      .eq("studio_id", studio.id)
      .eq("visible", true)
      .order("position")
      .order("created_at"),
  ]);
  if (sectionsRes.error) throw new Error(sectionsRes.error.message);
  if (servicesRes.error) throw new Error(servicesRes.error.message);

  const sections = (sectionsRes.data ?? []) as Section[];
  const services = (servicesRes.data ?? []) as Service[];

  // Solo secciones con algún servicio visible.
  const groups = sections
    .map((section) => ({
      section,
      services: services.filter((s) => s.section_id === section.id),
    }))
    .filter((group) => group.services.length > 0);

  if (groups.length === 0) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-5 py-10 text-center">
        <p className="text-lg">Todavía no hay servicios disponibles.</p>
        <Link
          href="/"
          className="flex min-h-11 items-center text-primary underline underline-offset-4"
        >
          Volver al inicio
        </Link>
      </main>
    );
  }

  const today = zonedParts(new Date(), studio.timezone).date;
  const lastBookableDate = addDays(today, studio.booking_window_weeks * 7);

  return (
    <BookingFlow
      groups={groups}
      today={today}
      lastBookableDate={lastBookableDate}
    />
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getRescheduleView } from "@/lib/reschedule";
import { RescheduleFlow } from "./reschedule-flow";

// La página siempre muestra el estado actual de la cita y el plazo calculado en el servidor.
export const dynamic = "force-dynamic";

// Enlace privado: no debe aparecer en buscadores.
export const metadata: Metadata = {
  title: "Reprogramar tu cita",
  robots: { index: false, follow: false },
};

export default async function Page(props: PageProps<"/cita/[token]/reprogramar">) {
  const { token } = await props.params;
  const view = await getRescheduleView(token);
  if (!view) notFound();

  return <RescheduleFlow view={view} />;
}

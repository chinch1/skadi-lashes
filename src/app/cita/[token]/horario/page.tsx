import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSlotChangeView } from "@/lib/slot-change";
import { SlotFlow } from "./slot-flow";

// La página siempre muestra el estado actual de la cita.
export const dynamic = "force-dynamic";

// Enlace privado: no debe aparecer en buscadores.
export const metadata: Metadata = {
  title: "Elige otro horario",
  robots: { index: false, follow: false },
};

export default async function Page(props: PageProps<"/cita/[token]/horario">) {
  const { token } = await props.params;
  const view = await getSlotChangeView(token);
  if (!view) notFound();

  return <SlotFlow view={view} />;
}

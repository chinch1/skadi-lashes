import Link from "next/link";
import { headers } from "next/headers";
import { smallButton } from "@/components/ui";
import { requireAdminPage } from "@/lib/auth";
import {
  DEFAULT_CONFIRMATION_TEMPLATE,
  DEFAULT_REJECTION_TEMPLATE,
  DEFAULT_REMINDER_TEMPLATE,
  DEFAULT_RETOUCH_TEMPLATE,
} from "@/lib/whatsapp";
import { MessageForm } from "./message-form";

// Dirección del sitio, solo para que la vista previa muestre enlaces reales.
async function siteOrigin(): Promise<string> {
  const list = await headers();
  const host = (list.get("x-forwarded-host") ?? list.get("host") ?? "")
    .split(",")[0]
    .trim();
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const forwarded = list.get("x-forwarded-proto")?.split(",")[0].trim();
  const proto = forwarded || (local ? "http" : "https");
  return `${proto}://${host}`;
}

export default async function Page() {
  const { supabase, studioId } = await requireAdminPage();
  const [{ data: studio, error }, origin] = await Promise.all([
    supabase
      .from("studios")
      .select("confirmation_message, rejection_message, reminder_message, retouch_message")
      .eq("id", studioId)
      .maybeSingle(),
    siteOrigin(),
  ]);
  const loadError = error || !studio;

  return (
    <>
      <Link href="/admin/ajustes" className={`${smallButton} -ml-3 w-fit`}>
        ‹ Ajustes
      </Link>
      <h1 className="mt-1 text-2xl font-semibold">Mensajes de WhatsApp</h1>
      <p className="mt-2 text-muted">
        Desde la Agenda y Recordatorios, el mensaje se abre ya escrito en WhatsApp. Ahí todavía
        puedes cambiarlo antes de enviarlo.
      </p>

      {loadError ? (
        <p role="alert" className="mt-4 text-red-800">
          No se pudieron cargar los mensajes. Recarga la página.
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          <MessageForm
            kind="confirmation"
            title="Al aprobar un abono"
            description="Confirma la cita. El enlace lleva a la página de su cita."
            initialText={studio.confirmation_message || DEFAULT_CONFIRMATION_TEMPLATE}
            defaultText={DEFAULT_CONFIRMATION_TEMPLATE}
            previewLink={`${origin}/cita/abc123`}
          />
          <MessageForm
            kind="rejection"
            title="Al rechazar un comprobante"
            description="El horario ya quedó libre. El enlace lleva a la página para agendar."
            initialText={studio.rejection_message || DEFAULT_REJECTION_TEMPLATE}
            defaultText={DEFAULT_REJECTION_TEMPLATE}
            previewLink={`${origin}/agendar`}
          />
          <MessageForm
            kind="reminder"
            title="Recordatorio de la cita de mañana"
            description="Se envía el día antes. El enlace lleva a la página de su cita."
            initialText={studio.reminder_message || DEFAULT_REMINDER_TEMPLATE}
            defaultText={DEFAULT_REMINDER_TEMPLATE}
            previewLink={`${origin}/cita/abc123`}
          />
          <MessageForm
            kind="retouch"
            title="Recordatorio de retoque"
            description="Fecha, hora y servicios son los de la cita a la que vino. El enlace lleva a la página para agendar."
            initialText={studio.retouch_message || DEFAULT_RETOUCH_TEMPLATE}
            defaultText={DEFAULT_RETOUCH_TEMPLATE}
            previewLink={`${origin}/agendar`}
          />
        </div>
      )}
    </>
  );
}

"use client";

import { smallButton } from "@/components/ui";
import { ActionError, useAgendaAction } from "../_agenda/use-agenda-action";
import { logReminder } from "./actions";

type Props = {
  appointmentId: string;
  kind: "appointment_reminder" | "retouch_reminder";
  // Enlace wa.me con el mensaje ya escrito.
  href: string;
};

// Abrir WhatsApp anota el recordatorio; la fila se va cuando la página se renueva.
export function ReminderActions({ appointmentId, kind, href }: Props) {
  const { pending, error, run } = useAgendaAction();
  const markSent = () => run("log", () => logReminder(appointmentId, kind));
  const quietLabel =
    kind === "appointment_reminder" ? "Ya le recordé" : "No recordar";

  return (
    <div className="flex flex-col gap-2">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={markSent}
        className="flex min-h-12 items-center justify-center rounded-xl bg-whatsapp px-5 text-center font-medium text-white"
      >
        Recordar por WhatsApp
      </a>
      <button
        type="button"
        disabled={pending}
        onClick={markSent}
        className={`${smallButton} self-center`}
      >
        {pending ? "Guardando…" : quietLabel}
      </button>
      <ActionError error={error} />
    </div>
  );
}

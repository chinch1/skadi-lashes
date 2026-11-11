"use client";

import { smallButton } from "@/components/ui";
import { logMessage } from "../agenda-actions";
import { ActionError, useAgendaAction } from "./use-agenda-action";

type Props = {
  appointmentId: string;
  kind: "confirmation" | "rejection";
  // Enlace wa.me con el mensaje ya escrito.
  href: string;
};

// Abrir WhatsApp anota el aviso; la tarjeta se va cuando la página se renueva.
export function NotifyActions({ appointmentId, kind, href }: Props) {
  const { pending, error, run } = useAgendaAction();
  const markSent = () => run("log", () => logMessage(appointmentId, kind));

  return (
    <div className="flex flex-col gap-2">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={markSent}
        className="flex min-h-12 items-center justify-center rounded-xl bg-whatsapp px-5 font-medium text-white"
      >
        Avisar por WhatsApp
      </a>
      <button
        type="button"
        disabled={pending}
        onClick={markSent}
        className={`${smallButton} self-center`}
      >
        {pending ? "Guardando…" : "Ya le avisé"}
      </button>
      <ActionError error={error} />
    </div>
  );
}

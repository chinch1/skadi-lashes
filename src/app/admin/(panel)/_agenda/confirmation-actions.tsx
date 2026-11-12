"use client";

import { primaryButton, secondaryButton } from "@/components/ui";
import { confirmAppointment, rejectAppointment } from "../agenda-actions";
import { ActionError, useAgendaAction } from "./use-agenda-action";

// Confirmar o rechazar una cita sin abono.
export function ConfirmationActions({ appointmentId }: { appointmentId: string }) {
  const { pending, running, error, run } = useAgendaAction();

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => run("confirm", () => confirmAppointment(appointmentId))}
          className={primaryButton}
        >
          {running === "confirm" ? "Confirmando…" : "Confirmar"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(
              "reject",
              () => rejectAppointment(appointmentId),
              "¿Rechazar esta cita? El horario se libera de inmediato.",
            )
          }
          className={`${secondaryButton} bg-white`}
        >
          {running === "reject" ? "Rechazando…" : "Rechazar"}
        </button>
      </div>
      <ActionError error={error} />
    </div>
  );
}

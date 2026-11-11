"use client";

import { secondaryButton, smallButton } from "@/components/ui";
import {
  markCompleted,
  markNoShow,
  releaseAppointment,
} from "../agenda-actions";
import { ActionError, useAgendaAction } from "./use-agenda-action";

type Props = {
  appointmentId: string;
  canRelease: boolean;
  // Pregunta antes de liberar, ya ajustada a esta cita.
  releaseConfirm: string;
  // Solo cuando la cita confirmada ya empezó (hora del servidor).
  canMark: boolean;
};

export function AppointmentActions({
  appointmentId,
  canRelease,
  releaseConfirm,
  canMark,
}: Props) {
  const { pending, running, error, run } = useAgendaAction();
  if (!canRelease && !canMark) return null;

  return (
    <div className="flex flex-col gap-2">
      {canMark && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => run("completed", () => markCompleted(appointmentId))}
            className={`${secondaryButton} px-3`}
          >
            {running === "completed" ? "Guardando…" : "Asistió"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(
                "no_show",
                () => markNoShow(appointmentId),
                "¿Marcar que no asistió? Quedará en su historial.",
              )
            }
            className={`${secondaryButton} px-3`}
          >
            {running === "no_show" ? "Guardando…" : "No asistió"}
          </button>
        </div>
      )}
      {canRelease && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(
              "release",
              () => releaseAppointment(appointmentId),
              releaseConfirm,
            )
          }
          className={`${smallButton} self-start -ml-3 text-red-800`}
        >
          {running === "release" ? "Liberando…" : "Liberar horario"}
        </button>
      )}
      <ActionError error={error} />
    </div>
  );
}

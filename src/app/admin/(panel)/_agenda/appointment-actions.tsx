"use client";

import type { ReactNode } from "react";
import { secondaryButton } from "@/components/ui";
import {
  markCompleted,
  markNoShow,
  releaseAppointment,
} from "../agenda-actions";
import { ActionError, useAgendaAction } from "./use-agenda-action";

type Props = {
  appointmentId: string;
  // Datos de la cita (columna principal), dibujados en el servidor.
  children: ReactNode;
  // Botón de WhatsApp, a la derecha junto a "Liberar".
  whatsapp: ReactNode;
  canRelease: boolean;
  // Pregunta antes de liberar, ya ajustada a esta cita.
  releaseConfirm: string;
  // Solo cuando la cita confirmada ya empezó (hora del servidor).
  canMark: boolean;
};

// Cuerpo de la tarjeta de una cita: datos a la izquierda, botones a la
// derecha y, si ya empezó, "Asistió" / "No asistió" debajo. Todos comparten
// el mismo estado para que no se lancen dos acciones a la vez.
export function AppointmentActions({
  appointmentId,
  children,
  whatsapp,
  canRelease,
  releaseConfirm,
  canMark,
}: Props) {
  const { pending, running, error, run } = useAgendaAction();

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1 basis-36">{children}</div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
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
              className="flex min-h-11 items-center gap-1.5 rounded-xl border border-red-800/50 bg-white px-3 text-sm font-medium text-red-800 disabled:opacity-60"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3.5" y="5" width="17" height="15" rx="2" />
                <path d="M3.5 10h17M8 3v4M16 3v4M10 13.5l4 4M14 13.5l-4 4" />
              </svg>
              {running === "release" ? "Liberando…" : "Liberar"}
            </button>
          )}
          {whatsapp}
        </div>
      </div>

      {canMark && (
        <div className="mt-3 grid grid-cols-2 gap-2">
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

      {error && (
        <div className="mt-2">
          <ActionError error={error} />
        </div>
      )}
    </>
  );
}

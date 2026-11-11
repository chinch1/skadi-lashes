"use client";

import { useState, useTransition } from "react";

type ActionResult = { error: string | null };

// Ejecuta una acción del servidor de la Agenda y guarda su error.
// `running` dice qué botón la lanzó, para mostrar "Aprobando…" solo en ese.
export function useAgendaAction() {
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run(
    name: string,
    action: () => Promise<ActionResult>,
    confirmText?: string,
  ) {
    if (confirmText && !window.confirm(confirmText)) return;
    setError(null);
    setRunning(name);
    startTransition(async () => {
      let message: string | null;
      try {
        message = (await action()).error;
      } catch {
        message = "No se pudo completar. Revisa tu conexión e inténtalo otra vez.";
      }
      startTransition(() => {
        setError(message);
        setRunning(null);
      });
    });
  }

  return { pending, running: pending ? running : null, error, run };
}

export function ActionError({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="text-sm text-red-800">
      {error}
    </p>
  ) : null;
}

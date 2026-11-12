"use client";

import { useActionState, useOptimistic, useState, useTransition } from "react";
import { inputClass, primaryButton } from "@/components/ui";
import { setDepositRequired, updateClientName, type FormState } from "../actions";

const NETWORK_ERROR = "No se pudo guardar. Revisa tu conexión e inténtalo otra vez.";

// Casilla "Pide abono". Se guarda al tocarla; si falla, vuelve a como estaba.
export function DepositSwitch({
  clientId,
  required,
}: {
  clientId: string;
  required: boolean;
}) {
  const [shown, setShown] = useOptimistic(required);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(next: boolean) {
    setError(null);
    startTransition(async () => {
      setShown(next);
      let message: string | null;
      try {
        message = (await setDepositRequired(clientId, next)).error;
      } catch {
        message = NETWORK_ERROR;
      }
      if (message) startTransition(() => setError(message));
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          checked={shown}
          disabled={pending}
          onChange={(e) => toggle(e.target.checked)}
          aria-describedby="abono-ayuda"
          className="size-5 shrink-0 accent-primary"
        />
        <span className="font-medium">Pide abono</span>
        {pending && <span className="text-sm text-muted">Guardando…</span>}
      </label>
      <p id="abono-ayuda" className="text-sm text-muted">
        {shown
          ? "Paga el abono al agendar, como todas las clientas nuevas."
          : "Clienta de confianza: agenda sin pagar abono y tú confirmas su cita desde la Agenda. Tampoco le aplica el plazo de 12 horas para reprogramar. Ella nunca ve esta etiqueta."}
      </p>
      <p className="text-sm text-muted">
        El cambio vale para las citas que agende de ahora en adelante.
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}

type NameState = FormState & { saved: boolean };
const initialNameState: NameState = { error: null, saved: false };

export function NameForm({
  clientId,
  firstName: savedFirst,
  lastName: savedLast,
}: {
  clientId: string;
  firstName: string;
  lastName: string;
}) {
  const [firstName, setFirstName] = useState(savedFirst);
  const [lastName, setLastName] = useState(savedLast);

  const [state, action, pending] = useActionState(
    async (prev: NameState, formData: FormData): Promise<NameState> => {
      try {
        const result = await updateClientName(prev, formData);
        return { error: result.error, saved: result.error === null };
      } catch {
        return { error: NETWORK_ERROR, saved: false };
      }
    },
    initialNameState,
  );

  const unchanged =
    firstName.trim() === savedFirst && lastName.trim() === savedLast;

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={clientId} />
      <label className="flex flex-col gap-1.5">
        <span className="font-medium">Nombre</span>
        <input
          name="first_name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          required
          maxLength={60}
          autoComplete="off"
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="font-medium">Apellido</span>
        <input
          name="last_name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          required
          maxLength={60}
          autoComplete="off"
          className={inputClass}
        />
      </label>

      <p role="alert" className="min-h-5 text-sm text-red-800">
        {state.error}
      </p>
      {state.saved && unchanged && !pending && (
        <p role="status" className="-mt-4 text-sm text-whatsapp">
          Nombre guardado.
        </p>
      )}

      <button
        type="submit"
        disabled={pending || unchanged}
        className={`${primaryButton} self-start`}
      >
        {pending ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}

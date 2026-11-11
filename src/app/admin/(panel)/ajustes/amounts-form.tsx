"use client";

import { useActionState, useState } from "react";
import { inputClass, primaryButton } from "@/components/ui";
import { centsToInput, parseEuros } from "@/lib/money";
import { saveAmounts, type AmountField, type AmountsState } from "./actions";

const NETWORK_ERROR = "No se pudo guardar. Revisa tu conexión e inténtalo otra vez.";
const initialState: AmountsState = { error: null, fieldErrors: {}, saved: false };

type Props = {
  depositCents: number;
  lateFeeCents: number;
  lateToleranceMin: number;
};

export function AmountsForm({ depositCents, lateFeeCents, lateToleranceMin }: Props) {
  const [deposit, setDeposit] = useState(() => centsToInput(depositCents));
  const [lateFee, setLateFee] = useState(() => centsToInput(lateFeeCents));

  const [state, action, pending] = useActionState(
    async (prev: AmountsState, formData: FormData): Promise<AmountsState> => {
      try {
        return await saveAmounts(prev, formData);
      } catch {
        return { error: NETWORK_ERROR, fieldErrors: {}, saved: false };
      }
    },
    initialState,
  );

  // Se compara el monto, no el texto: "10" y "10,00" son lo mismo.
  // Tras guardar, la página vuelve con los montos nuevos como guardados.
  const unchanged =
    parseEuros(deposit) === depositCents && parseEuros(lateFee) === lateFeeCents;

  return (
    <form action={action} className="flex flex-col gap-4">
      <AmountInput
        name="deposit"
        label="Abono para agendar (€)"
        help="Lo que paga la clienta para apartar su cita. No es reembolsable. Con 0, las citas se confirman sin pago."
        value={deposit}
        onChange={setDeposit}
        error={state.fieldErrors.deposit}
      />
      <AmountInput
        name="late_fee"
        label="Cargo por retraso (€)"
        help={`Lo que se cobra si llega con más de ${lateToleranceMin} minutos de retraso y aún puedes atenderla.`}
        value={lateFee}
        onChange={setLateFee}
        error={state.fieldErrors.late_fee}
      />

      {state.error && (
        <p role="alert" className="text-sm text-red-800">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || unchanged}
        className={`${primaryButton} self-start`}
      >
        {pending ? "Guardando…" : "Guardar"}
      </button>
      {state.saved && unchanged && !pending && (
        <p role="status" className="-mt-2 text-sm text-whatsapp">
          Guardado.
        </p>
      )}
    </form>
  );
}

function AmountInput({
  name,
  label,
  help,
  value,
  onChange,
  error,
}: {
  name: AmountField;
  label: string;
  help: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const id = `monto-${name}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        required
        maxLength={8}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-ayuda${error ? ` ${id}-error` : ""}`}
        className={`${inputClass} max-w-40 tabular-nums`}
      />
      <p id={`${id}-ayuda`} className="text-sm text-muted">
        {help}
      </p>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}

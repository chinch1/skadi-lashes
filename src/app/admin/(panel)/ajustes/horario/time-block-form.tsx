"use client";

import { useActionState, useState } from "react";
import { inputClass, primaryButton } from "@/components/ui";
import { createTimeBlock, type FormState } from "./actions";

const initialState: FormState = { error: null };

export function TimeBlockForm({ today }: { today: string }) {
  const [startDate, setStartDate] = useState(today);
  const [startTime, setStartTime] = useState("09:00");
  const [endDate, setEndDate] = useState(today);
  const [endTime, setEndTime] = useState("18:00");
  const [allDay, setAllDay] = useState(false);
  const [reason, setReason] = useState("");

  const [state, action, pending] = useActionState(
    async (prev: FormState, formData: FormData) => {
      const result = await createTimeBlock(prev, formData);
      if (!result.error) {
        // Bloqueo guardado: el formulario vuelve a quedar listo para otro.
        setStartDate(today);
        setStartTime("09:00");
        setEndDate(today);
        setEndTime("18:00");
        setAllDay(false);
        setReason("");
      }
      return result;
    },
    initialState,
  );

  return (
    <form
      action={action}
      className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-4"
    >
      <h3 className="text-lg font-semibold">Bloquear tiempo</h3>

      <label className="flex min-h-11 cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          name="all_day"
          checked={allDay}
          onChange={(event) => setAllDay(event.target.checked)}
          className="size-5 accent-primary"
        />
        Todo el día
      </label>

      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 font-medium">Desde</legend>
        <div className={allDay ? "" : "grid grid-cols-2 gap-2"}>
          <input
            type="date"
            name="start_date"
            required
            aria-label="Fecha de inicio"
            value={startDate}
            onChange={(event) => {
              const value = event.target.value;
              setStartDate(value);
              // Si el final queda antes del inicio, se mueve al mismo día.
              if (value && endDate < value) setEndDate(value);
            }}
            className={`${inputClass} min-w-0`}
          />
          {!allDay && (
            <input
              type="time"
              name="start_time"
              required
              aria-label="Hora de inicio"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              className={`${inputClass} min-w-0`}
            />
          )}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 font-medium">Hasta</legend>
        <div className={allDay ? "" : "grid grid-cols-2 gap-2"}>
          <input
            type="date"
            name="end_date"
            required
            aria-label="Fecha final"
            min={startDate || undefined}
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            className={`${inputClass} min-w-0`}
          />
          {!allDay && (
            <input
              type="time"
              name="end_time"
              required
              aria-label="Hora final"
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
              className={`${inputClass} min-w-0`}
            />
          )}
        </div>
        {allDay && (
          <p className="text-sm text-muted">Incluye el último día completo.</p>
        )}
      </fieldset>

      <label className="flex flex-col gap-1">
        <span className="font-medium">
          Motivo <span className="font-normal text-muted">(opcional)</span>
        </span>
        <input
          name="reason"
          maxLength={80}
          placeholder="Por ejemplo, Vacaciones"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className={inputClass}
        />
      </label>

      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Guardando…" : "Bloquear"}
      </button>
      {state.error && (
        <p role="alert" className="text-sm text-red-800">
          {state.error}
        </p>
      )}
    </form>
  );
}

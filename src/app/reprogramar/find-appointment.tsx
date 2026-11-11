"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { inputClass, primaryButton } from "@/components/ui";
import type { FindResult, FoundAppointment } from "@/lib/reschedule";
import { formatLongDate, formatTime12 } from "@/lib/format";
import { FOREIGN_PHONE_HINT, formatPhoneInput } from "@/lib/phone";
import { findAppointments } from "./actions";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export function FindAppointment() {
  const [phone, setPhone] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // null: todavía no se ha buscado.
  const [found, setFound] = useState<FoundAppointment[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLHeadingElement>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!phone.trim()) {
      setFound(null);
      setError("Escribe tu número de WhatsApp.");
      inputRef.current?.focus();
      return;
    }
    setError(null);
    setPending(true);

    let result: FindResult;
    try {
      result = await findAppointments(phone.trim());
    } catch {
      result = {
        ok: false,
        error: "No se pudo buscar. Revisa tu conexión e inténtalo de nuevo.",
      };
    }

    setPending(false);
    if (!result.ok) {
      setFound(null);
      setError(result.error);
      inputRef.current?.focus();
      return;
    }
    setFound(result.appointments);
    // El foco pasa a los resultados para que el lector de pantalla los anuncie.
    requestAnimationFrame(() => resultsRef.current?.focus());
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="telefono" className="font-medium">
            Tu número de WhatsApp
          </label>
          <input
            id="telefono"
            ref={inputRef}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0412-1234567"
            value={phone}
            onChange={(e) => setPhone(formatPhoneInput(e.target.value, phone))}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "telefono-ayuda telefono-error" : "telefono-ayuda"}
            className={`${inputClass} ${error ? "border-red-700" : ""}`}
          />
          <p id="telefono-ayuda" className="text-sm text-muted">
            Es el número con el que agendaste. {FOREIGN_PHONE_HINT}
          </p>
          {error && (
            <p id="telefono-error" role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className={`${primaryButton} w-full ${focusRing}`}
        >
          {pending ? "Buscando…" : "Buscar mi cita"}
        </button>
      </form>

      {found && (
        <section aria-labelledby="citas-encontradas" className="flex flex-col gap-3">
          <h2
            id="citas-encontradas"
            ref={resultsRef}
            tabIndex={-1}
            className="text-lg font-semibold outline-none"
          >
            {found.length === 0
              ? "No encontramos citas próximas con ese número."
              : found.length === 1
                ? "Tu cita"
                : "Tus citas"}
          </h2>

          {found.length === 0 ? (
            <Link
              href="/agendar"
              className={`flex min-h-11 items-center self-start text-primary underline ${focusRing}`}
            >
              Agendar una cita
            </Link>
          ) : (
            <ul className="flex flex-col gap-3">
              {found.map((appointment) => (
                <li key={appointment.token}>
                  <Link
                    href={`/cita/${appointment.token}/reprogramar`}
                    className={`flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-border bg-white p-4 hover:border-border-strong ${focusRing}`}
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="font-medium first-letter:uppercase">
                        {formatLongDate(appointment.date)}
                      </span>
                      <span className="text-muted">{formatTime12(appointment.time)}</span>
                      <span className="text-sm break-words text-muted">
                        {appointment.services.join(", ")}
                      </span>
                    </span>
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="size-5 shrink-0 text-primary"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

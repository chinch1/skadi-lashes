"use client";

import { useEffect, useRef, useState } from "react";
import { smallButton } from "@/components/ui";
import { formatLongDate, formatMonth, formatTime12 } from "@/lib/format";
import { monthDates, weekdayOf } from "@/lib/time";

const DAY_NAMES = [
  { short: "L", long: "lunes" },
  { short: "M", long: "martes" },
  { short: "M", long: "miércoles" },
  { short: "J", long: "jueves" },
  { short: "V", long: "viernes" },
  { short: "S", long: "sábado" },
  { short: "D", long: "domingo" },
];

const FALLBACK_ERROR = "No se pudo consultar la disponibilidad.";

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

// "2026-11" + 1 -> "2026-12"
function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const d = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

type Result = { key: string; days: Record<string, string[]> } | { key: string; error: string };

export function CalendarStep({
  serviceIds,
  today,
  lastBookableDate,
  month,
  onMonthChange,
  date,
  time,
  onSelectDate,
  onSelectTime,
  notice,
}: {
  serviceIds: string[];
  today: string;
  lastBookableDate: string;
  month: string;
  onMonthChange: (month: string) => void;
  date: string | null;
  time: string | null;
  onSelectDate: (date: string) => void;
  onSelectTime: (time: string) => void;
  notice: string | null;
}) {
  const servicesParam = serviceIds.join(",");
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const timesRef = useRef<HTMLDivElement>(null);

  const key = `${month}|${servicesParam}|${attempt}`;

  // Consulta las horas del mes visible. El estado solo cambia al llegar la respuesta;
  // una respuesta vieja (mes o servicios ya cambiados) se descarta al abortar.
  useEffect(() => {
    const requestKey = `${month}|${servicesParam}|${attempt}`;
    const controller = new AbortController();
    const params = new URLSearchParams({ month, services: servicesParam });
    fetch(`/api/availability?${params}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (res) => {
        const body: unknown = await res.json().catch(() => null);
        if (controller.signal.aborted) return;
        if (res.ok && body && typeof body === "object" && "days" in body) {
          setResult({
            key: requestKey,
            days: (body as { days: Record<string, string[]> }).days,
          });
          return;
        }
        const message =
          body && typeof body === "object" && "error" in body
            ? String((body as { error: unknown }).error)
            : FALLBACK_ERROR;
        setResult({ key: requestKey, error: message });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setResult({
          key: requestKey,
          error: "No se pudo conectar. Revisa tu conexión e inténtalo de nuevo.",
        });
      });
    return () => controller.abort();
  }, [month, servicesParam, attempt]);

  const current = result && result.key === key ? result : null;
  const loading = current === null;
  const days = current && "days" in current ? current.days : null;
  const error = current && "error" in current ? current.error : null;

  const minMonth = monthOf(today);
  const maxMonth = monthOf(lastBookableDate);
  const canGoBack = month > minMonth;
  const canGoForward = month < maxMonth;

  const dates = monthDates(month);
  // Las semanas empiezan el lunes.
  const leading = (weekdayOf(dates[0]) + 6) % 7;

  const selectedInMonth = date !== null && monthOf(date) === month;
  const times = selectedInMonth && days ? (days[date] ?? []) : [];

  function chooseDate(d: string) {
    onSelectDate(d);
    // En el teléfono las horas quedan debajo del calendario: se acercan a la vista.
    requestAnimationFrame(() => {
      timesRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {notice && (
        <p
          role="alert"
          className="rounded-xl border border-border-strong bg-tint px-4 py-3 text-sm"
        >
          {notice}
        </p>
      )}

      <section
        aria-labelledby="mes-visible"
        className="rounded-2xl border border-border bg-white p-3 sm:p-4"
      >
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onMonthChange(shiftMonth(month, -1))}
            disabled={!canGoBack}
            aria-label="Mes anterior"
            className={`${smallButton} w-11 focus-visible:outline-2 focus-visible:outline-primary`}
          >
            <Chevron direction="left" />
          </button>
          <h2
            id="mes-visible"
            aria-live="polite"
            className="text-lg font-semibold first-letter:uppercase"
          >
            {formatMonth(month)}
          </h2>
          <button
            type="button"
            onClick={() => onMonthChange(shiftMonth(month, 1))}
            disabled={!canGoForward}
            aria-label="Mes siguiente"
            className={`${smallButton} w-11 focus-visible:outline-2 focus-visible:outline-primary`}
          >
            <Chevron direction="right" />
          </button>
        </div>

        <div className="mt-2 grid grid-cols-7 text-center text-xs font-medium text-muted">
          {DAY_NAMES.map((d) => (
            <abbr key={d.long} title={d.long} className="py-2 no-underline">
              {d.short}
            </abbr>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1" aria-busy={loading}>
          {Array.from({ length: leading }, (_, i) => (
            <span key={`vacio-${i}`} aria-hidden="true" />
          ))}
          {dates.map((d) => {
            const available = !!days && (days[d]?.length ?? 0) > 0;
            const selected = d === date;
            const isToday = d === today;
            const label = `${formatLongDate(d)}${isToday ? ", hoy" : ""}${
              days && !available ? ", sin horas disponibles" : ""
            }`;
            return (
              <button
                key={d}
                type="button"
                disabled={!available}
                aria-pressed={selected}
                aria-label={label}
                onClick={() => chooseDate(d)}
                className={[
                  "relative flex aspect-square min-h-11 items-center justify-center rounded-xl text-base transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary",
                  selected
                    ? "bg-primary font-semibold text-white"
                    : available
                      ? "bg-tint font-medium text-foreground hover:bg-border"
                      : "text-muted/40",
                  isToday && !selected ? "ring-1 ring-inset ring-border-strong" : "",
                ].join(" ")}
              >
                {Number(d.slice(8))}
              </button>
            );
          })}
        </div>

        <div aria-live="polite" className="min-h-6 pt-2 text-center text-sm text-muted">
          {loading && "Buscando horas disponibles…"}
          {days &&
            !dates.some((d) => (days[d]?.length ?? 0) > 0) &&
            (canGoForward
              ? "No quedan horas este mes. Prueba con el mes siguiente."
              : "No quedan horas disponibles este mes.")}
        </div>
      </section>

      {error && (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-white p-4"
        >
          <p>{error}</p>
          <button
            type="button"
            onClick={() => setAttempt((a) => a + 1)}
            className="flex min-h-11 items-center justify-center rounded-xl border border-border-strong px-4 font-medium text-primary focus-visible:outline-2 focus-visible:outline-primary"
          >
            Reintentar
          </button>
        </div>
      )}

      <div ref={timesRef} className="scroll-mb-40">
        {selectedInMonth && days && (
          <section aria-labelledby="horas-del-dia" className="flex flex-col gap-3">
            <h2 id="horas-del-dia" className="text-lg font-semibold first-letter:uppercase">
              {formatLongDate(date)}
            </h2>
            {times.length === 0 ? (
              <p className="text-muted">Ya no quedan horas este día. Elige otro.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2" role="group" aria-label="Horas disponibles">
                {times.map((t) => {
                  const selected = t === time;
                  return (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onSelectTime(t)}
                      className={[
                        "flex min-h-12 items-center justify-center rounded-xl border text-base transition-colors",
                        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary",
                        selected
                          ? "border-primary bg-primary font-semibold text-white"
                          : "border-border-strong bg-white text-foreground hover:border-primary",
                      ].join(" ")}
                    >
                      {formatTime12(t)}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={direction === "left" ? "M15 18l-6-6 6-6" : "M9 6l6 6-6 6"} />
    </svg>
  );
}

"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { primaryButton, smallButton } from "@/components/ui";
import { SLOT_INTERVAL_MIN } from "@/lib/booking-config";
import { formatLongDate, formatMonth, formatTime12 } from "@/lib/format";
import { minutesToTime, monthDates, timeToMinutes, weekdayOf } from "@/lib/time";
import { saveDaySlots } from "./actions";

const DAY_NAMES = [
  { short: "L", long: "lunes" },
  { short: "M", long: "martes" },
  { short: "M", long: "miércoles" },
  { short: "J", long: "jueves" },
  { short: "V", long: "viernes" },
  { short: "S", long: "sábado" },
  { short: "D", long: "domingo" },
];

// Rejilla de horas que se pueden marcar: de 6:00 am a 9:00 pm.
const FIRST_MIN = 6 * 60;
const LAST_MIN = 21 * 60;
const GRID: string[] = [];
for (let m = FIRST_MIN; m <= LAST_MIN; m += SLOT_INTERVAL_MIN) {
  GRID.push(minutesToTime(m));
}

const PERIODS = [
  { id: "manana", title: "Mañana", test: (min: number) => min < 12 * 60 },
  { id: "tarde", title: "Tarde", test: (min: number) => min >= 12 * 60 && min < 18 * 60 },
  { id: "noche", title: "Noche", test: (min: number) => min >= 18 * 60 },
];

const helperButton =
  "flex min-h-11 items-center justify-center rounded-full border border-border-strong bg-white px-3 text-sm font-medium text-primary disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary";

function daysText(count: number): string {
  return count === 1 ? "1 día" : `${count} días`;
}

type Status = { kind: "ok" | "error"; text: string } | null;

export function DaySlotsEditor({
  month,
  today,
  slotsByDay,
  prevHref,
  nextHref,
}: {
  month: string; // "AAAA-MM"
  today: string; // "AAAA-MM-DD", hora local del estudio
  slotsByDay: Record<string, string[]>; // horas "HH:MM" guardadas por día
  prevHref: string | null;
  nextHref: string | null;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [marked, setMarked] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>(null);
  const [pending, startTransition] = useTransition();
  const panelHeadingRef = useRef<HTMLHeadingElement>(null);

  const dates = monthDates(month);
  // Las semanas empiezan el lunes.
  const leading = (weekdayOf(dates[0]) + 6) % 7;
  const openDates = dates.filter((d) => d >= today);

  const markedSet = new Set(marked);
  // La rejilla, más cualquier hora guardada fuera de ella para no perderla al guardar.
  const chipTimes = Array.from(new Set([...GRID, ...marked])).sort(
    (a, b) => timeToMinutes(a) - timeToMinutes(b),
  );
  const savedInSelection = selected.some((d) => (slotsByDay[d]?.length ?? 0) > 0);

  // Todo cambio de selección pasa por aquí: decide qué horas quedan marcadas.
  function changeSelection(next: string[]) {
    const sorted = [...next].sort();
    if (sorted.length === 1) {
      // Un solo día: se muestran sus horas guardadas.
      setMarked(slotsByDay[sorted[0]] ?? []);
    }
    // Varios días: se conservan las horas marcadas, para copiarlas a todos.
    setStatus(null);
    if (selected.length === 0 && sorted.length > 0) {
      // En el teléfono el panel queda debajo del calendario: se acerca a la vista.
      requestAnimationFrame(() => {
        panelHeadingRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    }
    setSelected(sorted);
  }

  function toggleDay(day: string) {
    changeSelection(
      selected.includes(day) ? selected.filter((d) => d !== day) : [...selected, day],
    );
  }

  function toggleTime(time: string) {
    setMarked((current) =>
      current.includes(time) ? current.filter((t) => t !== time) : [...current, time],
    );
  }

  function save(times: string[]) {
    const days = selected;
    if (
      times.length === 0 &&
      !window.confirm(`¿Quitar todas las horas de ${daysText(days.length)}?`)
    ) {
      return;
    }
    setStatus(null);
    startTransition(async () => {
      let error: string | null;
      try {
        error = (await saveDaySlots(days, times)).error;
      } catch {
        error = "No se pudo guardar. Revisa tu conexión e inténtalo otra vez.";
      }
      startTransition(() => {
        if (error) {
          setStatus({ kind: "error", text: error });
          return;
        }
        setSelected([]);
        setStatus({
          kind: "ok",
          text:
            times.length === 0
              ? `Listo: horas quitadas de ${daysText(days.length)}.`
              : `Listo: horas guardadas en ${daysText(days.length)}.`,
        });
      });
    });
  }

  const panelTitle =
    selected.length === 1
      ? `Horas para el ${formatLongDate(selected[0])}`
      : `Horas para ${daysText(selected.length)}`;

  return (
    <div>
      <section
        aria-labelledby="mes-visible"
        className="rounded-2xl border border-border bg-white p-3 sm:p-4"
      >
        <div className="flex items-center justify-between gap-2">
          <MonthLink href={prevHref} label="Mes anterior" direction="left" />
          <h2
            id="mes-visible"
            className="text-lg font-semibold first-letter:uppercase"
          >
            {formatMonth(month)}
          </h2>
          <MonthLink href={nextHref} label="Mes siguiente" direction="right" />
        </div>

        <div className="mt-2 grid grid-cols-7 text-center text-xs font-medium text-muted">
          {DAY_NAMES.map((d) => (
            <abbr key={d.long} title={d.long} className="py-2 no-underline">
              {d.short}
            </abbr>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: leading }, (_, i) => (
            <span key={`vacio-${i}`} aria-hidden="true" />
          ))}
          {dates.map((d) => {
            const count = slotsByDay[d]?.length ?? 0;
            const past = d < today;
            const isSelected = selected.includes(d);
            const isToday = d === today;
            const label = `${formatLongDate(d)}${isToday ? ", hoy" : ""}, ${
              count === 0 ? "sin horas" : count === 1 ? "1 hora" : `${count} horas`
            }`;
            return (
              <button
                key={d}
                type="button"
                disabled={past}
                aria-pressed={isSelected}
                aria-label={label}
                onClick={() => toggleDay(d)}
                className={[
                  "flex aspect-square min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl text-base leading-none transition-colors",
                  focusRing,
                  isSelected
                    ? "bg-primary font-semibold text-white"
                    : past
                      ? "text-muted/40"
                      : count > 0
                        ? "bg-tint font-medium text-foreground hover:bg-border"
                        : "text-foreground hover:bg-tint/60",
                  isToday && !isSelected ? "ring-2 ring-inset ring-primary/50" : "",
                ].join(" ")}
              >
                <span>{Number(d.slice(8))}</span>
                <span
                  aria-hidden="true"
                  className={[
                    "flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold",
                    count === 0
                      ? "invisible"
                      : isSelected
                        ? "bg-white text-primary"
                        : past
                          ? "bg-border text-muted"
                          : "bg-primary text-white",
                  ].join(" ")}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className={helperButton}
            disabled={openDates.length === 0}
            onClick={() =>
              changeSelection(
                openDates.filter((d) => {
                  const weekday = weekdayOf(d);
                  return weekday >= 1 && weekday <= 5;
                }),
              )
            }
          >
            Lunes a viernes
          </button>
          <button
            type="button"
            className={helperButton}
            disabled={openDates.length === 0}
            onClick={() => changeSelection(openDates)}
          >
            Todo el mes
          </button>
          <button
            type="button"
            className={helperButton}
            disabled={selected.length === 0}
            onClick={() => changeSelection([])}
          >
            Quitar selección
          </button>
        </div>

        <p className="mt-3 text-sm text-muted first-letter:uppercase">
          {selected.length === 0
            ? "Toca los días que quieres cambiar."
            : selected.length === 1
              ? formatLongDate(selected[0])
              : `${daysText(selected.length)} elegidos`}
        </p>
      </section>

      <p role="status" className="empty:hidden mt-3 rounded-xl bg-tint px-4 py-3 text-sm font-medium">
        {status?.kind === "ok" ? status.text : ""}
      </p>

      {selected.length > 0 && (
        <section aria-labelledby="horas-elegidas" className="mt-6">
          <div className="flex items-start justify-between gap-3">
            <h2
              id="horas-elegidas"
              ref={panelHeadingRef}
              className="scroll-mb-44 scroll-mt-4 text-xl font-semibold"
            >
              {panelTitle}
            </h2>
            {marked.length > 0 && (
              <button
                type="button"
                onClick={() => setMarked([])}
                className={`${smallButton} -mr-3 shrink-0 ${focusRing}`}
              >
                Desmarcar
              </button>
            )}
          </div>
          {selected.length > 1 && (
            <p className="mt-1 text-sm text-muted">
              Estas horas reemplazarán las que ya tengan esos días.
            </p>
          )}

          <div className="mt-2 flex flex-col gap-4">
            {PERIODS.map((period) => {
              const times = chipTimes.filter((t) => period.test(timeToMinutes(t)));
              if (times.length === 0) return null;
              return (
                <div key={period.id} role="group" aria-labelledby={`periodo-${period.id}`}>
                  <h3
                    id={`periodo-${period.id}`}
                    className="mb-2 text-sm font-semibold text-muted"
                  >
                    {period.title}
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {times.map((t) => {
                      const on = markedSet.has(t);
                      return (
                        <button
                          key={t}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggleTime(t)}
                          className={[
                            "flex min-h-12 items-center justify-center gap-1 rounded-xl border px-1 text-base transition-colors",
                            focusRing,
                            on
                              ? "border-primary bg-primary font-semibold text-white"
                              : "border-border-strong bg-white text-foreground hover:border-primary",
                          ].join(" ")}
                        >
                          {on && <Check />}
                          {formatTime12(t)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {savedInSelection && (
            <button
              type="button"
              disabled={pending}
              onClick={() => save([])}
              className={`${smallButton} mt-4 -ml-3 text-red-800 ${focusRing}`}
            >
              Quitar todas las horas
            </button>
          )}

          <p className="mt-3 text-sm text-muted">
            Si una cita larga ocupa la hora siguiente, esa hora deja de ofrecerse sola.
          </p>

          {/* Encima de la barra de pestañas (56 px más el borde y el área segura). */}
          <div className="sticky bottom-[calc(3.5rem+1px+env(safe-area-inset-bottom))] z-10 -mx-5 mt-4 flex flex-col gap-2 border-t border-border bg-background px-5 py-3">
            {status?.kind === "error" && (
              <p role="alert" className="text-sm text-red-800">
                {status.text}
              </p>
            )}
            <button
              type="button"
              disabled={pending || (marked.length === 0 && !savedInSelection)}
              onClick={() => save(marked)}
              className={`${primaryButton} w-full ${focusRing}`}
            >
              {pending ? "Guardando…" : "Guardar horas"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function MonthLink({
  href,
  label,
  direction,
}: {
  href: string | null;
  label: string;
  direction: "left" | "right";
}) {
  const className = `${smallButton} w-11 ${focusRing}`;
  if (!href) {
    return (
      <span aria-hidden="true" className={`${className} opacity-30`}>
        <Chevron direction={direction} />
      </span>
    );
  }
  return (
    <Link href={href} prefetch={false} aria-label={label} className={className}>
      <Chevron direction={direction} />
    </Link>
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

function Check() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12l5 5L19 7" />
    </svg>
  );
}

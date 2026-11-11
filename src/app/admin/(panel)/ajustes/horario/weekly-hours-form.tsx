"use client";

import { useActionState, useState } from "react";
import { inputClass, primaryButton, smallButton } from "@/components/ui";
import { minutesToTime, timeToMinutes } from "@/lib/time";
import { saveWorkingHours, type ScheduleState } from "./actions";
import { WEEKDAY_NAMES, WEEKDAY_ORDER, type ScheduleRange } from "./weekdays";

const initialState: ScheduleState = { error: null, saved: false };
const DEFAULT_RANGE: ScheduleRange = { opens_at: "09:00", closes_at: "18:00" };

type Day = { on: boolean; ranges: ScheduleRange[] };

// Un campo de hora vacío llega como "": entonces no hay minutos.
function toMinutes(time: string): number | null {
  return /^\d{2}:\d{2}$/.test(time) ? timeToMinutes(time) : null;
}

// Parte un horario en dos con una pausa. Si cabe, la pausa va de 12:30 a 13:30.
function splitRange(range: ScheduleRange): [ScheduleRange, ScheduleRange] | null {
  const opens = toMinutes(range.opens_at);
  const closes = toMinutes(range.closes_at);
  if (opens === null || closes === null || closes - opens < 3) return null;

  let firstEnd: number;
  let secondStart: number;
  if (opens < 12 * 60 + 30 && closes > 13 * 60 + 30) {
    firstEnd = 12 * 60 + 30;
    secondStart = 13 * 60 + 30;
  } else if (closes - opens >= 120) {
    firstEnd = opens + Math.floor((closes - opens - 60) / 2 / 30) * 30;
    secondStart = firstEnd + 60;
  } else {
    firstEnd = opens + Math.floor((closes - opens) / 3);
    secondStart = opens + Math.floor(((closes - opens) * 2) / 3);
  }
  return [
    { opens_at: range.opens_at, closes_at: minutesToTime(firstEnd) },
    { opens_at: minutesToTime(secondStart), closes_at: range.closes_at },
  ];
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function WeeklyHoursForm({ initial }: { initial: ScheduleRange[][] }) {
  const [days, setDays] = useState<Day[]>(() =>
    initial.map((ranges) => ({ on: ranges.length > 0, ranges })),
  );
  const [dirty, setDirty] = useState(false);
  const [state, action, pending] = useActionState(
    async (prev: ScheduleState, formData: FormData) => {
      const result = await saveWorkingHours(prev, formData);
      if (!result.error) setDirty(false);
      return result;
    },
    initialState,
  );

  function updateDay(weekday: number, change: (day: Day) => Day) {
    setDays((current) =>
      current.map((day, index) => (index === weekday ? change(day) : day)),
    );
    setDirty(true);
  }

  function setTime(
    weekday: number,
    rangeIndex: number,
    field: keyof ScheduleRange,
    value: string,
  ) {
    updateDay(weekday, (day) => ({
      ...day,
      ranges: day.ranges.map((range, index) =>
        index === rangeIndex ? { ...range, [field]: value } : range,
      ),
    }));
  }

  const schedule = days.flatMap((day, weekday) =>
    day.on ? day.ranges.map((range) => ({ weekday, ...range })) : [],
  );

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="schedule" value={JSON.stringify(schedule)} />

      {WEEKDAY_ORDER.map((weekday) => {
        const day = days[weekday];
        const name = capitalize(WEEKDAY_NAMES[weekday]);
        const split = day.ranges.length === 1 ? splitRange(day.ranges[0]) : null;

        return (
          <fieldset
            key={weekday}
            className="rounded-2xl border border-border bg-white px-4 py-3"
          >
            <legend className="sr-only">{name}</legend>
            <div className="flex items-center justify-between gap-3">
              <span className="text-lg font-semibold">{name}</span>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={day.on}
                  onChange={(event) => {
                    const on = event.target.checked;
                    updateDay(weekday, (current) => ({
                      on,
                      ranges:
                        on && current.ranges.length === 0
                          ? [DEFAULT_RANGE]
                          : current.ranges,
                    }));
                  }}
                  className="size-5 accent-primary"
                />
                Trabajo este día
              </label>
            </div>

            {day.on ? (
              <div className="mt-2 flex flex-col gap-3 pb-1">
                {day.ranges.map((range, index) => (
                  <div key={index}>
                    {day.ranges.length === 2 && (
                      <p className="mb-1 text-sm text-muted">
                        {index === 0 ? "Antes de la pausa" : "Después de la pausa"}
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex min-w-0 flex-col gap-1 text-sm">
                        Desde
                        <input
                          type="time"
                          required
                          value={range.opens_at}
                          onChange={(event) =>
                            setTime(weekday, index, "opens_at", event.target.value)
                          }
                          className={`${inputClass} min-w-0`}
                        />
                      </label>
                      <label className="flex min-w-0 flex-col gap-1 text-sm">
                        Hasta
                        <input
                          type="time"
                          required
                          value={range.closes_at}
                          onChange={(event) =>
                            setTime(weekday, index, "closes_at", event.target.value)
                          }
                          className={`${inputClass} min-w-0`}
                        />
                      </label>
                    </div>
                  </div>
                ))}

                <div className="flex">
                  {day.ranges.length === 2 ? (
                    <button
                      type="button"
                      onClick={() =>
                        updateDay(weekday, (current) => ({
                          ...current,
                          ranges: [
                            {
                              opens_at: current.ranges[0].opens_at,
                              closes_at: current.ranges[1].closes_at,
                            },
                          ],
                        }))
                      }
                      className={`${smallButton} -ml-3`}
                    >
                      Quitar pausa
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={!split}
                      onClick={() =>
                        split &&
                        updateDay(weekday, (current) => ({ ...current, ranges: split }))
                      }
                      className={`${smallButton} -ml-3`}
                    >
                      Agregar pausa
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <p className="pb-1 text-sm text-muted">No atiendes este día.</p>
            )}
          </fieldset>
        );
      })}

      <button type="submit" disabled={pending} className={`${primaryButton} mt-2`}>
        {pending ? "Guardando…" : "Guardar horario"}
      </button>
      {state.error && (
        <p role="alert" className="text-sm text-red-800">
          {state.error}
        </p>
      )}
      {state.saved && !dirty && !pending && (
        <p role="status" className="text-sm text-whatsapp">
          Horario guardado.
        </p>
      )}
    </form>
  );
}

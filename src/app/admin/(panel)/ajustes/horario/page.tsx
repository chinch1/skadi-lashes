import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { smallButton } from "@/components/ui";
import { requireAdminPage } from "@/lib/auth";
import { computeAvailability, type DaySlot } from "@/lib/availability";
import { BUFFER_MIN, MIN_NOTICE_MIN } from "@/lib/booking-config";
import { formatTime12 } from "@/lib/format";
import { formatDuration } from "@/lib/services";
import { addDays, monthDates, zonedParts, zonedToUtc } from "@/lib/time";
import { DaySlotsEditor } from "./day-slots-editor";

const PATH = "/admin/ajustes/horario";
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
// Hasta cuántos meses por delante se puede planificar.
const MAX_MONTHS_AHEAD = 12;
// Filas por consulta: el servidor de datos no devuelve más de 1000 a la vez.
const PAGE_SIZE = 1000;

// Duraciones de ejemplo para la vista previa, en minutos.
const PREVIEW_DURATIONS = [30, 60, 90, 120, 180];
const PREVIEW_DAYS = 14;

const dayFormat = new Intl.DateTimeFormat("es-VE", {
  timeZone: "UTC",
  weekday: "short",
  day: "numeric",
  month: "short",
});

// "2026-11-14" -> "sáb 14 nov"
function formatDate(date: string): string {
  const parts = dayFormat.formatToParts(new Date(`${date}T12:00:00Z`));
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value.replace(".", "") ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")}`;
}

// "2026-11" + 1 -> "2026-12"
function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1 + delta, 1))
    .toISOString()
    .slice(0, 7);
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function pageHref(params: { mes?: string; duracion?: number }, hash = "") {
  const query = new URLSearchParams();
  if (params.mes) query.set("mes", params.mes);
  if (params.duracion) query.set("duracion", String(params.duracion));
  const text = query.toString();
  return `${PATH}${text ? `?${text}` : ""}${hash}`;
}

// Horas guardadas entre dos fechas (incluidas), por páginas para no perder filas.
async function loadDaySlots(
  supabase: SupabaseClient,
  studioId: string,
  from: string,
  to: string,
): Promise<{ slots: DaySlot[]; error: boolean }> {
  const slots: DaySlot[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("day_slots")
      .select("day, start_time")
      .eq("studio_id", studioId)
      .gte("day", from)
      .lte("day", to)
      .order("day")
      .order("start_time")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      console.error("[horario] leer horas:", error);
      return { slots, error: true };
    }
    for (const row of data ?? []) {
      slots.push({ day: row.day, start_time: String(row.start_time).slice(0, 5) });
    }
    if ((data?.length ?? 0) < PAGE_SIZE) return { slots, error: false };
  }
}

export default async function Page(props: PageProps<"/admin/ajustes/horario">) {
  const searchParams = await props.searchParams;
  const rawMonth = single(searchParams.mes);
  const rawDuration = Number(single(searchParams.duracion));
  const durationGiven = PREVIEW_DURATIONS.includes(rawDuration);
  const previewDuration = durationGiven ? rawDuration : 60;

  const { supabase, studioId } = await requireAdminPage();
  const now = new Date();

  const { data: studio, error: studioError } = await supabase
    .from("studios")
    .select("timezone, booking_window_weeks")
    .eq("id", studioId)
    .maybeSingle();
  if (studioError) console.error("[horario] leer estudio:", studioError);

  const timeZone: string = studio?.timezone ?? "America/Caracas";
  const today = zonedParts(now, timeZone).date;
  const currentMonth = today.slice(0, 7);
  const lastMonth = shiftMonth(currentMonth, MAX_MONTHS_AHEAD);
  const month =
    rawMonth && MONTH_RE.test(rawMonth) && rawMonth >= currentMonth && rawMonth <= lastMonth
      ? rawMonth
      : currentMonth;

  const dates = monthDates(month);
  const previewEnd = addDays(today, PREVIEW_DAYS - 1);

  const [monthSlots, previewSlots, appointmentsResult] = await Promise.all([
    loadDaySlots(supabase, studioId, dates[0], dates[dates.length - 1]),
    loadDaySlots(supabase, studioId, today, previewEnd),
    supabase
      .from("appointments")
      .select("starts_at, ends_at, status, hold_expires_at")
      .eq("studio_id", studioId)
      .in("status", ["confirmed", "pending_deposit"])
      .gt("ends_at", now.toISOString())
      .lt(
        "starts_at",
        zonedToUtc(addDays(previewEnd, 1), "00:00", timeZone).toISOString(),
      ),
  ]);
  if (appointmentsResult.error) {
    console.error("[horario] leer citas:", appointmentsResult.error);
  }

  const slotsByDay: Record<string, string[]> = {};
  for (const slot of monthSlots.slots) {
    (slotsByDay[slot.day] ??= []).push(slot.start_time);
  }

  // Vista previa: las mismas horas que verá una clienta en los próximos días.
  const preview = computeAvailability({
    timeZone,
    slots: previewSlots.slots,
    // Una cita por aprobar cuya reserva ya venció no ocupa el horario.
    appointments: (appointmentsResult.data ?? [])
      .filter(
        (a) =>
          a.status === "confirmed" ||
          a.hold_expires_at === null ||
          new Date(a.hold_expires_at) > now,
      )
      .map((a) => ({ starts_at: a.starts_at, ends_at: a.ends_at })),
    durationMin: previewDuration,
    bufferMin: BUFFER_MIN,
    minNoticeMin: MIN_NOTICE_MIN,
    now,
    from: today,
    to: previewEnd,
    lastBookableDate: addDays(today, (studio?.booking_window_weeks ?? 8) * 7),
  });
  const previewDates = Array.from({ length: PREVIEW_DAYS }, (_, i) => addDays(today, i));

  const loadError = !!studioError || monthSlots.error;
  const previewError = previewSlots.error || !!appointmentsResult.error;
  const durationParam = durationGiven ? previewDuration : undefined;

  return (
    <>
      <Link href="/admin/ajustes" className={`${smallButton} -ml-3 w-fit`}>
        ‹ Ajustes
      </Link>
      <h1 className="mt-1 text-2xl font-semibold">Mi horario</h1>
      <p className="mt-1 text-muted">
        Marca las horas en que aceptas empezar una cita cada día. Las clientas
        solo pueden agendar en esas horas.
      </p>

      {loadError ? (
        <p role="alert" className="mt-4 text-red-800">
          No se pudo cargar tu horario. Recarga la página.
        </p>
      ) : (
        <div className="mt-5">
          <DaySlotsEditor
            // Al cambiar de mes, la selección empieza de nuevo.
            key={month}
            month={month}
            today={today}
            slotsByDay={slotsByDay}
            prevHref={
              month > currentMonth
                ? pageHref({ mes: shiftMonth(month, -1), duracion: durationParam })
                : null
            }
            nextHref={
              month < lastMonth
                ? pageHref({ mes: shiftMonth(month, 1), duracion: durationParam })
                : null
            }
          />
        </div>
      )}

      <section id="vista-previa" className="mt-10 scroll-mt-4">
        <h2 className="text-xl font-semibold">Así lo ven las clientas</h2>
        <p className="mt-1 text-muted">
          Las horas que se ofrecen en los próximos {PREVIEW_DAYS} días, según lo
          que dure la cita. Guarda tus horas para ver los cambios aquí.
        </p>

        <div className="mt-3 flex flex-wrap gap-2" aria-label="Duración de la cita">
          {PREVIEW_DURATIONS.map((minutes) => (
            <Link
              key={minutes}
              href={pageHref(
                { mes: rawMonth ? month : undefined, duracion: minutes },
                "#vista-previa",
              )}
              prefetch={false}
              aria-current={minutes === previewDuration ? "true" : undefined}
              className={`flex min-h-11 items-center rounded-full border px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ${
                minutes === previewDuration
                  ? "border-primary bg-primary text-white"
                  : "border-border-strong text-primary"
              }`}
            >
              {formatDuration(minutes)}
            </Link>
          ))}
        </div>

        {previewError ? (
          <p role="alert" className="mt-4 text-red-800">
            No se pudo calcular la vista previa. Recarga la página.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {previewDates.map((date) => {
              const times = preview[date] ?? [];
              return (
                <li
                  key={date}
                  className="rounded-2xl border border-border bg-white px-4 py-3"
                >
                  <p className="font-medium">{formatDate(date)}</p>
                  {times.length === 0 ? (
                    <p className="text-sm text-muted">Sin horas</p>
                  ) : (
                    <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
                      {times.map((time) => (
                        <span key={time}>{formatTime12(time)}</span>
                      ))}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

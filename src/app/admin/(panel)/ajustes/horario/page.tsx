import Link from "next/link";
import { smallButton } from "@/components/ui";
import { requireAdminPage } from "@/lib/auth";
import { computeAvailability } from "@/lib/availability";
import {
  BUFFER_MIN,
  MIN_NOTICE_MIN,
  SLOT_INTERVAL_MIN,
} from "@/lib/booking-config";
import { formatDuration } from "@/lib/services";
import { addDays, zonedParts, zonedToUtc } from "@/lib/time";
import { deleteTimeBlock } from "./actions";
import { TimeBlockForm } from "./time-block-form";
import { WeeklyHoursForm } from "./weekly-hours-form";
import type { ScheduleRange } from "./weekdays";

type TimeBlock = {
  id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
};

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

// "09:00" -> "9:00"
function formatTime(time: string): string {
  const [hour, minute] = time.split(":");
  return `${Number(hour)}:${minute}`;
}

// Describe el bloqueo en la hora local del estudio.
function describeBlock(block: TimeBlock, timeZone: string) {
  const start = zonedParts(new Date(block.starts_at), timeZone);
  const end = zonedParts(new Date(block.ends_at), timeZone);

  if (start.time === "00:00" && end.time === "00:00") {
    const lastDay = addDays(end.date, -1);
    return {
      range:
        lastDay === start.date
          ? formatDate(start.date)
          : `${formatDate(start.date)} – ${formatDate(lastDay)}`,
      detail: "Todo el día",
    };
  }
  if (start.date === end.date) {
    return {
      range: `${formatDate(start.date)}, ${formatTime(start.time)} – ${formatTime(end.time)}`,
      detail: null,
    };
  }
  return {
    range: `${formatDate(start.date)}, ${formatTime(start.time)} – ${formatDate(end.date)}, ${formatTime(end.time)}`,
    detail: null,
  };
}

// Duraciones de ejemplo para la vista previa, en minutos.
const PREVIEW_DURATIONS = [30, 60, 90, 120, 180];
const PREVIEW_DAYS = 14;

export default async function Page(
  props: PageProps<"/admin/ajustes/horario">,
) {
  const { duracion } = await props.searchParams;
  const previewDuration = PREVIEW_DURATIONS.includes(Number(duracion))
    ? Number(duracion)
    : 60;

  const { supabase, studioId } = await requireAdminPage();
  const now = new Date();

  const [studioResult, hoursResult, blocksResult] = await Promise.all([
    supabase
      .from("studios")
      .select("timezone, booking_window_weeks")
      .eq("id", studioId)
      .maybeSingle(),
    supabase
      .from("working_hours")
      .select("weekday, opens_at, closes_at")
      .eq("studio_id", studioId)
      .order("weekday")
      .order("opens_at"),
    supabase
      .from("time_blocks")
      .select("id, starts_at, ends_at, reason")
      .eq("studio_id", studioId)
      .gte("ends_at", now.toISOString())
      .order("starts_at"),
  ]);

  const timeZone: string = studioResult.data?.timezone ?? "America/Caracas";
  const today = zonedParts(now, timeZone).date;

  // Un arreglo por día de la semana (0 = domingo), con a lo sumo dos horarios.
  const weekly: ScheduleRange[][] = Array.from({ length: 7 }, () => []);
  for (const row of hoursResult.data ?? []) {
    const day = weekly[row.weekday as number];
    if (!day || day.length >= 2) continue;
    day.push({
      opens_at: String(row.opens_at).slice(0, 5),
      closes_at: String(row.closes_at).slice(0, 5),
    });
  }

  const blocks: TimeBlock[] = blocksResult.data ?? [];

  // Vista previa: las mismas horas que verá una clienta en los próximos días.
  const previewEnd = addDays(today, PREVIEW_DAYS - 1);
  const { data: appointmentRows } = await supabase
    .from("appointments")
    .select("starts_at, ends_at, status, hold_expires_at")
    .eq("studio_id", studioId)
    .in("status", ["confirmed", "pending_deposit"])
    .gt("ends_at", now.toISOString())
    .lt("starts_at", zonedToUtc(addDays(previewEnd, 1), "00:00", timeZone).toISOString());
  const preview = computeAvailability({
    timeZone,
    workingHours: hoursResult.data ?? [],
    blocks,
    // Una cita por aprobar cuya reserva ya venció no ocupa el horario.
    appointments: (appointmentRows ?? []).filter(
      (a) =>
        a.status === "confirmed" ||
        a.hold_expires_at === null ||
        new Date(a.hold_expires_at) > now,
    ),
    durationMin: previewDuration,
    slotIntervalMin: SLOT_INTERVAL_MIN,
    bufferMin: BUFFER_MIN,
    minNoticeMin: MIN_NOTICE_MIN,
    now,
    from: today,
    to: previewEnd,
    lastBookableDate: addDays(
      today,
      (studioResult.data?.booking_window_weeks ?? 8) * 7,
    ),
  });
  const loadError = studioResult.error || hoursResult.error || blocksResult.error;

  return (
    <>
      <Link
        href="/admin/ajustes"
        className={`${smallButton} -ml-3 w-fit`}
      >
        ‹ Ajustes
      </Link>
      <h1 className="mt-1 text-2xl font-semibold">Mi horario</h1>

      {loadError && (
        <p role="alert" className="mt-4 text-red-800">
          No se pudo cargar tu horario. Recarga la página.
        </p>
      )}

      <section className="mt-6">
        <h2 className="text-xl font-semibold">Horario semanal</h2>
        <p className="mt-1 mb-4 text-muted">
          Los días y horas en que atiendes. Las clientas solo ven horas dentro
          de este horario.
        </p>
        {!hoursResult.error && <WeeklyHoursForm initial={weekly} />}
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Bloqueos</h2>
        <p className="mt-1 text-muted">
          Días libres, vacaciones o una cita médica. Las clientas no podrán
          agendar en estos horarios.
        </p>
        <p className="mt-2 mb-4 text-sm text-muted">
          Bloquear no cancela las citas que ya están agendadas. Revísalas en la
          Agenda.
        </p>

        <TimeBlockForm today={today} />

        <h3 className="mt-6 mb-2 font-semibold">Próximos bloqueos</h3>
        {blocks.length === 0 ? (
          <p className="text-muted">No hay bloqueos.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {blocks.map((block) => {
              const { range, detail } = describeBlock(block, timeZone);
              return (
                <li
                  key={block.id}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-white py-2 pr-2 pl-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{range}</p>
                    {(detail || block.reason) && (
                      <p className="truncate text-sm text-muted">
                        {[detail, block.reason].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <form action={deleteTimeBlock.bind(null, block.id)}>
                    <button type="submit" className={smallButton}>
                      Quitar
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section id="vista-previa" className="mt-10 scroll-mt-4">
        <h2 className="text-xl font-semibold">Así lo ven las clientas</h2>
        <p className="mt-1 text-muted">
          Las horas que se ofrecen en los próximos {PREVIEW_DAYS} días, según
          lo que dure la cita. Guarda tu horario para ver los cambios aquí.
        </p>

        <div className="mt-3 flex flex-wrap gap-2" aria-label="Duración de la cita">
          {PREVIEW_DURATIONS.map((minutes) => (
            <Link
              key={minutes}
              href={`/admin/ajustes/horario?duracion=${minutes}#vista-previa`}
              prefetch={false}
              aria-current={minutes === previewDuration ? "true" : undefined}
              className={`flex min-h-11 items-center rounded-full border px-4 text-sm font-medium ${
                minutes === previewDuration
                  ? "border-primary bg-primary text-white"
                  : "border-border-strong text-primary"
              }`}
            >
              {formatDuration(minutes)}
            </Link>
          ))}
        </div>

        <ul className="mt-4 flex flex-col gap-2">
          {Object.entries(preview).map(([date, times]) => (
            <li
              key={date}
              className="rounded-2xl border border-border bg-white px-4 py-3"
            >
              <p className="font-medium">{formatDate(date)}</p>
              {times.length === 0 ? (
                <p className="text-sm text-muted">Sin cupo</p>
              ) : (
                <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
                  {times.map((time) => (
                    <span key={time}>{formatTime(time)}</span>
                  ))}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

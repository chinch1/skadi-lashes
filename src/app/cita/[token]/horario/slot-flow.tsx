"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { primaryButton } from "@/components/ui";
import { CalendarStep, monthOf } from "@/app/agendar/calendar-step";
import { formatLongDate, formatTime12 } from "@/lib/format";
import { formatEuros } from "@/lib/money";
import { formatDuration } from "@/lib/services";
import type { PickSlotResult, SlotChangeView } from "@/lib/slot-change";
import { chooseSlot } from "./actions";

const CONNECTION_ERROR = "No se pudo enviar. Revisa tu conexión e inténtalo de nuevo.";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export function SlotFlow({ view }: { view: SlotChangeView }) {
  const router = useRouter();
  const { token } = view;

  const [month, setMonth] = useState(monthOf(view.today));
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [slotNotice, setSlotNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function confirm() {
    if (pending || !date || !time) return;
    setError(null);
    setPending(true);

    let result: PickSlotResult;
    try {
      result = await chooseSlot(token, date, time);
    } catch {
      result = { ok: false, code: "server", error: CONNECTION_ERROR };
    }

    if (result.ok) {
      // Vuelve a la página de la cita, con el reloj nuevo. El botón sigue
      // deshabilitado mientras se abre.
      router.push(`/cita/${token}`);
      return;
    }

    setPending(false);
    if (result.code === "slot_taken") {
      setTime(null);
      setMonth(monthOf(date));
      setSlotNotice(result.error);
      window.scrollTo({ top: 0 });
      return;
    }
    setError(result.error);
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-5 pt-4 pb-40">
      <header className="flex items-center gap-2">
        <Link
          href={`/cita/${token}`}
          aria-label="Volver a tu cita"
          className={`-ml-2 flex size-11 shrink-0 items-center justify-center rounded-full text-primary ${focusRing}`}
        >
          <BackIcon />
        </Link>
        <h1 className="text-2xl font-semibold">Elige otro horario</h1>
      </header>

      <section
        aria-labelledby="tus-servicios"
        className="rounded-2xl border border-border bg-white p-4"
      >
        <h2 id="tus-servicios" className="text-sm font-medium text-muted">
          Tus servicios
        </h2>
        <p className="mt-1 break-words">{view.services.map((s) => s.name).join(", ")}</p>
        <p className="mt-2 flex items-baseline justify-between gap-3 border-t border-border pt-2 text-sm">
          <span className="text-muted">{formatDuration(view.durationMin)}</span>
          <span className="font-semibold tabular-nums">
            Total {formatEuros(view.totalCents)}
          </span>
        </p>
      </section>

      {error && (
        <p role="alert" className="rounded-xl border border-border-strong bg-tint px-4 py-3 text-sm">
          {error}
        </p>
      )}

      <CalendarStep
        query={`cita=${token}`}
        today={view.today}
        lastBookableDate={view.lastBookableDate}
        month={month}
        onMonthChange={setMonth}
        date={date}
        time={time}
        onSelectDate={(d) => {
          if (d !== date) setTime(null);
          setDate(d);
        }}
        onSelectTime={(t) => {
          setTime(t);
          setSlotNotice(null);
        }}
        notice={slotNotice}
      />

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-lg items-center gap-4 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <p className="min-w-0 flex-1 text-sm font-medium" aria-live="polite">
            {date && time ? (
              <>
                <span className="block first-letter:uppercase">{formatLongDate(date)}</span>
                <span className="text-muted">{formatTime12(time)}</span>
              </>
            ) : (
              <span className="text-muted">Elige un día y una hora</span>
            )}
          </p>
          <button
            type="button"
            disabled={!date || !time || pending}
            aria-busy={pending}
            onClick={confirm}
            className={`${primaryButton} shrink-0 ${focusRing}`}
          >
            {pending ? "Enviando…" : "Continuar"}
          </button>
        </div>
      </div>
    </main>
  );
}

function BackIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

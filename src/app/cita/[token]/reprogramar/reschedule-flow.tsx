"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { primaryButton, secondaryButton } from "@/components/ui";
import { CalendarStep, monthOf } from "@/app/agendar/calendar-step";
import { formatLongDate, formatTime12 } from "@/lib/format";
import { formatEuros } from "@/lib/money";
import type { ReleaseResult, RescheduleResult, RescheduleView } from "@/lib/reschedule";
import type { RescheduleMode } from "@/lib/reschedule-rules";
import { RULES } from "@/lib/rules";
import { formatDuration } from "@/lib/services";
import { release, reschedule } from "./actions";

type Step = "warning" | "calendar" | "confirm" | "blocked" | "release";

const DEPOSIT_RULE = RULES.find((rule) => rule.title === "Abono")!.text;

const CONNECTION_ERROR = "No se pudo enviar. Revisa tu conexión e inténtalo de nuevo.";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

function initialStep(mode: RescheduleMode): Step {
  if (mode === "late") return "warning";
  if (mode === "on_time") return "calendar";
  return "blocked";
}

// "jueves 12 de noviembre a las 3:00 pm"
function when(date: string, time: string): string {
  return `${formatLongDate(date)} a las ${formatTime12(time)}`;
}

export function RescheduleFlow({ view }: { view: RescheduleView }) {
  const router = useRouter();
  const { token } = view;
  // El aviso de abono perdido solo aplica a quien pagó abono. A la clienta sin abono
  // nunca se le habla de abonos.
  const late = view.mode === "late" && view.paidDeposit;

  const [step, setStep] = useState<Step>(() => initialStep(view.mode));
  // Paso al que vuelve "Volver" desde "No podré asistir".
  const [stepBeforeRelease, setStepBeforeRelease] = useState<Step>(() =>
    initialStep(view.mode),
  );
  const [month, setMonth] = useState(monthOf(view.today));
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [slotNotice, setSlotNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Si el servidor cambia el modo (por ejemplo, ya faltan menos de 12 horas tras
  // router.refresh()), el flujo vuelve al primer paso del modo nuevo. Se conserva el error.
  const [shownMode, setShownMode] = useState(view.mode);
  if (view.mode !== shownMode) {
    setShownMode(view.mode);
    setStep(initialStep(view.mode));
    setStepBeforeRelease(initialStep(view.mode));
    setDate(null);
    setTime(null);
    setSlotNotice(null);
  }

  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // Al cambiar de paso: arriba de la página y el foco en el título del paso.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
    headingRef.current?.focus();
  }, [step]);

  function go(next: Step) {
    setError(null);
    setStep(next);
  }

  function openRelease() {
    setStepBeforeRelease(step);
    go("release");
  }

  const isCurrentSlot = date === view.date && time === view.time;

  async function confirmChange() {
    if (pending || !date || !time) return;
    setError(null);
    setPending(true);

    let result: RescheduleResult;
    try {
      result = await reschedule(token, date, time, view.mode === "late" ? "late" : "on_time");
    } catch {
      result = { ok: false, code: "server", error: CONNECTION_ERROR };
    }

    if (result.ok) {
      // Los botones siguen deshabilitados mientras se abre la página de la cita.
      router.push(result.needsPayment ? `/cita/${token}` : `/cita/${token}?cambio=ok`);
      return;
    }

    setPending(false);
    if (result.code === "slot_taken") {
      setTime(null);
      setMonth(monthOf(date));
      setSlotNotice(result.error);
      setStep("calendar");
      return;
    }
    setError(result.error);
    if (result.code === "mode_changed") router.refresh();
  }

  async function confirmRelease() {
    if (pending) return;
    setError(null);
    setPending(true);

    let result: ReleaseResult;
    try {
      result = await release(token);
    } catch {
      result = { ok: false, error: CONNECTION_ERROR };
    }

    if (result.ok) {
      router.push(`/cita/${token}`);
      return;
    }
    setPending(false);
    setError(result.error);
  }

  // Volver dentro del flujo cuando hay un paso anterior; si no, a la página de la cita.
  const previous: Step | null =
    step === "confirm"
      ? "calendar"
      : step === "calendar" && view.mode === "late"
        ? "warning"
        : step === "release"
          ? stepBeforeRelease
          : null;

  const backControl =
    previous === null ? (
      <Link
        href={`/cita/${token}`}
        aria-label="Volver a tu cita"
        className={`-ml-2 flex size-11 shrink-0 items-center justify-center rounded-full text-primary ${focusRing}`}
      >
        <BackIcon />
      </Link>
    ) : (
      <button
        type="button"
        onClick={() => go(previous)}
        disabled={pending}
        aria-label="Volver al paso anterior"
        className={`-ml-2 flex size-11 shrink-0 items-center justify-center rounded-full text-primary disabled:opacity-60 ${focusRing}`}
      >
        <BackIcon />
      </button>
    );

  const showReleaseLink =
    view.canRelease && (step === "warning" || step === "calendar" || step === "blocked");

  const errorBox = error && (
    <p role="alert" className="rounded-xl border border-border-strong bg-tint px-4 py-3 text-sm">
      {error}
    </p>
  );

  const stepTitle = (text: string) => (
    <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold outline-none">
      {text}
    </h2>
  );

  return (
    <main
      className={`mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-5 pt-4 ${
        step === "calendar" ? "pb-40" : "pb-10"
      }`}
    >
      <header className="flex items-center gap-2">
        {backControl}
        <h1 className="text-2xl font-semibold">Reprogramar tu cita</h1>
      </header>

      <CurrentAppointment view={view} />

      {step === "warning" && (
        <section className="flex flex-col gap-4">
          {stepTitle(`Faltan menos de ${view.noticeHours} horas para tu cita`)}
          {errorBox}
          {late ? (
            <p>
              Si la cambias ahora, pierdes el abono que pagaste. Para la nueva fecha
              tendrás que pagar un abono nuevo de{" "}
              <strong className="font-semibold">{formatEuros(view.newDepositCents)}</strong>,
              que Skadi debe aprobar.
            </p>
          ) : (
            <p>Puedes cambiar tu cita una sola vez.</p>
          )}
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => go("calendar")}
              className={`${primaryButton} w-full ${focusRing}`}
            >
              Elegir nueva fecha
            </button>
            <Link href={`/cita/${token}`} className={`${secondaryButton} w-full ${focusRing}`}>
              Mantener mi cita
            </Link>
          </div>
        </section>
      )}

      {step === "calendar" && (
        <section className="flex flex-col gap-4">
          {stepTitle("Elige el nuevo día y la hora")}
          {errorBox}
          {view.mode === "on_time" && (
            <p className="text-muted">
              {view.paidDeposit
                ? "Puedes cambiar tu cita una sola vez. No pierdes tu abono."
                : "Puedes cambiar tu cita una sola vez."}
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

          <BottomBar>
            <p className="min-w-0 flex-1 text-sm font-medium" aria-live="polite">
              {date && time ? (
                isCurrentSlot ? (
                  <span className="text-muted">Esa es la hora de tu cita actual.</span>
                ) : (
                  <>
                    <span className="block first-letter:uppercase">{formatLongDate(date)}</span>
                    <span className="text-muted">{formatTime12(time)}</span>
                  </>
                )
              ) : (
                <span className="text-muted">Elige un día y una hora</span>
              )}
            </p>
            <button
              type="button"
              disabled={!date || !time || isCurrentSlot}
              onClick={() => go("confirm")}
              className={`${primaryButton} shrink-0 ${focusRing}`}
            >
              Continuar
            </button>
          </BottomBar>
        </section>
      )}

      {step === "confirm" && date && time && (
        <section className="flex flex-col gap-4">
          {stepTitle("Confirma el cambio")}
          <p>
            Tu cita pasará del {when(view.date, view.time)} al{" "}
            <strong className="font-semibold">{when(date, time)}</strong>.
          </p>
          {late && (
            <p className="rounded-2xl bg-tint p-4">
              Al confirmar, pierdes el abono que pagaste. Para la nueva fecha tendrás que
              pagar un abono nuevo de{" "}
              <strong className="font-semibold">{formatEuros(view.newDepositCents)}</strong>,
              que Skadi debe aprobar.
            </p>
          )}
          {errorBox}
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={confirmChange}
              disabled={pending}
              aria-busy={pending}
              className={`${primaryButton} w-full ${focusRing}`}
            >
              {pending ? "Enviando…" : "Confirmar cambio"}
            </button>
            <button
              type="button"
              onClick={() => {
                setTime(null);
                go("calendar");
              }}
              disabled={pending}
              className={`${secondaryButton} w-full ${focusRing}`}
            >
              Elegir otra hora
            </button>
          </div>
        </section>
      )}

      {step === "blocked" && (
        <section className="flex flex-col gap-4">
          {view.mode === "already_changed" ? (
            <>
              {stepTitle("Esta cita ya se cambió una vez")}
              <p className="text-muted">
                Solo se puede cambiar una vez. Si necesitas ayuda, escríbele a Skadi Lashes.
              </p>
            </>
          ) : (
            <>
              {stepTitle("Esta cita no se puede reprogramar")}
              <p className="text-muted">
                Solo se pueden cambiar citas confirmadas que aún no han empezado.
              </p>
            </>
          )}
          {errorBox}
          <Link href={`/cita/${token}`} className={`${secondaryButton} w-full ${focusRing}`}>
            Ver mi cita
          </Link>
        </section>
      )}

      {step === "release" && (
        <section className="flex flex-col gap-4">
          {stepTitle("¿No podrás asistir?")}
          {view.releaseLosesDeposit ? (
            <p>
              Liberaremos tu horario para otra clienta. Como faltan menos de{" "}
              {view.noticeHours} horas para tu cita, pierdes el abono que pagaste.
            </p>
          ) : (
            <>
              <p>Liberaremos tu horario para otra clienta.</p>
              {view.paidDeposit && <p className="text-muted">{DEPOSIT_RULE}</p>}
            </>
          )}
          {errorBox}
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={confirmRelease}
              disabled={pending}
              aria-busy={pending}
              className={`${primaryButton} w-full ${focusRing}`}
            >
              {pending ? "Enviando…" : "Sí, liberar mi horario"}
            </button>
            <button
              type="button"
              onClick={() => go(stepBeforeRelease)}
              disabled={pending}
              className={`${secondaryButton} w-full ${focusRing}`}
            >
              Volver
            </button>
          </div>
        </section>
      )}

      {showReleaseLink && (
        <button
          type="button"
          onClick={openRelease}
          className={`flex min-h-11 items-center justify-center self-center px-3 text-muted underline ${focusRing}`}
        >
          No podré asistir
        </button>
      )}
    </main>
  );
}

function CurrentAppointment({ view }: { view: RescheduleView }) {
  return (
    <section
      aria-labelledby="cita-actual"
      className="rounded-2xl border border-border bg-white p-4"
    >
      <h2 id="cita-actual" className="text-sm font-medium text-muted">
        Tu cita actual
      </h2>
      <p className="mt-1 font-semibold first-letter:uppercase">{formatLongDate(view.date)}</p>
      <p className="text-muted">
        {formatTime12(view.time)} – {formatTime12(view.endTime)}
      </p>
      <p className="mt-2 border-t border-border pt-2 text-sm break-words">
        {view.services.map((s) => s.name).join(", ")}
        <span className="text-muted"> · {formatDuration(view.durationMin)}</span>
      </p>
    </section>
  );
}

function BottomBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-lg items-center gap-4 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {children}
      </div>
    </div>
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

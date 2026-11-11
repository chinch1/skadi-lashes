"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { inputClass, primaryButton } from "@/components/ui";
import type { BookingResult } from "@/lib/booking";
import { formatLongDate, formatTime12 } from "@/lib/format";
import { formatEuros } from "@/lib/money";
import { RULES } from "@/lib/rules";
import { formatDuration, photoUrl, type Section, type Service } from "@/lib/services";
import { bookAppointment } from "./actions";
import { CalendarStep, monthOf } from "./calendar-step";

export type ServiceGroup = { section: Section; services: Service[] };

type Step = "services" | "datetime" | "details";
type Field = "firstName" | "lastName" | "phone";

const TITLES: Record<Step, string> = {
  services: "Elige tus servicios",
  datetime: "Elige el día y la hora",
  details: "Tus datos",
};

const DEPOSIT_RULE = RULES.find((rule) => rule.title === "Abono")!.text;

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export function BookingFlow({
  groups,
  today,
  lastBookableDate,
}: {
  groups: ServiceGroup[];
  today: string;
  lastBookableDate: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("services");

  // Paso 1
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set([groups[0].section.id]),
  );

  // Paso 2
  const [month, setMonth] = useState(monthOf(today));
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [slotNotice, setSlotNotice] = useState<string | null>(null);

  // Paso 3
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [remindersOk, setRemindersOk] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstNameRef = useRef<HTMLInputElement>(null);
  const lastNameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const firstRender = useRef(true);

  // Al cambiar de paso: arriba de la página y el foco en el título (lectores de pantalla).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
    headingRef.current?.focus();
  }, [step]);

  // Orden de la página: sección y luego posición del servicio.
  const chosen = useMemo(
    () => groups.flatMap((g) => g.services).filter((s) => selected.has(s.id)),
    [groups, selected],
  );
  const totalMin = chosen.reduce((sum, s) => sum + s.duration_min, 0);
  const totalCents = chosen.reduce((sum, s) => sum + s.price_cents, 0);
  const summary =
    chosen.length === 0
      ? "Elige uno o más servicios"
      : `${chosen.length} ${chosen.length === 1 ? "servicio" : "servicios"} · ${formatDuration(totalMin)} · ${formatEuros(totalCents)}`;

  function toggleService(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // Otros servicios cambian la duración: el día y la hora elegidos ya no valen.
    setDate(null);
    setTime(null);
    setSlotNotice(null);
  }

  function toggleSection(id: string) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function goBack() {
    if (step === "datetime") setStep("services");
    if (step === "details") setStep("datetime");
  }

  function validate(): Partial<Record<Field, string>> {
    const errors: Partial<Record<Field, string>> = {};
    if (!firstName.trim()) errors.firstName = "Escribe tu nombre.";
    if (!lastName.trim()) errors.lastName = "Escribe tu apellido.";
    if (!phone.trim()) errors.phone = "Escribe tu número de WhatsApp.";
    return errors;
  }

  function showFieldErrors(errors: Partial<Record<Field, string>>) {
    setFieldErrors(errors);
    const firstField = (["firstName", "lastName", "phone"] as const).find(
      (f) => errors[f],
    );
    const refs = { firstName: firstNameRef, lastName: lastNameRef, phone: phoneRef };
    if (firstField) refs[firstField].current?.focus();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !date || !time) return;
    setFormError(null);
    const errors = validate();
    if (Object.keys(errors).length > 0) {
      showFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);

    let result: BookingResult;
    try {
      result = await bookAppointment({
        serviceIds: chosen.map((s) => s.id),
        date,
        time,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        remindersOk,
      });
    } catch {
      result = {
        ok: false,
        code: "server",
        error: "No se pudo enviar. Revisa tu conexión e inténtalo de nuevo.",
      };
    }

    if (result.ok) {
      // El botón sigue deshabilitado mientras se abre la página de la cita.
      router.push(`/cita/${result.token}`);
      return;
    }

    setSubmitting(false);
    if (result.code === "slot_taken") {
      setTime(null);
      setMonth(monthOf(date));
      setSlotNotice(result.error);
      setStep("datetime");
      return;
    }
    if (result.code === "invalid" && result.field) {
      showFieldErrors({ [result.field]: result.error });
      return;
    }
    setFormError(result.error);
  }

  const backControl =
    step === "services" ? (
      <Link
        href="/"
        aria-label="Volver al inicio"
        className={`-ml-2 flex size-11 items-center justify-center rounded-full text-primary ${focusRing}`}
      >
        <BackIcon />
      </Link>
    ) : (
      <button
        type="button"
        onClick={goBack}
        aria-label="Volver al paso anterior"
        className={`-ml-2 flex size-11 items-center justify-center rounded-full text-primary ${focusRing}`}
      >
        <BackIcon />
      </button>
    );

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-5 pt-4 pb-40">
      <header className="flex items-center gap-2 pb-5">
        {backControl}
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl font-semibold outline-none"
        >
          {TITLES[step]}
        </h1>
      </header>

      {step === "services" && (
        <>
          <div className="flex flex-col gap-3">
            {groups.map(({ section, services }) => {
              const open = openSections.has(section.id);
              const count = services.filter((s) => selected.has(s.id)).length;
              const panelId = `seccion-${section.id}`;
              return (
                <section
                  key={section.id}
                  className="rounded-2xl border border-border bg-white"
                >
                  <h2>
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-controls={panelId}
                      onClick={() => toggleSection(section.id)}
                      className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl px-4 text-left ${focusRing}`}
                    >
                      <span className="text-lg font-semibold">{section.name}</span>
                      <span className="flex items-center gap-2 text-sm text-muted">
                        {count > 0 && (
                          <span className="rounded-full bg-tint px-2.5 py-0.5 font-sans font-medium text-primary">
                            {count} {count === 1 ? "elegido" : "elegidos"}
                          </span>
                        )}
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 24 24"
                          className={`size-5 transition-transform ${open ? "rotate-180" : ""}`}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </span>
                    </button>
                  </h2>
                  <div
                    id={panelId}
                    hidden={!open}
                    className="grid grid-cols-1 gap-3 px-3 pb-3 sm:grid-cols-2"
                  >
                    {services.map((service) => (
                      <ServiceCard
                        key={service.id}
                        service={service}
                        selected={selected.has(service.id)}
                        onToggle={() => toggleService(service.id)}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>

          <BottomBar>
            <p className="min-w-0 flex-1 text-sm font-medium" aria-live="polite">
              {summary}
            </p>
            <button
              type="button"
              disabled={chosen.length === 0}
              onClick={() => setStep("datetime")}
              className={`${primaryButton} shrink-0 ${focusRing}`}
            >
              Continuar
            </button>
          </BottomBar>
        </>
      )}

      {step === "datetime" && (
        <>
          <CalendarStep
            query={`services=${chosen.map((s) => s.id).join(",")}`}
            today={today}
            lastBookableDate={lastBookableDate}
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
                <>
                  <span className="first-letter:uppercase block">
                    {formatLongDate(date)}
                  </span>
                  <span className="text-muted">{formatTime12(time)}</span>
                </>
              ) : (
                <span className="text-muted">Elige un día y una hora</span>
              )}
            </p>
            <button
              type="button"
              disabled={!date || !time}
              onClick={() => setStep("details")}
              className={`${primaryButton} shrink-0 ${focusRing}`}
            >
              Continuar
            </button>
          </BottomBar>
        </>
      )}

      {step === "details" && date && time && (
        <form onSubmit={submit} noValidate className="flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            <TextField
              id="nombre"
              label="Nombre"
              value={firstName}
              onChange={setFirstName}
              autoComplete="given-name"
              error={fieldErrors.firstName}
              inputRef={firstNameRef}
            />
            <TextField
              id="apellido"
              label="Apellido"
              value={lastName}
              onChange={setLastName}
              autoComplete="family-name"
              error={fieldErrors.lastName}
              inputRef={lastNameRef}
            />
            <TextField
              id="telefono"
              label="Número de WhatsApp"
              value={phone}
              onChange={setPhone}
              autoComplete="tel"
              type="tel"
              inputMode="tel"
              placeholder="0412-1234567"
              error={fieldErrors.phone}
              inputRef={phoneRef}
            />

            <label className="flex min-h-11 cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={remindersOk}
                onChange={(e) => setRemindersOk(e.target.checked)}
                className="size-5 shrink-0 accent-primary"
              />
              <span>Quiero recibir recordatorios por WhatsApp</span>
            </label>
          </div>

          <section
            aria-labelledby="resumen-cita"
            className="flex flex-col gap-4 rounded-2xl border border-border bg-white p-5"
          >
            <h2 id="resumen-cita" className="text-lg font-semibold">
              Tu cita
            </h2>
            <p>
              <span className="block font-medium first-letter:uppercase">
                {formatLongDate(date)}
              </span>
              <span className="text-muted">{formatTime12(time)}</span>
            </p>
            <ul className="flex flex-col gap-2 border-t border-border pt-4">
              {chosen.map((s) => (
                <li key={s.id} className="flex items-baseline justify-between gap-3">
                  <span>{s.name}</span>
                  <span className="shrink-0 text-muted">{formatEuros(s.price_cents)}</span>
                </li>
              ))}
            </ul>
            <dl className="flex flex-col gap-1 border-t border-border pt-4">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Duración</dt>
                <dd>{formatDuration(totalMin)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="font-medium">Total</dt>
                <dd className="font-semibold">{formatEuros(totalCents)}</dd>
              </div>
            </dl>
          </section>

          <p className="text-sm text-muted">{DEPOSIT_RULE}</p>

          {formError && (
            <p
              role="alert"
              className="rounded-xl border border-border-strong bg-tint px-4 py-3 text-sm"
            >
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            aria-busy={submitting}
            className={`${primaryButton} w-full ${focusRing}`}
          >
            {submitting ? "Enviando…" : "Continuar"}
          </button>
        </form>
      )}
    </main>
  );
}

function ServiceCard({
  service,
  selected,
  onToggle,
}: {
  service: Service;
  selected: boolean;
  onToggle: () => void;
}) {
  const src = photoUrl(service.photo_path);
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={[
        "relative flex flex-col overflow-hidden rounded-2xl border-2 bg-white text-left transition-colors",
        focusRing,
        selected ? "border-primary" : "border-border hover:border-border-strong",
      ].join(" ")}
    >
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          className="aspect-[4/3] w-full bg-tint object-cover"
        />
      ) : (
        <span aria-hidden="true" className="block aspect-[4/3] w-full bg-tint" />
      )}
      <span className="flex flex-col gap-0.5 px-4 py-3">
        <span className="font-medium">{service.name}</span>
        <span className="text-sm text-muted">
          {formatDuration(service.duration_min)} · {formatEuros(service.price_cents)}
        </span>
      </span>
      <span
        aria-hidden="true"
        className={[
          "absolute top-3 right-3 flex size-8 items-center justify-center rounded-full border-2 transition-colors",
          selected
            ? "border-primary bg-primary text-white"
            : "border-white bg-white/80 text-transparent",
        ].join(" ")}
      >
        <svg
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12l5 5 9-10" />
        </svg>
      </span>
    </button>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  error,
  inputRef,
  ...rest
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  inputRef: React.Ref<HTMLInputElement>;
  autoComplete: string;
  type?: string;
  inputMode?: "tel" | "text";
  placeholder?: string;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      <input
        id={id}
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`${inputClass} ${error ? "border-red-700" : ""}`}
        {...rest}
      />
      {error && (
        <p id={errorId} role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
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

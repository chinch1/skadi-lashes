import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { primaryButton, secondaryButton } from "@/components/ui";
import { getBookingView, type BookingView } from "@/lib/booking";
import { formatLongDate, formatTime12 } from "@/lib/format";
import { formatEuros } from "@/lib/money";
import { buildRules, type Rule } from "@/lib/rules";
import { formatDuration } from "@/lib/services";
import { getRuleSettings } from "@/lib/studio-settings";
import { PaymentForm } from "./payment-form";

// La página siempre muestra el estado actual de la cita.
export const dynamic = "force-dynamic";

// Enlace privado: no debe aparecer en buscadores.
export const metadata: Metadata = {
  title: "Tu cita",
  robots: { index: false, follow: false },
};

const STUDIO_TIME_ZONE = "America/Caracas";

// Fecha "YYYY-MM-DD" y hora "HH:MM" de un instante, en la hora del estudio.
function studioParts(instant: Date): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: STUDIO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// "hasta las 8:15 pm de hoy", "hasta las 9:00 am de mañana" o con la fecha.
function holdDeadline(holdExpiresAt: string): string | null {
  const instant = new Date(holdExpiresAt);
  if (Number.isNaN(instant.getTime())) return null;
  const hold = studioParts(instant);
  const today = studioParts(new Date()).date;
  const time = formatTime12(hold.time);
  if (hold.date === today) return `hasta las ${time} de hoy`;
  if (hold.date === addDays(today, 1)) return `hasta las ${time} de mañana`;
  return `hasta las ${time} del ${formatLongDate(hold.date)}`;
}

function Summary({ view }: { view: BookingView }) {
  return (
    <section
      aria-labelledby="resumen"
      className="rounded-2xl border border-border bg-white p-5"
    >
      <h2 id="resumen" className="sr-only">
        Resumen de la cita
      </h2>
      <p className="text-lg font-semibold first-letter:uppercase">
        {formatLongDate(view.date)}
      </p>
      <p className="text-muted">
        {formatTime12(view.time)} – {formatTime12(view.endTime)}
      </p>
      <ul className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
        {view.services.map((service, i) => (
          <li key={i} className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 break-words">{service.name}</span>
            <span className="shrink-0 tabular-nums">
              {formatEuros(service.priceCents)}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-border pt-4">
        <span className="text-muted">{formatDuration(view.durationMin)}</span>
        <span className="font-semibold tabular-nums">
          Total {formatEuros(view.totalCents)}
        </span>
      </div>
    </section>
  );
}

function RuleList({ rules, titles }: { rules: readonly Rule[]; titles: string[] }) {
  return (
    <dl className="flex flex-col gap-3 rounded-2xl bg-tint p-5">
      {titles.map((title) => {
        const r = rules.find((rule) => rule.title === title);
        if (!r) return null;
        return (
          <div key={r.title}>
            <dt className="font-medium">{r.title}</dt>
            <dd className="text-muted">{r.text}</dd>
          </div>
        );
      })}
    </dl>
  );
}

function Header({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {children}
    </div>
  );
}

// Enlace discreto a la pantalla que ofrece liberar el horario.
function CantComeLink({ token }: { token: string }) {
  return (
    <Link
      href={`/cita/${token}/reprogramar`}
      className="flex min-h-11 items-center justify-center text-muted underline"
    >
      No podré asistir
    </Link>
  );
}

// Encabezado (título y texto) y cuerpo (normas, formulario, enlaces) de cada estado.
// El resumen de la cita va entre los dos.
function stateContent(
  view: BookingView,
  rules: readonly Rule[],
): { header: ReactNode; body?: ReactNode } {
  switch (view.state) {
    case "awaiting_payment": {
      const deadline = view.holdExpiresAt ? holdDeadline(view.holdExpiresAt) : null;
      const pagoMovil = view.payment?.pagoMovil ?? null;
      const binance = view.payment?.binance ?? null;
      return {
        header: (
          <Header title="Paga tu abono">
            <p>
              Para confirmar tu cita, paga un abono de{" "}
              <strong className="font-semibold">
                {formatEuros(view.depositCents)}
              </strong>
              .
            </p>
            {deadline && (
              <p className="text-muted">
                Tu horario está apartado {deadline}. Si no subes el comprobante
                antes, se libera.
              </p>
            )}
          </Header>
        ),
        body: (
          <>
            <RuleList rules={rules} titles={["Abono"]} />
            {pagoMovil || binance ? (
              <PaymentForm
                token={view.token}
                depositCents={view.depositCents}
                pagoMovil={pagoMovil}
                binance={binance}
              />
            ) : (
              <p className="rounded-2xl border border-border bg-white p-5">
                Por ahora no se puede pagar en línea. Escríbele a Skadi Lashes.
              </p>
            )}
            <CantComeLink token={view.token} />
          </>
        ),
      };
    }
    case "receipt_sent":
      return {
        header: (
          <Header title="Comprobante enviado">
            <p className="text-muted">
              Skadi revisará tu comprobante y te confirmará la cita por
              WhatsApp. Tu horario queda apartado mientras tanto.
            </p>
          </Header>
        ),
        body: <CantComeLink token={view.token} />,
      };
    case "confirmed":
      // También la ve la clienta sin abono: aquí no se habla de pagos.
      return {
        header: (
          <Header title="Cita confirmada">
            <p className="text-muted">Te esperamos, {view.clientFirstName}.</p>
          </Header>
        ),
        body: (
          <>
            <RuleList rules={rules} titles={["Puntualidad", "Acompañantes"]} />
            <Link href={`/cita/${view.token}/reprogramar`} className={secondaryButton}>
              Reprogramar o avisar que no puedo ir
            </Link>
          </>
        ),
      };
    case "expired":
      return {
        header: (
          <Header title="El tiempo para pagar terminó">
            <p className="text-muted">
              No recibimos el comprobante a tiempo y el horario se liberó.
              Puedes agendar de nuevo cuando quieras.
            </p>
          </Header>
        ),
        body: (
          <Link href="/agendar" className={primaryButton}>
            Agendar de nuevo
          </Link>
        ),
      };
    case "released":
      return {
        header: <Header title="Esta cita fue liberada" />,
        body: (
          <Link href="/agendar" className={primaryButton}>
            Agendar una cita
          </Link>
        ),
      };
    case "completed":
    case "no_show":
      // Mismo texto neutro en ambos casos.
      return { header: <Header title="Esta cita ya pasó." /> };
  }
}

export default async function Page(props: PageProps<"/cita/[token]">) {
  const { token } = await props.params;
  const { cambio } = await props.searchParams;
  const [view, settings] = await Promise.all([getBookingView(token), getRuleSettings()]);
  if (!view) notFound();

  const { header, body } = stateContent(view, buildRules(settings));
  // Viene de reprogramar sin abono nuevo: se confirma el cambio arriba.
  const changed = cambio === "ok" && view.state === "confirmed";

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-5 py-10">
      {changed && (
        <p
          role="status"
          className="rounded-xl border border-border-strong bg-tint px-4 py-3"
        >
          Listo, tu cita quedó para el {formatLongDate(view.date)} a las{" "}
          {formatTime12(view.time)}.
        </p>
      )}
      {header}
      <Summary view={view} />
      {body}
      <Link
        href="/"
        className="flex min-h-11 items-center justify-center text-muted underline"
      >
        Volver al inicio
      </Link>
    </main>
  );
}

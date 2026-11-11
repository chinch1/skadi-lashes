import Link from "next/link";
import { headers } from "next/headers";
import { smallButton } from "@/components/ui";
import { getAgenda, type AgendaAppointment } from "@/lib/agenda";
import { requireAdminPage } from "@/lib/auth";
import { formatBolivars, formatLongDate } from "@/lib/format";
import { getStudioRates } from "@/lib/studio-rates";
import { addDays } from "@/lib/time";
import {
  confirmationMessage,
  rejectionMessage,
  waLink,
} from "@/lib/whatsapp";
import { AppointmentCard, DepositCard, NotifyCard } from "./_agenda/cards";
import { CopyLinkButton } from "./_agenda/copy-link-button";

// Dirección pública del sitio, para los enlaces que se envían a las clientas.
async function siteOrigin(): Promise<string> {
  const list = await headers();
  const host = (list.get("x-forwarded-host") ?? list.get("host") ?? "")
    .split(",")[0]
    .trim();
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const forwarded = list.get("x-forwarded-proto")?.split(",")[0].trim();
  const proto = forwarded || (local ? "http" : "https");
  return `${proto}://${host}`;
}

// Solo se acepta una fecha real "AAAA-MM-DD"; si no, se muestra hoy.
function parseDate(value: string | string[] | undefined): string | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }
  return addDays(value, 0) === value ? value : undefined;
}

function messageData(a: AgendaAppointment, link: string) {
  return {
    firstName: a.client.firstName,
    date: a.date,
    time: a.time,
    services: a.services.map((service) => service.name),
    link,
  };
}

function serverNow(): number {
  return Date.now();
}

function dayHref(date: string, today: string): string {
  return date === today ? "/admin" : `/admin?fecha=${date}`;
}

export default async function Page(props: PageProps<"/admin">) {
  const { fecha } = await props.searchParams;
  const { supabase, studioId } = await requireAdminPage();

  const [agenda, rates, origin] = await Promise.all([
    getAgenda(supabase, studioId, parseDate(fecha)),
    getStudioRates(),
    siteOrigin(),
  ]);
  // Hora del servidor: decide si ya se puede marcar "Asistió" o "No asistió",
  // y si liberar ahora hace perder el abono.
  const now = serverNow();
  const noticeMs = agenda.noticeHours * 3_600_000;
  const templates = agenda.messageTemplates;
  const { today, date } = agenda;
  const isToday = date === today;
  const toNotify = agenda.toConfirm.length + agenda.toNotifyRejection.length;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold">Agenda</h1>
        <CopyLinkButton url={`${origin}/agendar`} />
      </div>

      {agenda.pendingDeposits.length > 0 && (
        <section aria-labelledby="abonos" className="mt-6">
          <h2
            id="abonos"
            className="flex items-center gap-2 text-xl font-semibold"
          >
            Abonos por aprobar
            <span className="flex min-w-7 items-center justify-center rounded-full bg-primary px-2 py-0.5 text-sm text-white">
              {agenda.pendingDeposits.length}
            </span>
          </h2>
          <p className="mt-1 mb-3 text-muted">
            Revisa que el pago haya llegado antes de aprobar.
          </p>
          <ul className="flex flex-col gap-3">
            {agenda.pendingDeposits.map((deposit) => (
              <DepositCard key={deposit.depositId} deposit={deposit} />
            ))}
          </ul>
        </section>
      )}

      {toNotify > 0 && (
        <section aria-labelledby="avisar" className="mt-8">
          <h2 id="avisar" className="text-xl font-semibold">
            Avisar a la clienta
          </h2>
          <p className="mt-1 mb-3 text-muted">
            El mensaje ya va escrito. Solo tienes que enviarlo.
          </p>
          <ul className="flex flex-col gap-3">
            {agenda.toConfirm.map((a) => (
              <NotifyCard
                key={a.id}
                appointment={a}
                kind="confirmation"
                href={waLink(
                  a.client.phone,
                  confirmationMessage(
                    messageData(a, `${origin}/cita/${a.token}`),
                    templates.confirmation,
                  ),
                )}
              />
            ))}
            {agenda.toNotifyRejection.map((a) => (
              <NotifyCard
                key={a.id}
                appointment={a}
                kind="rejection"
                href={waLink(
                  a.client.phone,
                  // El horario ya quedó libre: se envía el enlace para agendar.
                  rejectionMessage(
                    messageData(a, `${origin}/agendar`),
                    templates.rejection,
                  ),
                )}
              />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="citas" className="mt-8">
        <h2 id="citas" className="text-xl font-semibold">
          Citas del día
        </h2>

        <nav
          aria-label="Cambiar de día"
          className="mt-3 flex items-center gap-1 rounded-2xl border border-border bg-white p-1"
        >
          <Link
            href={dayHref(addDays(date, -1), today)}
            prefetch={false}
            aria-label="Día anterior"
            className={`${smallButton} min-w-11 text-xl`}
          >
            ‹
          </Link>
          <p className="min-w-0 flex-1 text-center font-medium first-letter:uppercase">
            {formatLongDate(date)}
            {isToday && <span className="text-muted"> · Hoy</span>}
          </p>
          <Link
            href={dayHref(addDays(date, 1), today)}
            prefetch={false}
            aria-label="Día siguiente"
            className={`${smallButton} min-w-11 text-xl`}
          >
            ›
          </Link>
        </nav>
        {!isToday && (
          <Link
            href="/admin"
            prefetch={false}
            className={`${smallButton} mx-auto mt-1 w-fit`}
          >
            Volver a hoy
          </Link>
        )}

        {agenda.dayAppointments.length === 0 ? (
          <p className="mt-4 text-muted">No hay citas este día.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {agenda.dayAppointments.map((a) => (
              <AppointmentCard
                key={a.id}
                appointment={a}
                started={new Date(a.startsAt).getTime() <= now}
                lateRelease={new Date(a.startsAt).getTime() - now < noticeMs}
                noticeHours={agenda.noticeHours}
              />
            ))}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="tasa"
        className="mt-10 rounded-2xl border border-border bg-white px-4 py-3"
      >
        <h2 id="tasa" className="text-sm font-medium text-muted">
          Tasa de cambio (BCV)
        </h2>
        {rates ? (
          <>
            <p className="mt-1 text-lg font-semibold">
              1 € = {formatBolivars(rates.eurToVes)}
            </p>
            <p className="text-muted">
              En USDT se cobra el mismo monto, sin conversión.
            </p>
            {rates.updatedOn && (
              <p className="mt-1 text-sm text-muted">
                Actualizada el {formatLongDate(rates.updatedOn)}. Se renueva
                sola cada día.
              </p>
            )}
          </>
        ) : (
          <p className="mt-1 text-muted">Todavía no hay una tasa cargada.</p>
        )}
      </section>
    </>
  );
}

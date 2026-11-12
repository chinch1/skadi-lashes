// Tarjetas de la Agenda. Se dibujan en el servidor; los botones son
// componentes de cliente aparte.
import type { AgendaAppointment, PendingDeposit } from "@/lib/agenda";
import { formatBolivars, formatLongDate, formatTime12, formatUsdt } from "@/lib/format";
import { formatEuros } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { formatDuration } from "@/lib/services";
import { waLink } from "@/lib/whatsapp";
import { ReminderButton } from "./reminder-button";
import { AppointmentActions } from "./appointment-actions";
import { ConfirmationActions } from "./confirmation-actions";
import { DepositActions } from "./deposit-actions";
import { NotifyActions } from "./notify-actions";

const card = "rounded-2xl border border-border bg-white p-4";

function fullName(a: AgendaAppointment): string {
  return `${a.client.firstName} ${a.client.lastName}`.trim();
}

function timeRange(a: AgendaAppointment): string {
  return `${formatTime12(a.time)} – ${formatTime12(a.endTime)}`;
}

function serviceNames(a: AgendaAppointment): string {
  return a.services.map((service) => service.name).join(", ");
}

const METHOD_LABEL: Record<PendingDeposit["method"], string> = {
  pago_movil: "Pago Móvil",
  binance: "Binance",
};

function paidAmount(deposit: PendingDeposit): string {
  if (deposit.paidAmount !== null) {
    if (deposit.paidCurrency === "VES") return formatBolivars(deposit.paidAmount);
    if (deposit.paidCurrency === "USDT") return formatUsdt(deposit.paidAmount);
  }
  return formatEuros(deposit.amountCents);
}

export function DepositCard({ deposit }: { deposit: PendingDeposit }) {
  const a = deposit.appointment;
  return (
    <li className="rounded-2xl border-2 border-primary bg-white p-4 shadow-sm">
      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold break-words">{fullName(a)}</h3>
          <p className="first-letter:uppercase">{formatLongDate(a.date)}</p>
          <p>{timeRange(a)}</p>
          <p className="mt-1 text-sm break-words text-muted">{serviceNames(a)}</p>
        </div>
        {deposit.receiptUrl ? (
          <a
            href={deposit.receiptUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block shrink-0 self-start"
          >
            <img
              src={deposit.receiptUrl}
              alt={`Comprobante de ${fullName(a)}. Toca para verlo completo`}
              className="h-28 w-24 rounded-xl border border-border object-cover"
            />
          </a>
        ) : (
          <p className="flex h-28 w-24 shrink-0 items-center rounded-xl bg-tint p-2 text-center text-xs text-muted">
            Comprobante no disponible
          </p>
        )}
      </div>

      <p className="mt-3 rounded-xl bg-tint px-3 py-2">
        <span className="text-muted">{METHOD_LABEL[deposit.method]}:</span>{" "}
        <span className="font-semibold">{paidAmount(deposit)}</span>
      </p>

      <div className="mt-3">
        <DepositActions depositId={deposit.depositId} />
      </div>
    </li>
  );
}

// Botón redondo que abre el chat de WhatsApp con la clienta, sin mensaje.
function WhatsAppButton({ appointment: a }: { appointment: AgendaAppointment }) {
  return (
    <a
      href={waLink(a.client.phone, "")}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Escribirle a ${fullName(a)} por WhatsApp`}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-whatsapp text-white"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
      </svg>
    </a>
  );
}

function PhoneText({ appointment: a }: { appointment: AgendaAppointment }) {
  return <p className="text-sm break-words text-muted">{formatPhone(a.client.phone)}</p>;
}

// Cita sin abono que espera que Giselle la confirme o la rechace.
export function ConfirmationCard({ appointment: a }: { appointment: AgendaAppointment }) {
  return (
    <li className="rounded-2xl border-2 border-primary bg-white p-4 shadow-sm">
      <h3 className="text-lg font-semibold break-words">{fullName(a)}</h3>
      <p className="first-letter:uppercase">{formatLongDate(a.date)}</p>
      <p>{timeRange(a)}</p>
      <p className="mt-1 text-sm break-words text-muted">{serviceNames(a)}</p>
      <p className="text-sm text-muted">
        {formatDuration(a.durationMin)} · {formatEuros(a.totalCents)}
      </p>
      <div className="mt-1 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted">Sin abono</p>
          <PhoneText appointment={a} />
        </div>
        <WhatsAppButton appointment={a} />
      </div>

      <div className="mt-3">
        <ConfirmationActions appointmentId={a.id} />
      </div>
    </li>
  );
}

function notifyLabel(a: AgendaAppointment, kind: "confirmation" | "rejection"): string {
  if (a.depositCents === 0) {
    return kind === "confirmation" ? "Cita confirmada" : "Cita rechazada";
  }
  return kind === "confirmation" ? "Abono aprobado" : "Comprobante rechazado";
}

export function NotifyCard({
  appointment: a,
  kind,
  href,
}: {
  appointment: AgendaAppointment;
  kind: "confirmation" | "rejection";
  href: string;
}) {
  return (
    <li className={card}>
      <p
        className={`text-sm font-medium ${kind === "confirmation" ? "text-whatsapp" : "text-red-800"}`}
      >
        {notifyLabel(a, kind)}
      </p>
      <h3 className="mt-1 text-lg font-semibold break-words">{fullName(a)}</h3>
      <p className="mb-3 text-muted">
        <span className="inline-block first-letter:uppercase">
          {formatLongDate(a.date)}
        </span>
        , {formatTime12(a.time)}
      </p>
      <NotifyActions appointmentId={a.id} kind={kind} href={href} />
    </li>
  );
}

function StatusChip({ appointment: a }: { appointment: AgendaAppointment }) {
  let label: string;
  let tone = "bg-tint text-primary";
  if (a.status === "pending_deposit" && a.awaitingConfirmation) {
    label = "Por confirmar";
    tone = "bg-amber-50 text-amber-900";
  } else if (a.status === "pending_deposit") {
    label = "Por aprobar";
    tone = "bg-amber-50 text-amber-900";
  } else if (a.status === "confirmed") {
    label = "Confirmada";
    tone = "bg-green-50 text-whatsapp";
  } else if (a.status === "completed") {
    label = "Asistió";
  } else if (a.status === "no_show") {
    label = "No asistió";
    tone = "bg-red-50 text-red-800";
  } else {
    label = "Liberada";
    tone = "bg-tint text-muted";
  }
  return (
    <span className={`inline-block shrink-0 rounded-full px-3 py-1 text-sm font-medium ${tone}`}>
      {label}
    </span>
  );
}

// Lo que se pregunta antes de liberar. A una clienta sin abono no se le
// menciona el abono.
function releaseQuestion(a: AgendaAppointment, late: boolean, noticeHours: number): string {
  if (a.depositCents === 0) return "¿Liberar este horario?";
  if (late) {
    return `¿Liberar este horario? Faltan menos de ${noticeHours} horas: la clienta pierde el abono.`;
  }
  return "¿Liberar este horario? Avísale a la clienta.";
}

export function AppointmentCard({
  appointment: a,
  started,
  lateRelease,
  noticeHours,
  reminderHref,
}: {
  appointment: AgendaAppointment;
  started: boolean;
  // Faltan menos horas que las de aviso (hora del servidor).
  lateRelease: boolean;
  noticeHours: number;
  // Enlace de WhatsApp con el recordatorio ya escrito. Solo para citas
  // confirmadas de clientas que aceptaron recordatorios.
  reminderHref?: string | null;
}) {
  const active = a.status === "pending_deposit" || a.status === "confirmed";
  return (
    <li className={card}>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 pt-1 font-semibold">{timeRange(a)}</p>
        <StatusChip appointment={a} />
      </div>
      <div className="mt-1">
        <AppointmentActions
          appointmentId={a.id}
          whatsapp={
            reminderHref ? (
              <ReminderButton
                appointmentId={a.id}
                href={reminderHref}
                clientName={fullName(a)}
              />
            ) : (
              <WhatsAppButton appointment={a} />
            )
          }
          canRelease={active}
          releaseConfirm={releaseQuestion(a, lateRelease, noticeHours)}
          canMark={a.status === "confirmed" && started}
        >
          <h3 className="text-lg font-semibold break-words">{fullName(a)}</h3>
          <p className="text-sm break-words text-muted">{serviceNames(a)}</p>
          <p className="text-sm text-muted">
            {formatDuration(a.durationMin)} · {formatEuros(a.totalCents)}
          </p>
          <PhoneText appointment={a} />
        </AppointmentActions>
      </div>
    </li>
  );
}

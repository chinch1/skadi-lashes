// Tarjetas de la Agenda. Se dibujan en el servidor; los botones son
// componentes de cliente aparte.
import type { AgendaAppointment, PendingDeposit } from "@/lib/agenda";
import { formatBolivars, formatLongDate, formatTime12, formatUsdt } from "@/lib/format";
import { formatEuros } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { formatDuration } from "@/lib/services";
import { waLink } from "@/lib/whatsapp";
import { AppointmentActions } from "./appointment-actions";
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
        {kind === "confirmation" ? "Abono aprobado" : "Comprobante rechazado"}
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
  if (a.status === "pending_deposit" && a.awaitingReceipt) {
    label = a.holdDeadline
      ? `Esperando comprobante hasta las ${formatTime12(a.holdDeadline)}`
      : "Esperando comprobante";
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
    <span className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${tone}`}>
      {label}
    </span>
  );
}

export function AppointmentCard({
  appointment: a,
  started,
}: {
  appointment: AgendaAppointment;
  started: boolean;
}) {
  const active = a.status === "pending_deposit" || a.status === "confirmed";
  return (
    <li className={card}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">{timeRange(a)}</p>
        <StatusChip appointment={a} />
      </div>
      <h3 className="mt-2 text-lg font-semibold break-words">{fullName(a)}</h3>
      <p className="text-sm break-words text-muted">{serviceNames(a)}</p>
      <p className="text-sm text-muted">
        {formatDuration(a.durationMin)} · {formatEuros(a.totalCents)}
      </p>

      <a
        href={waLink(a.client.phone, "")}
        target="_blank"
        rel="noopener noreferrer"
        className="-ml-3 mt-1 flex min-h-11 w-fit items-center gap-2 rounded-lg px-3 font-medium text-whatsapp"
      >
        <span>WhatsApp</span>
        <span className="text-muted">{formatPhone(a.client.phone)}</span>
      </a>

      {active && (
        <div className="mt-2">
          <AppointmentActions
            appointmentId={a.id}
            canRelease={active}
            canMark={a.status === "confirmed" && started}
          />
        </div>
      )}
    </li>
  );
}

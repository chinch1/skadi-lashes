import Link from "next/link";
import { notFound } from "next/navigation";
import { smallButton } from "@/components/ui";
import { requireAdminPage } from "@/lib/auth";
import {
  fullName,
  getClientDetail,
  type ClientAppointment,
  type ClientStatus,
} from "@/lib/clients";
import { formatLongDate, formatMonth, formatTime12 } from "@/lib/format";
import { formatEuros } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { waLink } from "@/lib/whatsapp";
import { DepositSwitch, NameForm } from "./client-forms";

const card = "rounded-2xl border border-border bg-white p-4";

const STATUS: Record<ClientStatus, { label: string; tone: string }> = {
  completed: { label: "Asistió", tone: "bg-tint text-primary" },
  no_show: { label: "No asistió", tone: "bg-red-50 text-red-800" },
  confirmed: { label: "Confirmada", tone: "bg-green-50 text-whatsapp" },
  pending_deposit: { label: "Por aprobar", tone: "bg-amber-50 text-amber-900" },
  released: { label: "Liberada", tone: "bg-tint text-muted" },
};

// La fecha lleva el año solo si no es el año en curso.
function appointmentDate(a: ClientAppointment, today: string): string {
  const text = formatLongDate(a.date);
  const year = a.date.slice(0, 4);
  return year === today.slice(0, 4) ? text : `${text} de ${year}`;
}

function Counter({ value, label, tone }: { value: number; label: string; tone?: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-white px-2 py-3 text-center">
      <p className={`text-2xl font-semibold ${tone ?? ""}`}>{value}</p>
      <p className="text-sm break-words text-muted">{label}</p>
    </div>
  );
}

export default async function Page(props: PageProps<"/admin/clientas/[id]">) {
  const { id } = await props.params;
  const { supabase, studioId } = await requireAdminPage();
  const detail = await getClientDetail(supabase, studioId, id);
  if (!detail) notFound();

  const { client, appointments, today } = detail;
  const name = fullName(client.firstName, client.lastName);

  return (
    <>
      <Link href="/admin/clientas" className={`${smallButton} -ml-3 w-fit`}>
        ‹ Clientas
      </Link>

      <header className="mt-1">
        <h1 className="text-2xl font-semibold break-words">{name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-lg">{formatPhone(client.phone)}</span>
          <a
            href={waLink(client.phone, "")}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-11 items-center rounded-xl bg-whatsapp px-4 font-medium text-white"
          >
            WhatsApp
          </a>
        </div>
        <p className="mt-2 text-muted">
          Clienta desde {formatMonth(client.sinceMonth)}
        </p>
        <p className="text-muted">
          {client.remindersOk ? "Acepta recordatorios" : "No quiere recordatorios"}
        </p>
      </header>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <Counter value={detail.attended} label="Atendidas" />
        <Counter
          value={detail.noShows}
          label={detail.noShows === 1 ? "Falta" : "Faltas"}
          tone={detail.noShows > 0 ? "text-amber-800" : undefined}
        />
        <Counter
          value={detail.upcoming}
          label={detail.upcoming === 1 ? "Próxima" : "Próximas"}
        />
      </div>

      <section className={`${card} mt-6`}>
        <h2 className="mb-2 text-xl font-semibold">Abono</h2>
        <DepositSwitch clientId={client.id} required={!client.depositExempt} />
      </section>

      <section className={`${card} mt-4`}>
        <h2 className="text-xl font-semibold">Datos</h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          El nombre se guarda cuando agenda por primera vez y ella no puede
          cambiarlo. Corrígelo aquí si hace falta.
        </p>
        <NameForm
          clientId={client.id}
          firstName={client.firstName}
          lastName={client.lastName}
        />
        <div className="mt-5 border-t border-border pt-4">
          <p className="font-medium">Número de WhatsApp</p>
          <p className="text-lg">{formatPhone(client.phone)}</p>
          <p className="mt-1 text-sm text-muted">
            El número identifica a la clienta, por eso no se puede cambiar.
          </p>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Historial</h2>
        {appointments.length === 0 ? (
          <p className="mt-2 text-muted">Aún no tiene citas.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {appointments.map((a) => {
              const status = STATUS[a.status] ?? STATUS.released;
              return (
                <li key={a.id} className={card}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold first-letter:uppercase">
                        {appointmentDate(a, today)}
                      </p>
                      <p>
                        {formatTime12(a.time)} – {formatTime12(a.endTime)}
                      </p>
                    </div>
                    <span
                      className={`inline-block shrink-0 rounded-full px-3 py-1 text-sm font-medium ${status.tone}`}
                    >
                      {status.label}
                    </span>
                  </div>
                  {a.services.length > 0 && (
                    <p className="mt-1 text-sm break-words text-muted">
                      {a.services.join(", ")}
                    </p>
                  )}
                  <p className="text-sm text-muted">
                    {formatEuros(a.totalCents)}
                    {a.rescheduled && " · Reprogramada"}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

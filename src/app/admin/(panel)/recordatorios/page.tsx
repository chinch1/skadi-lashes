import Link from "next/link";
import { headers } from "next/headers";
import { requireAdminPage } from "@/lib/auth";
import { formatLongDate, formatTime12 } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import {
  getReminders,
  type RetouchReminder,
  type TomorrowAppointment,
} from "@/lib/reminders";
import { reminderMessage, retouchMessage, waLink } from "@/lib/whatsapp";
import { ReminderActions } from "./reminder-actions";

const card = "rounded-2xl border border-border bg-white p-4";

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

function fullName(client: { firstName: string; lastName: string }): string {
  return `${client.firstName} ${client.lastName}`.trim();
}

function daysAgoText(days: number): string {
  if (days <= 0) return "hoy";
  return days === 1 ? "hace 1 día" : `hace ${days} días`;
}

function ReminderCard({
  appointment: a,
  href,
}: {
  appointment: TomorrowAppointment;
  href: string;
}) {
  return (
    <li className={card}>
      <p className="font-semibold">{formatTime12(a.time)}</p>
      <h4 className="mt-1 text-lg font-semibold break-words">{fullName(a.client)}</h4>
      <p className="mb-3 text-sm break-words text-muted">{a.services.join(", ")}</p>
      <ReminderActions appointmentId={a.id} kind="appointment_reminder" href={href} />
    </li>
  );
}

function RetouchCard({ item, href }: { item: RetouchReminder; href: string }) {
  return (
    <li className={card}>
      <h3 className="text-lg font-semibold break-words">{fullName(item.client)}</h3>
      <p className="text-sm break-words text-muted">{item.services.join(", ")}</p>
      <p className="mb-3 text-sm text-muted">
        Cita del {formatLongDate(item.date)} ·{" "}
        {daysAgoText(item.daysAgo)}
      </p>
      <ReminderActions appointmentId={item.id} kind="retouch_reminder" href={href} />
    </li>
  );
}

export default async function Page() {
  const { supabase, studioId } = await requireAdminPage();
  const [data, origin] = await Promise.all([
    getReminders(supabase, studioId),
    siteOrigin(),
  ]);
  const templates = data.messageTemplates;
  const hasTomorrow =
    data.toRemind.length + data.noReminders.length + data.reminded.length > 0;

  return (
    <>
      <h1 className="text-2xl font-semibold">Recordatorios</h1>

      <section aria-labelledby="manana" className="mt-6">
        <h2 id="manana" className="text-xl font-semibold">
          Citas de mañana
        </h2>
        <p className="mt-1 text-muted first-letter:uppercase">
          {formatLongDate(data.tomorrow)}
        </p>

        {!hasTomorrow ? (
          <p className="mt-4 text-muted">No hay citas mañana.</p>
        ) : (
          <>
            {data.toRemind.length > 0 && (
              <div className="mt-4">
                <h3 className="mb-2 font-semibold">Por recordar</h3>
                <ul className="flex flex-col gap-3">
                  {data.toRemind.map((a) => (
                    <ReminderCard
                      key={a.id}
                      appointment={a}
                      href={waLink(
                        a.client.phone,
                        reminderMessage(
                          {
                            firstName: a.client.firstName,
                            date: a.date,
                            time: a.time,
                            services: a.services,
                            link: `${origin}/cita/${a.token}`,
                          },
                          templates.reminder,
                        ),
                      )}
                    />
                  ))}
                </ul>
              </div>
            )}

            {data.noReminders.length > 0 && (
              <div className="mt-6">
                <h3 className="font-medium text-muted">No quieren recordatorios</h3>
                <ul className="mt-2 flex flex-col divide-y divide-border rounded-2xl border border-border bg-white">
                  {data.noReminders.map((a) => (
                    <li key={a.id} className="px-4 py-2">
                      <p className="break-words">
                        <span className="font-medium">{fullName(a.client)}</span>
                        <span className="text-muted"> · {formatTime12(a.time)}</span>
                      </p>
                      <a
                        href={waLink(a.client.phone, "")}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="-ml-3 flex min-h-11 w-fit items-center gap-2 rounded-lg px-3 font-medium text-whatsapp"
                      >
                        <span>WhatsApp</span>
                        <span className="text-muted">{formatPhone(a.client.phone)}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {data.reminded.length > 0 && (
              <details className="mt-6 rounded-2xl border border-border bg-white">
                <summary className="flex min-h-11 cursor-pointer items-center px-4 font-medium text-muted">
                  Ya recordadas ({data.reminded.length})
                </summary>
                <ul className="divide-y divide-border border-t border-border">
                  {data.reminded.map((a) => (
                    <li
                      key={a.id}
                      className="flex flex-wrap items-center justify-between gap-x-3 px-4 py-2 text-muted"
                    >
                      <span className="min-w-0 break-words">
                        {fullName(a.client)} · {formatTime12(a.time)}
                      </span>
                      <span className="text-sm text-whatsapp">Recordada</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="retoques" className="mt-10">
        <h2 id="retoques" className="text-xl font-semibold">
          Retoques pendientes
        </h2>
        <p className="mt-1 text-muted">
          Clientas que ya deberían volver para su retoque y aún no han agendado.
        </p>

        {data.retouches.length === 0 ? (
          <p className="mt-4 text-muted">No hay retoques pendientes.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {data.retouches.map((item) => (
              <RetouchCard
                key={item.id}
                item={item}
                href={waLink(
                  item.client.phone,
                  retouchMessage(
                    {
                      firstName: item.client.firstName,
                      date: item.date,
                      time: item.time,
                      services: item.services,
                      link: `${origin}/agendar`,
                    },
                    templates.retouch,
                  ),
                )}
              />
            ))}
          </ul>
        )}
      </section>

      <p className="mt-10 text-sm text-muted">
        Puedes cambiar estos textos en{" "}
        <Link
          href="/admin/ajustes/mensajes"
          className="inline-flex min-h-11 items-center font-medium text-primary underline"
        >
          Ajustes › Mensajes de WhatsApp
        </Link>
        .
      </p>
    </>
  );
}

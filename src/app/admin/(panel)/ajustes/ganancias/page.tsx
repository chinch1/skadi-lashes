import Link from "next/link";
import { smallButton } from "@/components/ui";
import { requireAdminPage } from "@/lib/auth";
import { shiftMonth } from "@/lib/earnings";
import { getEarnings, type EarningsData } from "@/lib/earnings-data";
import { formatMonth } from "@/lib/format";
import { formatDollars } from "@/lib/money";
import { zonedParts } from "@/lib/time";

const PATH = "/admin/ajustes/ganancias";
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
// Hasta cuántos meses hacia atrás se puede mirar.
const MAX_MONTHS_BACK = 24;
// Meses en la comparación de abajo.
const HISTORY_MONTHS = 6;

const card = "rounded-2xl border border-border bg-white p-4";
const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary";

// Hora del servidor, fuera del render (las reglas de React piden funciones puras).
function serverNow(): Date {
  return new Date();
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function monthHref(month: string, currentMonth: string): string {
  return month === currentMonth ? PATH : `${PATH}?mes=${month}`;
}

function timesText(count: number): string {
  return count === 1 ? "1 vez" : `${count} veces`;
}

function appointmentsText(count: number): string {
  return count === 1 ? "1 cita" : `${count} citas`;
}

function MonthLink({
  href,
  label,
  direction,
}: {
  href: string | null;
  label: string;
  direction: "left" | "right";
}) {
  const className = `${smallButton} w-11 ${focusRing}`;
  const chevron = (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={direction === "left" ? "M15 18l-6-6 6-6" : "M9 6l6 6-6 6"} />
    </svg>
  );
  if (!href) {
    return (
      <span aria-hidden="true" className={`${className} opacity-30`}>
        {chevron}
      </span>
    );
  }
  return (
    <Link href={href} prefetch={false} aria-label={label} className={className}>
      {chevron}
    </Link>
  );
}

export default async function Page(props: PageProps<"/admin/ajustes/ganancias">) {
  const searchParams = await props.searchParams;
  const rawMonth = single(searchParams.mes);

  const { supabase, studioId, studio } = await requireAdminPage();
  const now = serverNow();
  const timeZone = studio.timezone || "America/Caracas";

  const currentMonth = zonedParts(now, timeZone).date.slice(0, 7);
  const firstMonth = shiftMonth(currentMonth, -MAX_MONTHS_BACK);
  const month =
    rawMonth && MONTH_RE.test(rawMonth) && rawMonth >= firstMonth && rawMonth <= currentMonth
      ? rawMonth
      : currentMonth;
  const isCurrent = month === currentMonth;

  let data: EarningsData | null = null;
  try {
    data = await getEarnings(supabase, studioId, {
      month,
      timeZone,
      now,
      months: HISTORY_MONTHS,
    });
  } catch {
    data = null;
  }

  const prevHref = month > firstMonth ? monthHref(shiftMonth(month, -1), currentMonth) : null;
  const nextHref = month < currentMonth ? monthHref(shiftMonth(month, 1), currentMonth) : null;

  return (
    <>
      <Link href="/admin/ajustes" className={`${smallButton} -ml-3 w-fit`}>
        ‹ Ajustes
      </Link>
      <h1 className="mt-1 text-2xl font-semibold">Ganancias</h1>

      <div className="mt-3 flex items-center justify-between gap-2">
        <MonthLink href={prevHref} label="Mes anterior" direction="left" />
        <h2 className="text-lg font-semibold first-letter:uppercase">
          {formatMonth(month)}
        </h2>
        <MonthLink href={nextHref} label="Mes siguiente" direction="right" />
      </div>

      {!data ? (
        <p role="alert" className="mt-4 text-red-800">
          No se pudieron cargar las ganancias. Recarga la página.
        </p>
      ) : (
        <EarningsView
          data={data}
          isCurrent={isCurrent}
          currentMonth={currentMonth}
          firstMonth={firstMonth}
        />
      )}

      <p className="mt-8 px-1 text-sm text-muted">
        Se cuentan las citas marcadas como atendidas y las confirmadas que ya
        pasaron, más los abonos que no se devolvieron. Los montos son los precios
        de lista en dólares.
      </p>
    </>
  );
}

function EarningsView({
  data,
  isCurrent,
  currentMonth,
  firstMonth,
}: {
  data: EarningsData;
  isCurrent: boolean;
  currentMonth: string;
  firstMonth: string;
}) {
  const { selected, history } = data;
  const showUpcoming = isCurrent || selected.upcoming.count > 0;
  const largest = Math.max(...history.map((h) => h.totalCents), 0);

  return (
    <>
      <section aria-labelledby="total-mes" className={`mt-3 ${card}`}>
        <h2 id="total-mes" className="text-sm font-medium text-muted">
          Total del mes
        </h2>
        <p className="mt-1 text-4xl font-semibold text-primary tabular-nums">
          {formatDollars(selected.totalCents)}
        </p>
        <dl className="mt-4 flex flex-col gap-2 border-t border-border pt-3">
          <div className="flex items-baseline justify-between gap-3">
            <dt>Citas atendidas ({selected.attended.count})</dt>
            <dd className="font-medium tabular-nums">
              {formatDollars(selected.attended.cents)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt>Abonos perdidos ({selected.forfeited.count})</dt>
            <dd className="font-medium tabular-nums">
              {formatDollars(selected.forfeited.cents)}
            </dd>
          </div>
        </dl>
      </section>

      {(showUpcoming || selected.noShows > 0) && (
        <section className={`mt-3 ${card}`}>
          {showUpcoming && (
            <>
              <h2 className="font-semibold">Por venir este mes</h2>
              {selected.upcoming.count === 0 ? (
                <p className="mt-1 text-sm text-muted">
                  No quedan citas confirmadas este mes.
                </p>
              ) : (
                <div className="mt-1 flex items-baseline justify-between gap-3">
                  <p className="text-muted">
                    {appointmentsText(selected.upcoming.count)} confirmadas
                  </p>
                  <p className="font-medium tabular-nums">
                    {formatDollars(selected.upcoming.cents)}
                  </p>
                </div>
              )}
            </>
          )}
          {selected.noShows > 0 && (
            <p
              className={
                showUpcoming ? "mt-3 border-t border-border pt-3 text-muted" : "text-muted"
              }
            >
              Faltas: {selected.noShows}
            </p>
          )}
        </section>
      )}

      <section aria-labelledby="por-servicio" className="mt-8">
        <h2 id="por-servicio" className="text-xl font-semibold">
          Por servicio
        </h2>
        {selected.byService.length === 0 ? (
          <p className="mt-2 text-muted">Aún no hay citas atendidas este mes.</p>
        ) : (
          <ul className={`mt-3 divide-y divide-border ${card} py-1`}>
            {selected.byService.map((s) => (
              <li key={s.name} className="flex items-center gap-3 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium break-words">{s.name}</span>
                  <span className="block text-sm text-muted">{timesText(s.count)}</span>
                </span>
                <span className="font-medium tabular-nums">{formatDollars(s.cents)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="ultimos-meses" className="mt-8">
        <h2 id="ultimos-meses" className="text-xl font-semibold">
          Últimos {history.length} meses
        </h2>
        <ul className={`mt-3 divide-y divide-border ${card} px-0 py-1`}>
          {history.map((h, index) => {
            const width = largest > 0 ? (h.totalCents / largest) * 100 : 0;
            const content = (
              <>
                <span className="flex items-baseline justify-between gap-3">
                  <span className={`first-letter:uppercase ${index === 0 ? "font-semibold" : ""}`}>
                    {formatMonth(h.month)}
                  </span>
                  <span className="font-medium tabular-nums">
                    {formatDollars(h.totalCents)}
                  </span>
                </span>
                <span aria-hidden="true" className="mt-2 block h-1.5 rounded-full bg-tint">
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${width}%` }}
                  />
                </span>
              </>
            );
            const rowClass = "block min-h-11 px-4 py-3";
            return (
              <li key={h.month}>
                {index === 0 || h.month < firstMonth ? (
                  // El mes que ya se está viendo, o uno más viejo de lo que se puede abrir.
                  <div className={rowClass} aria-current={index === 0 ? "true" : undefined}>
                    {content}
                  </div>
                ) : (
                  <Link
                    href={monthHref(h.month, currentMonth)}
                    prefetch={false}
                    className={`${rowClass} ${focusRing}`}
                  >
                    {content}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

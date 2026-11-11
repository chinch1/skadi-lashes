import Image from "next/image";
import Link from "next/link";
import logo from "@/assets/logo.png";
import { formatBolivars, formatLongDate } from "@/lib/format";
import { buildRules } from "@/lib/rules";
import { getStudioRates } from "@/lib/studio-rates";
import { getRuleSettings } from "@/lib/studio-settings";

// La tasa cambia cada día: la página se arma en cada visita.
export const dynamic = "force-dynamic";

export default async function Home() {
  const [rates, settings] = await Promise.all([getStudioRates(), getRuleSettings()]);
  const rules = buildRules(settings);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-5 py-10">
      <header>
        <h1>
          {/* El logo tiene fondo blanco; "multiply" lo funde con el fondo de la página. */}
          <Image
            src={logo}
            alt="Skadi Lash Technician"
            priority
            unoptimized
            className="mx-auto h-auto w-full max-w-xs mix-blend-multiply"
          />
        </h1>
      </header>

      <nav className="flex flex-col gap-3">
        <Link
          href="/agendar"
          className="flex min-h-14 items-center justify-center rounded-xl bg-primary px-5 text-lg font-medium text-white"
        >
          Agendar una cita
        </Link>
        <Link
          href="/reprogramar"
          className="flex min-h-14 items-center justify-center rounded-xl border border-border-strong px-5 text-lg font-medium text-primary"
        >
          Reprogramar una cita
        </Link>
      </nav>

      {rates && (
        <p className="-mt-3 text-center text-sm text-muted">
          Tasa BCV: 1 € = {formatBolivars(rates.eurToVes)}
          {rates.updatedOn && (
            <span className="block">
              Actualizada el {formatLongDate(rates.updatedOn)}
            </span>
          )}
        </p>
      )}

      <section aria-labelledby="normas" className="rounded-2xl bg-tint p-5">
        <h2 id="normas" className="text-lg font-semibold">
          Normas del estudio
        </h2>
        <dl className="mt-3 flex flex-col gap-3">
          {rules.map((rule) => (
            <div key={rule.title}>
              <dt className="font-medium">{rule.title}</dt>
              <dd className="text-muted">{rule.text}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}

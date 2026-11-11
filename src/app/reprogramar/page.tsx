import type { Metadata } from "next";
import Link from "next/link";
import { buildRules, ruleText } from "@/lib/rules";
import { getRuleSettings } from "@/lib/studio-settings";
import { FindAppointment } from "./find-appointment";

export const metadata: Metadata = {
  title: "Reprogramar una cita",
};

// Las horas de aviso salen de los ajustes: la página se arma en cada visita.
export const dynamic = "force-dynamic";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export default async function Page() {
  const rescheduleRule = ruleText(buildRules(await getRuleSettings()), "Reprogramación");

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-5 pt-4 pb-10">
      <header className="flex items-center gap-2">
        <Link
          href="/"
          aria-label="Volver al inicio"
          className={`-ml-2 flex size-11 shrink-0 items-center justify-center rounded-full text-primary ${focusRing}`}
        >
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
        </Link>
        <h1 className="text-2xl font-semibold">Reprogramar una cita</h1>
      </header>

      <FindAppointment />

      <dl className="rounded-2xl bg-tint p-5">
        <dt className="font-medium">Reprogramación</dt>
        <dd className="text-muted">{rescheduleRule}</dd>
      </dl>
    </main>
  );
}

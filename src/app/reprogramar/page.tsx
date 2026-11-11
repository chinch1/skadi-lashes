import type { Metadata } from "next";
import Link from "next/link";
import { RULES } from "@/lib/rules";
import { FindAppointment } from "./find-appointment";

export const metadata: Metadata = {
  title: "Reprogramar una cita",
};

const RESCHEDULE_RULE = RULES.find((rule) => rule.title === "Reprogramación")!.text;

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export default function Page() {
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
        <dd className="text-muted">{RESCHEDULE_RULE}</dd>
      </dl>
    </main>
  );
}

import Link from "next/link";
import { requireAdminPage } from "@/lib/auth";
import { DEFAULT_RULE_SETTINGS } from "@/lib/rules";
import { logout } from "../../actions";
import { AmountsForm } from "./amounts-form";

export default async function Page() {
  const { supabase, studioId } = await requireAdminPage();
  const { data: studio, error } = await supabase
    .from("studios")
    .select("deposit_cents, late_fee_cents, late_tolerance_min")
    .eq("id", studioId)
    .maybeSingle();
  if (error) console.error("[ajustes] leer montos:", error.message);

  return (
    <>
      <h1 className="text-2xl font-semibold">Ajustes</h1>

      <section
        aria-labelledby="montos"
        className="mt-6 rounded-2xl border border-border bg-white p-4"
      >
        <h2 id="montos" className="mb-4 text-lg font-semibold">
          Montos
        </h2>
        {studio ? (
          <AmountsForm
            depositCents={Number(studio.deposit_cents) || 0}
            lateFeeCents={Number(studio.late_fee_cents) || 0}
            lateToleranceMin={
              Number(studio.late_tolerance_min ?? DEFAULT_RULE_SETTINGS.lateToleranceMin) || 0
            }
          />
        ) : (
          <p role="alert" className="text-red-800">
            No se pudieron cargar los montos. Recarga la página.
          </p>
        )}
      </section>
      <p className="mt-2 px-1 text-sm text-muted">
        El cambio vale para las citas que se agenden de ahora en adelante.
      </p>

      <Link
        href="/admin/ajustes/horario"
        className="mt-6 flex min-h-12 items-center gap-3 rounded-2xl border border-border bg-white px-4 py-3"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Mi horario</span>
          <span className="block text-sm text-muted">
            Las horas que ofreces cada día.
          </span>
        </span>
        <span aria-hidden="true" className="text-xl text-muted">
          ›
        </span>
      </Link>
      <Link
        href="/admin/ajustes/mensajes"
        className="mt-3 flex min-h-12 items-center gap-3 rounded-2xl border border-border bg-white px-4 py-3"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Mensajes de WhatsApp</span>
          <span className="block text-sm text-muted">
            Los textos que se envían por WhatsApp.
          </span>
        </span>
        <span aria-hidden="true" className="text-xl text-muted">
          ›
        </span>
      </Link>
      <form action={logout} className="mt-8">
        <button
          type="submit"
          className="flex min-h-12 w-full items-center justify-center rounded-xl border border-border-strong px-5 font-medium text-primary"
        >
          Cerrar sesión
        </button>
      </form>
    </>
  );
}

import Link from "next/link";
import { logout } from "../../actions";

export default function Page() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Ajustes</h1>
      <p className="mt-2 text-muted">
        Aquí podrás cambiar el monto del abono y el cargo por retraso.
      </p>
      <Link
        href="/admin/ajustes/horario"
        className="mt-6 flex min-h-12 items-center gap-3 rounded-2xl border border-border bg-white px-4 py-3"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Mi horario</span>
          <span className="block text-sm text-muted">
            Días y horas en que atiendes, y bloqueos.
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
            Los textos que se envían al aprobar o rechazar un abono.
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

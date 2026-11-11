import { logout } from "../../actions";

export default function Page() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Ajustes</h1>
      <p className="mt-2 text-muted">
        Aquí podrás cambiar el monto del abono y el cargo por retraso.
      </p>
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

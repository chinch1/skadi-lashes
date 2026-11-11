import Link from "next/link";
import { inputClass, primaryButton, smallButton } from "@/components/ui";
import { requireAdminPage } from "@/lib/auth";
import { cleanQuery, fullName, LIST_LIMIT, listClients, QUERY_MAX_LENGTH } from "@/lib/clients";
import { formatPhone } from "@/lib/phone";

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export default async function Page(props: PageProps<"/admin/clientas">) {
  const { q } = await props.searchParams;
  const query = cleanQuery(Array.isArray(q) ? q[0] : q);
  const { supabase, studioId } = await requireAdminPage();
  const { clients, truncated, error } = await listClients(supabase, studioId, query);

  return (
    <>
      <h1 className="text-2xl font-semibold">Clientas</h1>

      <form method="get" role="search" className="mt-4 flex gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Buscar clienta</span>
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Buscar por nombre o número"
            maxLength={QUERY_MAX_LENGTH}
            autoComplete="off"
            className={inputClass}
          />
        </label>
        <button type="submit" className={`${primaryButton} shrink-0 px-4`}>
          Buscar
        </button>
      </form>
      {query && (
        <Link
          href="/admin/clientas"
          prefetch={false}
          className={`${smallButton} -ml-3 mt-1 w-fit`}
        >
          Ver todas
        </Link>
      )}

      {error && (
        <p role="alert" className="mt-4 text-red-800">
          No se pudieron cargar las clientas. Recarga la página.
        </p>
      )}

      {!error && clients.length === 0 && (
        <p className="mt-6 text-muted">
          {query
            ? "No encontramos clientas con esa búsqueda."
            : "Todavía no hay clientas. Aparecerán aquí cuando agenden."}
        </p>
      )}

      {clients.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {clients.map((client) => (
            <li key={client.id}>
              <Link
                href={`/admin/clientas/${client.id}`}
                prefetch={false}
                className="flex min-h-11 items-center gap-3 rounded-2xl border border-border bg-white px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold break-words">
                    {fullName(client.firstName, client.lastName)}
                  </p>
                  <p className="text-sm text-muted">{formatPhone(client.phone)}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span className="text-muted">
                      {plural(client.attended, "cita", "citas")}
                    </span>
                    {client.noShows > 0 && (
                      <span className="font-medium text-amber-800">
                        {plural(client.noShows, "falta", "faltas")}
                      </span>
                    )}
                    {client.depositExempt && (
                      <span className="rounded-full bg-tint px-2.5 py-0.5 font-medium text-primary">
                        Sin abono
                      </span>
                    )}
                  </p>
                </div>
                <span aria-hidden="true" className="shrink-0 text-xl text-muted">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {truncated && (
        <p className="mt-4 text-sm text-muted">
          Se muestran las primeras {LIST_LIMIT}. Busca por nombre o número para
          encontrar a otra clienta.
        </p>
      )}
    </>
  );
}

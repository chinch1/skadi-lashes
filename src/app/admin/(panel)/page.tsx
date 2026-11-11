import { formatBolivars, formatLongDate, formatUsdt } from "@/lib/format";
import { getStudioRates } from "@/lib/studio-rates";

export default async function Page() {
  const rates = await getStudioRates();

  return (
    <>
      <h1 className="text-2xl font-semibold">Agenda</h1>
      <p className="mt-2 text-muted">
        Aquí verás los abonos por aprobar y las citas del día.
      </p>

      <section
        aria-labelledby="tasa"
        className="mt-6 rounded-2xl border border-border bg-white px-4 py-3"
      >
        <h2 id="tasa" className="text-sm font-medium text-muted">
          Tasa de cambio (BCV)
        </h2>
        {rates ? (
          <>
            <p className="mt-1 text-lg font-semibold">
              1 € = {formatBolivars(rates.eurToVes)}
            </p>
            {rates.eurToUsdt && (
              <p className="text-muted">1 € = {formatUsdt(rates.eurToUsdt)}</p>
            )}
            {rates.updatedOn && (
              <p className="mt-1 text-sm text-muted">
                Actualizada el {formatLongDate(rates.updatedOn)}. Se renueva
                sola cada día.
              </p>
            )}
          </>
        ) : (
          <p className="mt-1 text-muted">Todavía no hay una tasa cargada.</p>
        )}
      </section>
    </>
  );
}

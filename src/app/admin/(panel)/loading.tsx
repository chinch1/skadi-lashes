// Se muestra al instante al cambiar de pestaña, mientras llegan los datos.
export default function Loading() {
  return (
    <div role="status" aria-label="Cargando" className="animate-pulse">
      <div className="h-8 w-40 rounded-lg bg-tint" />
      <div className="mt-6 flex flex-col gap-3">
        <div className="h-28 rounded-2xl bg-tint" />
        <div className="h-28 rounded-2xl bg-tint" />
        <div className="h-20 rounded-2xl bg-tint" />
      </div>
    </div>
  );
}

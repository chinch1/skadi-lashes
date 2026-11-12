// Se muestra al instante al pasar de una pantalla a otra, mientras llegan los datos.
export default function Loading() {
  return (
    <main
      role="status"
      aria-label="Cargando"
      className="mx-auto flex w-full max-w-md flex-1 animate-pulse flex-col gap-4 px-5 py-10"
    >
      <div className="h-8 w-48 rounded-lg bg-tint" />
      <div className="h-40 rounded-2xl bg-tint" />
      <div className="h-24 rounded-2xl bg-tint" />
      <div className="h-24 rounded-2xl bg-tint" />
    </main>
  );
}

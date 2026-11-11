import Link from "next/link";

export default function Page() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-5 py-10">
      <h1 className="text-2xl font-semibold">Reprogramar una cita</h1>
      <p className="text-muted">Esta pantalla está en construcción.</p>
      <Link href="/" className="flex min-h-11 items-center text-primary underline">
        Volver al inicio
      </Link>
    </main>
  );
}

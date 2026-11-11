import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-5 py-10">
      <header>
        <h1 className="text-2xl font-semibold">Administración</h1>
        <p className="mt-1 text-muted">Inicia sesión para ver tu agenda.</p>
      </header>
      <LoginForm />
    </main>
  );
}

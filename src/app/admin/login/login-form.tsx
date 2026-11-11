"use client";

import { useActionState } from "react";
import { login, type LoginState } from "../actions";

const initialState: LoginState = { error: null, email: "" };

const inputClass =
  "min-h-12 w-full rounded-xl border border-border-strong bg-white px-4 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, initialState);

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="font-medium">Correo</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          defaultValue={state.email}
          required
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="font-medium">Contraseña</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </label>

      <p role="alert" className="min-h-6 text-sm text-red-800">
        {state.error}
      </p>

      <button
        type="submit"
        disabled={pending}
        className="flex min-h-14 items-center justify-center rounded-xl bg-primary px-5 text-lg font-medium text-white disabled:opacity-60"
      >
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}

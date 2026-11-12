"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { primaryButton, secondaryButton } from "@/components/ui";
import { changeSlot, type ChangeSlotState } from "./actions";

const CONNECTION_ERROR = "No se pudo enviar. Revisa tu conexión e inténtalo de nuevo.";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

// "Elegir otro horario": suelta el horario apartado y lleva al calendario.
// Con `confirm`, primero pregunta (el horario todavía estaba apartado).
export function ChangeSlotButton({
  token,
  confirm,
  primary,
}: {
  token: string;
  confirm: boolean;
  primary: boolean;
}) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const questionRef = useRef<HTMLHeadingElement>(null);

  // Al abrir la pregunta, el foco va a ella (el botón que la abrió desaparece).
  useEffect(() => {
    if (asking) questionRef.current?.focus();
  }, [asking]);

  async function go() {
    if (pending) return;
    setError(null);
    setPending(true);
    let result: ChangeSlotState;
    try {
      result = await changeSlot(token);
    } catch {
      result = { ok: false, error: CONNECTION_ERROR };
    }
    if (result.ok) {
      // Los botones siguen deshabilitados mientras se abre el calendario.
      router.push(`/cita/${token}/horario`);
      return;
    }
    setPending(false);
    setAsking(false);
    setError(result.error);
  }

  const errorBox = error && (
    <p role="alert" className="rounded-xl border border-border-strong bg-tint px-4 py-3 text-sm">
      {error}
    </p>
  );

  if (asking) {
    return (
      <section
        aria-labelledby="cambiar-horario"
        className="flex flex-col gap-3 rounded-2xl border border-border-strong bg-white p-5"
      >
        <h2
          ref={questionRef}
          tabIndex={-1}
          id="cambiar-horario"
          className="font-semibold outline-none"
        >
          ¿Cambiar de horario? Liberaremos el que tenías apartado.
        </h2>
        <button
          type="button"
          onClick={go}
          disabled={pending}
          aria-busy={pending}
          className={`${primaryButton} w-full ${focusRing}`}
        >
          {pending ? "Enviando…" : "Sí, elegir otro horario"}
        </button>
        <button
          type="button"
          onClick={() => setAsking(false)}
          disabled={pending}
          className={`${secondaryButton} w-full ${focusRing}`}
        >
          No, conservar este horario
        </button>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {errorBox}
      <button
        type="button"
        onClick={confirm ? () => setAsking(true) : go}
        disabled={pending}
        aria-busy={pending}
        className={`${primary ? primaryButton : secondaryButton} w-full ${focusRing}`}
      >
        {pending ? "Abriendo…" : "Elegir otro horario"}
      </button>
    </div>
  );
}

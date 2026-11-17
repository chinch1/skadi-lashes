"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { primaryButton, secondaryButton } from "@/components/ui";
import { changeSlot } from "./actions";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

// "Volver al inicio" desde el paso de pago: salir así es renunciar al cupo, de
// modo que se libera en el momento en vez de quedar apartado lo que dure el
// reloj. Pregunta antes, porque un toque por error le costaría el horario.
// (Salir a la app del banco no pasa por aquí: eso no debe liberar nada.)
export function LeavePaymentLink({ token }: { token: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [pending, setPending] = useState(false);
  const questionRef = useRef<HTMLHeadingElement>(null);

  // Al abrir la pregunta, el foco va a ella (el enlace que la abrió desaparece).
  useEffect(() => {
    if (asking) questionRef.current?.focus();
  }, [asking]);

  async function leave() {
    if (pending) return;
    setPending(true);
    try {
      await changeSlot(token);
    } catch {
      // Si no se pudo liberar, el reloj lo hará solo: no se le impide salir.
    }
    router.push("/");
  }

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className={`flex min-h-11 items-center justify-center text-muted underline ${focusRing}`}
      >
        Volver al inicio
      </button>
    );
  }

  return (
    <section
      aria-labelledby="salir-del-pago"
      className="flex flex-col gap-3 rounded-2xl border border-border-strong bg-white p-5"
    >
      <h2
        ref={questionRef}
        tabIndex={-1}
        id="salir-del-pago"
        className="font-semibold outline-none"
      >
        ¿Salir sin pagar? Liberaremos el horario que tenías apartado.
      </h2>
      <button
        type="button"
        onClick={() => setAsking(false)}
        disabled={pending}
        className={`${primaryButton} w-full ${focusRing}`}
      >
        No, seguir con el pago
      </button>
      <button
        type="button"
        onClick={leave}
        disabled={pending}
        aria-busy={pending}
        className={`${secondaryButton} w-full ${focusRing}`}
      >
        {pending ? "Saliendo…" : "Sí, salir y liberar mi horario"}
      </button>
    </section>
  );
}

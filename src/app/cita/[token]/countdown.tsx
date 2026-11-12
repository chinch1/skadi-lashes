"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Reloj para pagar, como al comprar entradas de cine.
// Cuenta hasta `deadline` (ISO) con la hora del servidor (`serverNow`) como
// referencia, para que un teléfono con la hora mal puesta no lo adelante ni lo
// atrase. Cada segundo se recalcula desde el plazo (no se resta de a uno), así
// que sigue exacto aunque el teléfono se duerma.

const TICK_MS = 500;
const WARNING_MS = 60_000;

export function useHoldRemaining(deadline: string, serverNow: string): number {
  const deadlineMs = Date.parse(deadline);
  const serverMs = Date.parse(serverNow);
  const valid = Number.isFinite(deadlineMs) && Number.isFinite(serverMs);

  // Valor inicial puro: lo que faltaba cuando el servidor armó la página.
  const [remaining, setRemaining] = useState(() =>
    valid ? Math.max(0, deadlineMs - serverMs) : 0,
  );

  useEffect(() => {
    if (!valid) return;
    // Diferencia entre el reloj del teléfono y el del servidor.
    const offset = serverMs - Date.now();
    const tick = () => setRemaining(Math.max(0, deadlineMs - (Date.now() + offset)));
    const id = setInterval(tick, TICK_MS);
    // Al volver a la pestaña o despertar el teléfono se actualiza de una vez.
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [valid, deadlineMs, serverMs]);

  return remaining;
}

function mmss(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// "4 minutos y 12 segundos", para lectores de pantalla.
function spoken(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  const parts: string[] = [];
  if (minutes > 0) parts.push(`${minutes} ${minutes === 1 ? "minuto" : "minutos"}`);
  if (seconds > 0 || minutes === 0) {
    parts.push(`${seconds} ${seconds === 1 ? "segundo" : "segundos"}`);
  }
  return parts.join(" y ");
}

export function PaymentClock({
  deadline,
  serverNow,
}: {
  deadline: string;
  serverNow: string;
}) {
  const router = useRouter();
  const remaining = useHoldRemaining(deadline, serverNow);
  const expired = remaining <= 0;
  const warning = remaining <= WARNING_MS;

  // En 0:00 se pide la página otra vez para que el servidor muestre el estado
  // vencido. Si el servidor todavía no lo ve (relojes con una fracción de
  // diferencia), llega un serverNow nuevo y se vuelve a intentar.
  useEffect(() => {
    if (!expired) return;
    const id = setTimeout(() => router.refresh(), 1000);
    return () => clearTimeout(id);
  }, [expired, serverNow, router]);

  return (
    <div
      className={`flex flex-col items-center gap-1 rounded-2xl border-2 px-5 py-4 text-center ${
        warning ? "border-red-800 bg-red-50" : "border-primary bg-tint"
      }`}
    >
      <p className={`text-sm font-medium ${warning ? "text-red-800" : "text-muted"}`}>
        Tiempo para pagar
      </p>
      <p
        role="timer"
        aria-live="off"
        aria-label={`Tiempo para pagar: ${spoken(remaining)}`}
        className={`text-6xl leading-none font-semibold tabular-nums ${
          warning ? "text-red-800" : "text-primary"
        }`}
      >
        {mmss(remaining)}
      </p>
      {/* Solo dos avisos hablados: al quedar un minuto y al terminar. */}
      <p aria-live="polite" className="sr-only">
        {expired
          ? "El tiempo para pagar terminó."
          : warning
            ? "Queda un minuto para pagar."
            : ""}
      </p>
    </div>
  );
}

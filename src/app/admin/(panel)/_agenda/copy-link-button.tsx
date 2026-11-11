"use client";

import { useEffect, useState } from "react";
import { secondaryButton } from "@/components/ui";

type Status = "idle" | "copied" | "failed";

// Copia el enlace público de reservas para pegarlo en WhatsApp o Instagram.
export function CopyLinkButton({ url }: { url: string }) {
  const [status, setStatus] = useState<Status>("idle");

  // El aviso "Copiado" desaparece solo después de unos segundos.
  useEffect(() => {
    if (status !== "copied") return;
    const timer = setTimeout(() => setStatus("idle"), 2500);
    return () => clearTimeout(timer);
  }, [status]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setStatus("copied");
    } catch {
      // Sin permiso para copiar: se muestra el enlace para copiarlo a mano.
      setStatus("failed");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={copy}
        className={`${secondaryButton} whitespace-nowrap px-4 text-sm`}
      >
        {status === "copied" ? "Copiado" : "Copiar enlace de reservas"}
      </button>
      <p aria-live="polite" className="text-sm text-muted">
        {status === "failed" && (
          <>
            No se pudo copiar. Mantén presionado:{" "}
            <span className="break-all select-all text-foreground">{url}</span>
          </>
        )}
      </p>
    </div>
  );
}

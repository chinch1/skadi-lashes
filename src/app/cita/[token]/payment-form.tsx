"use client";

import { useActionState, useRef, useState } from "react";
import { primaryButton } from "@/components/ui";
import { formatBolivars, formatUsdt } from "@/lib/format";
import { formatEuros } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { submitReceipt, type ReceiptState } from "./actions";
import { useHoldRemaining } from "./countdown";

type Method = "pago_movil" | "binance";
type PagoMovil = { bank: string; phone: string; idNumber: string; amountVes: number };
type Binance = { account: string; amountUsdt: number };

// "sent" evita volver a mostrar el formulario mientras llega la página nueva.
type FormState = ReceiptState & { sent: boolean };
const initialState: FormState = { error: null, sent: false };

const MAX_SIDE = 1600;

// Reduce la imagen en el navegador. Si algo falla, se envía el archivo original.
async function shrinkPhoto(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    return blob ?? file;
  } catch {
    return file;
  }
}

// "+584121234567" -> "04121234567". Otros formatos se copian sin espacios.
function plainPhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+58")) return `0${digits.slice(3)}`;
  return digits.replace(/^\+/, "");
}

function displayPhone(phone: string): string {
  return phone.replace(/\s/g, "").startsWith("+58") ? formatPhone(phone) : phone;
}

function CopyRow({
  label,
  value,
  copyText,
}: {
  label: string;
  value: string;
  copyText: string;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(copyText);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus("idle"), 2000);
  }

  return (
    <div className="py-2">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="flex items-center gap-3">
        <span className="min-w-0 flex-1 break-all font-medium">{value}</span>
        <button
        type="button"
        onClick={copy}
        aria-label={`Copiar ${label.toLowerCase()}`}
        className="flex min-h-11 min-w-20 shrink-0 items-center justify-center rounded-lg border border-border-strong px-3 text-sm font-medium text-primary"
      >
        <span aria-live="polite">
          {status === "copied"
            ? "Copiado"
            : status === "failed"
              ? "No se pudo"
              : "Copiar"}
        </span>
        </button>
      </dd>
    </div>
  );
}

function MethodCard({
  selected,
  onSelect,
  title,
  subtitle,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center rounded-2xl border-2 px-3 py-2 text-center ${
        selected
          ? "border-primary bg-tint text-primary"
          : "border-border bg-white text-foreground"
      }`}
    >
      <span className="font-semibold">{title}</span>
      <span className="text-sm text-muted">{subtitle}</span>
    </button>
  );
}

export function PaymentForm({
  token,
  depositCents,
  pagoMovil,
  binance,
  holdExpiresAt,
  serverNow,
}: {
  token: string;
  depositCents: number;
  pagoMovil: PagoMovil | null;
  binance: Binance | null;
  holdExpiresAt: string;
  serverNow: string;
}) {
  // Con el reloj en 0:00 el formulario se deshabilita; la página se recarga sola.
  const timeUp = useHoldRemaining(holdExpiresAt, serverNow) <= 0;
  const onlyOne: Method | null =
    pagoMovil && !binance ? "pago_movil" : binance && !pagoMovil ? "binance" : null;
  const [method, setMethod] = useState<Method | null>(onlyOne);
  const [receipt, setReceipt] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);

  // Recibe el archivo elegido o soltado, lo reduce y prepara la vista previa.
  async function pickReceipt(file: File | undefined) {
    if (!file) return;
    // Algunos iPhone no declaran el tipo de sus fotos: solo se rechaza lo que dice no ser imagen.
    if (file.type && !file.type.startsWith("image/")) {
      setReceiptError("El comprobante debe ser una imagen.");
      return;
    }
    setReceiptError(null);
    const small = await shrinkPhoto(file);
    if (preview) URL.revokeObjectURL(preview);
    setReceipt(small);
    setPreview(URL.createObjectURL(small));
  }

  const [state, action, pending] = useActionState(
    async (_prev: FormState, formData: FormData): Promise<FormState> => {
      if (!method || !receipt) {
        return { error: "Elige el método de pago y sube el comprobante.", sent: false };
      }
      // Se envía la imagen ya reducida, no el archivo original.
      formData.delete("receipt_file");
      formData.set("token", token);
      formData.set("method", method);
      const name =
        receipt instanceof File
          ? receipt.name
          : receipt.type === "image/jpeg"
            ? "comprobante.jpg"
            : "comprobante";
      formData.set("receipt", receipt, name);
      const result = await submitReceipt({ error: null }, formData);
      return { error: result.error, sent: result.error === null };
    },
    initialState,
  );

  if (state.sent) {
    return (
      <p role="status" className="rounded-2xl border border-border bg-white p-5">
        Comprobante enviado.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-5">
      <fieldset disabled={timeUp && !pending} className="flex flex-col gap-3">
        <legend className="mb-3 text-lg font-semibold">¿Cómo vas a pagar?</legend>
        <div className="flex gap-3">
          {pagoMovil && (
            <MethodCard
              selected={method === "pago_movil"}
              onSelect={() => setMethod("pago_movil")}
              title="Pago Móvil"
              subtitle="Bolívares"
            />
          )}
          {binance && (
            <MethodCard
              selected={method === "binance"}
              onSelect={() => setMethod("binance")}
              title="Binance"
              subtitle="USDT"
            />
          )}
        </div>
      </fieldset>

      {method === "pago_movil" && pagoMovil && (
        <section className="rounded-2xl border border-border bg-white p-5">
          <p className="text-sm text-muted">Monto a pagar</p>
          <p className="break-words text-3xl font-semibold tabular-nums text-primary">
            {formatBolivars(pagoMovil.amountVes)}
          </p>
          <p className="text-sm text-muted">
            Equivale a {formatEuros(depositCents)}
          </p>
          <dl className="mt-4 divide-y divide-border border-t border-border">
            <CopyRow label="Banco" value={pagoMovil.bank} copyText={pagoMovil.bank} />
            <CopyRow
              label="Teléfono"
              value={displayPhone(pagoMovil.phone)}
              copyText={plainPhone(pagoMovil.phone)}
            />
            <CopyRow
              label="Cédula/RIF"
              value={pagoMovil.idNumber}
              copyText={pagoMovil.idNumber}
            />
            <CopyRow
              label="Monto"
              value={formatBolivars(pagoMovil.amountVes)}
              copyText={pagoMovil.amountVes.toFixed(2).replace(".", ",")}
            />
          </dl>
        </section>
      )}

      {method === "binance" && binance && (
        <section className="rounded-2xl border border-border bg-white p-5">
          <p className="text-sm text-muted">Monto a pagar</p>
          <p className="break-words text-3xl font-semibold tabular-nums text-primary">
            {formatUsdt(binance.amountUsdt)}
          </p>
          <dl className="mt-4 divide-y divide-border border-t border-border">
            <CopyRow
              label="Cuenta (correo o Pay ID)"
              value={binance.account}
              copyText={binance.account}
            />
            <CopyRow
              label="Monto"
              value={formatUsdt(binance.amountUsdt)}
              copyText={binance.amountUsdt.toFixed(2)}
            />
          </dl>
        </section>
      )}

      <div className="flex flex-col gap-2">
        <span className="font-medium">Comprobante de pago</span>
        {/* Zona para tocar o soltar la imagen: distinta de los botones de la pantalla. */}
        <label
          onDragOver={(e) => {
            if (timeUp) return;
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!timeUp) void pickReceipt(e.dataTransfer.files?.[0]);
          }}
          className={`flex min-h-36 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-4 text-center transition-colors ${
            dragging ? "border-primary bg-tint" : "border-border-strong bg-white"
          } ${timeUp ? "pointer-events-none opacity-60" : "cursor-pointer"}`}
        >
          {preview ? (
            <>
              <img
                src={preview}
                alt="Vista previa del comprobante"
                className="max-h-64 w-full rounded-xl object-contain"
              />
              <span className="text-sm font-medium text-primary">
                Toca para cambiarlo
              </span>
            </>
          ) : (
            <>
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-8 text-primary"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 16V5M7.5 9.5 12 5l4.5 4.5M5 19h14" />
              </svg>
              <span className="font-medium">Toca para subir tu comprobante</span>
              <span className="text-sm text-muted">
                Una captura o foto del pago. También puedes arrastrarla aquí.
              </span>
            </>
          )}
          <input
            type="file"
            name="receipt_file"
            accept="image/*"
            disabled={timeUp}
            className="sr-only"
            onChange={(e) => void pickReceipt(e.target.files?.[0])}
          />
        </label>
        {receiptError && (
          <p role="alert" className="text-sm text-red-800">
            {receiptError}
          </p>
        )}
      </div>

      {timeUp && !pending && (
        <p role="status" className="text-sm text-red-800">
          El tiempo para pagar terminó.
        </p>
      )}

      {state.error && (
        <p role="alert" className="text-sm text-red-800">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || timeUp || !method || !receipt}
        className={primaryButton}
      >
        {pending ? "Enviando…" : "Enviar comprobante"}
      </button>
    </form>
  );
}

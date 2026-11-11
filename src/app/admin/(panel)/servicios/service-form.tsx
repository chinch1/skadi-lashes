"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { inputClass, primaryButton, secondaryButton } from "@/components/ui";
import { centsToInput } from "@/lib/money";
import { formatDuration, type Section, type Service } from "@/lib/services";
import { deleteService, saveService, type FormState } from "./actions";

const initialState: FormState = { error: null };
const MAX_SIDE = 1280;

// Reduce la foto en el navegador: sube rápido y ocupa poco almacenamiento.
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
      canvas.toBlob(resolve, "image/jpeg", 0.82),
    );
    return blob ?? file;
  } catch {
    return file;
  }
}

export function ServiceForm({
  sections,
  service,
  defaultSectionId,
  currentPhotoUrl,
}: {
  sections: Section[];
  service?: Service;
  defaultSectionId?: string;
  currentPhotoUrl?: string | null;
}) {
  const [sectionId, setSectionId] = useState(
    service?.section_id ?? defaultSectionId ?? sections[0]?.id ?? "",
  );
  const [name, setName] = useState(service?.name ?? "");
  const [duration, setDuration] = useState(
    service ? String(service.duration_min) : "",
  );
  const [price, setPrice] = useState(
    service ? centsToInput(service.price_cents) : "",
  );
  const [visible, setVisible] = useState(service?.visible ?? true);
  const [retouch, setRetouch] = useState(
    service ? service.retouch_reminder_days !== null : false,
  );
  const [retouchDays, setRetouchDays] = useState(
    String(service?.retouch_reminder_days ?? 21),
  );
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const [state, action, pending] = useActionState(
    async (prev: FormState, formData: FormData) => {
      // Se envía la foto ya reducida, no el archivo original.
      formData.delete("photo_file");
      if (photo) formData.set("photo", photo, "foto.jpg");
      return saveService(prev, formData);
    },
    initialState,
  );

  const minutes = /^\d+$/.test(duration) ? Number(duration) : 0;
  const shown = preview ?? currentPhotoUrl ?? null;

  return (
    <form action={action} className="flex flex-col gap-5">
      {service && <input type="hidden" name="id" value={service.id} />}

      <label className="flex flex-col gap-1.5">
        <span className="font-medium">Sección</span>
        <select
          name="section_id"
          value={sectionId}
          onChange={(e) => setSectionId(e.target.value)}
          className={inputClass}
        >
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="font-medium">Nombre</span>
        <input
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={80}
          className={inputClass}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="font-medium">Duración (minutos)</span>
          <input
            name="duration_min"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            inputMode="numeric"
            required
            className={inputClass}
          />
          <span className="min-h-5 text-sm text-muted">
            {minutes >= 60 ? formatDuration(minutes) : ""}
          </span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-medium">Precio (€)</span>
          <input
            name="price"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            required
            className={inputClass}
          />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <span className="font-medium">Foto de referencia</span>
        <div className="flex items-center gap-4">
          {shown ? (
            <img
              src={shown}
              alt="Foto del servicio"
              className="size-24 shrink-0 rounded-xl object-cover"
            />
          ) : (
            <span className="flex size-24 shrink-0 items-center justify-center rounded-xl bg-tint text-sm text-muted">
              Sin foto
            </span>
          )}
          <label className={`${secondaryButton} cursor-pointer`}>
            {shown ? "Cambiar foto" : "Elegir foto"}
            <input
              type="file"
              name="photo_file"
              accept="image/*"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const small = await shrinkPhoto(file);
                if (preview) URL.revokeObjectURL(preview);
                setPhoto(small);
                setPreview(URL.createObjectURL(small));
              }}
            />
          </label>
        </div>
      </div>

      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          name="visible"
          checked={visible}
          onChange={(e) => setVisible(e.target.checked)}
          className="size-5 accent-primary"
        />
        <span>Visible para las clientas</span>
      </label>

      <div className="flex flex-col gap-2">
        <label className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            name="retouch"
            checked={retouch}
            onChange={(e) => setRetouch(e.target.checked)}
            className="size-5 accent-primary"
          />
          <span>Recordar el retoque</span>
        </label>
        {retouch && (
          <label className="flex items-center gap-3 pl-8">
            <span>A los</span>
            <input
              name="retouch_days"
              value={retouchDays}
              onChange={(e) => setRetouchDays(e.target.value)}
              inputMode="numeric"
              aria-label="Días para el retoque"
              className={`${inputClass} w-20 text-center`}
            />
            <span>días</span>
          </label>
        )}
      </div>

      <p role="alert" className="min-h-6 text-sm text-red-800">
        {state.error}
      </p>

      <div className="flex gap-3">
        <Link href="/admin/servicios" className={`${secondaryButton} flex-1`}>
          Cancelar
        </Link>
        <button
          type="submit"
          disabled={pending}
          className={`${primaryButton} flex-1`}
        >
          {pending ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}

export function DeleteServiceForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(deleteService, initialState);

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm("¿Eliminar este servicio? No se puede deshacer.")) {
          e.preventDefault();
        }
      }}
      className="mt-10 flex flex-col gap-2 border-t border-border pt-6"
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="flex min-h-12 items-center justify-center rounded-xl px-5 font-medium text-red-800"
      >
        Eliminar servicio
      </button>
      {state.error && (
        <p role="alert" className="text-center text-sm text-red-800">
          {state.error}
        </p>
      )}
    </form>
  );
}

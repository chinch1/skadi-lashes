"use client";

import { useActionState, useRef } from "react";
import { inputClass, primaryButton, smallButton } from "@/components/ui";
import { saveSection, type FormState } from "./actions";

const initialState: FormState = { error: null };

export function NewSectionForm() {
  const [state, action, pending] = useActionState(saveSection, initialState);

  return (
    <form action={action} className="flex flex-col gap-2">
      <label htmlFor="new-section" className="font-medium">
        Nueva sección
      </label>
      <div className="flex gap-2">
        <input
          id="new-section"
          name="name"
          required
          maxLength={60}
          placeholder="Por ejemplo, Pestañas"
          className={inputClass}
        />
        <button type="submit" disabled={pending} className={primaryButton}>
          Crear
        </button>
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-red-800">
          {state.error}
        </p>
      )}
    </form>
  );
}

export function RenameSection({ id, name }: { id: string; name: string }) {
  const details = useRef<HTMLDetailsElement>(null);
  const [state, action, pending] = useActionState(
    async (prev: FormState, formData: FormData) => {
      const result = await saveSection(prev, formData);
      if (!result.error) details.current?.removeAttribute("open");
      return result;
    },
    initialState,
  );

  return (
    <details ref={details} className="group">
      <summary className={`${smallButton} cursor-pointer list-none`}>
        Renombrar
      </summary>
      <form action={action} className="mt-2 flex flex-col gap-2 pb-2">
        <input type="hidden" name="id" value={id} />
        <div className="flex gap-2">
          <input
            name="name"
            aria-label="Nombre de la sección"
            defaultValue={name}
            required
            maxLength={60}
            className={inputClass}
          />
          <button type="submit" disabled={pending} className={primaryButton}>
            Guardar
          </button>
        </div>
        {state.error && (
          <p role="alert" className="text-sm text-red-800">
            {state.error}
          </p>
        )}
      </form>
    </details>
  );
}

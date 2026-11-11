"use client";

import { useActionState, useLayoutEffect, useRef, useState } from "react";
import { inputClass, primaryButton, smallButton } from "@/components/ui";
import { MESSAGE_MAX_LENGTH, PLACEHOLDERS, renderTemplate } from "@/lib/whatsapp";
import { saveMessageTemplate, type MessageKind, type MessageState } from "./actions";

const initialState: MessageState = { error: null, saved: false };

type Props = {
  kind: MessageKind;
  title: string;
  description: string;
  initialText: string; // el texto guardado, o el de la app
  defaultText: string;
  previewLink: string; // enlace de ejemplo para la vista previa
  previewNorms: string; // normas con los ajustes actuales, para {normas}
};

export function MessageForm({
  kind,
  title,
  description,
  initialText,
  defaultText,
  previewLink,
  previewNorms,
}: Props) {
  const [text, setText] = useState(initialText);
  const [dirty, setDirty] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Dónde dejar el cursor después de insertar un marcador.
  const cursorRef = useRef<number | null>(null);

  const [state, action, pending] = useActionState(
    async (prev: MessageState, formData: FormData) => {
      const result = await saveMessageTemplate(prev, formData);
      if (!result.error) setDirty(false);
      return result;
    },
    initialState,
  );

  // Coloca el cursor justo después del marcador insertado.
  useLayoutEffect(() => {
    const position = cursorRef.current;
    const textarea = textareaRef.current;
    if (position === null || !textarea) return;
    cursorRef.current = null;
    textarea.focus();
    textarea.setSelectionRange(position, position);
  }, [text]);

  function change(next: string) {
    setText(next);
    setDirty(true);
  }

  function insert(key: string) {
    const token = `{${key}}`;
    if (text.length + token.length > MESSAGE_MAX_LENGTH) return;
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? text.length;
    const end = textarea?.selectionEnd ?? text.length;
    cursorRef.current = start + token.length;
    change(text.slice(0, start) + token + text.slice(end));
  }

  const examples: Record<string, string> = Object.fromEntries(
    PLACEHOLDERS.map((p) => [p.key, p.example]),
  );
  examples.enlace = previewLink;
  examples.normas = previewNorms;
  const preview = renderTemplate(text.trim() ? text : defaultText, examples);
  const missingLink =
    (kind === "confirmation" || kind === "reminder") &&
    text.trim() !== "" &&
    !text.includes("{enlace}");
  const fieldId = `mensaje-${kind}`;

  return (
    <form
      action={action}
      className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-4"
    >
      <input type="hidden" name="kind" value={kind} />
      <div>
        <label htmlFor={fieldId} className="text-lg font-semibold">
          {title}
        </label>
        <p className="text-sm text-muted">{description}</p>
      </div>

      <textarea
        ref={textareaRef}
        id={fieldId}
        name="text"
        rows={8}
        maxLength={MESSAGE_MAX_LENGTH}
        value={text}
        onChange={(event) => change(event.target.value)}
        aria-describedby={`${fieldId}-chips`}
        className={`${inputClass} py-3 leading-relaxed`}
      />

      <div>
        <p id={`${fieldId}-chips`} className="mb-2 text-sm text-muted">
          Toca para agregar al texto:
        </p>
        <div className="flex flex-wrap gap-2">
          {PLACEHOLDERS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => insert(p.key)}
              aria-label={`Agregar ${p.label.toLowerCase()}`}
              className="flex min-h-11 items-center gap-1.5 rounded-full border border-border-strong px-3 text-sm"
            >
              <span className="font-medium text-primary">{p.label}</span>
              <span className="text-muted">{`{${p.key}}`}</span>
            </button>
          ))}
        </div>
      </div>

      {missingLink && (
        <p className="text-sm text-muted">
          Sin {"{enlace}"}, la clienta no recibirá el enlace a su cita.
        </p>
      )}

      <div>
        <p className="mb-1 text-sm font-medium text-muted">Así se verá</p>
        <p className="rounded-xl bg-tint px-3 py-2 break-words whitespace-pre-wrap">
          {preview}
        </p>
      </div>

      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Guardando…" : "Guardar"}
      </button>
      <button
        type="button"
        disabled={pending || text === defaultText}
        onClick={() => change(defaultText)}
        className={`${smallButton} self-center`}
      >
        Volver al texto original
      </button>

      <p aria-live="polite" className="text-sm text-whatsapp empty:hidden">
        {state.saved && !dirty && !pending ? "Guardado." : ""}
      </p>
      {state.error && (
        <p role="alert" className="text-sm text-red-800">
          {state.error}
        </p>
      )}
    </form>
  );
}

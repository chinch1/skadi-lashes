import { formatLongDate, formatTime12 } from "./format";
import { RULES, ruleText, type Rule } from "./rules";

// Mensajes de WhatsApp que Giselle envía con un enlace wa.me.
// Solo texto: no se usa el servicio de pago de Meta.
// Los textos son plantillas con marcadores entre llaves ({nombre}, {fecha}…).
// Giselle puede cambiarlas en Ajustes; si no, se usan las de abajo.

export type MessageAppointment = {
  firstName: string;
  date: string; // "AAAA-MM-DD", fecha local del estudio
  time: string; // "HH:MM", hora local
  services: string[];
  link: string; // dirección completa: /cita/<token> o /agendar
  // Normas para {normas}, armadas con los ajustes actuales (normsText).
  // Sin este campo se usan las de la app.
  norms?: string;
};

// Largo máximo de un texto guardado por Giselle.
export const MESSAGE_MAX_LENGTH = 1200;

// Lo que reemplaza a {normas}: Puntualidad y Acompañantes, una por línea.
export function normsText(rules: readonly Rule[]): string {
  return `${ruleText(rules, "Puntualidad")}\n${ruleText(rules, "Acompañantes")}`;
}

const DEFAULT_NORMS = normsText(RULES);

export const DEFAULT_CONFIRMATION_TEMPLATE =
  "Hola {nombre}, tu cita en Skadi Lashes quedó confirmada para el {fecha} a las {hora}.\n\n" +
  "Servicios: {servicios}.\n\n" +
  "{normas}\n\n" +
  "Si necesitas cambiar tu cita o no puedes venir, hazlo desde aquí: {enlace}";

export const DEFAULT_REJECTION_TEMPLATE =
  "Hola {nombre}, no pude verificar el comprobante de tu abono para la cita del {fecha} a las {hora}, así que el horario quedó libre.\n\n" +
  "Si quieres, puedes agendar de nuevo aquí: {enlace}";

export const DEFAULT_REMINDER_TEMPLATE =
  "Hola {nombre}, te recuerdo tu cita en Skadi Lashes mañana, {fecha}, a las {hora}.\n\n" +
  "Servicios: {servicios}.\n\n" +
  "{normas}\n\n" +
  "Si necesitas cambiarla o no puedes venir, hazlo desde aquí: {enlace}";

export const DEFAULT_RETOUCH_TEMPLATE =
  "Hola {nombre}, ya pasó un tiempo desde tu cita del {fecha} en Skadi Lashes ({servicios}). Es buen momento para tu retoque.\n\n" +
  "Puedes agendar aquí: {enlace}";

export const PLACEHOLDERS: { key: string; label: string; example: string }[] = [
  { key: "nombre", label: "Nombre", example: "María" },
  { key: "fecha", label: "Fecha", example: "jueves 12 de noviembre" },
  { key: "hora", label: "Hora", example: "12:00 pm" },
  { key: "servicios", label: "Servicios", example: "Pestañas clásicas, Retiro" },
  { key: "enlace", label: "Enlace", example: "https://skadi.example/cita/abc123" },
  { key: "normas", label: "Normas", example: DEFAULT_NORMS },
];

// Cambia cada {marcador} conocido por su valor. Lo que no se conoce queda
// tal como se escribió. Una sola pasada: un valor con llaves no se vuelve a leer.
export function renderTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(/\{([^{}]*)\}/g, (match, key: string) =>
    Object.hasOwn(values, key) ? values[key] : match,
  );
}

function valuesFor(a: MessageAppointment): Record<string, string> {
  return {
    nombre: a.firstName,
    fecha: formatLongDate(a.date),
    hora: formatTime12(a.time),
    servicios: a.services.join(", "),
    enlace: a.link,
    normas: a.norms ?? DEFAULT_NORMS,
  };
}

// Texto vacío o solo espacios: se usa el de la app.
function pick(template: string | null | undefined, fallback: string): string {
  return template && template.trim() ? template : fallback;
}

export function confirmationMessage(
  a: MessageAppointment,
  template?: string | null,
): string {
  return renderTemplate(pick(template, DEFAULT_CONFIRMATION_TEMPLATE), valuesFor(a));
}

// `link` es el enlace público para agendar: el horario ya quedó libre.
export function rejectionMessage(
  a: MessageAppointment,
  template?: string | null,
): string {
  return renderTemplate(pick(template, DEFAULT_REJECTION_TEMPLATE), valuesFor(a));
}

// Recordatorio de la cita de mañana. `link` es la página de su cita.
export function reminderMessage(
  a: MessageAppointment,
  template?: string | null,
): string {
  return renderTemplate(pick(template, DEFAULT_REMINDER_TEMPLATE), valuesFor(a));
}

// Recordatorio de retoque. Fecha y hora son las de la cita a la que asistió;
// `link` es el enlace público para agendar.
export function retouchMessage(
  a: MessageAppointment,
  template?: string | null,
): string {
  return renderTemplate(pick(template, DEFAULT_RETOUCH_TEMPLATE), valuesFor(a));
}

// "+584121234567" -> "https://wa.me/584121234567?text=…"
export function waLink(phoneE164: string, text: string): string {
  const digits = phoneE164.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

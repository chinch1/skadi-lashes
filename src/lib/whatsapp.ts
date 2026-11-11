import { formatLongDate, formatTime12 } from "./format";
import { RULES } from "./rules";

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
};

// Largo máximo de un texto guardado por Giselle.
export const MESSAGE_MAX_LENGTH = 1200;

function ruleText(title: (typeof RULES)[number]["title"]): string {
  const rule = RULES.find((r) => r.title === title);
  if (!rule) throw new Error(`Falta la norma "${title}".`);
  return rule.text;
}

export const DEFAULT_CONFIRMATION_TEMPLATE =
  "Hola {nombre}, tu cita en Skadi Lashes quedó confirmada para el {fecha} a las {hora}.\n\n" +
  "Servicios: {servicios}.\n\n" +
  `${ruleText("Puntualidad")}\n` +
  `${ruleText("Acompañantes")}\n\n` +
  "Puedes ver tu cita aquí: {enlace}";

export const DEFAULT_REJECTION_TEMPLATE =
  "Hola {nombre}, no pude verificar el comprobante de tu abono para la cita del {fecha} a las {hora}, así que el horario quedó libre.\n\n" +
  "Si quieres, puedes agendar de nuevo aquí: {enlace}";

export const PLACEHOLDERS: { key: string; label: string; example: string }[] = [
  { key: "nombre", label: "Nombre", example: "María" },
  { key: "fecha", label: "Fecha", example: "jueves 12 de noviembre" },
  { key: "hora", label: "Hora", example: "12:00 pm" },
  { key: "servicios", label: "Servicios", example: "Pestañas clásicas, Retiro" },
  { key: "enlace", label: "Enlace", example: "https://skadi.example/cita/abc123" },
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

// "+584121234567" -> "https://wa.me/584121234567?text=…"
export function waLink(phoneE164: string, text: string): string {
  const digits = phoneE164.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

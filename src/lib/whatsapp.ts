import { formatLongDate, formatTime12 } from "./format";
import { RULES } from "./rules";

// Mensajes de WhatsApp que Giselle envía con un enlace wa.me.
// Solo texto: no se usa el servicio de pago de Meta.

export type MessageAppointment = {
  firstName: string;
  date: string; // "AAAA-MM-DD", fecha local del estudio
  time: string; // "HH:MM", hora local
  services: string[];
  link: string; // dirección completa de /cita/<token>
};

// "+584121234567" -> "https://wa.me/584121234567?text=…"
export function waLink(phoneE164: string, text: string): string {
  const digits = phoneE164.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

function ruleText(title: (typeof RULES)[number]["title"]): string {
  const rule = RULES.find((r) => r.title === title);
  if (!rule) throw new Error(`Falta la norma "${title}".`);
  return rule.text;
}

function when(a: MessageAppointment): string {
  return `${formatLongDate(a.date)} a las ${formatTime12(a.time)}`;
}

export function confirmationMessage(a: MessageAppointment): string {
  return (
    `Hola ${a.firstName}, tu cita en Skadi Lashes quedó confirmada para el ${when(a)}.\n\n` +
    `Servicios: ${a.services.join(", ")}.\n\n` +
    `${ruleText("Puntualidad")}\n` +
    `${ruleText("Acompañantes")}\n\n` +
    `Puedes ver tu cita aquí: ${a.link}`
  );
}

export function rejectionMessage(
  a: MessageAppointment & { deadline: string | null },
): string {
  const until = a.deadline ? ` antes de las ${formatTime12(a.deadline)}` : "";
  return (
    `Hola ${a.firstName}, no pude verificar el comprobante de tu abono para la cita del ${when(a)}. ` +
    `Por favor súbelo de nuevo aquí${until}: ${a.link}\n\n` +
    `Si no lo recibo, el horario se libera.`
  );
}

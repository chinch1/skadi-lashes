// Números de WhatsApp. El número identifica a la clienta, así que siempre se
// guarda en un formato único: "+" seguido solo de dígitos ("+584121234567").

// Prefijos de celulares venezolanos.
const VE_MOBILE_PREFIXES = ["412", "414", "416", "422", "424", "426"];

const VE_MOBILE_RE = new RegExp(`^(${VE_MOBILE_PREFIXES.join("|")})(\\d{7})$`);

// Celular venezolano sin código de país ni cero inicial: "4121234567".
function veMobile(national: string): string | null {
  return VE_MOBILE_RE.test(national) ? `+58${national}` : null;
}

// Devuelve el número canónico o null si no es válido.
export function normalizePhone(input: string): string | null {
  if (typeof input !== "string" || input.length > 40) return null;
  let text = input.trim().replace(/[\s.\-()]/g, "");

  // "0058…" es la forma marcada de "+58…".
  if (/^00\d/.test(text)) text = `+${text.slice(2)}`;

  if (text.startsWith("+")) {
    const digits = text.slice(1);
    if (!/^\d+$/.test(digits)) return null;
    if (digits.startsWith("58")) {
      // "+58 0412…" también se escribe a veces: se quita el cero.
      const national = digits.slice(2).replace(/^0/, "");
      const mobile = veMobile(national);
      if (mobile) return mobile;
    }
    // Números extranjeros (o venezolanos no celulares): se aceptan tal cual.
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }

  if (!/^\d+$/.test(text)) return null;
  if (text.length === 11 && text.startsWith("0")) return veMobile(text.slice(1));
  if (text.length === 10) return veMobile(text);
  if (text.length === 12 && text.startsWith("58")) return veMobile(text.slice(2));
  return null;
}

// "+584121234567" -> "0412-1234567". Otros números se devuelven igual.
export function formatPhone(e164: string): string {
  const match = /^\+58(\d{3})(\d{7})$/.exec(e164);
  if (match && VE_MOBILE_PREFIXES.includes(match[1])) {
    return `0${match[1]}-${match[2]}`;
  }
  return e164;
}

export const FOREIGN_PHONE_HINT =
  "Si tu número es de otro país, escríbelo con + y el código, por ejemplo +34 612 345 678.";

// Ayuda mientras la clienta escribe. No bloquea nada: solo ordena lo que teclea.
// - Número venezolano: pone el guion solo ("0412-1234567").
// - Número con "+": lo deja libre, para clientas de otros países.
// Al borrar no se reacomoda, para que pueda corregir sin que el guion vuelva.
export function formatPhoneInput(next: string, previous = ""): string {
  const value = next.trimStart();

  if (value.startsWith("+")) {
    const rest = value.slice(1).replace(/[^\d ]/g, "").replace(/ {2,}/g, " ");
    return `+${rest}`.slice(0, 20);
  }

  const typing = value.length > previous.length;
  if (!typing) return value.replace(/[^\d -]/g, "");

  const digits = value.replace(/\D/g, "").slice(0, 15);
  if (digits.startsWith("04") && digits.length > 4 && digits.length <= 11) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }
  if (digits.startsWith("4") && digits.length > 3 && digits.length <= 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }
  return digits;
}

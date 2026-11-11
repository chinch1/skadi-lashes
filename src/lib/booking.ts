import "server-only";
import { getMonthAvailability } from "@/lib/availability-data";
import { normalizePhone } from "@/lib/phone";
import { STUDIO_SLUG } from "@/lib/studio";
import { createAdminClient } from "@/lib/supabase/admin";
import { zonedParts, zonedToUtc } from "@/lib/time";

// Flujo público de "agendar": crear la cita y guardar el horario, mostrar la
// cita por su enlace privado y recibir el comprobante del abono.
// Todo pasa por la llave de servicio: el público no puede leer ni escribir
// estas tablas. Nada de lo que se devuelve incluye identificadores internos.

// ---------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------

export type BookingInput = {
  serviceIds: string[];
  date: string; // "AAAA-MM-DD", fecha local del estudio
  time: string; // "HH:MM", hora local
  firstName: string;
  lastName: string;
  phone: string;
  remindersOk: boolean;
};

export type BookingResult =
  | { ok: true; token: string }
  | {
      ok: false;
      code: "invalid" | "slot_taken" | "server";
      error: string;
      field?: "firstName" | "lastName" | "phone";
    };

export type BookingState =
  | "awaiting_payment"
  | "receipt_sent"
  | "confirmed"
  | "expired"
  | "released"
  | "completed"
  | "no_show";

export type BookingView = {
  token: string;
  state: BookingState;
  clientFirstName: string;
  date: string;
  time: string;
  endTime: string;
  services: { name: string; durationMin: number; priceCents: number }[];
  totalCents: number;
  durationMin: number;
  depositCents: number; // 0 para clientas de confianza
  holdExpiresAt: string | null; // ISO; solo tiene sentido en awaiting_payment
  payment: null | {
    pagoMovil: { bank: string; phone: string; idNumber: string; amountVes: number } | null;
    binance: { account: string; amountUsdt: number } | null;
  };
};

export type ReceiptResult = { ok: true } | { ok: false; error: string };

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_SERVICES = 20;
const MAX_NAME = 60;

const UNIQUE_VIOLATION = "23505";
const EXCLUSION_VIOLATION = "23P01";

const BOOKING_ERROR = "No se pudo agendar. Intenta de nuevo.";
const SLOT_TAKEN_ERROR = "Ese horario ya no está disponible. Elige otro.";
const RECEIPT_ERROR = "No se pudo enviar el comprobante. Intenta de nuevo.";

const RECEIPT_BUCKET = "receipts";
const MAX_RECEIPT_BYTES = 3.5 * 1024 * 1024;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

// Fecha real (descarta "2026-02-30").
function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// Postgres devuelve numeric como número o como texto según el tamaño.
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// Nombre o apellido: sin espacios de más ni caracteres de control.
function cleanName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
}

function invalid(
  error: string,
  field?: "firstName" | "lastName" | "phone",
): BookingResult {
  return field ? { ok: false, code: "invalid", error, field } : { ok: false, code: "invalid", error };
}

function bookingFailure(context: string, detail: unknown): BookingResult {
  // El detalle queda en el registro del servidor; nunca se devuelve a la clienta.
  console.error(`[agendar] ${context}:`, detail instanceof Error ? detail.message : detail);
  return { ok: false, code: "server", error: BOOKING_ERROR };
}

function receiptFailure(context: string, detail: unknown): ReceiptResult {
  console.error(`[comprobante] ${context}:`, detail instanceof Error ? detail.message : detail);
  return { ok: false, error: RECEIPT_ERROR };
}

// ---------------------------------------------------------------------
// Agendar
// ---------------------------------------------------------------------

export async function createBooking(input: BookingInput): Promise<BookingResult> {
  // La entrada viene de una acción pública: se revisa todo, incluidos los tipos.
  const raw = (typeof input === "object" && input !== null ? input : {}) as Record<
    string,
    unknown
  >;

  const firstName = cleanName(raw.firstName);
  if (!firstName) return invalid("Escribe tu nombre.", "firstName");
  if (firstName.length > MAX_NAME) return invalid("El nombre es demasiado largo.", "firstName");

  const lastName = cleanName(raw.lastName);
  if (!lastName) return invalid("Escribe tu apellido.", "lastName");
  if (lastName.length > MAX_NAME) return invalid("El apellido es demasiado largo.", "lastName");

  const phone = typeof raw.phone === "string" ? normalizePhone(raw.phone) : null;
  if (!phone) {
    return invalid("Escribe un número de WhatsApp válido, por ejemplo 0412-1234567.", "phone");
  }

  const remindersOk = raw.remindersOk === true;

  if (!isValidDate(raw.date) || typeof raw.time !== "string" || !TIME_RE.test(raw.time)) {
    return invalid("Elige un día y una hora.");
  }
  const date = raw.date;
  const time = raw.time;

  const serviceIdsRaw = raw.serviceIds;
  if (
    !Array.isArray(serviceIdsRaw) ||
    serviceIdsRaw.length < 1 ||
    serviceIdsRaw.length > MAX_SERVICES ||
    !serviceIdsRaw.every(isUuid)
  ) {
    return invalid("Elige al menos un servicio.");
  }
  const serviceIds = (serviceIdsRaw as string[]).map((id) => id.toLowerCase());
  if (new Set(serviceIds).size !== serviceIds.length) {
    return invalid("Elige al menos un servicio.");
  }

  try {
    // Comprobación autoritativa del horario: el mismo cálculo que ve la clienta.
    const availability = await getMonthAvailability(date.slice(0, 7), serviceIds);
    if (!availability.ok) {
      if (availability.error === "unknown_services") {
        return invalid("Alguno de los servicios ya no está disponible.");
      }
      return bookingFailure("disponibilidad", availability.error);
    }
    if (!(availability.data.days[date] ?? []).includes(time)) {
      return { ok: false, code: "slot_taken", error: SLOT_TAKEN_ERROR };
    }

    const supabase = createAdminClient();

    const { data: studio, error: studioError } = await supabase
      .from("studios")
      .select("id, timezone, deposit_cents, pending_hold_hours, eur_to_ves_rate, eur_to_usdt_rate")
      .eq("slug", STUDIO_SLUG)
      .maybeSingle();
    if (studioError) return bookingFailure("estudio", studioError.message);
    if (!studio) return bookingFailure("estudio", "No se encontró el estudio.");
    const studioId: string = studio.id;

    const { data: servicesData, error: servicesError } = await supabase
      .from("services")
      .select("id, name, duration_min, price_cents")
      .eq("studio_id", studioId)
      .eq("visible", true)
      .in("id", serviceIds);
    if (servicesError) return bookingFailure("servicios", servicesError.message);
    const byId = new Map(
      (servicesData ?? []).map((s) => [String(s.id).toLowerCase(), s]),
    );
    if (byId.size !== serviceIds.length) {
      return invalid("Alguno de los servicios ya no está disponible.");
    }
    // Mismo orden en que la clienta los eligió.
    const services = serviceIds.map((id) => byId.get(id)!);

    const durationMin = services.reduce((sum, s) => sum + Number(s.duration_min), 0);
    const totalCents = services.reduce((sum, s) => sum + Number(s.price_cents), 0);

    const now = new Date();
    const startsAt = zonedToUtc(date, time, studio.timezone);
    const endsAt = new Date(startsAt.getTime() + durationMin * 60_000);

    // Las reservas vencidas que se cruzan con este horario se liberan primero,
    // para que la regla de "sin citas cruzadas" no bloquee un horario libre.
    const { error: releaseError } = await supabase
      .from("appointments")
      .update({ status: "released" })
      .eq("studio_id", studioId)
      .eq("status", "pending_deposit")
      .not("hold_expires_at", "is", null)
      .lt("hold_expires_at", now.toISOString())
      .lt("starts_at", endsAt.toISOString())
      .gt("ends_at", startsAt.toISOString());
    if (releaseError) return bookingFailure("liberar reservas vencidas", releaseError.message);

    // Clienta: el número la identifica.
    const client = await findOrCreateClient(supabase, {
      studioId,
      firstName,
      lastName,
      phone,
      remindersOk,
    });
    if (!client) return { ok: false, code: "server", error: BOOKING_ERROR };

    const studioDeposit = Number(studio.deposit_cents) || 0;
    const skipsDeposit = client.depositExempt || studioDeposit <= 0;

    const appointmentRow = skipsDeposit
      ? {
          status: "confirmed",
          deposit_cents: 0,
          hold_expires_at: null,
          quote_eur_to_ves: null,
          quote_eur_to_usdt: null,
        }
      : {
          status: "pending_deposit",
          deposit_cents: studioDeposit,
          hold_expires_at: new Date(
            now.getTime() + Number(studio.pending_hold_hours) * 3_600_000,
          ).toISOString(),
          // La tasa se congela aquí, al llegar al paso de pago.
          quote_eur_to_ves: toNumber(studio.eur_to_ves_rate),
          quote_eur_to_usdt: toNumber(studio.eur_to_usdt_rate),
        };

    const { data: appointment, error: appointmentError } = await supabase
      .from("appointments")
      .insert({
        studio_id: studioId,
        client_id: client.id,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        total_cents: totalCents,
        ...appointmentRow,
      })
      .select("id, manage_token")
      .single();
    if (appointmentError) {
      if (appointmentError.code === EXCLUSION_VIOLATION) {
        return { ok: false, code: "slot_taken", error: SLOT_TAKEN_ERROR };
      }
      return bookingFailure("cita", appointmentError.message);
    }
    if (!appointment) return bookingFailure("cita", "La cita no se devolvió.");

    // Copias de cada servicio: cambios posteriores no alteran la cita.
    const { error: linesError } = await supabase.from("appointment_services").insert(
      services.map((s) => ({
        appointment_id: appointment.id,
        service_id: s.id,
        studio_id: studioId,
        name: s.name,
        duration_min: s.duration_min,
        price_cents: s.price_cents,
      })),
    );
    if (linesError) {
      await supabase.from("appointments").delete().eq("id", appointment.id);
      return bookingFailure("servicios de la cita", linesError.message);
    }

    return { ok: true, token: String(appointment.manage_token) };
  } catch (e) {
    return bookingFailure("inesperado", e);
  }
}

type AdminClient = ReturnType<typeof createAdminClient>;

// Busca la clienta por número. Si existe, conserva sus nombres y su exención
// de abono, y solo actualiza el permiso para recordatorios.
async function findOrCreateClient(
  supabase: AdminClient,
  args: {
    studioId: string;
    firstName: string;
    lastName: string;
    phone: string;
    remindersOk: boolean;
  },
): Promise<{ id: string; depositExempt: boolean } | null> {
  const find = () =>
    supabase
      .from("clients")
      .select("id, deposit_exempt")
      .eq("studio_id", args.studioId)
      .eq("phone", args.phone)
      .maybeSingle();

  const { data: existing, error: findError } = await find();
  if (findError) {
    bookingFailure("buscar clienta", findError.message);
    return null;
  }

  if (existing) {
    const { error } = await supabase
      .from("clients")
      .update({ reminders_ok: args.remindersOk })
      .eq("id", existing.id);
    if (error) {
      bookingFailure("actualizar clienta", error.message);
      return null;
    }
    return { id: existing.id, depositExempt: existing.deposit_exempt === true };
  }

  const { data: created, error: insertError } = await supabase
    .from("clients")
    .insert({
      studio_id: args.studioId,
      first_name: args.firstName,
      last_name: args.lastName,
      phone: args.phone,
      reminders_ok: args.remindersOk,
    })
    .select("id, deposit_exempt")
    .single();

  if (insertError?.code === UNIQUE_VIOLATION) {
    // Otra reserva con el mismo número se adelantó: se usa esa clienta.
    const { data: raced, error } = await find();
    if (error || !raced) {
      bookingFailure("releer clienta", error?.message ?? "No se encontró.");
      return null;
    }
    await supabase
      .from("clients")
      .update({ reminders_ok: args.remindersOk })
      .eq("id", raced.id);
    return { id: raced.id, depositExempt: raced.deposit_exempt === true };
  }
  if (insertError || !created) {
    bookingFailure("crear clienta", insertError?.message ?? "No se devolvió.");
    return null;
  }
  return { id: created.id, depositExempt: created.deposit_exempt === true };
}

// ---------------------------------------------------------------------
// Ver la cita por su enlace privado
// ---------------------------------------------------------------------

type AppointmentRecord = {
  id: string;
  studioId: string;
  token: string;
  status: string;
  startsAt: string;
  endsAt: string;
  depositCents: number;
  totalCents: number;
  holdExpiresAt: string | null;
  quoteVes: number | null;
  quoteUsdt: number | null;
  clientFirstName: string;
  services: { name: string; durationMin: number; priceCents: number }[];
  depositStatuses: string[];
  studio: {
    timezone: string;
    pagoMovilBank: string | null;
    pagoMovilPhone: string | null;
    pagoMovilIdNumber: string | null;
    binanceAccount: string | null;
  };
};

// Las relaciones embebidas llegan como objeto o como lista según la relación.
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function many<T>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

type RawAppointment = {
  id: string;
  studio_id: string;
  manage_token: string;
  status: string;
  starts_at: string;
  ends_at: string;
  deposit_cents: number;
  total_cents: number;
  hold_expires_at: string | null;
  quote_eur_to_ves: number | string | null;
  quote_eur_to_usdt: number | string | null;
  clients: { first_name: string } | { first_name: string }[] | null;
  appointment_services:
    | { name: string; duration_min: number; price_cents: number }[]
    | null;
  deposits: { status: string }[] | null;
  studios:
    | {
        timezone: string;
        pago_movil_bank: string | null;
        pago_movil_phone: string | null;
        pago_movil_id_number: string | null;
        binance_account: string | null;
      }
    | null;
};

// Lanza si la base de datos falla; devuelve null si la cita no existe.
async function loadAppointment(token: string): Promise<AppointmentRecord | null> {
  if (!isUuid(token)) return null;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("appointments")
    .select(
      `id, studio_id, manage_token, status, starts_at, ends_at, deposit_cents,
       total_cents, hold_expires_at, quote_eur_to_ves, quote_eur_to_usdt,
       clients ( first_name ),
       appointment_services ( name, duration_min, price_cents ),
       deposits ( status ),
       studios ( timezone, pago_movil_bank, pago_movil_phone, pago_movil_id_number, binance_account )`,
    )
    .eq("manage_token", token.toLowerCase())
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as unknown as RawAppointment;
  const studio = one(row.studios);
  if (!studio) throw new Error("La cita no tiene estudio.");

  return {
    id: row.id,
    studioId: row.studio_id,
    token: String(row.manage_token),
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    depositCents: Number(row.deposit_cents) || 0,
    totalCents: Number(row.total_cents) || 0,
    holdExpiresAt: row.hold_expires_at,
    quoteVes: toNumber(row.quote_eur_to_ves),
    quoteUsdt: toNumber(row.quote_eur_to_usdt),
    clientFirstName: one(row.clients)?.first_name ?? "",
    services: many(row.appointment_services).map((s) => ({
      name: s.name,
      durationMin: Number(s.duration_min),
      priceCents: Number(s.price_cents),
    })),
    depositStatuses: many(row.deposits).map((d) => d.status),
    studio: {
      timezone: studio.timezone,
      pagoMovilBank: nonEmpty(studio.pago_movil_bank),
      pagoMovilPhone: nonEmpty(studio.pago_movil_phone),
      pagoMovilIdNumber: nonEmpty(studio.pago_movil_id_number),
      binanceAccount: nonEmpty(studio.binance_account),
    },
  };
}

function stateOf(record: AppointmentRecord, now: Date): BookingState {
  switch (record.status) {
    case "confirmed":
      return "confirmed";
    case "completed":
      return "completed";
    case "no_show":
      return "no_show";
    case "released":
      return "released";
  }
  // pending_deposit
  if (record.depositStatuses.some((s) => s === "pending" || s === "approved")) {
    return "receipt_sent";
  }
  if (record.holdExpiresAt && new Date(record.holdExpiresAt).getTime() < now.getTime()) {
    return "expired";
  }
  return "awaiting_payment";
}

function paymentOf(record: AppointmentRecord): NonNullable<BookingView["payment"]> {
  const euros = record.depositCents / 100;
  const { studio } = record;
  return {
    pagoMovil:
      studio.pagoMovilBank &&
      studio.pagoMovilPhone &&
      studio.pagoMovilIdNumber &&
      record.quoteVes !== null &&
      record.quoteVes > 0
        ? {
            bank: studio.pagoMovilBank,
            phone: studio.pagoMovilPhone,
            idNumber: studio.pagoMovilIdNumber,
            amountVes: round2(euros * record.quoteVes),
          }
        : null,
    binance:
      studio.binanceAccount && record.quoteUsdt !== null && record.quoteUsdt > 0
        ? {
            account: studio.binanceAccount,
            amountUsdt: round2(euros * record.quoteUsdt),
          }
        : null,
  };
}

export async function getBookingView(token: string): Promise<BookingView | null> {
  if (!isUuid(token)) return null;
  let record: AppointmentRecord | null;
  try {
    record = await loadAppointment(token);
  } catch (e) {
    console.error("[cita] cargar:", e instanceof Error ? e.message : e);
    throw new Error("No se pudo cargar la cita.");
  }
  if (!record) return null;

  const state = stateOf(record, new Date());
  const tz = record.studio.timezone;
  const start = zonedParts(new Date(record.startsAt), tz);
  const end = zonedParts(new Date(record.endsAt), tz);

  return {
    token: record.token,
    state,
    clientFirstName: record.clientFirstName,
    date: start.date,
    time: start.time,
    endTime: end.time,
    services: record.services,
    totalCents: record.totalCents,
    durationMin: record.services.reduce((sum, s) => sum + s.durationMin, 0),
    depositCents: record.depositCents,
    holdExpiresAt: state === "awaiting_payment" ? record.holdExpiresAt : null,
    payment: state === "awaiting_payment" ? paymentOf(record) : null,
  };
}

// ---------------------------------------------------------------------
// Comprobante del abono
// ---------------------------------------------------------------------

// El tipo se decide por los primeros bytes, no por lo que declara el navegador.
function detectImage(bytes: Uint8Array): { ext: string; contentType: string } | null {
  const at = (i: number) => bytes[i];
  const ascii = (from: number, to: number) =>
    String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length < 12) return null;
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) {
    return { ext: "jpg", contentType: "image/jpeg" };
  }
  if (at(0) === 0x89 && ascii(1, 4) === "PNG") {
    return { ext: "png", contentType: "image/png" };
  }
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") {
    return { ext: "webp", contentType: "image/webp" };
  }
  if (ascii(4, 8) === "ftyp") {
    const brand = ascii(8, 12);
    if (["heic", "heix", "hevc", "hevx", "heim", "heis"].includes(brand)) {
      return { ext: "heic", contentType: "image/heic" };
    }
    if (["mif1", "msf1"].includes(brand)) {
      return { ext: "heif", contentType: "image/heif" };
    }
  }
  return null;
}

export async function saveReceipt(
  token: string,
  method: "pago_movil" | "binance",
  file: File,
): Promise<ReceiptResult> {
  if (!isUuid(token)) return { ok: false, error: "No encontramos esta cita." };
  if (method !== "pago_movil" && method !== "binance") {
    return { ok: false, error: "Elige cómo pagaste el abono." };
  }
  if (typeof File === "undefined" || !(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Sube la imagen del comprobante." };
  }
  if (file.size > MAX_RECEIPT_BYTES) {
    return {
      ok: false,
      error: "La imagen pesa demasiado. Prueba con una captura de pantalla.",
    };
  }
  if (file.type && !file.type.startsWith("image/")) {
    return { ok: false, error: "El comprobante debe ser una imagen (JPG, PNG, WEBP o HEIC)." };
  }

  let uploadedPath: string | null = null;
  let depositId: string | null = null;
  const supabase = createAdminClient();
  const storage = supabase.storage.from(RECEIPT_BUCKET);

  // Deshace lo hecho si un paso posterior falla.
  const rollback = async () => {
    if (depositId) await supabase.from("deposits").delete().eq("id", depositId);
    if (uploadedPath) await storage.remove([uploadedPath]);
  };

  try {
    const record = await loadAppointment(token);
    if (!record) return { ok: false, error: "No encontramos esta cita." };

    const state = stateOf(record, new Date());
    if (state === "expired") {
      return { ok: false, error: "El tiempo para pagar esta cita terminó. Agenda de nuevo." };
    }
    if (state !== "awaiting_payment") {
      return { ok: false, error: "Esta cita ya no admite un comprobante." };
    }

    const payment = paymentOf(record);
    const paid =
      method === "pago_movil"
        ? payment.pagoMovil && {
            currency: "VES",
            amount: payment.pagoMovil.amountVes,
            rate: record.quoteVes,
          }
        : payment.binance && {
            currency: "USDT",
            amount: payment.binance.amountUsdt,
            rate: record.quoteUsdt,
          };
    if (!paid) return { ok: false, error: "Ese método de pago no está disponible." };

    const bytes = new Uint8Array(await file.arrayBuffer());
    const image = detectImage(bytes);
    if (!image) {
      return { ok: false, error: "El comprobante debe ser una imagen (JPG, PNG, WEBP o HEIC)." };
    }

    const path = `${record.studioId}/${record.id}/${Date.now()}.${image.ext}`;
    const { error: uploadError } = await storage.upload(path, bytes, {
      contentType: image.contentType,
      upsert: false,
    });
    if (uploadError) return receiptFailure("subir", uploadError.message);
    uploadedPath = path;

    const { data: deposit, error: depositError } = await supabase
      .from("deposits")
      .insert({
        studio_id: record.studioId,
        appointment_id: record.id,
        method,
        amount_cents: record.depositCents,
        receipt_path: path,
        paid_currency: paid.currency,
        paid_amount: paid.amount,
        rate_used: paid.rate,
        status: "pending",
      })
      .select("id")
      .single();
    if (depositError || !deposit) {
      await rollback();
      return receiptFailure("abono", depositError?.message ?? "No se devolvió.");
    }
    depositId = deposit.id;

    // Con el comprobante enviado, el horario queda guardado hasta que Giselle
    // apruebe o rechace. Solo si la cita sigue esperando el pago: si la reserva
    // venció o se liberó mientras tanto, se deshace todo.
    const { data: held, error: holdError } = await supabase
      .from("appointments")
      .update({ hold_expires_at: null })
      .eq("id", record.id)
      .eq("status", "pending_deposit")
      .or(`hold_expires_at.is.null,hold_expires_at.gt.${new Date().toISOString()}`)
      .select("id");
    if (holdError) {
      await rollback();
      return receiptFailure("guardar horario", holdError.message);
    }
    if (!held || held.length === 0) {
      await rollback();
      return { ok: false, error: "El tiempo para pagar esta cita terminó. Agenda de nuevo." };
    }

    return { ok: true };
  } catch (e) {
    await rollback().catch(() => undefined);
    return receiptFailure("inesperado", e);
  }
}

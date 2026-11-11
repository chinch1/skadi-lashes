import type { NextRequest } from "next/server";
import {
  getAppointmentMonthAvailability,
  getMonthAvailability,
  type AvailabilityError,
} from "@/lib/availability-data";

// Público y sin sesión: solo devuelve horas de inicio libres, nunca datos de citas.
// GET /api/availability?month=YYYY-MM&services=<uuid>,<uuid>   (agendar)
// GET /api/availability?month=YYYY-MM&cita=<enlace privado>      (reprogramar)
// Se usa uno de los dos, nunca ambos.
// Leer la URL de la solicitud ya hace que la ruta sea dinámica.

const NO_STORE = { "Cache-Control": "no-store" };

const ERRORS: Record<AvailabilityError, { status: number; message: string }> = {
  bad_request: { status: 400, message: "Solicitud no válida." },
  unknown_services: {
    status: 404,
    message: "Alguno de los servicios ya no está disponible.",
  },
  server_error: { status: 503, message: "No se pudo consultar la disponibilidad." },
};

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const month = params.get("month") ?? "";
  const servicesParam = params.get("services");
  const token = params.get("cita");

  if ((servicesParam === null) === (token === null)) {
    const { status, message } = ERRORS.bad_request;
    return Response.json({ error: message }, { status, headers: NO_STORE });
  }

  const result =
    token !== null
      ? await getAppointmentMonthAvailability(month, token)
      : await getMonthAvailability(
          month,
          (servicesParam ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0),
        );

  if (!result.ok) {
    const { status, message } = ERRORS[result.error];
    return Response.json({ error: message }, { status, headers: NO_STORE });
  }
  return Response.json(result.data, { headers: NO_STORE });
}

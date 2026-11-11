import { describe, expect, it } from "vitest";

import { RULES } from "./rules";
import { confirmationMessage, rejectionMessage, waLink } from "./whatsapp";

const appointment = {
  firstName: "María",
  date: "2026-11-12",
  time: "12:00",
  services: ["Pestañas clásicas", "Retiro"],
  link: "https://skadi.example/cita/abc",
};

const rule = (title: string) => RULES.find((r) => r.title === title)!.text;

describe("waLink", () => {
  it("deja solo los dígitos del número y codifica el texto", () => {
    expect(waLink("+584121234567", "Hola María & co?\nSí")).toBe(
      "https://wa.me/584121234567?text=Hola%20Mar%C3%ADa%20%26%20co%3F%0AS%C3%AD",
    );
  });

  it("el texto codificado vuelve a ser el original", () => {
    const text = confirmationMessage(appointment);
    const url = new URL(waLink("+584121234567", text));
    expect(url.searchParams.get("text")).toBe(text);
  });
});

describe("confirmationMessage", () => {
  it("arma el mensaje con fecha larga, hora de 12 horas, servicios y normas", () => {
    expect(confirmationMessage(appointment)).toBe(
      "Hola María, tu cita en Skadi Lashes quedó confirmada para el jueves 12 de noviembre a las 12:00 pm.\n\n" +
        "Servicios: Pestañas clásicas, Retiro.\n\n" +
        `${rule("Puntualidad")}\n` +
        `${rule("Acompañantes")}\n\n` +
        "Puedes ver tu cita aquí: https://skadi.example/cita/abc",
    );
  });

  it("usa el texto exacto de las normas", () => {
    const text = confirmationMessage(appointment);
    expect(text).toContain(
      "Si llegas con más de 10 minutos de retraso, Skadi evaluará si puede atenderte, con un cargo adicional de 8 €.",
    );
    expect(text).toContain("No se admiten acompañantes, sin excepción.");
  });
});

describe("rejectionMessage", () => {
  it("incluye la hora límite cuando la hay", () => {
    expect(rejectionMessage({ ...appointment, time: "15:30", deadline: "14:05" })).toBe(
      "Hola María, no pude verificar el comprobante de tu abono para la cita del jueves 12 de noviembre a las 3:30 pm. " +
        "Por favor súbelo de nuevo aquí antes de las 2:05 pm: https://skadi.example/cita/abc\n\n" +
        "Si no lo recibo, el horario se libera.",
    );
  });

  it("omite la hora límite cuando no la hay", () => {
    const text = rejectionMessage({ ...appointment, deadline: null });
    expect(text).toContain("súbelo de nuevo aquí: https://skadi.example/cita/abc");
    expect(text).not.toContain("antes de las");
  });
});

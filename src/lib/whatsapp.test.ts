import { describe, expect, it } from "vitest";

import { RULES } from "./rules";
import {
  DEFAULT_CONFIRMATION_TEMPLATE,
  DEFAULT_REJECTION_TEMPLATE,
  PLACEHOLDERS,
  confirmationMessage,
  rejectionMessage,
  renderTemplate,
  waLink,
} from "./whatsapp";

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

describe("renderTemplate", () => {
  it("cambia todos los marcadores conocidos, aunque se repitan", () => {
    expect(renderTemplate("{nombre} y {nombre}: {hora}", { nombre: "Ana", hora: "3:00 pm" })).toBe(
      "Ana y Ana: 3:00 pm",
    );
  });

  it("deja tal cual los marcadores que no conoce y las llaves sueltas", () => {
    expect(renderTemplate("Hola {nombre} {apodo} {}", { nombre: "Ana" })).toBe(
      "Hola Ana {apodo} {}",
    );
  });

  it("no vuelve a leer un valor que trae llaves", () => {
    expect(renderTemplate("{nombre} {hora}", { nombre: "{hora}", hora: "1:00 pm" })).toBe(
      "{hora} 1:00 pm",
    );
  });

  it("no toma propiedades heredadas como marcadores", () => {
    expect(renderTemplate("{toString}", {})).toBe("{toString}");
  });
});

describe("PLACEHOLDERS", () => {
  it("ofrece los cinco marcadores", () => {
    expect(PLACEHOLDERS.map((p) => p.key)).toEqual([
      "nombre",
      "fecha",
      "hora",
      "servicios",
      "enlace",
    ]);
  });
});

describe("confirmationMessage", () => {
  const expected =
    "Hola María, tu cita en Skadi Lashes quedó confirmada para el jueves 12 de noviembre a las 12:00 pm.\n\n" +
    "Servicios: Pestañas clásicas, Retiro.\n\n" +
    `${rule("Puntualidad")}\n` +
    `${rule("Acompañantes")}\n\n` +
    "Puedes ver tu cita aquí: https://skadi.example/cita/abc";

  it("con el texto por defecto arma fecha larga, hora de 12 horas, servicios y normas", () => {
    expect(confirmationMessage(appointment)).toBe(expected);
  });

  it("usa el texto exacto de las normas", () => {
    const text = confirmationMessage(appointment);
    expect(text).toContain(
      "Si llegas con más de 10 minutos de retraso, Skadi evaluará si puede atenderte, con un cargo adicional de 8 €.",
    );
    expect(text).toContain("No se admiten acompañantes, sin excepción.");
  });

  it("usa el texto de Giselle cuando lo hay", () => {
    expect(
      confirmationMessage(appointment, "¡{nombre}! Te espero el {fecha}, {hora}.\n{servicios}\n{enlace}"),
    ).toBe(
      "¡María! Te espero el jueves 12 de noviembre, 12:00 pm.\nPestañas clásicas, Retiro\nhttps://skadi.example/cita/abc",
    );
  });

  it("con un texto vacío, nulo o de solo espacios vuelve al de la app", () => {
    expect(confirmationMessage(appointment, "")).toBe(expected);
    expect(confirmationMessage(appointment, null)).toBe(expected);
    expect(confirmationMessage(appointment, "  \n ")).toBe(expected);
  });

  it("el texto por defecto lleva el enlace", () => {
    expect(DEFAULT_CONFIRMATION_TEMPLATE).toContain("{enlace}");
  });
});

describe("rejectionMessage", () => {
  const booking = { ...appointment, time: "15:30", link: "https://skadi.example/agendar" };

  it("con el texto por defecto avisa que el horario quedó libre y da el enlace para agendar", () => {
    expect(rejectionMessage(booking)).toBe(
      "Hola María, no pude verificar el comprobante de tu abono para la cita del jueves 12 de noviembre a las 3:30 pm, así que el horario quedó libre.\n\n" +
        "Si quieres, puedes agendar de nuevo aquí: https://skadi.example/agendar",
    );
  });

  it("usa el texto de Giselle y deja los marcadores desconocidos", () => {
    expect(rejectionMessage(booking, "{nombre}, revisa tu pago {monto}. {enlace}")).toBe(
      "María, revisa tu pago {monto}. https://skadi.example/agendar",
    );
  });

  it("con un texto vacío vuelve al de la app", () => {
    expect(rejectionMessage(booking, " ")).toBe(
      renderTemplate(DEFAULT_REJECTION_TEMPLATE, {
        nombre: "María",
        fecha: "jueves 12 de noviembre",
        hora: "3:30 pm",
        servicios: "Pestañas clásicas, Retiro",
        enlace: "https://skadi.example/agendar",
      }),
    );
  });
});

import { describe, expect, it } from "vitest";

import { RULES, buildRules } from "./rules";
import {
  DEFAULT_CONFIRMATION_TEMPLATE,
  DEFAULT_REJECTION_TEMPLATE,
  DEFAULT_REMINDER_TEMPLATE,
  DEFAULT_RETOUCH_TEMPLATE,
  PLACEHOLDERS,
  confirmationMessage,
  normsText,
  rejectionMessage,
  reminderMessage,
  retouchMessage,
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
  it("ofrece los siete marcadores", () => {
    expect(PLACEHOLDERS.map((p) => p.key)).toEqual([
      "nombre",
      "fecha",
      "dia",
      "hora",
      "servicios",
      "enlace",
      "normas",
    ]);
  });

  it("el ejemplo de {normas} son Puntualidad y Acompañantes de la app", () => {
    expect(PLACEHOLDERS.find((p) => p.key === "normas")!.example).toBe(
      `${rule("Puntualidad")}\n${rule("Acompañantes")}`,
    );
  });
});

describe("confirmationMessage", () => {
  const expected =
    "Hola María, tu cita en Skadi Lashes quedó confirmada para el jueves 12 de noviembre a las 12:00 pm.\n\n" +
    "Servicios: Pestañas clásicas, Retiro.\n\n" +
    `${rule("Puntualidad")}\n` +
    `${rule("Acompañantes")}\n\n` +
    "Si necesitas cambiar tu cita o no puedes venir, hazlo desde aquí: https://skadi.example/cita/abc";

  it("con el texto por defecto arma fecha larga, hora de 12 horas, servicios y normas", () => {
    expect(confirmationMessage(appointment)).toBe(expected);
  });

  it("usa el texto exacto de las normas", () => {
    const text = confirmationMessage(appointment);
    expect(text).toContain(
      "Si llegas con más de 10 minutos de retraso, Skadi evaluará si puede atenderte, con un cargo adicional de 8\u00a0€.",
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

  it("el texto por defecto lleva el enlace y las normas", () => {
    expect(DEFAULT_CONFIRMATION_TEMPLATE).toContain("{enlace}");
    expect(DEFAULT_CONFIRMATION_TEMPLATE).toContain("{normas}");
  });

  it("{normas} sigue los ajustes que recibe", () => {
    const norms = normsText(
      buildRules({ lateFeeCents: 1000, lateToleranceMin: 15, noticeHours: 24 }),
    );
    const text = confirmationMessage({ ...appointment, norms });
    expect(text).toContain(
      "Si llegas con más de 15 minutos de retraso, Skadi evaluará si puede atenderte, con un cargo adicional de 10\u00a0€.\nNo se admiten acompañantes, sin excepción.\n\n",
    );
    expect(text).not.toContain("8\u00a0€");
  });

  it("un texto de Giselle sin {normas} no lleva normas", () => {
    const text = confirmationMessage(
      { ...appointment, norms: "NORMAS" },
      "{nombre}, te espero el {fecha}. {enlace}",
    );
    expect(text).toBe("María, te espero el jueves 12 de noviembre. https://skadi.example/cita/abc");
    expect(confirmationMessage(appointment, "{nombre}: {enlace}")).not.toContain(
      rule("Puntualidad"),
    );
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

describe("reminderMessage", () => {
  const expected =
    "Hola María, te recuerdo tu cita en Skadi Lashes mañana, jueves 12 de noviembre a las 12:00 pm.\n\n" +
    "Servicios: Pestañas clásicas, Retiro.\n\n" +
    `${rule("Puntualidad")}\n` +
    `${rule("Acompañantes")}\n\n` +
    "Si necesitas cambiarla o no puedes venir, hazlo desde aquí: https://skadi.example/cita/abc";

  it("con el texto por defecto arma fecha, hora, servicios, normas y el enlace de su cita", () => {
    expect(reminderMessage({ ...appointment, today: "2026-11-11" })).toBe(expected);
  });

  it("{dia} dice hoy, mañana o la fecha según cuándo sea la cita", () => {
    const dia = (today?: string) => reminderMessage({ ...appointment, today }, "{dia}");
    expect(dia("2026-11-12")).toBe("hoy, jueves 12 de noviembre");
    expect(dia("2026-11-11")).toBe("mañana, jueves 12 de noviembre");
    expect(dia("2026-11-05")).toBe("el jueves 12 de noviembre");
    expect(dia()).toBe("el jueves 12 de noviembre");
  });

  it("usa el texto de Giselle cuando lo hay", () => {
    expect(reminderMessage(appointment, "{nombre}, mañana a las {hora}. {enlace}")).toBe(
      "María, mañana a las 12:00 pm. https://skadi.example/cita/abc",
    );
  });

  it("con un texto vacío, nulo o de solo espacios vuelve al de la app", () => {
    const manana = { ...appointment, today: "2026-11-11" };
    expect(reminderMessage(manana, "")).toBe(expected);
    expect(reminderMessage(manana, null)).toBe(expected);
    expect(reminderMessage(manana, " \n ")).toBe(expected);
  });

  it("el texto por defecto lleva el enlace y las normas", () => {
    expect(DEFAULT_REMINDER_TEMPLATE).toContain("{enlace}");
    expect(DEFAULT_REMINDER_TEMPLATE).toContain("{normas}");
  });

  it("{normas} sigue los ajustes que recibe", () => {
    const norms = normsText(
      buildRules({ lateFeeCents: 550, lateToleranceMin: 5, noticeHours: 12 }),
    );
    const lateRule = rule("Puntualidad")
      .replace("10 minutos", "5 minutos")
      .replace("8\u00a0€", "5,50\u00a0€");
    expect(reminderMessage({ ...appointment, norms, today: "2026-11-11" })).toBe(
      expected.replace(rule("Puntualidad"), lateRule),
    );
  });
});

describe("retouchMessage", () => {
  const retouch = {
    ...appointment,
    date: "2026-10-21",
    services: ["Pestañas clásicas"],
    link: "https://skadi.example/agendar",
  };
  const expected =
    "Hola María, ya pasó un tiempo desde tu cita del miércoles 21 de octubre en Skadi Lashes (Pestañas clásicas). Es buen momento para tu retoque.\n\n" +
    "Puedes agendar aquí: https://skadi.example/agendar";

  it("con el texto por defecto nombra la cita a la que asistió y da el enlace para agendar", () => {
    expect(retouchMessage(retouch)).toBe(expected);
  });

  it("usa el texto de Giselle cuando lo hay", () => {
    expect(retouchMessage(retouch, "{nombre}: ¿retoque de {servicios}? {enlace}")).toBe(
      "María: ¿retoque de Pestañas clásicas? https://skadi.example/agendar",
    );
  });

  it("con un texto vacío o nulo vuelve al de la app", () => {
    expect(retouchMessage(retouch, "")).toBe(expected);
    expect(retouchMessage(retouch, null)).toBe(expected);
    expect(retouchMessage(retouch, "   ")).toBe(expected);
  });

  it("el texto por defecto lleva el enlace", () => {
    expect(DEFAULT_RETOUCH_TEMPLATE).toContain("{enlace}");
  });

  it("sin mensaje, el enlace abre solo el chat", () => {
    expect(waLink("+584121234567", "")).toBe("https://wa.me/584121234567");
    expect(waLink("+584121234567", "   ")).toBe("https://wa.me/584121234567");
    expect(waLink("+584121234567", "Hola")).toBe("https://wa.me/584121234567?text=Hola");
  });
});

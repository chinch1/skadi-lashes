import { describe, expect, it } from "vitest";

import { formatPhone, formatPhoneInput, normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it("acepta las formas habituales de un celular venezolano", () => {
    for (const input of [
      "0412-1234567",
      "04121234567",
      "4121234567",
      "584121234567",
      "+58 412 1234567",
      "+58 (412) 123.45.67",
      " 0412 123 45 67 ",
      "+58 0412 1234567",
      "0058 412 1234567",
    ]) {
      expect(normalizePhone(input), input).toBe("+584121234567");
    }
  });

  it("acepta todos los prefijos de celular", () => {
    for (const prefix of ["412", "414", "416", "422", "424", "426"]) {
      expect(normalizePhone(`0${prefix}-7654321`)).toBe(`+58${prefix}7654321`);
    }
  });

  it("rechaza prefijos venezolanos que no son de celular sin el +", () => {
    expect(normalizePhone("0212-1234567")).toBeNull();
    expect(normalizePhone("04131234567")).toBeNull();
    expect(normalizePhone("4151234567")).toBeNull();
  });

  it("acepta números extranjeros con + y entre 8 y 15 dígitos", () => {
    expect(normalizePhone("+34 612 34 56 78")).toBe("+34612345678");
    expect(normalizePhone("+1 (305) 555-0100")).toBe("+13055550100");
    expect(normalizePhone("+12345678")).toBe("+12345678");
    expect(normalizePhone("+123456789012345")).toBe("+123456789012345");
  });

  it("rechaza números extranjeros demasiado cortos o largos", () => {
    expect(normalizePhone("+1234567")).toBeNull();
    expect(normalizePhone("+1234567890123456")).toBeNull();
  });

  it("rechaza texto que no es un número", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("   ")).toBeNull();
    expect(normalizePhone("+")).toBeNull();
    expect(normalizePhone("0412-12345ab")).toBeNull();
    expect(normalizePhone("+58 412 123 4567 ext 2")).toBeNull();
    expect(normalizePhone("++584121234567")).toBeNull();
    expect(normalizePhone("041212345678")).toBeNull();
    expect(normalizePhone("041212345")).toBeNull();
  });

  it("rechaza valores que no son texto", () => {
    expect(normalizePhone(undefined as unknown as string)).toBeNull();
    expect(normalizePhone(4121234567 as unknown as string)).toBeNull();
  });
});

describe("formatPhone", () => {
  it("muestra los celulares venezolanos en formato local", () => {
    expect(formatPhone("+584121234567")).toBe("0412-1234567");
    expect(formatPhone("+584261234567")).toBe("0426-1234567");
  });

  it("deja igual los demás números", () => {
    expect(formatPhone("+34612345678")).toBe("+34612345678");
    expect(formatPhone("+582121234567")).toBe("+582121234567");
  });
});

describe("formatPhoneInput", () => {
  // Simula teclear carácter por carácter.
  const type = (text: string) =>
    [...text].reduce((value, char) => formatPhoneInput(value + char, value), "");

  it("pone el guion a un número venezolano mientras se escribe", () => {
    expect(type("04121234567")).toBe("0412-1234567");
    expect(type("0412")).toBe("0412");
    expect(type("04121")).toBe("0412-1");
    expect(type("4121234567")).toBe("412-1234567");
  });

  it("acepta un número pegado con espacios o guiones", () => {
    expect(formatPhoneInput("0412 123 45 67")).toBe("0412-1234567");
    expect(formatPhoneInput("0412-1234567")).toBe("0412-1234567");
  });

  it("deja libre un número de otro país", () => {
    expect(type("+34 612 345 678")).toBe("+34 612 345 678");
    expect(formatPhoneInput("+1 (305) 555-0100")).toBe("+1 305 5550100");
  });

  it("no reacomoda al borrar", () => {
    expect(formatPhoneInput("0412-", "0412-1")).toBe("0412-");
    expect(formatPhoneInput("0412", "0412-")).toBe("0412");
  });

  it("quita letras y símbolos", () => {
    expect(type("04a12b")).toBe("0412");
  });

  it("lo que produce siempre se puede guardar", () => {
    expect(normalizePhone(type("04121234567"))).toBe("+584121234567");
    expect(normalizePhone(type("4121234567"))).toBe("+584121234567");
    expect(normalizePhone(type("+34 612 345 678"))).toBe("+34612345678");
  });
});

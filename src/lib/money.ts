// Dinero: siempre céntimos de euro, como enteros.

export function formatEuros(cents: number): string {
  const euros = cents / 100;
  const text = Number.isInteger(euros)
    ? String(euros)
    : euros.toFixed(2).replace(".", ",");
  // Espacio fijo: el símbolo nunca queda solo en la línea siguiente.
  return `${text}\u00a0€`;
}

// Para rellenar un campo de texto: "45" o "45,50".
export function centsToInput(cents: number): string {
  return formatEuros(cents).replace("\u00a0€", "");
}

// Acepta "45", "45,5", "45.50". Devuelve null si no es un monto válido.
export function parseEuros(input: string): number | null {
  const clean = input.trim().replace("€", "").trim().replace(",", ".");
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

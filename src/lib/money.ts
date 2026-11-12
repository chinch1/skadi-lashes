// Dinero: siempre céntimos de euro, como enteros.

export function formatEuros(cents: number): string {
  const euros = cents / 100;
  const text = Number.isInteger(euros)
    ? String(euros)
    : euros.toFixed(2).replace(".", ",");
  // Espacio fijo: el símbolo nunca queda solo en la línea siguiente.
  return `${text}\u00a0€`;
}

// Los mismos céntimos leídos como dólares, sin conversión: en este negocio
// 10 € se cobran como 10 $. 4500 -> "$45", 4550 -> "$45,50", 125000 -> "$1.250".
export function formatDollars(cents: number): string {
  const dollars = Math.round(cents) / 100;
  const [whole, decimals] = dollars.toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decimals === "00" ? `$${grouped}` : `$${grouped},${decimals}`;
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

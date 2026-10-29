/**
 * Money is always an integer number of pesewas (GH₵ 1 = 100 pesewas).
 * Only format for display; never do arithmetic on formatted strings or floats.
 */

export type Pesewas = number;

const CEDI_SIGN = "GH₵";

function assertPesewas(value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`Money must be a whole number of pesewas, got ${value}`);
  }
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Formats pesewas for display: 45000 → "GH₵ 450", 125050 → "GH₵ 1,250.50".
 * Whole cedi amounts drop the decimals; otherwise two decimals are shown.
 */
export function formatPesewas(pesewas: Pesewas): string {
  assertPesewas(pesewas);
  const sign = pesewas < 0 ? "-" : "";
  const abs = Math.abs(pesewas);
  const cedis = Math.floor(abs / 100);
  const rest = abs % 100;
  const whole = groupThousands(String(cedis));
  const decimals = rest === 0 ? "" : `.${String(rest).padStart(2, "0")}`;
  return `${sign}${CEDI_SIGN} ${whole}${decimals}`;
}

/** Multiplies a unit price by a quantity, keeping the result in whole pesewas. */
export function lineTotal(unitPrice: Pesewas, qty: number): Pesewas {
  assertPesewas(unitPrice);
  if (!Number.isSafeInteger(qty) || qty < 0) {
    throw new TypeError(`Quantity must be a non-negative whole number, got ${qty}`);
  }
  const total = unitPrice * qty;
  assertPesewas(total);
  return total;
}

/** Adds amounts in pesewas. */
export function sumPesewas(amounts: readonly Pesewas[]): Pesewas {
  return amounts.reduce((total, amount) => {
    assertPesewas(amount);
    const next = total + amount;
    assertPesewas(next);
    return next;
  }, 0);
}

/**
 * Reads an amount typed in cedis ("450", "1,250.50", "GH₵ 12.5") as pesewas.
 * Uses string arithmetic only, never floats. Returns null if it isn't a valid amount.
 */
export function parseCedis(input: string): Pesewas | null {
  const cleaned = input.trim().replace(/^(GH₵|GHS|GH¢|₵)\s*/i, "").replace(/,/g, "");
  const match = /^(\d{1,8})(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const [, cedis, fraction = ""] = match;
  return Number(cedis) * 100 + Number(fraction.padEnd(2, "0"));
}

/** Pesewas as a plain cedi amount for form inputs: 45000 → "450", 125050 → "1250.50". */
export function pesewasToInput(pesewas: Pesewas | null): string {
  if (pesewas === null) return "";
  assertPesewas(pesewas);
  const cedis = Math.floor(pesewas / 100);
  const rest = pesewas % 100;
  return rest === 0 ? String(cedis) : `${cedis}.${String(rest).padStart(2, "0")}`;
}

/** Pesewas as a plain decimal string for machines (structured data): 45000 → "450.00". */
export function pesewasToDecimal(pesewas: Pesewas): string {
  assertPesewas(pesewas);
  const sign = pesewas < 0 ? "-" : "";
  const abs = Math.abs(pesewas);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

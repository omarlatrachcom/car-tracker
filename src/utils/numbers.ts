export function parseDecimal(value: string) {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) return NaN;
  return Number(trimmed);
}

export function roundTo2(value: number) {
  return Math.round(value * 100) / 100;
}

export function roundTo4(value: number) {
  return Math.round(value * 10000) / 10000;
}

export function isPositiveNumber(value: number) {
  return Number.isFinite(value) && value > 0;
}

export function isNonNegativeNumber(value: number) {
  return Number.isFinite(value) && value >= 0;
}

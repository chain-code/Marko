const DECIMAL_INTEGER_PATTERN = /^\d+$/;

export function normalizeOrderedListNumber(value: string): string {
  if (!DECIMAL_INTEGER_PATTERN.test(value)) return value;
  const normalized = value.replace(/^0+(?=\d)/, "");
  return normalized || "0";
}

export function incrementOrderedListNumber(value: string): string {
  const normalized = normalizeOrderedListNumber(value);
  if (!DECIMAL_INTEGER_PATTERN.test(normalized)) return value;

  const digits = normalized.split("");
  let carry = 1;
  for (let index = digits.length - 1; index >= 0 && carry > 0; index -= 1) {
    const next = (digits[index]?.charCodeAt(0) ?? 48) - 48 + carry;
    digits[index] = String(next % 10);
    carry = next >= 10 ? 1 : 0;
  }
  if (carry > 0) digits.unshift("1");
  return digits.join("");
}

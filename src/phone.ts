// Mobile numbers are stored in international (E.164) form: + and up to 15
// digits. A number typed the local way (010…) is read with the space's default
// country code; a number that cannot be read is refused (null).

const MIN_DIGITS = 8; // country code + subscriber number
const MAX_DIGITS = 15; // E.164 maximum

/** "+20", "20" or " +966 " → "+20" / "+966"; anything else → null. */
export function normaliseCountryCode(input: string): string | null {
  const m = input.trim().match(/^\+?([1-9]\d{0,2})$/);
  return m ? `+${m[1]}` : null;
}

export function normaliseMobile(input: string, defaultCountryCode?: string): string | null {
  const compact = input.trim().replace(/[\s\-().]/g, '');
  let digits: string;
  if (compact.startsWith('+')) digits = compact.slice(1);
  else if (compact.startsWith('00')) digits = compact.slice(2);
  else {
    const cc = defaultCountryCode ? normaliseCountryCode(defaultCountryCode) : null;
    if (!cc) return null;
    // Local form: drop the national trunk prefix (the leading 0).
    digits = cc.slice(1) + (compact.startsWith('0') ? compact.slice(1) : compact);
  }
  if (!/^[1-9]\d*$/.test(digits)) return null;
  if (digits.length < MIN_DIGITS || digits.length > MAX_DIGITS) return null;
  return `+${digits}`;
}

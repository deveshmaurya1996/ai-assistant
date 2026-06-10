import type { CountryCode } from 'react-native-country-picker-modal';

export const DEFAULT_COUNTRY_CODE: CountryCode = 'IN';
export const DEFAULT_CALLING_CODE = '91';

export function countryCodeToFlagEmoji(countryCode: string): string {
  if (countryCode.length !== 2) return '';
  const upper = countryCode.toUpperCase();
  return String.fromCodePoint(
    ...upper.split('').map((char) => 0x1f1e6 - 65 + char.charCodeAt(0))
  );
}

function stripDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function splitLocalPhone(callingCode: string, rawInput: string): string {
  const dial = stripDigits(callingCode);
  let local = stripDigits(rawInput);

  if (local.startsWith(dial) && local.length > dial.length + 5) {
    local = local.slice(dial.length);
    while (local.startsWith(dial) && local.length > 10) {
      local = local.slice(dial.length);
    }
  }
  if (dial === '91' && local.length === 11 && local.startsWith('0')) {
    local = local.slice(1);
  }
  return local.replace(/^0+/, '');
}

export function buildE164Phone(callingCode: string, localNumber: string): string {
  const dial = stripDigits(callingCode);
  const localDigits = splitLocalPhone(callingCode, localNumber);
  return `${dial}${localDigits}`;
}

export function validateLocalPhone(callingCode: string, localNumber: string): string | null {
  const dial = stripDigits(callingCode);
  const localDigits = splitLocalPhone(callingCode, localNumber);

  if (!localDigits) return 'Enter your mobile number.';

  if (dial === '91') {
    if (localDigits.length !== 10) {
      return 'Enter a valid 10-digit Indian mobile number (without +91).';
    }
    if (!/^[6-9]\d{9}$/.test(localDigits)) {
      return 'Indian mobile numbers start with 6, 7, 8, or 9.';
    }
    return null;
  }

  if (localDigits.length < 6) {
    return 'Enter a valid mobile number.';
  }
  return null;
}

export function formatE164ForDisplay(e164: string): string {
  const d = stripDigits(e164);
  if (d.startsWith('91') && d.length === 12) {
    return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  }
  return `+${d}`;
}

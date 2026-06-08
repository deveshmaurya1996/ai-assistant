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

export function buildE164Phone(callingCode: string, localNumber: string): string {
  const dial = callingCode.replace(/\D/g, '');
  const localDigits = localNumber.replace(/\D/g, '');
  return `${dial}${localDigits}`;
}

export function validateLocalPhone(callingCode: string, localNumber: string): string | null {
  const dial = callingCode.replace(/\D/g, '');
  const localDigits = localNumber.replace(/\D/g, '');
  if (!localDigits) return 'Enter your mobile number.';
  if (dial === '91' && localDigits.length !== 10) {
    return 'Enter a valid 10-digit Indian mobile number.';
  }
  if (localDigits.length < 6) {
    return 'Enter a valid mobile number.';
  }
  return null;
}

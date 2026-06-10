
export function stripPhoneDigits(input: string): string {
  return input.replace(/\D/g, '');
}

export function normalizeWhatsAppPairingPhone(
  input: string,
  defaultCountryCode = '91'
): string {
  let digits = stripPhoneDigits(input);
  if (!digits) {
    throw new Error('Phone number is required');
  }

  const cc = defaultCountryCode.replace(/\D/g, '') || '91';

  if (digits.startsWith(cc) && digits.length > cc.length + 5) {
    let local = digits.slice(cc.length).replace(/^0+/, '');
    while (local.startsWith(cc) && local.length > 10) {
      local = local.slice(cc.length).replace(/^0+/, '');
    }
    digits = `${cc}${local}`;
  } else if (digits.length === 10 && cc === '91' && /^[6-9]\d{9}$/.test(digits)) {
    digits = `${cc}${digits}`;
  } else if (digits.length === 11 && digits.startsWith('0') && cc === '91') {
    const local = digits.slice(1);
    if (/^[6-9]\d{9}$/.test(local)) {
      digits = `${cc}${local}`;
    }
  } else if (digits.length >= 6 && digits.length <= 10 && !digits.startsWith(cc)) {
    digits = `${cc}${digits.replace(/^0+/, '')}`;
  }

  if (cc === '91') {
    if (digits.length !== 12 || !digits.startsWith('91')) {
      throw new Error(
        'Indian numbers must be country code 91 + 10-digit mobile (e.g. 919876543210).'
      );
    }
    const local = digits.slice(2);
    if (!/^[6-9]\d{9}$/.test(local)) {
      throw new Error(
        `Invalid Indian mobile "${local}" — must be 10 digits starting with 6, 7, 8, or 9.`
      );
    }
  } else if (digits.length < 10 || digits.length > 15) {
    throw new Error(
      'Enter a valid phone number with country code (digits only, e.g. 14155552671).'
    );
  }

  return digits;
}

export function formatPhoneForDisplay(e164Digits: string): string {
  const d = stripPhoneDigits(e164Digits);
  if (d.startsWith('91') && d.length === 12) {
    return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  }
  return `+${d}`;
}

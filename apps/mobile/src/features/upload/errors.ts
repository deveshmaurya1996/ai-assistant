import { formatApiError } from '@/lib/format-ai-error';

const FORMDATA_UNSUPPORTED = /Unsupported FormDataPart implementation/i;

export function formatUploadError(err: unknown): string {
  const message = formatApiError(err);
  if (FORMDATA_UNSUPPORTED.test(message)) {
    return 'This file could not be sent from the app. Try again or pick a different file.';
  }
  return message || 'Upload failed';
}

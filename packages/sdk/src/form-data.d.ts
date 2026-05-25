import type { UploadFilePayload } from '@ai-assistant/types';

declare global {
  interface FormData {
    append(name: string, value: string | Blob | File | UploadFilePayload): void;
  }
}

export {};

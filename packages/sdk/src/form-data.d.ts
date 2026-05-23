import type { UploadFilePayload } from './types';

declare global {
  interface FormData {
    append(name: string, value: string | Blob | UploadFilePayload): void;
  }
}

export {};

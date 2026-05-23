
export interface FormDataFile {
  uri: string;
  name: string;
  type: string;
}

declare global {
  interface FormData {
    append(name: string, value: string | Blob | FormDataFile): void;
  }
}

export {};


export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = Record<string, unknown>;

export type ApiErrorDetails =
  | string
  | number
  | boolean
  | null
  | ApiErrorDetails[]
  | { [key: string]: ApiErrorDetails };

export interface ApiErrorBody {
  error: string;
  details?: ApiErrorDetails;
}

export type ApiErrorDetails =
  | string
  | number
  | boolean
  | null
  | ApiErrorDetails[]
  | { [key: string]: ApiErrorDetails };

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: ApiErrorDetails
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function parseApiError(res: Response): Promise<ApiError> {
  const text = await res.text();
  try {
    const json = JSON.parse(text) as { error?: string; details?: ApiErrorDetails };
    return new ApiError(
      res.status,
      json.error ?? res.statusText,
      json.details ?? text
    );
  } catch {
    return new ApiError(res.status, text || res.statusText);
  }
}

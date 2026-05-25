import type { ApiErrorBody, ApiErrorDetails } from '@ai-assistant/types';

export type { ApiErrorDetails };

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
    const json = JSON.parse(text) as ApiErrorBody;
    return new ApiError(
      res.status,
      json.error ?? res.statusText,
      json.details ?? text
    );
  } catch {
    return new ApiError(res.status, text || res.statusText);
  }
}

import { unauthorized } from './errors';
import type { AuthenticatedRequest } from '../types/request';

export function requireUserId(request: AuthenticatedRequest): string {
  const userId = request.user?.userId;
  if (!userId) {
    throw unauthorized();
  }
  return userId;
}

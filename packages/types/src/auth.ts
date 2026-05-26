export interface AuthUser {
  id: string;
  email: string;
  name: string;
  image?: string | null;
}

export interface AuthSession {
  token: string;
}

export interface SessionInfo {
  user: AuthUser;
  session: AuthSession;
}

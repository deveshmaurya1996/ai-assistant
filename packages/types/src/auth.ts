export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthSession {
  token: string;
}

export interface SessionInfo {
  user: AuthUser;
  session: AuthSession;
}

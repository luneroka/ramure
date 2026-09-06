export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;
  APP_ORIGIN: string;
  DEV_ECHO_LINKS?: string;
  MAIL_FROM: string;
  RESEND_API_KEY?: string;
}

export interface User {
  id: string;
  email: string;
  name: string | null;
}

export type Role = 'owner' | 'editor' | 'viewer';

/** Per-request context set by the auth middleware. */
export interface Vars {
  user: User | null;
}

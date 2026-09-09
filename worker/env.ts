export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;
  APP_ORIGIN: string;
  DEV_ECHO_LINKS?: string;
  MAIL_FROM: string;
  RESEND_API_KEY?: string;
  /** The operator's address: that user is the application administrator. */
  ADMIN_EMAIL?: string;
  /** Secret mixed into the sign-in code hashes, so a database copy alone cannot be brute-forced offline. */
  CODE_PEPPER?: string;
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

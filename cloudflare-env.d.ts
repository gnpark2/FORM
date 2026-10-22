declare namespace Cloudflare {
  interface Env {
    AUTH_MODE?: "sites" | "google";
    APP_ORIGIN?: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    CF_AI_ACCOUNT_ID?: string;
    CF_AI_TOKEN?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}

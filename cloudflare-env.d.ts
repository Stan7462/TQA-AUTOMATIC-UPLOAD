declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    PIN_ENCRYPTION_KEY?: string;
  }
}

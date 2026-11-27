import "server-only";

// Typed access to server environment variables, with safe defaults so the
// app still boots in development while .env values are blank.

const str = (v: string | undefined, fallback = "") =>
  v && v.trim() !== "" ? v.trim() : fallback;
const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return v && v.trim() !== "" && Number.isFinite(n) ? n : fallback;
};

export const env = {
  appUrl: str(process.env.NEXT_PUBLIC_APP_URL, "http://localhost:3000"),
  timezone: str(process.env.APP_TIMEZONE, "Asia/Kolkata"),

  ftp: {
    host: str(process.env.FTP_HOST),
    port: num(process.env.FTP_PORT, 21),
    user: str(process.env.FTP_USER),
    password: str(process.env.FTP_PASSWORD),
    /** Explicit FTPS (TLS). Set FTP_SECURE=false only if the server has no TLS. */
    secure: str(process.env.FTP_SECURE, "true") !== "false",
    /** FTP folder served at STORAGE_URL (the site's web root). */
    baseDir: str(process.env.FTP_BASE_DIR, "public_html").replace(/\/+$/, ""),
    /** Public origin of baseDir, e.g. https://files.example.com */
    publicUrl: (() => {
      const u = str(process.env.STORAGE_URL).replace(/\/+$/, "");
      return u && !/^https?:\/\//.test(u) ? `https://${u}` : u;
    })(),
  },

  /**
   * Absolute folder for uploaded files on the app's own server (Hostinger
   * Node.js hosting). Must be outside the deploy folder (hbuilds/), which is
   * replaced on every deploy, and outside public_html.
   */
  storageDir: str(process.env.STORAGE_DIR).replace(/[\\/]+$/, ""),

  /** Secret used to make stored file names unguessable. */
  filesSecret: str(process.env.FILES_SECRET, str(process.env.BETTER_AUTH_SECRET, "dev-files-secret")),

  r2: {
    accountId: str(process.env.R2_ACCOUNT_ID),
    accessKeyId: str(process.env.R2_ACCESS_KEY_ID),
    secretAccessKey: str(process.env.R2_SECRET_ACCESS_KEY),
    bucket: str(process.env.R2_BUCKET),
    signedUrlTtl: num(process.env.R2_SIGNED_URL_TTL, 300),
  },

  sms: {
    provider: (str(process.env.SMS_PROVIDER, "demo") === "live"
      ? "live"
      : "demo") as "demo" | "live",
    senderId: str(process.env.SMS_SENDER_ID, "AGAMWT"),
    demoFailureRate: Math.min(
      1,
      Math.max(0, num(process.env.SMS_DEMO_FAILURE_RATE, 0)),
    ),
    apiUrl: str(process.env.SMS_API_URL),
    apiKey: str(process.env.SMS_API_KEY),
  },

  cronSecret: str(process.env.CRON_SECRET),
};

export const ftpConfigured = () =>
  Boolean(env.ftp.host && env.ftp.user && env.ftp.password && env.ftp.publicUrl);

export const r2Configured = () =>
  Boolean(
    env.r2.accountId &&
      env.r2.accessKeyId &&
      env.r2.secretAccessKey &&
      env.r2.bucket,
  );

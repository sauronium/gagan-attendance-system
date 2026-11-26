import "server-only";

import { createHmac } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import { AwsClient } from "aws4fetch";
import { Client as FtpClient } from "basic-ftp";

import { env, ftpConfigured, r2Configured } from "@/lib/env";

// File storage for check-in selfies, visit photos and documents.
// Backends, in order of preference:
// 1. STORAGE_DIR: a folder on the app's own server. Used when the app runs on
//    Hostinger Node.js hosting; it must sit outside hbuilds/ (replaced on every
//    deploy) and outside public_html.
// 2. Hostinger FTP (FTP_* + STORAGE_URL): upload over FTPS into the site's
//    web root, read back over HTTPS from STORAGE_URL.
// 3. Cloudflare R2 (R2_*).
// 4. Local disk under .data/uploads/ (development only).
// On Vercel (read-only disk) STORAGE_DIR is ignored and R2 is preferred over
// FTP: it is plain HTTPS, while FTP opens a new connection for every upload.
//
// The app never links to a storage URL directly: browsers always go through
// /api/files/<key>, which checks the viewer's permission first. Because the
// FTP folder is publicly served, each file's real name gets an HMAC prefix
// derived from FILES_SECRET, so its public URL can't be guessed from the key.

const DEV_ROOT = path.join(process.cwd(), ".data", "uploads");
const localRoot = () => (env.storageDir && !process.env.VERCEL ? env.storageDir : DEV_ROOT);
const FTP_FOLDER = "uploads"; // inside FTP_BASE_DIR / STORAGE_URL

const contentTypes: Record<string, string> = {
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".pdf": "application/pdf",
};

function safeKey(key: string): string {
  const clean = key.replace(/\\/g, "/").replace(/^\/+/, "");
  if (clean.split("/").some((p) => p === ".." || p === "." || p === "")) {
    throw new Error("Invalid file key");
  }
  return clean;
}

const typeOf = (key: string) =>
  contentTypes[path.extname(key).toLowerCase()] ?? "application/octet-stream";

// ── FTP ──────────────────────────────────────────────────────

/** attendance/12/2026-11-22-in.webp → attendance/12/<hmac16>-2026-11-22-in.webp */
function obscuredPath(key: string): string {
  const dir = path.posix.dirname(key);
  const base = path.posix.basename(key);
  const tag = createHmac("sha256", env.filesSecret).update(key).digest("hex").slice(0, 16);
  return `${dir === "." ? "" : `${dir}/`}${tag}-${base}`;
}

async function withFtp<T>(fn: (c: FtpClient) => Promise<T>): Promise<T> {
  const client = new FtpClient(30_000);
  try {
    await client.access({
      host: env.ftp.host,
      port: env.ftp.port,
      user: env.ftp.user,
      password: env.ftp.password,
      secure: env.ftp.secure,
      secureOptions: { servername: env.ftp.host },
    });
    return await fn(client);
  } finally {
    client.close();
  }
}

let ftpFolderReady = false;

async function ftpPut(key: string, data: Uint8Array) {
  const remote = obscuredPath(key);
  // Absolute path: ensureDir() also changes the working directory, so every
  // path must be absolute or later calls would nest inside the previous one.
  const root = `/${env.ftp.baseDir.replace(/^\/+/, "")}/${FTP_FOLDER}`;
  await withFtp(async (c) => {
    if (!ftpFolderReady) {
      // No directory listings for the uploads folder.
      await c.ensureDir(root);
      await c.uploadFrom(Readable.from(Buffer.from("Options -Indexes\n")), ".htaccess");
      ftpFolderReady = true;
    }
    await c.ensureDir(`${root}/${path.posix.dirname(remote)}`);
    await c.uploadFrom(Readable.from(Buffer.from(data)), path.posix.basename(remote));
  });
}

async function ftpGet(key: string) {
  const url = `${env.ftp.publicUrl}/${FTP_FOLDER}/${obscuredPath(key).split("/").map(encodeURIComponent).join("/")}`;
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

// ── R2 ───────────────────────────────────────────────────────

let r2Client: AwsClient | null = null;
function r2() {
  r2Client ??= new AwsClient({
    accessKeyId: env.r2.accessKeyId,
    secretAccessKey: env.r2.secretAccessKey,
    service: "s3",
    region: "auto",
  });
  return r2Client;
}
const r2Url = (key: string) =>
  `https://${env.r2.accountId}.r2.cloudflarestorage.com/${env.r2.bucket}/${encodeURI(key)}`;

// ── Public API ───────────────────────────────────────────────

type Backend = "ftp" | "r2" | "local";

function backend(): Backend {
  const vercel = Boolean(process.env.VERCEL);
  if (vercel && r2Configured()) return "r2";
  if (!vercel && env.storageDir) return "local";
  if (ftpConfigured()) return "ftp";
  if (r2Configured()) return "r2";
  if (vercel) {
    throw new Error("File storage is not configured. Set the R2_* (or FTP_* and STORAGE_URL) environment variables in Vercel.");
  }
  // Hostinger replaces the deploy folder (…/hbuilds/…) on every deploy, so
  // photos saved inside it would disappear.
  if (/[\\/]hbuilds[\\/]/.test(process.cwd())) {
    throw new Error("File storage is not configured. Set STORAGE_DIR (a folder outside hbuilds/ and public_html) or the FTP_* variables.");
  }
  return "local";
}

export async function putFile(key: string, data: Uint8Array, contentType: string): Promise<string> {
  const k = safeKey(key);
  const where = backend();
  if (where === "ftp") {
    await ftpPut(k, data);
  } else if (where === "r2") {
    const res = await r2().fetch(r2Url(k), {
      method: "PUT",
      body: data as BodyInit,
      headers: { "Content-Type": contentType },
    });
    if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  } else {
    const file = path.join(localRoot(), k);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
  }
  return k;
}

export async function getFile(key: string): Promise<{ data: Uint8Array; contentType: string } | null> {
  const k = safeKey(key);
  const contentType = typeOf(k);
  const where = backend();
  if (where === "ftp") {
    const data = await ftpGet(k);
    return data ? { data, contentType } : null;
  }
  if (where === "r2") {
    const res = await r2().fetch(r2Url(k));
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    return {
      data: new Uint8Array(await res.arrayBuffer()),
      contentType: res.headers.get("content-type") ?? contentType,
    };
  }
  try {
    return { data: await readFile(path.join(localRoot(), k)), contentType };
  } catch {
    return null;
  }
}

/** Decode a `data:image/webp;base64,...` URL from the camera component. */
export function decodeDataUrl(
  dataUrl: string,
  maxBytes = 2_000_000,
): { data: Uint8Array; contentType: string; ext: string } {
  const m = dataUrl.match(/^data:(image\/(webp|jpeg|png));base64,(.+)$/);
  if (!m) throw new Error("Photo must be a WebP, JPEG or PNG image.");
  const data = Uint8Array.from(Buffer.from(m[3], "base64"));
  if (data.byteLength > maxBytes) throw new Error("Photo is too large.");
  return { data, contentType: m[1], ext: m[2] === "jpeg" ? "jpg" : m[2] };
}

/** URL the browser uses to show a stored file. */
export const fileUrl = (key: string | null | undefined) => (key ? `/api/files/${key}` : null);

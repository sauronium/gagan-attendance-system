// Auth base URL on Vercel, kept free of server imports so it can be tested.

/** Host part of a URL or bare host name ("https://a.com/x" → "a.com"). */
const hostOf = (v: string | undefined) => {
  const t = v?.trim();
  if (!t) return null;
  try {
    return new URL(t.includes("://") ? t : `https://${t}`).host;
  } catch {
    return null;
  }
};

/**
 * On Vercel the same build answers on the production domain and on its own
 * *.vercel.app addresses (deployment and branch URLs, used for previews), so
 * the auth base URL follows the request host, limited to exactly those hosts.
 * Elsewhere BETTER_AUTH_URL is used as is.
 */
export function vercelBaseURL(env: NodeJS.ProcessEnv = process.env) {
  if (!env.VERCEL) return undefined;
  const production = env.BETTER_AUTH_URL?.trim() || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  const hosts = [production, env.VERCEL_PROJECT_PRODUCTION_URL, env.VERCEL_BRANCH_URL, env.VERCEL_URL]
    .map(hostOf)
    .filter((h): h is string => Boolean(h));
  return { allowedHosts: [...new Set(hosts)], fallback: production || undefined, protocol: "https" as const };
}

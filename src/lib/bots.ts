// Request filtering for a private staff app: nothing here is meant to be
// crawled, previewed or scraped. Used by src/proxy.ts. Kept free of
// server-only imports so it can be unit tested.

/**
 * User agents refused outright: search engines, SEO/marketing crawlers, AI
 * crawlers, link-preview fetchers, archivers, uptime/scanner bots and
 * scraping libraries. Matching is case-insensitive.
 *
 * Deliberately not listed: curl, wget and Node's fetch, which the cron jobs
 * and server admins use (cron routes are not filtered at all), and headless
 * browsers, so local screenshot/testing tools keep working.
 */
// Generic signatures first: "SomethingBot/1.2" and the "+http://…" info link
// crawlers put in their user agent (browsers never do). A bare "bot" word is
// not used: some phone models end in it (e.g. "CUBOT X30").
const BOT_UA =
  /bot\/\d|\+https?:\/\/|crawl|spider|slurp|scrap|archiver|ia_archiver|facebookexternalhit|facebookcatalog|meta-externalagent|meta-externalfetcher|whatsapp|skypeuripreview|embedly|quora link preview|bitlybot|outbrain|pinterest|vkshare|w3c_validator|redditbot|discordbot|telegrambot|slackbot|twitterbot|linkedinbot|googleother|google-extended|google-inspectiontool|storebot-google|adsbot|mediapartners|apis-google|feedfetcher|bingpreview|yandex|baiduspider|sogou|exabot|seznambot|petalbot|bytespider|ahrefs|semrush|mj12bot|dotbot|rogerbot|blexbot|serpstat|dataforseo|screaming frog|sitebulb|gptbot|chatgpt-user|oai-searchbot|claudebot|claude-web|claude-user|claude-searchbot|anthropic-ai|perplexity|ccbot|cohere-ai|diffbot|omgili|timpibot|youbot|amazonbot|applebot|duckassistbot|imagesiftbot|friendlycrawler|ai2bot|scrapy|python-requests|python-urllib|aiohttp|httpx|go-http-client|okhttp|java\/|libwww-perl|mechanize|httpunit|nutch|zgrab|masscan|nmap|nikto|sqlmap|wpscan|nuclei|censys|shodan|expanse|netcraft|uptimerobot|pingdom|statuscake|site24x7/i;

/** Paths only vulnerability scanners ask for: answered 404 without touching the app. */
const SCANNER_PATH =
  /^\/(?:wp-[\w-]*|wordpress|xmlrpc\.php|phpmyadmin|pma|myadmin|cgi-bin|vendor\/phpunit|\.env|\.git|\.svn|\.hg|\.ds_store|\.aws|\.ssh|config\.(?:php|json|ya?ml)|server-status|actuator|solr|owa|autodiscover|boaform|hnap1|shell|cmd|admin\.php|login\.php|.*\.(?:php|asp|aspx|jsp|cgi|env|ini|sql|bak|old|swp))(?:[/?.]|$)/i;

/** True when the request comes from a crawler or other unwanted automated client. */
export function isUnwantedBot(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? "").trim();
  // Every real browser sends a user agent.
  if (ua === "") return true;
  return BOT_UA.test(ua);
}

/** True for well-known vulnerability-scanner probe paths. */
export function isScannerPath(pathname: string): boolean {
  return SCANNER_PATH.test(pathname);
}

const localName = (host: string) => {
  const h = host.trim().toLowerCase().replace(/:\d+$/, "");
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
};

/**
 * Requests to the machine itself (local development, testing tools) are not
 * filtered. Behind a proxy (Hostinger, Vercel) the public host is checked
 * too, so a proxy that forwards to localhost doesn't switch filtering off.
 */
export function isLocalHost(host: string | null | undefined, forwardedHost?: string | null): boolean {
  if (!host || !localName(host)) return false;
  const fwd = forwardedHost?.split(",")[0];
  return !fwd || localName(fwd);
}

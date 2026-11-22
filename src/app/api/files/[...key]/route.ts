import { getViewer } from "@/lib/session";
import { getFile } from "@/lib/storage";

// Serves stored files (check-in selfies, visit and job photos) only to
// signed-in users who may see them. Admins can read any key; staff can read
// only files under their own attendance/, visits/ or jobs/ folders.

const STAFF_PREFIXES = ["attendance", "visits", "jobs"] as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Unauthorized", { status: 401 });

  const { key: segments } = await params;
  // Next has already URL-decoded each segment.
  const key = (segments ?? []).join("/");
  if (!key || key.split("/").some((s) => s === ".." || s === "." || s === "")) {
    return new Response("Bad request", { status: 400 });
  }

  if (!viewer.isAdmin) {
    const own = STAFF_PREFIXES.some((p) => key.startsWith(`${p}/${viewer.employee.id}/`));
    if (!own) return new Response("Forbidden", { status: 403 });
  }

  let file: Awaited<ReturnType<typeof getFile>>;
  try {
    file = await getFile(key);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (!file) return new Response("Not found", { status: 404 });

  return new Response(file.data as BodyInit, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.data.byteLength),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

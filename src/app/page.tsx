import { redirect } from "next/navigation";

import { homeFor } from "@/lib/roles";
import { getViewer } from "@/lib/session";

// "/" just routes people: admins → dashboard, staff → staff app.
export default async function Home() {
  const viewer = await getViewer();
  redirect(viewer ? homeFor(viewer.employee.role) : "/login");
}

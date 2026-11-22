import type { NextRequest } from "next/server";

import { env } from "@/lib/env";
import { getViewer } from "@/lib/session";
import { todayIso } from "@/lib/time";
import { getMuster } from "@/server/attendance-admin";

// Payroll-ready monthly muster as CSV: one row per employee, a code per day,
// then paid days, loss-of-pay days, lates and overtime hours.

function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  // Neutralise spreadsheet formula injection, then quote when needed.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function GET(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) {
    return new Response("Unauthorized", { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const monthParam = params.get("month") ?? "";
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam) ? monthParam : todayIso(env.timezone).slice(0, 7);
  const departmentId = Number(params.get("department")) || undefined;

  const muster = await getMuster(month, departmentId);

  const header = [
    "Emp code",
    "Name",
    "Department",
    ...muster.days.map((d) => d.date.slice(8)),
    "Paid days",
    "LOP days",
    "Absent days",
    "Lates",
    "Late cut (days)",
    "OT hours",
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const r of muster.rows) {
    lines.push(
      [
        r.empCode,
        r.name,
        r.department ?? "",
        ...r.cells.map((c) => c.code),
        r.totals.paidDays,
        r.totals.lopDays,
        r.totals.absentDays,
        r.totals.lates,
        r.totals.lateCut,
        r.totals.overtimeHours,
      ]
        .map(csvCell)
        .join(","),
    );
  }

  // BOM so Excel opens the file as UTF-8.
  const body = `﻿${lines.join("\r\n")}\r\n`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="attendance-${month}${departmentId ? `-dept${departmentId}` : ""}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

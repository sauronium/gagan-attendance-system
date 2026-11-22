"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { weekdayShort } from "@/lib/time";

const attendanceConfig = {
  present: { label: "Present", color: "var(--chart-1)" },
  late: { label: "Late", color: "var(--chart-4)" },
  leave: { label: "On leave", color: "var(--chart-2)" },
  absent: { label: "Absent", color: "var(--destructive)" },
} satisfies ChartConfig;

/** Stacked daily attendance for the last N days (dashboard). */
export function AttendanceTrendChart({
  data,
}: {
  data: { date: string; present: number; late: number; leave: number; absent: number }[];
}) {
  const rows = data.map((d) => ({ ...d, label: `${weekdayShort(d.date)} ${Number(d.date.slice(8))}` }));
  return (
    <ChartContainer config={attendanceConfig} className="aspect-auto h-64 w-full">
      <BarChart data={rows} margin={{ left: -16, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} interval="preserveStartEnd" />
        <YAxis tickLine={false} axisLine={false} allowDecimals={false} fontSize={11} width={40} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="present" stackId="a" fill="var(--color-present)" />
        <Bar dataKey="late" stackId="a" fill="var(--color-late)" />
        <Bar dataKey="leave" stackId="a" fill="var(--color-leave)" />
        <Bar dataKey="absent" stackId="a" fill="var(--color-absent)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}


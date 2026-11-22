"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

import type { VisitMapPoint } from "./visit-map";

export type { VisitMapPoint };

// Leaflet needs `window`, so the map renders in the browser only.
// `ssr: false` is only allowed inside a client component, hence this wrapper.
const VisitMap = dynamic(() => import("./visit-map").then((m) => m.VisitMap), {
  ssr: false,
  loading: () => <Skeleton className="h-[420px] w-full rounded-xl" />,
});

export function VisitMapLoader(props: {
  points: VisitMapPoint[];
  center: [number, number] | null;
  showRoute: boolean;
}) {
  return <VisitMap {...props} />;
}

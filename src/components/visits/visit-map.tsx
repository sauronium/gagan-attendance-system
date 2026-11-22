"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect } from "react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";

// Leaflet map of field visits. Loaded only in the browser (Leaflet touches
// `window`), via VisitMapLoader → next/dynamic with ssr: false.

export type VisitMapPoint = {
  id: number;
  lat: number;
  lng: number;
  status: "pending" | "verified" | "rejected";
  /** Client or prospect name. */
  title: string;
  employee: string;
  /** Pre-formatted on the server in the business timezone. */
  time: string;
  purpose: string;
  /** 1-based position in the day's route (single-employee view only). */
  order?: number;
  /** A geo-tagged photo stop ("Tag location") rather than a client visit. */
  isTag?: boolean;
  /** /api/files URL of the visit or tag photo, shown in the popup. */
  photoUrl?: string | null;
};

// Leaflet draws on a canvas/SVG, so marker colours are brand hex values
// (theme tokens can't reach inside SVG attributes set by Leaflet).
const STATUS_COLOR: Record<VisitMapPoint["status"], string> = {
  pending: "#a35f00",
  verified: "#1d7f52",
  rejected: "#c93a3a",
};
const ROUTE_COLOR = "#2A4086";

// Location tags use a square pin with a camera glyph so they stand apart
// from client visits (round pins). Border colour = review status.
const CAMERA_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>';
const TAG_FILL = "#00A8C8";

function tagIcon(status: VisitMapPoint["status"], order?: number) {
  const badge = order
    ? `<span style="position:absolute;top:-8px;right:-8px;min-width:16px;height:16px;padding:0 3px;border-radius:8px;background:${ROUTE_COLOR};color:#fff;font:700 10px/16px sans-serif;text-align:center">${order}</span>`
    : "";
  return L.divIcon({
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
    html: `<div style="position:relative;width:28px;height:28px;border-radius:7px;background:${TAG_FILL};border:3px solid ${STATUS_COLOR[status]};box-shadow:0 1px 4px rgba(0,0,0,.35);display:grid;place-items:center">${CAMERA_SVG}${badge}</div>`,
  });
}

/** India, when there are no points and no office location. */
const INDIA: [number, number] = [22.5, 79];

const TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION =
  process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || "© OpenStreetMap contributors";

/** Re-fits the view whenever the set of points changes (filters applied). */
function FitBounds({
  points,
  center,
}: {
  points: VisitMapPoint[];
  center: [number, number] | null;
}) {
  const map = useMap();
  const key = points.map((p) => p.id).join(",");
  useEffect(() => {
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 15);
    } else if (points.length > 1) {
      map.fitBounds(
        points.map((p) => [p.lat, p.lng] as [number, number]),
        { padding: [32, 32], maxZoom: 16 },
      );
    } else {
      map.setView(center ?? INDIA, center ? 12 : 5);
    }
    // `key` stands in for `points` so a re-render with equal data doesn't re-fit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, center?.[0], center?.[1], map]);
  return null;
}

export function VisitMap({
  points,
  center,
  showRoute,
}: {
  points: VisitMapPoint[];
  center: [number, number] | null;
  /** Number the markers and join them with a dashed line. */
  showRoute: boolean;
}) {
  return (
    <MapContainer
      center={center ?? INDIA}
      zoom={center ? 12 : 5}
      scrollWheelZoom={false}
      className="z-0 h-[420px] w-full rounded-xl border"
    >
      <TileLayer url={TILE_URL} attribution={ATTRIBUTION} />
      <FitBounds points={points} center={center} />

      {showRoute && points.length > 1 ? (
        <Polyline
          positions={points.map((p) => [p.lat, p.lng] as [number, number])}
          pathOptions={{ color: ROUTE_COLOR, weight: 3, opacity: 0.7, dashArray: "6 8" }}
        />
      ) : null}

      {points.map((p) =>
        p.isTag ? (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={tagIcon(p.status, showRoute ? p.order : undefined)}>
            <PointPopup p={p} />
          </Marker>
        ) : (
          <CircleMarker
            key={p.id}
            center={[p.lat, p.lng]}
            radius={showRoute ? 11 : 8}
            pathOptions={{
              color: "#ffffff",
              weight: 2,
              fillColor: STATUS_COLOR[p.status],
              fillOpacity: 0.95,
            }}
          >
            {showRoute && p.order ? (
              <Tooltip
                permanent
                direction="center"
                opacity={1}
                className="border-0! bg-transparent! p-0! text-[11px] font-bold text-white! shadow-none! before:hidden!"
              >
                {p.order}
              </Tooltip>
            ) : null}
            <PointPopup p={p} />
          </CircleMarker>
        ),
      )}
    </MapContainer>
  );
}

function PointPopup({ p }: { p: VisitMapPoint }) {
  // Leaflet popups are always light, so text colours come from Leaflet's CSS.
  return (
    <Popup>
      <div className="flex w-48 flex-col gap-0.5 text-xs">
        {p.photoUrl ? (
          <a href={p.photoUrl} target="_blank" rel="noreferrer" className="mb-1 block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.photoUrl}
              alt={p.isTag ? `Photo tagged at ${p.title}` : `Photo from ${p.title}`}
              className="h-28 w-full rounded object-cover"
              loading="lazy"
            />
          </a>
        ) : null}
        <strong className="text-sm">
          {p.order ? `${p.order}. ` : ""}
          {p.title}
        </strong>
        <span>{p.employee}</span>
        <span className="opacity-75">
          {p.time} · {p.purpose}
        </span>
        <span className="font-medium" style={{ color: STATUS_COLOR[p.status] }}>
          {p.status === "pending" ? "Pending" : p.status === "verified" ? "Verified" : "Rejected"}
        </span>
        <a href={`#visit-${p.id}`} className="mt-1">
          Open in list
        </a>
      </div>
    </Popup>
  );
}

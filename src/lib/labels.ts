// Human labels + badge tones for every status-like value in the app.
// Tone names map to classes in components/app/status-badge.tsx.

export type Tone = "success" | "warning" | "danger" | "info" | "brand" | "neutral" | "highlight";

type LabelMap = Record<string, { label: string; tone: Tone }>;

export const attendanceStatus: LabelMap = {
  present: { label: "Present", tone: "success" },
  late: { label: "Late", tone: "warning" },
  half_day: { label: "Half-day", tone: "warning" },
  absent: { label: "Absent", tone: "danger" },
  on_leave: { label: "On leave", tone: "brand" },
  holiday: { label: "Holiday", tone: "neutral" },
  week_off: { label: "Week off", tone: "neutral" },
  missed_punch: { label: "Missed punch", tone: "danger" },
  not_checked_in: { label: "Not checked in", tone: "neutral" },
};

/** Single-letter codes for the monthly muster grid. */
export const attendanceCode: Record<string, string> = {
  present: "P",
  late: "L",
  half_day: "H",
  absent: "A",
  on_leave: "LV",
  holiday: "HO",
  week_off: "WO",
  missed_punch: "MP",
};

export const requestStatus: LabelMap = {
  pending: { label: "Pending", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export const visitStatus: LabelMap = {
  pending: { label: "Pending", tone: "warning" },
  verified: { label: "Verified", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
};

export const visitPurpose: Record<string, string> = {
  sales_pitch: "Sales pitch",
  demo: "Demo",
  follow_up: "Follow-up",
  amc_service: "AMC service",
  complaint: "Complaint",
  payment_collection: "Payment collection",
  installation: "Installation",
  other: "Other",
  location_tag: "Location tag",
};

export const visitOutcome: LabelMap = {
  interested: { label: "Interested", tone: "info" },
  quotation_requested: { label: "Quotation requested", tone: "brand" },
  order_won: { label: "Order won", tone: "success" },
  not_interested: { label: "Not interested", tone: "neutral" },
  revisit: { label: "Revisit", tone: "warning" },
};

export const contractStatus: LabelMap = {
  active: { label: "Active", tone: "success" },
  expired: { label: "Expired", tone: "danger" },
  renewed: { label: "Renewed", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export const paymentStatus: LabelMap = {
  unpaid: { label: "Unpaid", tone: "danger" },
  partial: { label: "Partial", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
};

export const serviceVisitStatus: LabelMap = {
  scheduled: { label: "Scheduled", tone: "info" },
  done: { label: "Done", tone: "success" },
  missed: { label: "Missed", tone: "danger" },
  rescheduled: { label: "Rescheduled", tone: "warning" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export const complaintStatus: LabelMap = {
  open: { label: "Open", tone: "danger" },
  assigned: { label: "Assigned", tone: "warning" },
  in_progress: { label: "In progress", tone: "info" },
  resolved: { label: "Resolved", tone: "success" },
  closed: { label: "Closed", tone: "neutral" },
};

export const complaintPriority: LabelMap = {
  low: { label: "Low", tone: "neutral" },
  normal: { label: "Normal", tone: "info" },
  high: { label: "High", tone: "warning" },
  urgent: { label: "Urgent", tone: "danger" },
};

export const smsStatus: LabelMap = {
  queued: { label: "Queued", tone: "neutral" },
  sent: { label: "Sent", tone: "info" },
  delivered: { label: "Delivered", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export const employeeStatus: LabelMap = {
  active: { label: "Active", tone: "success" },
  on_notice: { label: "On notice", tone: "warning" },
  inactive: { label: "Inactive", tone: "neutral" },
};

export const clientStatus: LabelMap = {
  prospect: { label: "Prospect", tone: "info" },
  active: { label: "Active", tone: "success" },
  inactive: { label: "Inactive", tone: "neutral" },
};

export const clientSegment: Record<string, string> = {
  industrial: "Industrial",
  commercial: "Commercial",
  domestic: "Domestic",
  institution: "Institution",
};

export const workType: Record<string, string> = {
  office: "Office",
  field: "Field",
  both: "Office + field",
};

export function labelOf(map: LabelMap, key: string | null | undefined) {
  return (key && map[key]) || { label: key ?? "—", tone: "neutral" as Tone };
}

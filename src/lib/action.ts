import { z } from "zod";

// Shared shape for server action results, used with React's useActionState.
// Actions return { ok: true, message } on success or { ok: false, error,
// fieldErrors } on failure. They never throw to the client.

export type ActionState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
};

export const initialActionState: ActionState = {};

export function actionError(e: unknown): ActionState {
  if (e instanceof z.ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of e.issues) {
      const key = issue.path.join(".");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }
  const msg = e instanceof Error ? e.message : "Something went wrong.";
  // MySQL duplicate key → friendlier message.
  if (/ER_DUP_ENTRY|Duplicate entry/i.test(msg)) {
    return { ok: false, error: "That record already exists (duplicate value)." };
  }
  console.error(e);
  return { ok: false, error: msg };
}

/** FormData → plain object (empty strings become undefined). */
export function formToObject(fd: FormData): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v === "string") out[k] = v.trim() === "" ? undefined : v.trim();
  }
  return out;
}

// Reusable zod field helpers for form inputs (strings from FormData).
export const zf = {
  text: (max = 255) => z.string().trim().min(1, "Required").max(max),
  optText: (max = 255) => z.string().trim().max(max).optional(),
  id: () => z.coerce.number().int().positive("Required"),
  optId: () => z.coerce.number().int().positive().optional(),
  date: () => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  optDate: () => z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  int: (min = 0) => z.coerce.number().int().min(min),
  bool: () => z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
};

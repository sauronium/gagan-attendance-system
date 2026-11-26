// Better Auth requires every login to have an email. Staff without a real one
// get an internal placeholder on a reserved domain (.invalid can never be a
// real address); placeholders are refused at email sign-in.

const PLACEHOLDER_DOMAIN = "@staff.agamops.invalid";

/** Placeholder email for staff without one. */
export function placeholderEmail(empCode: string) {
  return `${empCode.toLowerCase().replace(/[^a-z0-9]/g, "")}${PLACEHOLDER_DOMAIN}`;
}

export function isPlaceholderEmail(email: string) {
  return email.trim().toLowerCase().endsWith(PLACEHOLDER_DOMAIN);
}

// Phone helpers shared by client and server. Numbers are stored in E.164
// form (+91XXXXXXXXXX). Staff can type a 10-digit Indian mobile number.

export function normalizePhone(input: string): string {
  const digits = input.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  const bare = digits.replace(/^0+/, "");
  if (bare.length === 10) return `+91${bare}`;
  if (bare.length === 12 && bare.startsWith("91")) return `+${bare}`;
  return `+${bare}`;
}

export function isValidPhone(phone: string): boolean {
  return /^\+[1-9]\d{9,14}$/.test(phone);
}

/** +919812345678 → 98123 45678 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const m = phone.match(/^\+91(\d{5})(\d{5})$/);
  return m ? `${m[1]} ${m[2]}` : phone;
}

/** +919812345678 → 98xxx xx678 (for SMS previews and logs) */
export function maskPhone(phone: string): string {
  const m = phone.match(/^\+91(\d{2})\d{3}\d{2}(\d{3})$/);
  return m ? `${m[1]}xxx xx${m[2]}` : phone;
}

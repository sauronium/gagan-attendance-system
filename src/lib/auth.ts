import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { phoneNumber } from "better-auth/plugins/phone-number";

import { db } from "@/db";
import { account, session, user, verification } from "@/db/schema";
import { brand } from "@/lib/brand";
import { isPlaceholderEmail } from "@/lib/login-email";
import { isValidPhone } from "@/lib/phone";
import { sendSms } from "@/lib/sms";

// Better Auth server instance.
// - Staff sign in with mobile number + password (phone-number plugin), or
//   with email + password when their employee record has a real email.
// - Nobody can self-register: admins create logins from the Employees screen
//   (see createLogin in src/server/auth-admin.ts).
// - Phone OTP endpoints are disabled (see disabledPaths). sendOTP stays wired
//   to the SMS adapter so OTP login can be switched on later by removing them.
// BETTER_AUTH_SECRET and BETTER_AUTH_URL are read from the environment.
export const auth = betterAuth({
  appName: brand.appName,
  database: drizzleAdapter(db, {
    provider: "mysql",
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 8,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days: staff stay signed in on their phone
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  rateLimit: {
    enabled: true,
    customRules: {
      "/sign-in/phone-number": { window: 60, max: 10 },
      "/sign-in/email": { window: 60, max: 10 },
    },
  },
  advanced: {
    // Hostinger serves the app behind a proxy: take the client IP from its
    // headers so rate limits apply per person, not to everyone at once.
    ipAddress: { ipAddressHeaders: ["x-forwarded-for", "x-real-ip"] },
  },
  hooks: {
    // Staff without an email get an internal placeholder address (Better
    // Auth requires one). Those must never work as a sign-in identifier.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/email") return;
      const email = typeof ctx.body?.email === "string" ? ctx.body.email : "";
      if (isPlaceholderEmail(email)) {
        throw new APIError("UNAUTHORIZED", { message: "Invalid email or password" });
      }
    }),
  },
  // Endpoints this app never uses. Staff sign in with mobile or email +
  // password; admins manage names, numbers, emails and passwords from the
  // Employees screen.
  disabledPaths: [
    "/sign-up/email",
    "/sign-in/social",
    "/link-social",
    "/request-password-reset",
    "/reset-password",
    "/send-verification-email",
    "/verify-email",
    "/change-email",
    "/update-user",
    "/delete-user",
    "/phone-number/send-otp",
    "/phone-number/verify",
    "/phone-number/request-password-reset",
    "/phone-number/reset-password",
  ],
  plugins: [
    phoneNumber({
      phoneNumberValidator: isValidPhone,
      sendOTP: async ({ phoneNumber: phone, code }) => {
        await sendSms({
          phone,
          body: `${code} is your ${brand.shortName} verification code. It expires in 5 minutes. Do not share it.`,
          refType: "auth_otp",
        });
      },
    }),
    // Must stay last: lets server actions set auth cookies.
    nextCookies(),
  ],
});


// Agam Water Industries brand, taken from agamwaterindustries.com:
// the logo (navy "AWi", aqua drop, orange wordmark, lavender swoosh) and the
// site's button gradient (navy → teal). The same values are defined as CSS
// tokens in src/app/globals.css. Keep the two in sync.

export const brand = {
  company: "Agam Water Industries",
  shortName: "Agam Ops",
  appName: "Agam Ops Platform",
  tagline: "Attendance, field visits & client messaging",
  website: "https://agamwaterindustries.com",

  colors: {
    /** "AWi" lettering, gradient start. Primary brand color. */
    navy: "#2A4086",
    /** Gradient end. */
    teal: "#3DCBCB",
    /** Water drop. */
    aqua: "#00A8C8",
    /** Wordmark "AGAM WATER INDUSTRIES". Accent only (3:1 on white). */
    orange: "#F06A0C",
    /** Logo swoosh. */
    lavender: "#6068A0",
    /** Headings on the website. */
    ink: "#344767",
    /** Body text on the website. */
    muted: "#7B809A",
    /** Light page background on the website. */
    surface: "#F0F2F5",
  },

  /** Button / hero gradient used across the website. */
  gradient: "linear-gradient(195deg, #2A4086, #3DCBCB)",

  logo: {
    /** Full horizontal logo, 955 × 187, transparent. */
    full: { src: "/brand/agam-logo.png", width: 955, height: 187 },
    /** Square "AWi" drop mark, 512 × 512, transparent. */
    mark: { src: "/brand/agam-mark.png", width: 512, height: 512 },
  },
} as const;

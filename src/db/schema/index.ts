// Drizzle schema entry point. drizzle-kit reads this file to generate
// migrations, and src/db/index.ts passes it to the query client.
// Table design follows docs/project-doc.html, section 11 (Data model).

export * from "./auth";
export * from "./people";
export * from "./attendance";
export * from "./leave";
export * from "./field-visits";
export * from "./clients";
export * from "./messaging";
export * from "./system";
export * from "./relations";

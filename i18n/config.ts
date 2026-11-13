// Supported interface languages. The locale is stored in a cookie (no URL
// prefix), so existing routes and the auth/session handling are unchanged.
export const locales = ["en", "vi"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

// Cookie that holds the user's chosen language.
export const LOCALE_COOKIE = "pd_locale";

// Keep the choice as long as the login session cookie (400 days).
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 400;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

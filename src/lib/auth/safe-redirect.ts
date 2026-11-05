/** Only same-site relative paths: anything else falls back to the home page. */
export function safeRedirectPath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || !value.startsWith("/")) {
    return fallback;
  }
  // "//host" and "/\host" are protocol-relative and would leave the site.
  if (value.startsWith("//") || value.startsWith("/\\") || /[\r\n]/.test(value)) {
    return fallback;
  }
  return value;
}

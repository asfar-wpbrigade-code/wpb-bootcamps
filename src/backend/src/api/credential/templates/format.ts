/**
 * Small formatting helpers shared by the outbound email templates.
 */

/**
 * Escapes a value for interpolation into HTML.
 *
 * Recipient and achievement names reach these templates from CSV uploads and
 * form input, so they are untrusted: an unescaped `&` breaks entity parsing
 * and an unescaped `<` can break out of the surrounding markup entirely.
 */
export function escapeHtml(value: string | null | undefined): string {
  if (value === null || value === undefined) return ''

  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * The name to greet someone by: their first name where they have a
 * multi-part name, the whole thing where they don't (mononyms, handles).
 * Returns null for a missing or blank name, so callers can fall back to an
 * impersonal greeting rather than addressing someone as "Hi ,".
 */
export function greetingName(fullName: string | null | undefined): string | null {
  const trimmed = fullName?.trim()

  if (!trimmed) return null

  return trimmed.split(/\s+/)[0]
}

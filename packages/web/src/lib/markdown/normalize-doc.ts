const LEGACY_DOC_TITLE_RE = /^\s*#\s+[A-Za-z0-9_-]+\.md(?:\s*[-:]\s*.*)?\s*\n+/i;

/**
 * Remove legacy markdown doc title headers like:
 *   # USER.md - About Our Human
 *   # SOUL.md - Lumen
 */
export function normalizeDocMarkdown(markdown?: string): string {
  if (!markdown) return '';
  return markdown.replace(LEGACY_DOC_TITLE_RE, '').trimStart();
}

/**
 * Shared Identity Templates
 *
 * Canonical templates for PCP identity documents — used by both
 * the CLI (sb awaken) and the API (choose_name, save_identity).
 *
 * Templates are loaded from .md files at module init time.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Always read .md files from src/ — they're static text and don't need compilation.
// join(__dirname, '..', 'src') resolves correctly from both dist/ and src/.
const SRC_DIR = join(__dirname, '..', 'src');

function loadTemplate(relativePath: string): string {
  return readFileSync(join(SRC_DIR, relativePath), 'utf-8');
}

/**
 * All PCP identity templates.
 */
export const templates = {
  /** Full awakening prompt with {{PLACEHOLDERS}} for dynamic sections. */
  awaken: loadTemplate('awaken.md'),

  /** Starter templates for identity documents. */
  starters: {
    /** SOUL.md — philosophical core, what matters, what won't leave you alone. */
    soul: loadTemplate('starters/soul.md'),
    /** IDENTITY.md — name, role, nature, values, capabilities, relationships. */
    identity: loadTemplate('starters/identity.md'),
    /** VALUES.md — personal values and what they mean in practice. */
    values: loadTemplate('starters/values.md'),
    /** HEARTBEAT.md — operational wake-up checklist and periodic tasks. */
    heartbeat: loadTemplate('starters/heartbeat.md'),
    /** PROCESS.md — decision-making approach and working style. */
    process: loadTemplate('starters/process.md'),
  },
};

/**
 * Replace {{PLACEHOLDER}} tokens in a template string.
 * Unknown placeholders are left as-is. Multiple consecutive
 * blank lines in the output are collapsed to two.
 */
export function renderTemplate(
  template: string,
  vars: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  // Collapse runs of 3+ blank lines to 2
  return result.replace(/\n{3,}/g, '\n\n');
}

/**
 * Integration Test Pre-flight Checks
 *
 * Runs before integration tests to verify:
 * - required environment variables are present
 * - by default, SUPABASE_URL points at localhost
 * - Not running against production
 */

const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

// Reject production environment
if (process.env.NODE_ENV === 'production') {
  throw new Error('Cannot run integration tests in production environment');
}

// Verify Supabase credentials are available (supports both naming conventions)
const hasSupabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!process.env.SUPABASE_URL || !hasSupabaseKey) {
  throw new Error(
    'Integration tests require SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_KEY).\n' +
      'Set these explicitly (recommended) or via scripts/test-integration-db-local.sh.'
  );
}

// Safety guard: default to local-only integration DB targets unless explicitly overridden.
if (process.env.INK_ALLOW_REMOTE_INTEGRATION_DB !== '1') {
  let hostname: string;
  try {
    hostname = new URL(process.env.SUPABASE_URL).hostname;
  } catch {
    throw new Error(`SUPABASE_URL is not a valid URL: ${process.env.SUPABASE_URL}`);
  }

  if (!LOCALHOST_HOSTS.has(hostname)) {
    throw new Error(
      [
        `Refusing to run integration tests against non-local SUPABASE_URL host: ${hostname}`,
        'Use a local Supabase stack (scripts/test-integration-db-local.sh), or set',
        'INK_ALLOW_REMOTE_INTEGRATION_DB=1 if you intentionally want a remote target.',
      ].join('\n')
    );
  }
}

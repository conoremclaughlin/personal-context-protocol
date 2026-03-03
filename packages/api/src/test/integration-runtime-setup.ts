/**
 * Runtime Integration Test Pre-flight Checks
 *
 * Used for runtime/CLI integration tests that may invoke local binaries.
 * These checks intentionally do NOT require database credentials.
 */

if (process.env.NODE_ENV === 'production') {
  throw new Error('Cannot run runtime integration tests in production environment');
}

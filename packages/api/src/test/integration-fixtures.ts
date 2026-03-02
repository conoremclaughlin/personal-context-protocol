import type { DataComposer } from '../data/composer';

export const INTEGRATION_TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000';
export const INTEGRATION_TEST_USER_EMAIL = 'integration-test@example.com';
export const INTEGRATION_TEST_AGENT_ID = 'echo';

/**
 * Ensures the canonical integration-test user + `echo` identity exist.
 * This keeps integration tests deterministic even when seed state differs.
 */
export async function ensureEchoIntegrationFixture(
  dataComposer: DataComposer
): Promise<{ userId: string; email: string }> {
  const supabase = dataComposer.getClient();

  const { data: existingUser, error: userLookupError } = await supabase
    .from('users')
    .select('id, email')
    .eq('id', INTEGRATION_TEST_USER_ID)
    .maybeSingle();

  if (userLookupError) {
    throw new Error(`Failed to query integration test user: ${userLookupError.message}`);
  }

  if (!existingUser) {
    const { error: insertUserError } = await supabase.from('users').insert({
      id: INTEGRATION_TEST_USER_ID,
      email: INTEGRATION_TEST_USER_EMAIL,
      username: 'integration-test-user',
      first_name: 'Integration',
      last_name: 'Test',
      timezone: 'UTC',
      preferences: {},
    });

    if (insertUserError) {
      throw new Error(`Failed to create integration test user: ${insertUserError.message}`);
    }
  }

  const { data: existingEchoIdentity, error: identityLookupError } = await supabase
    .from('agent_identities')
    .select('id')
    .eq('user_id', INTEGRATION_TEST_USER_ID)
    .eq('agent_id', INTEGRATION_TEST_AGENT_ID)
    .is('workspace_id', null)
    .maybeSingle();

  if (identityLookupError) {
    throw new Error(
      `Failed to query integration fixture agent identity: ${identityLookupError.message}`
    );
  }

  if (!existingEchoIdentity) {
    const { error: insertIdentityError } = await supabase.from('agent_identities').insert({
      user_id: INTEGRATION_TEST_USER_ID,
      agent_id: INTEGRATION_TEST_AGENT_ID,
      name: 'Echo',
      role: 'Integration test fixture agent',
      description: 'Fixture identity used by integration tests',
      values: [],
      relationships: {},
      capabilities: [],
      metadata: { fixture: true },
      backend: 'claude',
    });

    if (insertIdentityError) {
      throw new Error(
        `Failed to create integration fixture agent identity: ${insertIdentityError.message}`
      );
    }
  }

  return {
    userId: INTEGRATION_TEST_USER_ID,
    email: existingUser?.email || INTEGRATION_TEST_USER_EMAIL,
  };
}

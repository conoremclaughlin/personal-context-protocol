/**
 * Quick test script for the channel adapter
 * Run with: yarn tsx src/test-channels.ts
 */

import { getDataComposer } from './data/composer';
import { createChannelAdapter } from './channels/adapter';
import { convertClawdbotContext } from './channels/clawdbot-bridge';
import type { ClawdbotMsgContext } from './channels/clawdbot-bridge';

async function main() {
  console.log('Testing channel adapter...\n');

  // Initialize
  const dataComposer = await getDataComposer();
  const adapter = createChannelAdapter(dataComposer, {
    autoExtract: { links: true, notes: false, tasks: false, reminders: false },
  });

  // Simulate a clawdbot message context
  const clawdbotCtx: ClawdbotMsgContext = {
    Body: 'Check out this article: https://example.com/article',
    RawBody: 'Check out this article: https://example.com/article',
    From: 'telegram:123456789',
    Provider: 'telegram',
    ChatType: 'direct',
    SenderName: 'Test User',
    SenderId: '123456789',
    Timestamp: Date.now(),
    MessageSid: 'msg-001',
  };

  // Convert to our format
  const message = convertClawdbotContext(clawdbotCtx);
  if (!message) {
    console.error('Failed to convert context');
    process.exit(1);
  }

  console.log('Converted message:', JSON.stringify(message, null, 2));
  console.log('\n---\n');

  // Process the message
  const result = await adapter.processMessage(message);

  console.log('Processing result:', JSON.stringify(result, null, 2));

  if (result.success) {
    console.log('\n✅ Test passed!');
    if (result.response) {
      console.log(`Response: ${result.response}`);
    }
  } else {
    console.log('\n❌ Test failed');
    console.log('Errors:', result.errors);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});

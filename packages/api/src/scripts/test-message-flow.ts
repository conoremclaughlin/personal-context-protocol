#!/usr/bin/env npx tsx
/**
 * Test the full message flow:
 * Telegram message -> MessageHandler -> Claude Code -> Telegram response
 *
 * Usage: npx tsx src/scripts/test-message-flow.ts [message]
 */

import path from 'path';
import { getDataComposer } from '../data/composer';
import { createMessageHandler } from '../services/message-handler';
import type { InboundMessage } from '../channels/types';

async function main() {
  const testMessage = process.argv[2] || 'Hello! What are we working on today?';

  console.log('🔄 Testing Full Message Flow\n');
  console.log(`Message: "${testMessage}"\n`);

  // Initialize data layer
  console.log('1. Initializing data composer...');
  const dataComposer = await getDataComposer();
  console.log('   ✓ Data composer ready\n');

  // Create message handler
  console.log('2. Creating message handler...');
  const handler = createMessageHandler(dataComposer, {
    model: 'haiku', // Use haiku for faster testing
    workingDirectory: path.resolve(__dirname, '../../../..'),
    includeContext: true,
  });

  // Listen for streaming events
  handler.on('text', (text: string) => {
    process.stdout.write(`   [stream] ${text}\n`);
  });

  console.log('   ✓ Message handler ready\n');

  // Simulate inbound Telegram message from Conor
  console.log('3. Simulating inbound Telegram message...');
  const inboundMessage: InboundMessage = {
    body: testMessage,
    rawBody: testMessage,
    timestamp: Date.now(),
    messageId: '12345',
    platform: 'telegram',
    chatType: 'direct',
    sender: {
      id: '726555973', // Conor's Telegram chat ID
      username: 'conoremc',
      name: 'Conor',
    },
    conversationId: 'telegram:726555973',
  };
  console.log(`   From: @${inboundMessage.sender.username} (${inboundMessage.sender.id})`);
  console.log(`   Platform: ${inboundMessage.platform}\n`);

  // Process message
  console.log('4. Processing message through handler...\n');
  const startTime = Date.now();

  const result = await handler.handleMessage(inboundMessage);

  const duration = Date.now() - startTime;

  // Show results
  console.log('\n5. Results:');
  console.log(`   Success: ${result.success}`);
  console.log(`   Session ID: ${result.sessionId}`);
  console.log(`   Cost: $${result.cost?.toFixed(4) || 'N/A'}`);
  console.log(`   Duration: ${duration}ms`);

  if (result.error) {
    console.log(`   Error: ${result.error}`);
  }

  if (result.response) {
    console.log('\n6. Response sent to Telegram:');
    console.log('   ---');
    console.log(`   ${result.response}`);
    console.log('   ---');
  }

  console.log('\n✅ Test complete!');
}

main().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});

#!/usr/bin/env npx tsx
/**
 * Test script for the Agent Orchestrator
 *
 * Usage: npx tsx src/scripts/test-orchestrator.ts
 */

import { createAgentOrchestrator } from '../services/agent-orchestrator';
import path from 'path';

async function main() {
  console.log('🤖 Testing Agent Orchestrator\n');

  // Create orchestrator with our MCP config
  const mcpConfigPath = path.resolve(__dirname, '../../../../.mcp.json');

  const orchestrator = createAgentOrchestrator({
    model: 'haiku', // Use haiku for faster/cheaper testing
    workingDirectory: path.resolve(__dirname, '../../../..'),
    mcpConfig: mcpConfigPath,
    systemPrompt: 'You are a helpful assistant. Keep responses brief.',
    timeout: 60000,
  });

  // Listen for streaming events
  orchestrator.on('text', (text: string) => {
    process.stdout.write(`[stream] ${text}\n`);
  });

  orchestrator.on('system', () => {
    console.log('[system] Claude Code initialized');
  });

  // Test 1: Simple message
  console.log('--- Test 1: Simple message ---');
  console.log('Sending: "What is 2+2? Reply with just the number."\n');

  const response1 = await orchestrator.sendMessage(
    'What is 2+2? Reply with just the number.',
    { userId: 'test-user', platform: 'test' }
  );

  console.log('\nResult:', {
    success: response1.success,
    content: response1.content,
    sessionId: response1.sessionId,
    cost: response1.cost,
  });

  // Test 2: Follow-up message (session continuity)
  if (response1.sessionId) {
    console.log('\n--- Test 2: Session continuity ---');
    console.log('Sending: "What was the question I just asked?"\n');

    const response2 = await orchestrator.sendMessage(
      'What was the question I just asked?',
      { sessionId: response1.sessionId }
    );

    console.log('\nResult:', {
      success: response2.success,
      content: response2.content,
      sessionId: response2.sessionId,
    });
  }

  // Show sessions
  console.log('\n--- Active Sessions ---');
  const sessions = orchestrator.listSessions();
  for (const session of sessions) {
    console.log(`Session ${session.sessionId}:`);
    console.log(`  Messages: ${session.messages.length}`);
    console.log(`  Platform: ${session.platform}`);
  }

  console.log('\n✅ Test complete!');
}

main().catch(console.error);

import { describe, expect, it, vi } from 'vitest';
import { PassThrough } from 'stream';
import {
  JsonlApprovalChannel,
  AutoApprovalChannel,
  type ApprovalRequestEvent,
  type ApprovalResponseEvent,
} from './approval-channel.js';

describe('JsonlApprovalChannel', () => {
  it('emits JSONL request and resolves on programmatic respond()', async () => {
    const output = new PassThrough();
    const channel = new JsonlApprovalChannel(output);

    const chunks: string[] = [];
    output.on('data', (chunk) => chunks.push(String(chunk)));

    const promise = channel.requestApproval({
      tool: 'get_inbox',
      args: { agentId: 'wren' },
      reason: 'Tool requires approval.',
      sessionId: 'sess-1',
    });

    // Parse the emitted request
    const requestLine = chunks.join('').trim();
    const request = JSON.parse(requestLine) as ApprovalRequestEvent;
    expect(request.type).toBe('approval_request');
    expect(request.tool).toBe('get_inbox');
    expect(request.args).toEqual({ agentId: 'wren' });
    expect(request.reason).toBe('Tool requires approval.');
    expect(request.sessionId).toBe('sess-1');
    expect(request.ts).toBeTruthy();

    // Respond programmatically
    channel.respond({
      type: 'approval_response',
      id: request.id,
      decision: 'once',
      by: 'test-harness',
    });

    const response = await promise;
    expect(response.decision).toBe('once');
    expect(response.by).toBe('test-harness');

    channel.dispose();
  });

  it('resolves on stream-based response via input', async () => {
    const output = new PassThrough();
    const input = new PassThrough();
    const channel = new JsonlApprovalChannel(output, input);

    const chunks: string[] = [];
    output.on('data', (chunk) => chunks.push(String(chunk)));

    const promise = channel.requestApproval({
      tool: 'send_to_inbox',
      args: {},
      reason: 'Needs confirmation.',
    });

    // Parse request ID from emitted JSONL
    const request = JSON.parse(chunks.join('').trim()) as ApprovalRequestEvent;

    // Simulate external response via input stream
    const response: ApprovalResponseEvent = {
      type: 'approval_response',
      id: request.id,
      decision: 'always',
      by: 'remote-app',
    };
    input.write(JSON.stringify(response) + '\n');

    const result = await promise;
    expect(result.decision).toBe('always');
    expect(result.by).toBe('remote-app');

    channel.dispose();
  });

  it('times out with cancel decision', async () => {
    const output = new PassThrough();
    const channel = new JsonlApprovalChannel(output);

    const result = await channel.requestApproval({
      tool: 'dangerous_tool',
      args: {},
      reason: 'test',
      timeoutMs: 50,
    });

    expect(result.decision).toBe('cancel');
    expect(result.by).toBe('timeout');

    channel.dispose();
  });

  it('handles multiple concurrent requests', async () => {
    const output = new PassThrough();
    const channel = new JsonlApprovalChannel(output);

    const chunks: string[] = [];
    output.on('data', (chunk) => chunks.push(String(chunk)));

    const p1 = channel.requestApproval({ tool: 'tool_a', args: {}, reason: 'a' });
    const p2 = channel.requestApproval({ tool: 'tool_b', args: {}, reason: 'b' });

    // Parse both requests
    const lines = chunks.join('').trim().split('\n');
    expect(lines.length).toBe(2);
    const req1 = JSON.parse(lines[0]) as ApprovalRequestEvent;
    const req2 = JSON.parse(lines[1]) as ApprovalRequestEvent;

    // Respond in reverse order
    channel.respond({ type: 'approval_response', id: req2.id, decision: 'deny' });
    channel.respond({ type: 'approval_response', id: req1.id, decision: 'session' });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.decision).toBe('session');
    expect(r2.decision).toBe('deny');

    channel.dispose();
  });

  it('dispose cancels all pending requests', async () => {
    const output = new PassThrough();
    const channel = new JsonlApprovalChannel(output);

    const promise = channel.requestApproval({
      tool: 'get_inbox',
      args: {},
      reason: 'test',
      timeoutMs: 60_000,
    });

    channel.dispose();

    const result = await promise;
    expect(result.decision).toBe('cancel');
    expect(result.by).toBe('disposed');
  });

  it('ignores non-JSON and unrelated lines on input stream', async () => {
    const output = new PassThrough();
    const input = new PassThrough();
    const channel = new JsonlApprovalChannel(output, input);

    const chunks: string[] = [];
    output.on('data', (chunk) => chunks.push(String(chunk)));

    const promise = channel.requestApproval({
      tool: 'get_inbox',
      args: {},
      reason: 'test',
    });

    const request = JSON.parse(chunks.join('').trim()) as ApprovalRequestEvent;

    // Send garbage, unrelated response, then the real one
    input.write('not json at all\n');
    input.write('{"type":"something_else","id":"unrelated"}\n');
    input.write(
      JSON.stringify({ type: 'approval_response', id: 'wrong-id', decision: 'once' }) + '\n'
    );
    input.write(
      JSON.stringify({ type: 'approval_response', id: request.id, decision: 'once' }) + '\n'
    );

    const result = await promise;
    expect(result.decision).toBe('once');

    channel.dispose();
  });
});

describe('AutoApprovalChannel', () => {
  it('auto-denies by default', async () => {
    const channel = new AutoApprovalChannel();
    const result = await channel.requestApproval({
      tool: 'anything',
      args: {},
      reason: 'test',
    });
    expect(result.decision).toBe('cancel');
    expect(result.by).toBe('auto');
  });

  it('auto-approves when configured', async () => {
    const channel = new AutoApprovalChannel('once');
    const result = await channel.requestApproval({
      tool: 'anything',
      args: {},
      reason: 'test',
    });
    expect(result.decision).toBe('once');
  });
});

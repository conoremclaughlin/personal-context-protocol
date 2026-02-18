import { describe, expect, it } from 'vitest';
import { ToolPolicyState } from './tool-policy.js';

describe('ToolPolicyState', () => {
  it('allows safe tools in backend mode', () => {
    const policy = new ToolPolicyState('backend');
    const decision = policy.canCallPcpTool('get_inbox');
    expect(decision.allowed).toBe(true);
  });

  it('blocks unsafe tools by default', () => {
    const policy = new ToolPolicyState('backend');
    const decision = policy.canCallPcpTool('send_to_inbox');
    expect(decision.allowed).toBe(false);
  });

  it('consumes scoped grants', () => {
    const policy = new ToolPolicyState('off');
    policy.grantTool('send_to_inbox', 2);

    expect(policy.canCallPcpTool('send_to_inbox').allowed).toBe(true);
    expect(policy.canCallPcpTool('send_to_inbox').allowed).toBe(true);
    expect(policy.canCallPcpTool('send_to_inbox').allowed).toBe(false);
  });

  it('allows all tools in privileged mode', () => {
    const policy = new ToolPolicyState('privileged');
    expect(policy.canUseBackendTools()).toBe(true);
    expect(policy.canCallPcpTool('send_to_inbox').allowed).toBe(true);
  });
});


import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Command } from 'commander';
import { registerHooksCommands } from './hooks.js';

type CapturedCall = {
  path: string;
  method: string;
  tool: string;
  args: Record<string, unknown>;
  headers: Record<string, string>;
};

function parseJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function sendToolResponse(
  res: ServerResponse,
  requestId: unknown,
  payload: Record<string, unknown>
): void {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(
    JSON.stringify({
      jsonrpc: '2.0',
      id: requestId,
      result: {
        content: [{ text: JSON.stringify(payload) }],
      },
    })
  );
}

describe('hooks integration: on-session-start', () => {
  const originalCwd = process.cwd();
  const originalHome = process.env.HOME;
  const originalServerUrl = process.env.PCP_SERVER_URL;
  const originalAgentId = process.env.AGENT_ID;
  const originalAccessToken = process.env.PCP_ACCESS_TOKEN;

  let testCwd: string;
  let testHome: string;
  let calls: CapturedCall[];
  let server: ReturnType<typeof createServer>;
  let serverUrl = '';
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    calls = [];
    testCwd = mkdtempSync(join(tmpdir(), 'pcp-hooks-int-cwd-'));
    testHome = mkdtempSync(join(tmpdir(), 'pcp-hooks-int-home-'));
    process.chdir(testCwd);
    process.env.HOME = testHome;
    process.env.AGENT_ID = 'lumen';
    process.env.PCP_ACCESS_TOKEN = 'test-access-token';

    mkdirSync(join(testHome, '.pcp'), { recursive: true });
    writeFileSync(
      join(testHome, '.pcp', 'config.json'),
      JSON.stringify({ email: 'test@example.com' })
    );

    stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true as unknown as ReturnType<typeof process.stdout.write>);

    server = createServer(async (req, res) => {
      if (req.method !== 'POST' || req.url !== '/mcp') {
        res.statusCode = 404;
        res.end('not found');
        return;
      }

      const body = await parseJsonBody(req);
      const params = (body.params as Record<string, unknown> | undefined) || {};
      const tool = String(params.name || '');
      const args = (params.arguments as Record<string, unknown> | undefined) || {};

      calls.push({
        path: req.url || '',
        method: req.method || '',
        tool,
        args,
        headers: {
          authorization: String(req.headers.authorization || ''),
          callerProfile: String(req.headers['x-pcp-caller-profile'] || ''),
          agentHeader: String(req.headers['x-pcp-agent-id'] || ''),
        },
      });

      switch (tool) {
        case 'bootstrap':
          sendToolResponse(res, body.id, {
            identityFiles: { self: '# SELF\n\nhello' },
            recentMemories: [],
            activeSessions: [],
          });
          return;
        case 'get_inbox':
          sendToolResponse(res, body.id, { messages: [] });
          return;
        case 'list_skills':
          sendToolResponse(res, body.id, { skills: [] });
          return;
        case 'start_session':
          sendToolResponse(res, body.id, {
            session: { id: 'pcp-sess-1', threadKey: 'thread:test' },
          });
          return;
        case 'update_session_phase':
          sendToolResponse(res, body.id, { success: true });
          return;
        default:
          sendToolResponse(res, body.id, { success: true });
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    serverUrl = `http://127.0.0.1:${port}`;
    process.env.PCP_SERVER_URL = serverUrl;
  });

  afterEach(async () => {
    stdoutSpy.mockRestore();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    process.chdir(originalCwd);
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalServerUrl === undefined) delete process.env.PCP_SERVER_URL;
    else process.env.PCP_SERVER_URL = originalServerUrl;
    if (originalAgentId === undefined) delete process.env.AGENT_ID;
    else process.env.AGENT_ID = originalAgentId;
    if (originalAccessToken === undefined) delete process.env.PCP_ACCESS_TOKEN;
    else process.env.PCP_ACCESS_TOKEN = originalAccessToken;
    rmSync(testCwd, { recursive: true, force: true });
    rmSync(testHome, { recursive: true, force: true });
  });

  it('hits MCP /mcp and calls bootstrap/start_session/update_session_phase during startup hook', async () => {
    const program = new Command();
    registerHooksCommands(program);

    await program.parseAsync(['hooks', 'on-session-start', '--backend', 'codex'], { from: 'user' });

    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((call) => call.path === '/mcp' && call.method === 'POST')).toBe(true);

    const calledTools = calls.map((call) => call.tool);
    expect(calledTools).toContain('bootstrap');
    expect(calledTools).toContain('start_session');
    expect(calledTools).toContain('update_session_phase');

    const startSessionCall = calls.find((call) => call.tool === 'start_session');
    expect(startSessionCall?.args).toMatchObject({
      agentId: 'lumen',
      backend: 'codex',
    });

    const updatePhaseCall = calls.find((call) => call.tool === 'update_session_phase');
    expect(updatePhaseCall?.args).toMatchObject({
      agentId: 'lumen',
      sessionId: 'pcp-sess-1',
      lifecycle: 'idle',
    });

    // Ensure runtime hook profile + auth headers are included.
    for (const call of calls) {
      expect(call.headers.callerProfile).toBe('runtime');
      expect(call.headers.authorization).toBe('Bearer test-access-token');
    }

    const agentScopedCalls = calls.filter(
      (call) => typeof call.args.agentId === 'string' && call.args.agentId === 'lumen'
    );
    expect(agentScopedCalls.length).toBeGreaterThan(0);
    for (const call of agentScopedCalls) {
      expect(call.headers.agentHeader).toBe('lumen');
    }
  });
});

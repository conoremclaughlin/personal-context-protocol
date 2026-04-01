/**
 * Gemini CLI Backend Adapter
 *
 * Wraps the Gemini CLI with Inkstand identity injection.
 * Gemini reads MCP headers from settings.json (not env vars like Codex).
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createIdentityPromptFile } from './identity.js';
import { buildSessionEnv, encodeContextToken } from '@inkstand/shared';
import type { BackendAdapter, BackendConfig, PreparedBackend } from './types.js';

/**
 * Build a temp Gemini settings.json that merges Inkstand auth + session headers
 * into the MCP server config. Gemini reads MCP headers from settings.json
 * (not env vars like Codex), so we need a generated override file.
 *
 * Uses ${ENV_VAR} syntax — Gemini resolves env vars at runtime.
 * Authorization uses ${INK_ACCESS_TOKEN} which is set at the spawn site.
 * If unset, Gemini sends "Bearer " which the server handles as unauthenticated.
 *
 * NOTE: Gemini env var interpolation in MCP headers may be unreliable
 * (upstream issues #5282, #5828). Aster's existing settings use ${GITHUB_TOKEN}
 * for GitHub auth which works, but Inkstand headers haven't been verified end-to-end.
 * Live validation needed once Aster's quota resets.
 */
function buildGeminiSettings(cwd: string): { path: string; cleanup: () => void } | null {
  // Start from .mcp.json to preserve other MCP servers (supabase, github, etc.)
  const mcpJsonPath = join(cwd, '.mcp.json');
  let mcpServers: Record<string, unknown> = {};
  if (existsSync(mcpJsonPath)) {
    try {
      const parsed = JSON.parse(readFileSync(mcpJsonPath, 'utf-8'));
      mcpServers = parsed.mcpServers || {};
    } catch {
      // ignore parse errors
    }
  }

  // Merge Inkstand auth + session headers
  const inkConfig = (mcpServers.inkstand || {}) as Record<string, unknown>;
  const existingHeaders = (inkConfig.headers || {}) as Record<string, string>;
  mcpServers.inkstand = {
    ...inkConfig,
    type: inkConfig.type || 'http',
    url: inkConfig.url || 'http://localhost:3001/mcp',
    headers: {
      ...existingHeaders,
      Authorization: 'Bearer ${INK_ACCESS_TOKEN}',
      'x-ink-context': '${INK_CONTEXT_TOKEN}',
      'x-ink-session-id': '${INK_SESSION_ID}',
      'x-ink-studio-id': '${INK_STUDIO_ID}',
    },
  };

  const settingsDir = join(tmpdir(), 'ink-gemini');
  mkdirSync(settingsDir, { recursive: true });
  const settingsFile = join(settingsDir, `settings-${process.pid}-${Date.now()}.json`);
  try {
    writeFileSync(settingsFile, JSON.stringify({ mcpServers }, null, 2));
    return {
      path: settingsFile,
      cleanup: () => {
        try {
          rmSync(settingsFile, { force: true });
        } catch {
          // best-effort
        }
      },
    };
  } catch {
    return null;
  }
}

export class GeminiAdapter implements BackendAdapter {
  readonly name = 'gemini';
  readonly binary = 'gemini';

  prepare(config: BackendConfig): PreparedBackend {
    const { promptFile, cleanup: identityCleanup } = createIdentityPromptFile(config.agentId);

    const args: string[] = [];
    if (config.model) {
      args.push('--model', config.model);
    }
    args.push('--system_instruction', promptFile);

    // Build Gemini settings with Inkstand headers
    const settings = buildGeminiSettings(config.cwd);
    const cleanups = [identityCleanup, settings?.cleanup].filter(Boolean) as Array<() => void>;
    const cleanup = () => cleanups.forEach((fn) => fn());

    // Build context token for consolidated session metadata
    const contextToken = config.pcpSessionId && config.agentId
      ? encodeContextToken({
          sessionId: config.pcpSessionId,
          studioId: config.studioId || '',
          agentId: config.agentId,
          cliAttached: true,
          runtime: 'gemini',
        })
      : '';

    return {
      binary: this.binary,
      args,
      env: {
        AGENT_ID: config.agentId,
        GEMINI_SYSTEM_MD: promptFile,
        INK_CONTEXT_TOKEN: contextToken,
        ...(config.pcpSessionId ? { INK_SESSION_ID: config.pcpSessionId } : {}),
        ...(config.studioId ? { INK_STUDIO_ID: config.studioId } : {}),
        ...(settings ? { GEMINI_CLI_SYSTEM_SETTINGS_PATH: settings.path } : {}),
      },
      cleanup,
    };
  }
}

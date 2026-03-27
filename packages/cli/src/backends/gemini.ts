/**
 * Gemini CLI Backend Adapter
 *
 * Identity injection via GEMINI_SYSTEM_MD=<tmpfile> env var
 * MCP config via GEMINI_CLI_SYSTEM_SETTINGS_PATH → temp settings.json
 *   with auth + session headers merged into PCP server config.
 *
 * Docs: https://geminicli.com/docs/
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createIdentityPromptFile } from './identity.js';
import { encodeContextToken } from '@personal-context/shared';
import type { BackendAdapter, BackendConfig, PreparedBackend } from './types.js';

/**
 * Build a temp Gemini settings.json that merges PCP auth + session headers
 * into the MCP server config. Gemini reads MCP headers from settings.json
 * (not env vars like Codex), so we need a generated override file.
 *
 * Uses ${ENV_VAR} syntax — Gemini resolves env vars at runtime.
 * Authorization uses ${PCP_ACCESS_TOKEN} which is set at the spawn site.
 * If unset, Gemini sends "Bearer " which the server handles as unauthenticated.
 *
 * NOTE: Gemini env var interpolation in MCP headers may be unreliable
 * (upstream issues #5282, #5828). Aster's existing settings use ${GITHUB_TOKEN}
 * for GitHub auth which works, but PCP headers haven't been verified end-to-end.
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

  // Merge PCP auth + session headers
  const pcpConfig = (mcpServers.pcp || {}) as Record<string, unknown>;
  const existingHeaders = (pcpConfig.headers || {}) as Record<string, string>;
  mcpServers.pcp = {
    ...pcpConfig,
    type: pcpConfig.type || 'http',
    url: pcpConfig.url || 'http://localhost:3001/mcp',
    headers: {
      ...existingHeaders,
      Authorization: 'Bearer ${PCP_ACCESS_TOKEN}',
      'x-pcp-context': '${PCP_CONTEXT_TOKEN}',
      'x-pcp-session-id': '${PCP_SESSION_ID}',
      'x-pcp-studio-id': '${PCP_STUDIO_ID}',
    },
  };

  const settingsDir = join(tmpdir(), 'sb-gemini');
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

    // Model (only if explicitly specified)
    if (config.model) {
      args.push('-m', config.model);
    }

    // Prompt mode: gemini uses -p for one-shot
    // Interactive is the default (no flag needed)
    if (config.prompt) {
      args.push('-p');
      // Keep prompt adjacent to -p for strict CLI parsers.
      args.push(config.prompt);
    }

    // Resume a specific backend-native Gemini session when available.
    if (config.backendSessionId) {
      args.push('--resume', config.backendSessionId);
    }

    // Auto-approve: skip all permission prompts
    if (config.dangerous) {
      args.push('--yolo');
    }

    // Passthrough flags
    args.push(...config.passthroughArgs);

    // Build consolidated context token
    const contextToken = encodeContextToken({
      sessionId: config.pcpSessionId || '',
      studioId: config.studioId || '',
      agentId: config.agentId,
      cliAttached: true,
      runtime: 'gemini',
    });

    // Build temp settings.json with PCP auth + session headers.
    // PCP_ACCESS_TOKEN is set at the spawn site (after prepare) — the
    // ${PCP_ACCESS_TOKEN} syntax in settings.json resolves at Gemini runtime.
    const settings = buildGeminiSettings(process.cwd());
    const cleanup = () => {
      identityCleanup();
      settings?.cleanup();
    };

    return {
      binary: this.binary,
      args,
      env: {
        AGENT_ID: config.agentId,
        GEMINI_SYSTEM_MD: promptFile,
        PCP_CONTEXT_TOKEN: contextToken,
        ...(config.pcpSessionId ? { PCP_SESSION_ID: config.pcpSessionId } : {}),
        ...(config.studioId ? { PCP_STUDIO_ID: config.studioId } : {}),
        ...(settings ? { GEMINI_CLI_SYSTEM_SETTINGS_PATH: settings.path } : {}),
      },
      cleanup,
    };
  }
}

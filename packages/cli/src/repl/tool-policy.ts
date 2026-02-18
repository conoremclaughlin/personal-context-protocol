export type ToolMode = 'backend' | 'off' | 'privileged';

export interface ToolPolicyDecision {
  allowed: boolean;
  reason: string;
}

const SAFE_PCP_TOOLS = new Set<string>([
  'bootstrap',
  'get_inbox',
  'list_sessions',
  'get_session',
  'get_activity',
  'get_activity_summary',
  'recall',
  'list_artifacts',
  'get_artifact',
  'list_tasks',
  'list_projects',
  'list_reminders',
  'list_workspace_containers',
  'list_workspaces',
  'list_studios',
  'get_workspace_container',
  'get_workspace',
  'get_studio',
  'get_timezone',
  'get_focus',
]);

function normalizeToolName(name: string): string {
  return name.trim().toLowerCase();
}

export class ToolPolicyState {
  private mode: ToolMode;
  private grants = new Map<string, number>();

  constructor(initialMode: ToolMode = 'backend') {
    this.mode = initialMode;
  }

  public getMode(): ToolMode {
    return this.mode;
  }

  public setMode(mode: ToolMode): void {
    this.mode = mode;
  }

  public canUseBackendTools(): boolean {
    return this.mode !== 'off';
  }

  public grantTool(tool: string, uses = 1): void {
    const key = normalizeToolName(tool);
    const next = Math.max(1, uses);
    this.grants.set(key, (this.grants.get(key) || 0) + next);
  }

  public listGrants(): Array<{ tool: string; uses: number }> {
    return Array.from(this.grants.entries())
      .map(([tool, uses]) => ({ tool, uses }))
      .sort((a, b) => a.tool.localeCompare(b.tool));
  }

  public canCallPcpTool(tool: string): ToolPolicyDecision {
    const key = normalizeToolName(tool);
    if (!key) {
      return { allowed: false, reason: 'Invalid tool name.' };
    }

    if (this.mode === 'privileged') {
      return { allowed: true, reason: 'Tool mode is privileged.' };
    }

    if (SAFE_PCP_TOOLS.has(key)) {
      return { allowed: true, reason: 'Tool is in safe PCP allowlist.' };
    }

    const grantUses = this.grants.get(key) || 0;
    if (grantUses > 0) {
      this.grants.set(key, grantUses - 1);
      if (grantUses - 1 <= 0) this.grants.delete(key);
      return {
        allowed: true,
        reason: `One-time grant consumed (${grantUses - 1} grant${grantUses - 1 === 1 ? '' : 's'} remaining).`,
      };
    }

    return {
      allowed: false,
      reason:
        'Tool blocked by policy. Use /grant <tool> [uses] for scoped access or /tools privileged for broad access.',
    };
  }
}


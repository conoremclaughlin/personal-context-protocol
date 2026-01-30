/**
 * PCP Workspaces
 *
 * Programmatic API for workspace management.
 * For CLI usage, see cli.ts
 */

export interface WorkspaceIdentity {
  agentId: string;
  context: string;
  description: string;
  workspace: string;
  branch: string;
  createdAt: string;
  createdBy?: string;
}

export interface WorkspaceInfo {
  name: string;
  path: string;
  branch: string;
  identity?: WorkspaceIdentity;
}

export interface CreateWorkspaceOptions {
  name: string;
  agentId?: string;
  gitRoot?: string;
}

// Re-export for programmatic use
// Future: Add functions for creating/managing workspaces programmatically

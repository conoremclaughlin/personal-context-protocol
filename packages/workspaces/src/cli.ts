#!/usr/bin/env node
/**
 * PCP Workspaces CLI
 *
 * Orchestrate parallel development with synthetic and biological teams.
 * Creates isolated git worktrees with PCP identity for each workspace.
 *
 * Usage:
 *   ws create <name>     Create a new workspace
 *   ws list              List all workspaces
 *   ws remove <name>     Remove a workspace (keeps branch)
 *   ws clean <name>      Remove workspace and delete branch
 *   ws status            Show status of all workspaces
 *   ws path <name>       Output workspace path (for cd)
 */

import { program } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { execSync, spawnSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { homedir } from 'os';

const VERSION = '0.1.0';
const WORKSPACE_PREFIX = 'pcp-ws';

interface WorkspaceIdentity {
  agentId: string;
  context: string;
  description: string;
  workspace: string;
  branch: string;
  createdAt: string;
  createdBy?: string;
}

interface WorkspaceInfo {
  name: string;
  path: string;
  branch: string;
  identity?: WorkspaceIdentity;
  status?: string;
}

/**
 * Find the git root directory
 */
function findGitRoot(): string {
  try {
    const result = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' });
    return result.trim();
  } catch {
    console.error(chalk.red('Error: Not in a git repository'));
    process.exit(1);
  }
}

/**
 * Get the parent directory where workspaces will be created
 */
function getWorkspaceParent(gitRoot: string): string {
  return dirname(gitRoot);
}

/**
 * Get the workspace directory path
 */
function getWorkspacePath(gitRoot: string, name: string): string {
  return join(getWorkspaceParent(gitRoot), `${WORKSPACE_PREFIX}-${name}`);
}

/**
 * Execute git command and return output
 */
function git(args: string, cwd?: string): string {
  try {
    return execSync(`git ${args}`, {
      encoding: 'utf-8',
      cwd: cwd || process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (error: unknown) {
    const err = error as { stderr?: string; message?: string };
    throw new Error(err.stderr || err.message || 'Git command failed');
  }
}

/**
 * Check if a branch exists
 */
function branchExists(branch: string, cwd?: string): boolean {
  try {
    git(`show-ref --verify --quiet refs/heads/${branch}`, cwd);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get current user from git config or PCP config
 */
function getCurrentUser(): string | undefined {
  // Try PCP config first
  const pcpConfigPath = join(homedir(), '.pcp', 'config.json');
  if (existsSync(pcpConfigPath)) {
    try {
      const config = JSON.parse(readFileSync(pcpConfigPath, 'utf-8'));
      return config.email || config.userId;
    } catch {
      // Fall through to git config
    }
  }

  // Try git config
  try {
    return git('config user.email');
  } catch {
    return undefined;
  }
}

/**
 * List all workspaces
 */
function listWorkspaces(gitRoot: string): WorkspaceInfo[] {
  const parentDir = getWorkspaceParent(gitRoot);
  const workspaces: WorkspaceInfo[] = [];

  // Get all worktrees
  const worktreeOutput = git('worktree list --porcelain', gitRoot);
  const worktrees = new Map<string, string>();

  let currentPath = '';
  for (const line of worktreeOutput.split('\n')) {
    if (line.startsWith('worktree ')) {
      currentPath = line.substring(9);
    } else if (line.startsWith('branch ')) {
      worktrees.set(currentPath, line.substring(7).replace('refs/heads/', ''));
    }
  }

  // Find PCP workspaces
  if (existsSync(parentDir)) {
    for (const entry of readdirSync(parentDir)) {
      if (entry.startsWith(`${WORKSPACE_PREFIX}-`)) {
        const wsPath = join(parentDir, entry);
        const name = entry.replace(`${WORKSPACE_PREFIX}-`, '');
        const branch = worktrees.get(wsPath) || 'unknown';

        let identity: WorkspaceIdentity | undefined;
        const identityPath = join(wsPath, '.pcp', 'identity.json');
        if (existsSync(identityPath)) {
          try {
            identity = JSON.parse(readFileSync(identityPath, 'utf-8'));
          } catch {
            // Ignore parse errors
          }
        }

        workspaces.push({ name, path: wsPath, branch, identity });
      }
    }
  }

  return workspaces;
}

// ============================================================================
// Commands
// ============================================================================

/**
 * Create a new workspace
 */
async function createWorkspace(name: string, options: { agent?: string }): Promise<void> {
  const spinner = ora(`Creating workspace: ${name}`).start();

  try {
    const gitRoot = findGitRoot();
    const wsPath = getWorkspacePath(gitRoot, name);
    const branch = `workspace/${name}`;

    // Check if workspace already exists
    if (existsSync(wsPath)) {
      spinner.fail(`Workspace already exists at ${wsPath}`);
      process.exit(1);
    }

    // Create worktree with branch
    spinner.text = `Creating git worktree...`;
    if (branchExists(branch, gitRoot)) {
      git(`worktree add "${wsPath}" "${branch}"`, gitRoot);
    } else {
      git(`worktree add -b "${branch}" "${wsPath}"`, gitRoot);
    }

    // Create .pcp directory and identity
    spinner.text = `Setting up PCP identity...`;
    const pcpDir = join(wsPath, '.pcp');
    mkdirSync(pcpDir, { recursive: true });

    const identity: WorkspaceIdentity = {
      agentId: options.agent || 'wren',
      context: `workspace-${name}`,
      description: `Workspace: ${name}`,
      workspace: name,
      branch,
      createdAt: new Date().toISOString(),
      createdBy: getCurrentUser(),
    };

    writeFileSync(join(pcpDir, 'identity.json'), JSON.stringify(identity, null, 2));

    spinner.succeed(`Workspace created: ${name}`);
    console.log('');
    console.log(chalk.dim('  Path:   ') + wsPath);
    console.log(chalk.dim('  Branch: ') + branch);
    console.log(chalk.dim('  Agent:  ') + identity.agentId);
    console.log('');
    console.log(chalk.cyan('To start working:'));
    console.log(chalk.dim(`  cd ${wsPath}`));
    console.log(chalk.dim('  claude'));
    console.log('');
    console.log(chalk.cyan('Or use:'));
    console.log(chalk.dim(`  cd $(yarn ws path ${name})`));
  } catch (error) {
    spinner.fail(`Failed to create workspace: ${error}`);
    process.exit(1);
  }
}

/**
 * List all workspaces
 */
function listCommand(): void {
  const gitRoot = findGitRoot();
  const workspaces = listWorkspaces(gitRoot);

  if (workspaces.length === 0) {
    console.log(chalk.yellow('No workspaces found.'));
    console.log(chalk.dim('Create one with: ws create <name>'));
    return;
  }

  console.log(chalk.bold('\nPCP Workspaces:\n'));

  for (const ws of workspaces) {
    console.log(chalk.cyan(`  ${ws.name}`));
    console.log(chalk.dim(`    Path:   ${ws.path}`));
    console.log(chalk.dim(`    Branch: ${ws.branch}`));
    if (ws.identity) {
      console.log(chalk.dim(`    Agent:  ${ws.identity.agentId}`));
      if (ws.identity.createdBy) {
        console.log(chalk.dim(`    Owner:  ${ws.identity.createdBy}`));
      }
    }
    console.log('');
  }
}

/**
 * Remove a workspace (keeps branch)
 */
async function removeWorkspace(name: string): Promise<void> {
  const spinner = ora(`Removing workspace: ${name}`).start();

  try {
    const gitRoot = findGitRoot();
    const wsPath = getWorkspacePath(gitRoot, name);

    if (!existsSync(wsPath)) {
      spinner.fail(`Workspace not found: ${name}`);
      process.exit(1);
    }

    git(`worktree remove "${wsPath}"`, gitRoot);
    spinner.succeed(`Workspace removed: ${name}`);
    console.log(chalk.dim('  Branch kept for PR. Use "ws clean" to also delete branch.'));
  } catch (error) {
    spinner.fail(`Failed to remove workspace: ${error}`);
    process.exit(1);
  }
}

/**
 * Clean a workspace (remove worktree and delete branch)
 */
async function cleanWorkspace(name: string): Promise<void> {
  const spinner = ora(`Cleaning workspace: ${name}`).start();

  try {
    const gitRoot = findGitRoot();
    const wsPath = getWorkspacePath(gitRoot, name);
    const branch = `workspace/${name}`;

    // Remove worktree if exists
    if (existsSync(wsPath)) {
      spinner.text = 'Removing worktree...';
      git(`worktree remove "${wsPath}" --force`, gitRoot);
    }

    // Delete branch if exists
    if (branchExists(branch, gitRoot)) {
      spinner.text = 'Deleting branch...';
      git(`branch -D "${branch}"`, gitRoot);
    }

    spinner.succeed(`Cleaned workspace: ${name}`);
  } catch (error) {
    spinner.fail(`Failed to clean workspace: ${error}`);
    process.exit(1);
  }
}

/**
 * Show status of all workspaces
 */
function statusCommand(): void {
  const gitRoot = findGitRoot();
  const workspaces = listWorkspaces(gitRoot);

  console.log(chalk.bold('\nWorkspace Status:\n'));

  // Main repo status
  console.log(chalk.cyan(`  main (${gitRoot})`));
  try {
    const status = git('status --short', gitRoot);
    if (status) {
      for (const line of status.split('\n')) {
        console.log(chalk.dim(`    ${line}`));
      }
    } else {
      console.log(chalk.green('    Clean'));
    }
  } catch {
    console.log(chalk.red('    Error getting status'));
  }
  console.log('');

  // Workspace status
  for (const ws of workspaces) {
    console.log(chalk.cyan(`  ${ws.name} (${ws.branch})`));
    try {
      const status = git('status --short', ws.path);
      if (status) {
        for (const line of status.split('\n')) {
          console.log(chalk.dim(`    ${line}`));
        }
      } else {
        console.log(chalk.green('    Clean'));
      }
    } catch {
      console.log(chalk.red('    Error getting status'));
    }
    console.log('');
  }
}

/**
 * Output workspace path (for use with cd)
 */
function pathCommand(name: string): void {
  const gitRoot = findGitRoot();
  const wsPath = getWorkspacePath(gitRoot, name);

  if (!existsSync(wsPath)) {
    console.error(`Workspace not found: ${name}`);
    process.exit(1);
  }

  // Just output the path for use with cd
  console.log(wsPath);
}

// ============================================================================
// CLI Setup
// ============================================================================

program
  .name('ws')
  .description('PCP Workspaces - Orchestrate parallel development')
  .version(VERSION);

program
  .command('create <name>')
  .description('Create a new workspace with git worktree')
  .option('-a, --agent <agent>', 'Agent ID for this workspace', 'wren')
  .action(createWorkspace);

program
  .command('list')
  .alias('ls')
  .description('List all workspaces')
  .action(listCommand);

program
  .command('remove <name>')
  .alias('rm')
  .description('Remove a workspace (keeps branch for PR)')
  .action(removeWorkspace);

program
  .command('clean <name>')
  .description('Remove workspace and delete branch')
  .action(cleanWorkspace);

program
  .command('status')
  .alias('st')
  .description('Show git status of all workspaces')
  .action(statusCommand);

program
  .command('path <name>')
  .description('Output workspace path (for use with cd)')
  .action(pathCommand);

program.parse();

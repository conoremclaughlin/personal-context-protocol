# @personal-context/cli

Command-line interface for Personal Context Protocol (PCP).

## Installation

```bash
# From the monorepo root
yarn install

# Use via yarn
yarn cli <command>
yarn ws <command>
```

## Commands

### Workspace Management (`ws` / `workspace`)

Manage git worktrees for parallel development with PCP identity.

```bash
# Create a workspace
yarn ws create <name> [options]
  -i, --identity <agent>  Agent ID for this workspace (default: wren)
  -p, --purpose <desc>    Description/purpose of the workspace
  -b, --branch <branch>   Custom branch name (default: workspace/<name>)

# Examples
yarn ws create feat-auth                                  # Creates workspace/feat-auth branch
yarn ws create myra --identity myra --branch myra/main   # Custom agent and branch
yarn ws create bugfix --purpose "Fix login issue"

# List all workspaces
yarn ws list
yarn ws ls

# Show git status of all workspaces
yarn ws status
yarn ws st

# Remove workspace (keeps branch for PR)
yarn ws remove <name>
yarn ws rm <name>

# Remove workspace AND delete branch
yarn ws clean <name>

# Get workspace path
yarn ws path <name>

# Change to workspace directory
eval $(yarn ws cd <name>)
```

### Workspace Naming Convention

Workspaces are created as sibling directories to the main repo:

```
~/ws/
  personal-context-protocol/          # Main repo
  personal-context-protocol--feat-x/  # Workspace for feat-x
  personal-context-protocol--myra/    # Myra's workspace
```

The prefix is derived from the repo folder name, so it works regardless of how users clone the repo.

### Agent Commands (`agent`)

Interact with PCP agents.

```bash
# Trigger an agent to wake up
yarn cli agent trigger <id> [options]
  -m, --message <msg>      Message to include
  -p, --priority <level>   Priority (low, normal, high, urgent)

# Check agent status
yarn cli agent status [id]   # All agents if no ID

# Check agent inbox
yarn cli agent inbox [id]

# List known agents
yarn cli agent list
yarn cli agent ls
```

### Session Commands (`session`)

Manage PCP sessions.

```bash
# List recent sessions
yarn cli session list [options]
  -a, --agent <id>   Filter by agent
  -l, --limit <n>    Number of sessions (default: 10)

# Show session details
yarn cli session show <id>

# Resume a session
yarn cli session resume <id>

# End a session
yarn cli session end [id]
```

## Workspace Identity

Each workspace has a `.pcp/identity.json` file:

```json
{
  "agentId": "wren",
  "context": "workspace-feat-auth",
  "description": "Implementing authentication",
  "workspace": "feat-auth",
  "branch": "workspace/feat-auth",
  "createdAt": "2026-02-05T...",
  "createdBy": "user@example.com"
}
```

This identity is used by the PCP CLI to:
- Inject agent identity into Claude Code sessions
- Track which agent is working in which workspace
- Enable parallel development with multiple agents

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PCP_SERVER_URL` | PCP server URL | `http://localhost:3001` |
| `AGENT_ID` | Override agent identity | (from identity.json) |

## Development

```bash
# Build
yarn workspace @personal-context/cli build

# Test
yarn workspace @personal-context/cli test

# Type check
yarn workspace @personal-context/cli type-check
```

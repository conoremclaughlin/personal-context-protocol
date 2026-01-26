# Personal Context Protocol

> Be known to your AI compatriots

A personal Model Context Protocol (MCP) server that manages your context across different messaging services and agents. This allows AI companions to easily access and manage your links, notes, tasks, reminders, and conversations through a standardized protocol.

**The key insight**: AI assistants become dramatically more useful when they "know you" - when they have access to your saved links, notes, tasks, and conversation history across every platform you use.

## Features

- **MCP Server**: Exposes tools for AI agents to interact with your personal context
- **Link Management**: Save, search, and tag URLs from any platform
- **Note Taking**: Create and search notes with full-text search
- **Task Management**: Create and manage tasks with priorities and due dates
- **Reminder System**: Set reminders with recurrence support
- **Conversation Storage**: Store and retrieve conversation history
- **Universal Search**: Search across all your personal context
- **Multi-Platform Messaging**: Telegram, WhatsApp, Discord, Slack, Signal, iMessage via [Clawdbot](https://github.com/clawdbot/clawdbot)
- **Semantic Search**: Vector embeddings with Voyage AI and pgvector
- **Flexible User Identity**: Look up users by email, phone, platform ID, or UUID

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Telegram │ WhatsApp │ Discord │ Slack │ Signal │ Claude Code  │
└─────────────────────────┬───────────────────────────────────────┘
                          │
            ┌─────────────▼─────────────┐
            │    Clawdbot Bridge        │
            │  (Message Normalization)  │
            └─────────────┬─────────────┘
                          │
            ┌─────────────▼─────────────┐
            │    MCP Server + Tools     │
            └─────────────┬─────────────┘
                          │
            ┌─────────────▼─────────────┐
            │   Supabase (PostgreSQL)   │
            │   + pgvector + RLS        │
            └───────────────────────────┘
```

- **Monorepo**: Yarn workspaces with packages for API and shared utilities
- **MCP Server**: Built with `@modelcontextprotocol/sdk`
- **Database**: Supabase (PostgreSQL) with Row Level Security and pgvector
- **Messaging**: Multi-platform via Clawdbot (Telegram, WhatsApp, Discord, Slack, Signal, iMessage)
- **AI Layer**: Claude Code (recommended), Anthropic API, or other providers

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed architecture documentation.

## Cost Model

This system is designed to be incredibly cost-effective:

| Component | Cost |
|-----------|------|
| Supabase (database) | Free tier generous, ~$5/mo for moderate use |
| Claude Pro subscription | $20/mo (your existing subscription) |
| Clawdbot | Free (open source) |
| **Total** | **~$5/mo on top of Claude Pro** |

The key insight is using **Claude Code** as your AI layer - it can directly access MCP tools with your existing subscription. No per-message API costs!

## Getting Started

### Prerequisites

- Node.js 18+
- Yarn 1.22+
- Supabase account (or local Supabase setup)
- Telegram Bot Token (optional, for Telegram integration)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/personal-context-protocol.git
cd personal-context-protocol
```

2. Install dependencies:
```bash
yarn install
```

3. Set up environment variables:
```bash
cp packages/api/.env.example packages/api/.env
```

Edit `packages/api/.env` with your configuration:
```env
# Database - Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key

# MCP Server
MCP_TRANSPORT=stdio  # stdio or http

# Authentication
JWT_SECRET=your-secret-key-min-32-chars
```

4. Set up Supabase database:
   - Create a new Supabase project
   - Run the migration: `supabase/migrations/001_initial_schema.sql`
   - Or use Supabase CLI:
```bash
supabase db push
```

### Running the Server

Development mode with stdio transport (for Claude Desktop):
```bash
yarn dev
```

Build for production:
```bash
yarn build
yarn start
```

## Using with Claude Desktop

To use this MCP server with Claude Desktop, add it to your Claude Desktop configuration:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "personal-context": {
      "command": "node",
      "args": ["/path/to/personal-context-protocol/packages/api/dist/index.js"],
      "env": {
        "SUPABASE_URL": "https://your-project.supabase.co",
        "SUPABASE_ANON_KEY": "your-anon-key",
        "SUPABASE_SERVICE_KEY": "your-service-key",
        "JWT_SECRET": "your-secret-key",
        "MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

Restart Claude Desktop and you should see the personal context tools available!

## Available MCP Tools

### Link Management
- `save_link`: Save a URL with metadata and tags
- `search_links`: Search saved links by query, tags, or date
- `tag_link`: Add or remove tags from a link

### User Identification

All tools support flexible user identification - you don't need to know the user's UUID:

- `userId`: Direct UUID lookup
- `email`: Account email address
- `platform` + `platformId`: Platform-specific ID (e.g., `telegram` + `123456789`)
- `phone`: E.164 format phone number

### (More tools coming soon)
- Note management
- Task management
- Reminders
- Context search

## Multi-Platform Messaging (Clawdbot)

This project uses [Clawdbot](https://github.com/clawdbot/clawdbot) as a git submodule for multi-platform messaging support. Clawdbot handles the complexity of integrating with:

- **Telegram** (grammY)
- **WhatsApp** (Baileys)
- **Discord** (discord.js)
- **Slack** (Bolt)
- **Signal** (signal-cli)
- **iMessage** (BlueBubbles)

### How It Works

1. Messages arrive through any platform via Clawdbot
2. Our **bridge layer** normalizes the message format
3. **Content extraction** identifies links, commands, notes
4. **Data adapter** saves context to Supabase
5. User gets confirmation across any platform

### Commands (via Messaging)

```
/save <url>              # Save a link
/note <text>             # Create a note
/task <title>            # Create a task
/remind <message> in 1h  # Set a reminder
/links                   # List recent links
/search <query>          # Search your context
```

### Updating Clawdbot

```bash
git submodule update --remote packages/clawdbot
```

## Project Structure

```
personal-context-protocol/
├── packages/
│   ├── api/                      # Main API server
│   │   ├── src/
│   │   │   ├── channels/         # Platform integrations (adapter, bridge)
│   │   │   ├── config/           # Configuration and environment
│   │   │   ├── data/             # Data layer (composer, repositories, models)
│   │   │   │   ├── models/       # Type definitions
│   │   │   │   ├── repositories/ # Database operations
│   │   │   │   └── supabase/     # Supabase client and types
│   │   │   ├── mcp/              # MCP server and tools
│   │   │   ├── services/         # Business logic (user resolver, etc.)
│   │   │   ├── utils/            # Shared utilities
│   │   │   └── index.ts          # Main entry point
│   │   └── package.json
│   └── clawdbot/                 # Git submodule - messaging gateway
│       └── (see clawdbot repo)   # Telegram, WhatsApp, Discord, Slack, etc.
├── supabase/
│   └── migrations/               # Database migrations
├── ARCHITECTURE.md               # Detailed architecture docs
├── CLAUDE.md                     # Agent guidelines
└── README.md                     # This file
```

## Database Schema

The system uses the following main tables:
- `users` - User profiles and preferences
- `links` - Saved URLs with metadata
- `notes` - Personal notes
- `tasks` - Task management
- `conversations` - Chat conversations
- `messages` - Individual messages
- `reminders` - Scheduled reminders

All tables have Row Level Security (RLS) enabled for data isolation.

## Development

### Building
```bash
yarn build
```

### Type Checking
```bash
yarn type-check
```

### Linting
```bash
yarn lint
```

## Roadmap

- [x] MCP server with stdio transport
- [x] Link management tools
- [x] Supabase database with RLS
- [x] pgvector for semantic search
- [x] Voyage AI embeddings (1024 dimensions)
- [x] Flexible user identification (email, phone, platform ID)
- [x] Clawdbot integration (multi-platform messaging)
- [x] Channel adapter and bridge architecture
- [ ] Note management tools (in progress)
- [ ] Task management tools (in progress)
- [ ] Reminder tools (in progress)
- [ ] Context search tools
- [ ] HTTP transport for cloud deployment
- [ ] REST API
- [ ] Web frontend (Next.js)
- [ ] Browser extension
- [ ] Mobile app

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details

## Acknowledgments

- Built with [Model Context Protocol](https://modelcontextprotocol.io)
- Powered by [Supabase](https://supabase.com)
- Inspired by the need for unified personal context across AI agents

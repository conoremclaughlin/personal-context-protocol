# Personal Context Protocol - Architecture

## Overview

The Personal Context Protocol (PCP) is a system designed to capture, store, and surface your personal context (links, notes, tasks, reminders, conversations) across any AI interface. The key insight is that AI assistants become dramatically more useful when they "know you" - when they have access to your saved links, notes, tasks, and conversation history.

## Core Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         USER INTERFACES                                  │
├─────────────┬─────────────┬─────────────┬─────────────┬────────────────┤
│  Telegram   │  WhatsApp   │   Discord   │    Slack    │  Claude Code   │
│    Bot      │    Bot      │     Bot     │     Bot     │    (Direct)    │
└──────┬──────┴──────┬──────┴──────┬──────┴──────┬──────┴───────┬────────┘
       │             │             │             │              │
       └─────────────┴─────────────┴─────────────┴──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │     CLAWDBOT BRIDGE         │
                    │  (Message Normalization)    │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │    CHANNEL ADAPTER          │
                    │  (Context Extraction)       │
                    │  - URL detection            │
                    │  - Command parsing          │
                    │  - Note extraction          │
                    │  - Task detection           │
                    │  - Reminder parsing         │
                    └──────────────┬──────────────┘
                                   │
       ┌───────────────────────────┼───────────────────────────┐
       │                           │                           │
┌──────▼──────┐          ┌────────▼────────┐          ┌───────▼───────┐
│  MCP SERVER │          │   DATA LAYER    │          │   AI LAYER    │
│  (Tools)    │◄────────►│  (Supabase)     │◄────────►│ (Claude API)  │
└─────────────┘          └─────────────────┘          └───────────────┘
```

## Why Clawdbot?

[Clawdbot](https://github.com/clawdbot/clawdbot) is an open-source multi-platform messaging gateway that handles the complexity of integrating with various messaging platforms:

- **Telegram** (grammY)
- **WhatsApp** (Baileys/WPP)
- **Discord** (discord.js)
- **Slack** (Bolt)
- **Signal** (signal-cli)
- **iMessage** (BlueBubbles)
- **Matrix** (matrix-js-sdk)
- **MS Teams**

Instead of building and maintaining integrations for each platform, we leverage clawdbot's mature, battle-tested implementations as a **submodule**. This gives us:

1. **Immediate multi-platform support** - All platforms clawdbot supports work out of the box
2. **Maintained integrations** - Platform API changes are handled upstream
3. **Proven architecture** - Plugin system, message normalization, access control
4. **Focus on value** - We focus on personal context, not messaging infrastructure

## The Bridge Pattern

The integration uses a **bridge pattern** that:

1. **Intercepts messages** from clawdbot's normalized context
2. **Extracts personal context** (links, notes, tasks, reminders)
3. **Stores context** in Supabase via our data layer
4. **Optionally augments** AI responses with saved context

```typescript
// In clawdbot's message handler:
const result = await bridge.processContext(ctxPayload);

// Context is now saved, optionally inform the user
if (result.saved.links > 0) {
  // "Saved 3 links to your personal context"
}
```

## Data Flow

### Inbound (User → System)

1. User sends message on any platform (Telegram, WhatsApp, etc.)
2. Clawdbot receives and normalizes the message
3. Bridge converts to `InboundMessage` format
4. Extractor identifies content (URLs, commands, etc.)
5. Adapter saves extracted context to Supabase
6. (Optional) Context augments AI response

### Outbound (System → User)

1. AI generates response (via Claude API or Claude Code)
2. Response may include saved context
3. Clawdbot delivers to original platform

## User Identification

Users can be identified across platforms through:

1. **User ID** - Direct UUID lookup
2. **Email** - Account-linked email
3. **Platform + Platform ID** - e.g., `telegram:123456789`
4. **Phone Number** - E.164 format

This enables cross-platform context - a link saved on Telegram is available when chatting on WhatsApp.

## AI Integration

### Claude Code Integration (Recommended)

The most powerful integration is using this with Claude Code. Since Claude Code has full access to your codebase and tools, you can:

1. **Use your existing Claude subscription** - No additional AI API costs
2. **Leverage Claude Code's capabilities** - File access, code execution, tool use
3. **Direct MCP tool access** - Claude Code can directly call MCP tools

This model enables an incredibly cost-effective personal AI assistant:
- ~$5/month for Supabase (generous free tier)
- Your existing Claude Pro subscription
- No per-message API costs

### Standalone API Integration

For platforms without Claude Code access:

1. **Anthropic API** - Direct Claude API calls
2. **OpenAI API** - GPT-4 integration
3. **Local Models** - Ollama, llama.cpp

## Key Design Decisions

### 1. Submodule vs. Fork

We use clawdbot as a **git submodule** rather than forking because:
- Updates flow naturally via `git submodule update`
- Clear separation of concerns
- We can contribute improvements upstream
- No maintenance burden for messaging infrastructure

### 2. Bridge Pattern vs. Deep Integration

We use a **bridge/adapter pattern** rather than modifying clawdbot internals:
- Clawdbot remains unmodified
- Our code is isolated and testable
- Easy to upgrade clawdbot versions
- Works with any clawdbot-compatible bot

### 3. Supabase for Storage

Supabase provides:
- PostgreSQL with pgvector for semantic search
- Row Level Security for data isolation
- Realtime subscriptions for live updates
- Edge Functions for serverless compute
- Authentication built-in

### 4. MCP as the API

Model Context Protocol (MCP) provides:
- Standard tool interface for AI agents
- Works with Claude Desktop, Claude Code, and other MCP clients
- Extensible and well-documented
- Future-proof as MCP adoption grows

## Future Architecture

### Planned Enhancements

1. **Semantic Search** - Voyage AI embeddings with pgvector
2. **Context Augmentation** - Auto-inject relevant saved context into AI prompts
3. **Cross-Platform Identity** - Unified identity across messaging platforms
4. **Web/Mobile Apps** - Direct access to saved context
5. **Browser Extension** - One-click save from any webpage

### Scaling Considerations

For high-volume deployments:
- Supabase can be replaced with any PostgreSQL + vector store
- Message queue (Redis/BullMQ) for async processing
- CDN for media storage
- Edge deployment for low latency

## Reminder System

The heartbeat service manages scheduled reminders stored in the `scheduled_reminders` table. It runs every 5 minutes via `node-cron` in development and `pg_cron` in production.

### Delivery Flow

1. **Heartbeat tick** — fetches due reminders (`next_run_at <= now`, `status = 'active'`)
2. **Quiet hours check** — skips delivery if the user's `heartbeat_state` indicates quiet hours
3. **Delivery routing:**
   - **Direct channel** — if a delivery channel (e.g., Telegram) is registered in the same process, sends the message directly
   - **Agent trigger fallback** — if no direct channel exists (e.g., Telegram listener lives in the PCP server, not the agent process), triggers the agent via the Agent Gateway. The agent processes the reminder (checks emails, calendar, etc.) and responds via `send_response`, which routes through the Channel Gateway to the user
4. **State update** — increments `run_count`, calculates `next_run_at` using `cron-parser`, or marks completed for one-time reminders

### Cron Scheduling

Next-run times are calculated using the `cron-parser` library (`CronExpressionParser.parse`), which correctly handles complex patterns like `0 16-23,0-7 * * *` (ranges, lists, step values). Cron expressions are evaluated in the server's timezone by default.

## Security Model

### Data Isolation
- Row Level Security (RLS) on all tables
- Users can only access their own data
- Service key only used server-side

### Authentication
- Platform-based identity verification
- JWT tokens for API access
- Optional 2FA support

### Privacy
- All data encrypted at rest (Supabase)
- HTTPS only
- No third-party data sharing
- User-controlled data deletion

## Getting Started

See [README.md](./README.md) for installation and usage instructions.

## Contributing

We welcome contributions! Areas of interest:
- New platform integrations
- Improved context extraction
- Better semantic search
- UI/UX improvements
- Documentation

## License

MIT License - see [LICENSE](./LICENSE) for details.

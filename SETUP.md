# Setup Guide

## What's Been Implemented

### Phase 1: Foundation ✅
- [x] Yarn workspaces monorepo structure
- [x] TypeScript configuration (root + packages)
- [x] ESLint and Prettier setup
- [x] Environment configuration with validation
- [x] Logging system with Winston

### Phase 2: Database Layer ✅
- [x] Supabase schema with all tables
- [x] Row Level Security (RLS) policies
- [x] Full-text search indexes
- [x] Data models and TypeScript types
- [x] Repository pattern for all entities
- [x] Data composer for dependency injection

### Phase 3: MCP Server ✅
- [x] MCP server setup with stdio transport
- [x] Link management tools (save_link, search_links, tag_link)
- [x] Tool registration system
- [x] Error handling and logging
- [x] Graceful shutdown

## Next Steps

### Immediate Priorities
1. **Test the MCP Server**
   - Create a Supabase project
   - Run database migrations
   - Configure environment variables
   - Run the server with `yarn dev`

2. **Add More MCP Tools**
   - Note management tools
   - Task management tools
   - Reminder tools
   - Context search tools

3. **Telegram Bot Integration**
   - Create Telegram bot with BotFather
   - Implement command handlers
   - Add conversation logging
   - Connect to data layer

### Future Development
4. **REST API**
   - Express server setup
   - Authentication middleware
   - CRUD endpoints
   - API documentation

5. **Testing**
   - Unit tests for repositories
   - Integration tests for MCP tools
   - E2E tests

6. **Deployment**
   - Docker containerization
   - Cloud deployment (Railway/Render)
   - HTTP transport for MCP
   - Monitoring and logging

## Quick Start

### 1. Install Dependencies
```bash
yarn install
```

### 2. Create Supabase Project
1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Copy the project URL and API keys

### 3. Run Database Migrations
In your Supabase project dashboard:
1. Go to SQL Editor
2. Run the migration from `supabase/migrations/001_initial_schema.sql`
3. (Optional) Run the seed data from `supabase/seed.sql`

### 4. Configure Environment
```bash
cp packages/api/.env.example packages/api/.env
```

Edit `.env` with your credentials:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_KEY=your-service-key-here
JWT_SECRET=generate-a-random-32-char-secret
```

### 5. Run the Server
```bash
yarn dev
```

The MCP server will start with stdio transport, ready to connect to Claude Desktop!

### 6. Test with Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "personal-context": {
      "command": "node",
      "args": ["--loader", "./.yarn/__virtual__/tsx-virtual-*/0/cache/tsx-npm-4.7.0-*/node_modules/tsx/dist/cli.mjs", "packages/api/src/index.ts"],
      "cwd": "/Users/conormclaughlin/ws/personal-context-protocol",
      "env": {
        "SUPABASE_URL": "your-supabase-url",
        "SUPABASE_ANON_KEY": "your-anon-key",
        "SUPABASE_SERVICE_KEY": "your-service-key",
        "JWT_SECRET": "your-secret",
        "MCP_TRANSPORT": "stdio",
        "NODE_ENV": "production"
      }
    }
  }
}
```

Or for a simpler approach after building:
```json
{
  "mcpServers": {
    "personal-context": {
      "command": "node",
      "args": ["packages/api/dist/index.js"],
      "cwd": "/Users/conormclaughlin/ws/personal-context-protocol",
      "env": {
        "SUPABASE_URL": "your-supabase-url",
        "SUPABASE_ANON_KEY": "your-anon-key",
        "SUPABASE_SERVICE_KEY": "your-service-key",
        "JWT_SECRET": "your-secret",
        "MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

## Testing MCP Tools

Once connected to Claude Desktop, you can test the tools:

1. **Save a Link**:
   "Save this link for me: https://modelcontextprotocol.io with title 'MCP Docs' and tags 'documentation, mcp'"

2. **Search Links**:
   "Search my saved links for 'mcp'"

3. **Add Tags**:
   "Add the tag 'important' to link [link-id]"

## Troubleshooting

### TypeScript Build Issues
If you encounter module resolution issues, run:
```bash
yarn dlx @yarnpkg/sdks vscode
```

### Database Connection Issues
- Verify your Supabase URL and keys in `.env`
- Check that RLS policies are set up correctly
- Ensure migrations have been run

### MCP Server Not Showing in Claude Desktop
- Restart Claude Desktop after config changes
- Check the MCP server logs in Claude Desktop
- Verify the command and args in the config
- Make sure environment variables are set

## Project Structure

```
personal-context-protocol/
├── packages/
│   ├── api/                    # Main API server
│   │   ├── src/
│   │   │   ├── config/         # Environment and constants
│   │   │   ├── data/           # Data layer
│   │   │   │   ├── composer.ts # Data composer (DI)
│   │   │   │   ├── models/     # TypeScript models
│   │   │   │   ├── repositories/ # Database repositories
│   │   │   │   └── supabase/   # Supabase client and types
│   │   │   ├── mcp/            # MCP server
│   │   │   │   ├── server.ts   # MCP server setup
│   │   │   │   └── tools/      # MCP tool implementations
│   │   │   ├── utils/          # Utilities
│   │   │   └── index.ts        # Main entry point
│   │   └── logs/               # Log files
│   └── shared/                 # Shared types
└── supabase/                   # Database migrations
```

## Available MCP Tools

### Link Management
- **save_link**: Save a URL with metadata and tags
  - Parameters: userId, url, title?, description?, tags?, source?
  - Example: Save any link from any platform

- **search_links**: Search saved links
  - Parameters: userId, query?, tags?, startDate?, endDate?, limit?
  - Example: Find links by text or tags

- **tag_link**: Manage link tags
  - Parameters: userId, linkId, addTags?, removeTags?
  - Example: Organize links with tags

## Resources

- [Model Context Protocol Docs](https://modelcontextprotocol.io)
- [Supabase Documentation](https://supabase.com/docs)
- [Yarn 4 Documentation](https://yarnpkg.com)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

# Quick Start Guide

## Your Configuration ✅

Your environment is already set up with:
- ✅ Supabase URL configured
- ✅ Supabase keys (new naming convention)
- ✅ Telegram Bot Token (Myra)
- ✅ Telegram Benson Bot Token
- ✅ JWT Secret configured

## Step 1: Set Up Supabase Database

### Option A: Using Supabase Dashboard (Recommended)
1. Go to [your Supabase project](https://xzcdodccpjmveubfitvo.supabase.co)
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Copy and paste the entire contents of `supabase/migrations/001_initial_schema.sql`
5. Click **Run** to execute the migration
6. (Optional) Run `supabase/seed.sql` for test data

### Option B: Using Supabase CLI
```bash
# Install Supabase CLI (if not already installed)
npm install -g supabase

# Link to your project
supabase link --project-ref xzcdodccpjmveubfitvo

# Push migration
supabase db push
```

## Step 2: Test Your Setup

Run the connection test to verify everything is working:

```bash
yarn test:connection
```

You should see:
```
✅ Environment variables loaded
✅ Data composer initialized
✅ Database connection healthy
🎉 All tests passed!
```

## Step 3: Start the MCP Server

```bash
yarn dev
```

You should see:
```
Starting Personal Context Protocol server...
Environment: development
MCP Transport: stdio
Database connection healthy
MCP Server started with stdio transport
Personal Context Protocol server is running!
```

## Step 4: Connect to Claude Desktop

Create or edit your Claude Desktop config file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

Add this configuration:

```json
{
  "mcpServers": {
    "personal-context": {
      "command": "node",
      "args": [
        "--loader",
        "tsx/esm",
        "packages/api/src/index.ts"
      ],
      "cwd": "/Users/conormclaughlin/ws/personal-context-protocol",
      "env": {
        "SUPABASE_URL": "https://xzcdodccpjmveubfitvo.supabase.co",
        "SUPABASE_SECRET_KEY": "sb_secret_BvLVvt_WFjI8tMP6RH0PjA_29CY_0ql",
        "JWT_SECRET": "omgXhKnG1nVNCT7srLAb1A_top_secret_JWUjaslFAuiawe4nW",
        "MCP_TRANSPORT": "stdio",
        "NODE_ENV": "production"
      }
    }
  }
}
```

**Important:** Restart Claude Desktop after saving the config!

## Step 5: Test with Claude

Once Claude Desktop restarts, you should see the personal context tools available. Try these commands:

### Save a Link
```
"Save this link for me: https://modelcontextprotocol.io with title 'MCP Documentation' and tags: documentation, mcp, api"
```

### Search Links
```
"Search my saved links for 'mcp'"
```

### Add Tags
```
"Add the tags 'important' and 'reference' to my MCP link"
```

## Troubleshooting

### Connection Test Fails
1. **Check Supabase credentials** in `packages/api/.env`
2. **Verify migration was run** in Supabase SQL Editor
3. **Test Supabase connection** in the dashboard

### Claude Desktop Not Showing Tools
1. **Restart Claude Desktop** completely (Quit and reopen)
2. **Check MCP logs** in Claude Desktop settings
3. **Verify the cwd path** is correct in the config
4. **Try running manually** with `yarn dev` to see errors

### Server Won't Start
1. **Run** `yarn test:connection` to identify the issue
2. **Check logs** in `packages/api/logs/`
3. **Verify all dependencies** are installed with `yarn install`

## What's Available Now

### MCP Tools (Ready)
- ✅ **save_link**: Save URLs with metadata and tags
- ✅ **search_links**: Search by query, tags, or date range
- ✅ **tag_link**: Add/remove tags from links

### Coming Soon
- 📝 Note management tools
- ✓ Task management tools
- ⏰ Reminder tools
- 🔍 Universal context search
- 💬 Telegram bot integration

## Using Multiple Bots

You have two Telegram bots configured:

1. **Myra Bot** (`TELEGRAM_BOT_TOKEN`)
   - Primary bot for personal use

2. **Benson Bot** (`TELEGRAM_BENSON_BOT_TOKEN`)
   - Secondary bot (perhaps for work?)

To use them, you'll need to implement the Telegram integration (coming in next phase).

## Development Commands

```bash
# Run with hot reload
yarn dev

# Test database connection
yarn test:connection

# Build for production
yarn build

# Start production server
yarn start

# Type checking
yarn type-check

# Linting
yarn lint
```

## Need Help?

- 📖 See [SETUP.md](./SETUP.md) for detailed setup instructions
- 📊 See [STATUS.md](./STATUS.md) for project status
- 🐛 Report issues: [GitHub Issues](https://github.com/yourusername/personal-context-protocol/issues)

## Success! 🎉

Your personal context protocol is now running! You can:

1. Save any link from anywhere through Claude
2. Search your entire link library
3. Organize with tags
4. Access from any Claude-enabled platform

The foundation is ready for notes, tasks, reminders, and Telegram integration!

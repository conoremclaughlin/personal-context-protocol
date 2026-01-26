#!/usr/bin/env npx tsx
/**
 * Session Management CLI
 *
 * List and manage active Claude Code sessions.
 * Provides commands to attach to running sessions from the terminal.
 *
 * Usage:
 *   npx tsx src/scripts/sessions.ts           # List all active sessions
 *   npx tsx src/scripts/sessions.ts attach    # Attach to most recent session
 *   npx tsx src/scripts/sessions.ts attach <id> # Attach to specific session
 */

import { getDataComposer } from '../data/composer';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'list';

  const dataComposer = await getDataComposer();
  const sessionsRepo = dataComposer.repositories.agentSessions;

  switch (command) {
    case 'list': {
      const sessions = await sessionsRepo.listAllActive();

      if (sessions.length === 0) {
        console.log('\nNo active sessions found.\n');
        console.log('Start the server with: yarn server');
        console.log('Then send a message via Telegram to create a session.\n');
        return;
      }

      console.log('\n' + '='.repeat(70));
      console.log(' Active Claude Code Sessions');
      console.log('='.repeat(70));

      for (const session of sessions) {
        console.log(`\n  ID: ${session.session_id}`);
        console.log(`  Key: ${session.session_key || 'none'}`);
        console.log(`  Platform: ${session.platform || 'unknown'}`);
        console.log(`  Model: ${session.model || 'default'}`);
        console.log(`  Status: ${session.status}`);
        console.log(`  Messages: ${session.message_count}`);
        console.log(`  Cost: $${Number(session.total_cost).toFixed(4)}`);
        console.log(`  Last Activity: ${new Date(session.last_activity_at).toLocaleString()}`);

        // Build attach command
        let attachCmd = `claude --resume ${session.session_id}`;
        if (session.mcp_config_path) {
          attachCmd += ` --mcp-config "${session.mcp_config_path}"`;
        }
        if (session.working_directory) {
          console.log(`  Working Dir: ${session.working_directory}`);
        }
        console.log(`\n  Attach command:`);
        console.log(`    ${attachCmd}`);
        console.log('  ' + '-'.repeat(66));
      }

      console.log('\n' + '='.repeat(70));
      console.log('\nTo attach to a session, run the "Attach command" shown above.');
      console.log('Or use: yarn sessions attach [session-id]\n');
      break;
    }

    case 'attach': {
      const sessionId = args[1];
      let session;

      if (sessionId) {
        session = await sessionsRepo.findBySessionId(sessionId);
        if (!session) {
          console.error(`Session not found: ${sessionId}`);
          process.exit(1);
        }
      } else {
        // Get most recent active session
        const sessions = await sessionsRepo.listAllActive();
        if (sessions.length === 0) {
          console.error('No active sessions found.');
          process.exit(1);
        }
        session = sessions[0];
      }

      // Build and print the attach command
      let attachCmd = `claude --resume ${session.session_id}`;
      if (session.mcp_config_path) {
        attachCmd += ` --mcp-config "${session.mcp_config_path}"`;
      }

      console.log('\nAttaching to session:', session.session_key || session.session_id);
      console.log('Run this command:\n');
      console.log(`  ${attachCmd}\n`);

      // If working directory is set, suggest cd
      if (session.working_directory) {
        console.log(`(Make sure you're in the working directory: ${session.working_directory})\n`);
      }

      break;
    }

    case 'end': {
      const sessionId = args[1];
      if (!sessionId) {
        console.error('Usage: sessions end <session-id>');
        process.exit(1);
      }

      const session = await sessionsRepo.findBySessionId(sessionId);
      if (!session) {
        console.error(`Session not found: ${sessionId}`);
        process.exit(1);
      }

      await sessionsRepo.endSession(session.id);
      console.log(`Session ended: ${sessionId}`);
      break;
    }

    case 'cleanup': {
      const days = parseInt(args[1] || '30', 10);
      const count = await sessionsRepo.cleanupOldSessions(days);
      console.log(`Cleaned up ${count} old sessions (older than ${days} days).`);
      break;
    }

    default:
      console.log(`
Session Management CLI

Commands:
  list              List all active sessions (default)
  attach [id]       Show command to attach to session (most recent if no ID)
  end <id>          End a session
  cleanup [days]    Remove ended sessions older than N days (default: 30)

Examples:
  yarn sessions                    # List all sessions
  yarn sessions attach             # Attach to most recent
  yarn sessions attach abc123      # Attach to specific session
  yarn sessions end abc123         # End a session
  yarn sessions cleanup 7          # Clean sessions older than 7 days
`);
  }
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});

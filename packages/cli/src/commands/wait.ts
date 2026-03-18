/**
 * sb wait — Poll for new inbox/thread messages and exit when something arrives.
 *
 * Designed to be run in the background so the SB wakes up when there's
 * new content to process. Works with Claude Code's run_in_background.
 *
 * Usage:
 *   sb wait                              # Wait for any new message
 *   sb wait --thread pr:231              # Wait for activity on a specific thread
 *   sb wait --timeout 300 --interval 15  # Custom timing
 */

import type { Command } from 'commander';
import { PcpClient } from '../lib/pcp-client.js';

interface WaitOptions {
  thread?: string;
  timeout?: string;
  interval?: string;
  agent?: string;
  pending?: boolean;
}

function resolveAgentId(): string {
  return process.env.AGENT_ID || 'wren';
}

export function registerWaitCommand(program: Command): void {
  program
    .command('wait')
    .description('Wait for new inbox or thread messages, then exit with the content')
    .option('-t, --thread <threadKey>', 'Watch a specific thread for new messages')
    .option('--timeout <seconds>', 'Max wait time in seconds (default: 300)', '300')
    .option('--interval <seconds>', 'Poll interval in seconds (default: 15)', '15')
    .option('-a, --agent <agentId>', 'Agent ID (default: from env)')
    .option('--pending', 'Also check pending message queue (for CLI-attached sessions)')
    .action(async (options: WaitOptions) => {
      const timeoutSec = Math.max(10, parseInt(options.timeout || '300', 10));
      const intervalSec = Math.max(5, parseInt(options.interval || '15', 10));
      const agentId = options.agent || resolveAgentId();
      const threadKey = options.thread;

      const pcp = new PcpClient();
      const config = pcp.getConfig();

      if (!config.email) {
        console.error('[sb wait] PCP not configured. Run: sb init');
        process.exit(2);
      }

      const deadline = Date.now() + timeoutSec * 1000;
      const startedAt = new Date().toISOString();

      console.log(
        `[sb wait] Watching ${threadKey ? `thread ${threadKey}` : 'inbox'} for ${agentId} (timeout: ${timeoutSec}s, interval: ${intervalSec}s)`
      );

      // Get baseline counts
      let baselineThreadMessageCount = 0;
      let baselineInboxCount = 0;

      if (threadKey) {
        try {
          const threadResult = (await pcp.callTool('get_thread_messages', {
            email: config.email,
            agentId,
            threadKey,
            markRead: false,
            limit: 1,
          })) as Record<string, unknown>;
          baselineThreadMessageCount = (threadResult.messageCount as number) || 0;
        } catch {
          // Thread may not exist yet — baseline is 0
        }
      } else {
        try {
          const inboxResult = (await pcp.callTool('get_inbox', {
            email: config.email,
            agentId,
            status: 'unread',
            limit: 1,
          })) as Record<string, unknown>;
          baselineInboxCount =
            ((inboxResult.totalUnreadCount as number) ?? (inboxResult.unreadCount as number)) || 0;
        } catch {
          // Baseline is 0
        }
      }

      console.log(
        `[sb wait] Baseline: ${threadKey ? `${baselineThreadMessageCount} messages in thread` : `${baselineInboxCount} unread`}`
      );

      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, intervalSec * 1000));

        try {
          // Check pending queue first (CLI-attached triggers)
          if (options.pending !== false) {
            const pendingResult = (await pcp.callTool('get_pending_messages', {
              channel: 'agent',
              limit: 5,
            })) as Record<string, unknown>;
            const pendingMessages = pendingResult.messages as
              | Array<Record<string, unknown>>
              | undefined;
            if (pendingMessages?.length) {
              console.log(`[sb wait] ${pendingMessages.length} pending trigger message(s) found`);
              for (const msg of pendingMessages) {
                const sender =
                  typeof msg.sender === 'object'
                    ? (msg.sender as Record<string, unknown>).id || 'unknown'
                    : msg.sender || 'unknown';
                const preview = typeof msg.content === 'string' ? msg.content.slice(0, 200) : '';
                console.log(`  from ${sender}: ${preview}`);
              }
              process.exit(0);
            }
          }

          if (threadKey) {
            // Watch specific thread
            const threadResult = (await pcp.callTool('get_thread_messages', {
              email: config.email,
              agentId,
              threadKey,
              markRead: false,
              limit: 5,
              ...(baselineThreadMessageCount > 0 ? {} : {}),
            })) as Record<string, unknown>;

            const currentCount = (threadResult.messageCount as number) || 0;
            if (currentCount > baselineThreadMessageCount) {
              const messages = threadResult.messages as Array<Record<string, unknown>> | undefined;
              const newMessages = messages?.slice(baselineThreadMessageCount) || [];

              console.log(
                `[sb wait] ${currentCount - baselineThreadMessageCount} new message(s) on ${threadKey}`
              );
              for (const msg of newMessages) {
                const sender = msg.senderAgentId || 'unknown';
                const preview = typeof msg.content === 'string' ? msg.content.slice(0, 200) : '';
                console.log(`  from ${sender}: ${preview}`);
              }
              process.exit(0);
            }
          } else {
            // Watch inbox for any new unread
            const inboxResult = (await pcp.callTool('get_inbox', {
              email: config.email,
              agentId,
              status: 'unread',
              limit: 5,
            })) as Record<string, unknown>;

            const currentUnread =
              ((inboxResult.totalUnreadCount as number) ?? (inboxResult.unreadCount as number)) ||
              0;

            if (currentUnread > baselineInboxCount) {
              const messages = inboxResult.messages as Array<Record<string, unknown>> | undefined;
              const threads = inboxResult.threadsWithUnread as
                | Array<Record<string, unknown>>
                | undefined;

              console.log(`[sb wait] ${currentUnread - baselineInboxCount} new unread message(s)`);

              // Show inbox messages
              if (messages?.length) {
                for (const msg of messages.slice(0, 3)) {
                  const sender = msg.senderAgentId || 'unknown';
                  const preview = typeof msg.content === 'string' ? msg.content.slice(0, 150) : '';
                  console.log(`  inbox: from ${sender}: ${preview}`);
                }
              }

              // Show thread unreads
              if (threads?.length) {
                for (const t of threads.slice(0, 3)) {
                  console.log(`  thread ${t.threadKey}: ${t.unreadCount} unread`);
                }
              }

              process.exit(0);
            }
          }

          console.log('[sb wait] No new messages yet...');
        } catch (error) {
          // Silent poll failure — retry on next interval
          const msg = error instanceof Error ? error.message : String(error);
          console.log(`[sb wait] Poll error (will retry): ${msg.slice(0, 100)}`);
        }
      }

      console.error(`[sb wait] Timed out after ${timeoutSec}s with no new messages.`);
      process.exit(1);
    });
}

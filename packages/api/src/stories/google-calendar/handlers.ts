/**
 * Google Calendar MCP Tool Handlers
 *
 * Exposes Google Calendar functionality via MCP tools.
 */

import { z } from 'zod';
import { getGoogleCalendarService } from './service';
import { resolveUserOrThrow } from '../../services/user-resolver';
import { logger } from '../../utils/logger';
import type { DataComposer } from '../../data/composer';

// Shared user identifier schema
const userIdentifierBaseSchema = z.object({
  userId: z.string().uuid().optional().describe('User UUID (if known)'),
  email: z.string().email().optional().describe('User email address'),
  phone: z
    .string()
    .optional()
    .describe('Phone number in E.164 format (e.g., +14155551234)'),
  platform: z
    .enum(['telegram', 'whatsapp', 'discord'])
    .optional()
    .describe('Platform name'),
  platformId: z
    .string()
    .optional()
    .describe('Platform-specific user ID or username'),
});

// Tool result type
type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

// ============================================================================
// Schemas
// ============================================================================

export const listCalendarsSchema = userIdentifierBaseSchema.extend({});

export const listCalendarEventsSchema = userIdentifierBaseSchema.extend({
  startDate: z
    .string()
    .describe('Start of date range (ISO 8601 format, e.g., 2026-01-30T00:00:00Z)'),
  endDate: z
    .string()
    .describe('End of date range (ISO 8601 format, e.g., 2026-02-06T00:00:00Z)'),
  calendarId: z
    .string()
    .optional()
    .describe('Calendar ID to query (default: "primary")'),
  maxResults: z
    .number()
    .optional()
    .default(10)
    .describe('Maximum number of events to return (default: 10)'),
  query: z
    .string()
    .optional()
    .describe('Free text search query to filter events'),
});

export const getCalendarEventSchema = userIdentifierBaseSchema.extend({
  eventId: z.string().describe('The event ID to retrieve'),
  calendarId: z
    .string()
    .optional()
    .describe('Calendar ID containing the event (default: "primary")'),
});

// ============================================================================
// Handlers
// ============================================================================

/**
 * List all calendars accessible by the user
 */
export async function handleListCalendars(
  args: unknown,
  dataComposer: DataComposer
): Promise<ToolResult> {
  const params = listCalendarsSchema.parse(args);
  const { user, resolvedBy } = await resolveUserOrThrow(params, dataComposer);

  const calendarService = getGoogleCalendarService();

  try {
    const calendars = await calendarService.listCalendars(user.id);

    logger.info('Listed calendars', {
      userId: user.id,
      count: calendars.length,
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              success: true,
              user: { id: user.id, resolvedBy },
              calendars,
              count: calendars.length,
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to list calendars', { userId: user.id, error: message });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              success: false,
              error: message,
              hint:
                message.includes('No active google account')
                  ? 'User needs to connect their Google account in the web dashboard'
                  : undefined,
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
}

/**
 * List events within a date range
 */
export async function handleListCalendarEvents(
  args: unknown,
  dataComposer: DataComposer
): Promise<ToolResult> {
  const params = listCalendarEventsSchema.parse(args);
  const { user, resolvedBy } = await resolveUserOrThrow(params, dataComposer);

  const calendarService = getGoogleCalendarService();

  try {
    const events = await calendarService.listEvents(user.id, {
      startDate: params.startDate,
      endDate: params.endDate,
      calendarId: params.calendarId,
      maxResults: params.maxResults,
      query: params.query,
    });

    logger.info('Listed calendar events', {
      userId: user.id,
      calendarId: params.calendarId || 'primary',
      startDate: params.startDate,
      endDate: params.endDate,
      count: events.length,
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              success: true,
              user: { id: user.id, resolvedBy },
              query: {
                startDate: params.startDate,
                endDate: params.endDate,
                calendarId: params.calendarId || 'primary',
                maxResults: params.maxResults,
              },
              events,
              count: events.length,
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to list calendar events', {
      userId: user.id,
      error: message,
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              success: false,
              error: message,
              hint:
                message.includes('No active google account')
                  ? 'User needs to connect their Google account in the web dashboard'
                  : message.includes('calendar.readonly')
                    ? 'User needs to re-authorize Google with Calendar permissions'
                    : undefined,
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
}

/**
 * Get a single event by ID
 */
export async function handleGetCalendarEvent(
  args: unknown,
  dataComposer: DataComposer
): Promise<ToolResult> {
  const params = getCalendarEventSchema.parse(args);
  const { user, resolvedBy } = await resolveUserOrThrow(params, dataComposer);

  const calendarService = getGoogleCalendarService();

  try {
    const event = await calendarService.getEvent(user.id, {
      eventId: params.eventId,
      calendarId: params.calendarId,
    });

    logger.info('Retrieved calendar event', {
      userId: user.id,
      eventId: params.eventId,
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              success: true,
              user: { id: user.id, resolvedBy },
              event,
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to get calendar event', {
      userId: user.id,
      eventId: params.eventId,
      error: message,
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              success: false,
              error: message,
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
}

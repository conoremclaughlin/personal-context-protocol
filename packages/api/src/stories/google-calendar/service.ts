/**
 * Google Calendar Service
 *
 * Handles Google Calendar API interactions using OAuth tokens
 * managed by the OAuthService.
 */

import { google, calendar_v3 } from 'googleapis';
import { getOAuthService } from '../../services/oauth';
import { logger } from '../../utils/logger';
import type {
  CalendarEvent,
  CalendarInfo,
  ListEventsOptions,
  GetEventOptions,
} from './types';

export class GoogleCalendarService {
  private oauthService = getOAuthService();

  /**
   * Get an authenticated Calendar API client for a user
   */
  private async getClient(userId: string): Promise<calendar_v3.Calendar> {
    const accessToken = await this.oauthService.getValidAccessToken(userId, 'google');

    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    return google.calendar({ version: 'v3', auth });
  }

  /**
   * List calendars accessible by the user
   */
  async listCalendars(userId: string): Promise<CalendarInfo[]> {
    const calendar = await this.getClient(userId);

    logger.info('Fetching calendar list', { userId });

    const response = await calendar.calendarList.list({
      maxResults: 100,
    });

    const calendars = response.data.items || [];

    return calendars.map((cal) => ({
      id: cal.id || '',
      summary: cal.summary || '',
      description: cal.description || undefined,
      primary: cal.primary || false,
      accessRole: cal.accessRole || 'reader',
      backgroundColor: cal.backgroundColor || undefined,
      foregroundColor: cal.foregroundColor || undefined,
      timeZone: cal.timeZone || undefined,
    }));
  }

  /**
   * List events within a date range
   */
  async listEvents(
    userId: string,
    options: ListEventsOptions
  ): Promise<CalendarEvent[]> {
    const calendar = await this.getClient(userId);

    const {
      startDate,
      endDate,
      calendarId = 'primary',
      maxResults = 10,
      query,
      singleEvents = true,
      orderBy = 'startTime',
    } = options;

    logger.info('Fetching calendar events', {
      userId,
      calendarId,
      startDate,
      endDate,
      maxResults,
    });

    const response = await calendar.events.list({
      calendarId,
      timeMin: startDate,
      timeMax: endDate,
      maxResults,
      q: query,
      singleEvents,
      orderBy: singleEvents ? orderBy : undefined, // orderBy only works with singleEvents
    });

    const events = response.data.items || [];

    return events.map(this.mapEvent);
  }

  /**
   * Get a single event by ID
   */
  async getEvent(
    userId: string,
    options: GetEventOptions
  ): Promise<CalendarEvent> {
    const calendar = await this.getClient(userId);

    const { calendarId = 'primary', eventId } = options;

    logger.info('Fetching calendar event', { userId, calendarId, eventId });

    const response = await calendar.events.get({
      calendarId,
      eventId,
    });

    return this.mapEvent(response.data);
  }

  /**
   * Map Google Calendar API event to our CalendarEvent type
   */
  private mapEvent(event: calendar_v3.Schema$Event): CalendarEvent {
    return {
      id: event.id || '',
      summary: event.summary || '(No title)',
      description: event.description || undefined,
      start: {
        dateTime: event.start?.dateTime || undefined,
        date: event.start?.date || undefined,
        timeZone: event.start?.timeZone || undefined,
      },
      end: {
        dateTime: event.end?.dateTime || undefined,
        date: event.end?.date || undefined,
        timeZone: event.end?.timeZone || undefined,
      },
      location: event.location || undefined,
      attendees: event.attendees?.map((a) => ({
        email: a.email || '',
        displayName: a.displayName || undefined,
        responseStatus: a.responseStatus || undefined,
        self: a.self || false,
        organizer: a.organizer || false,
      })),
      organizer: event.organizer
        ? {
            email: event.organizer.email || '',
            displayName: event.organizer.displayName || undefined,
            self: event.organizer.self || false,
          }
        : undefined,
      status: event.status || 'confirmed',
      htmlLink: event.htmlLink || '',
      created: event.created || undefined,
      updated: event.updated || undefined,
      recurringEventId: event.recurringEventId || undefined,
      visibility: event.visibility || undefined,
      iCalUID: event.iCalUID || undefined,
    };
  }
}

// Singleton instance
let calendarService: GoogleCalendarService | null = null;

export function getGoogleCalendarService(): GoogleCalendarService {
  if (!calendarService) {
    calendarService = new GoogleCalendarService();
  }
  return calendarService;
}

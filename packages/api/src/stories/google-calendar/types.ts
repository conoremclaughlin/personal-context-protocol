/**
 * Google Calendar Types
 *
 * Type definitions for Calendar API interactions.
 */

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  location?: string;
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus?: string;
    self?: boolean;
    organizer?: boolean;
  }>;
  organizer?: {
    email: string;
    displayName?: string;
    self?: boolean;
  };
  status: string;
  htmlLink: string;
  created?: string;
  updated?: string;
  recurringEventId?: string;
  visibility?: string;
  iCalUID?: string;
}

export interface CalendarInfo {
  id: string;
  summary: string;
  description?: string;
  primary?: boolean;
  accessRole: string;
  backgroundColor?: string;
  foregroundColor?: string;
  timeZone?: string;
}

export interface ListEventsOptions {
  startDate: string; // ISO 8601
  endDate: string; // ISO 8601
  calendarId?: string; // Defaults to 'primary'
  maxResults?: number; // Defaults to 10
  query?: string; // Free text search
  singleEvents?: boolean; // Expand recurring events
  orderBy?: 'startTime' | 'updated';
}

export interface GetEventOptions {
  calendarId?: string;
  eventId: string;
}

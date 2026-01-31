/**
 * Gmail Types
 *
 * Type definitions for Gmail API interactions.
 */

export interface EmailAddress {
  email: string;
  name?: string;
}

export interface EmailAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface Email {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  subject: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  date: string;
  body?: {
    text?: string;
    html?: string;
  };
  attachments?: EmailAttachment[];
  isUnread: boolean;
  isStarred: boolean;
  headers?: Record<string, string>;
}

export interface EmailThread {
  id: string;
  historyId: string;
  messages: Email[];
}

export interface EmailLabel {
  id: string;
  name: string;
  type: 'system' | 'user';
  messagesTotal?: number;
  messagesUnread?: number;
}

export interface ListEmailsOptions {
  maxResults?: number;
  query?: string; // Gmail search query (e.g., "from:john@example.com is:unread")
  labelIds?: string[]; // Filter by labels (e.g., ['INBOX', 'UNREAD'])
  pageToken?: string;
  includeSpamTrash?: boolean;
}

export interface GetEmailOptions {
  messageId: string;
  format?: 'minimal' | 'full' | 'raw' | 'metadata';
}

export interface SendEmailOptions {
  to: string[]; // Email addresses
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  isHtml?: boolean;
  replyToMessageId?: string; // For threading
  threadId?: string; // For threading
}

export interface DraftEmailOptions {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  isHtml?: boolean;
  replyToMessageId?: string;
  threadId?: string;
}

export interface ReplyToEmailOptions {
  messageId: string;
  body: string;
  isHtml?: boolean;
  replyAll?: boolean; // Reply to all recipients
}

export interface EmailSearchResult {
  emails: Email[];
  nextPageToken?: string;
  resultSizeEstimate: number;
}

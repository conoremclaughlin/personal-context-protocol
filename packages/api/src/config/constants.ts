// Application constants

export const APP_NAME = 'Personal Context Protocol';
export const APP_VERSION = '1.0.0';
export const APP_DESCRIPTION =
  'MCP server for managing personal context across messaging platforms';

// MCP Server metadata
export const MCP_SERVER_NAME = 'personal-context-protocol';
export const MCP_SERVER_VERSION = '1.0.0';

// API configuration
export const API_PREFIX = '/api/v1';

// Pagination defaults
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// Rate limiting
export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const RATE_LIMIT_MAX_REQUESTS = 100; // requests per window

// Platform types
export const PLATFORMS = {
  TELEGRAM: 'telegram',
  WHATSAPP: 'whatsapp',
  DISCORD: 'discord',
  API: 'api',
} as const;

// Task statuses
export const TASK_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

// Task priorities
export const TASK_PRIORITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent',
} as const;

// Reminder statuses
export const REMINDER_STATUS = {
  PENDING: 'pending',
  SENT: 'sent',
  CANCELLED: 'cancelled',
} as const;

// Message types
export const MESSAGE_TYPE = {
  TEXT: 'text',
  LINK: 'link',
  COMMAND: 'command',
  SYSTEM: 'system',
} as const;

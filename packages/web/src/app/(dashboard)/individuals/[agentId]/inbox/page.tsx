'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Inbox,
  Mail,
  MessageSquare,
  AlertCircle,
} from 'lucide-react';
import { useApiQuery } from '@/lib/api';
import clsx from 'clsx';

interface InboxMessage {
  id: string;
  subject: string | null;
  content: string;
  messageType: string;
  priority: string;
  status: string;
  senderAgentId: string | null;
  threadKey: string | null;
  relatedSessionId: string | null;
  relatedArtifactUri: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  readAt: string | null;
  acknowledgedAt: string | null;
  expiresAt: string | null;
}

interface ThreadGroup {
  threadKey: string;
  messageCount: number;
  unreadCount: number;
  latestMessage: InboxMessage;
  participants: string[];
  firstMessageAt: string;
  lastMessageAt: string;
  messages: InboxMessage[];
}

interface InboxResponse {
  agentId: string;
  stats: {
    totalMessages: number;
    unreadCount: number;
    threadCount: number;
    flatCount: number;
  };
  threads: ThreadGroup[];
  flatMessages: InboxMessage[];
  pagination: {
    limit: number;
    offset: number;
    totalThreads: number;
    hasMore: boolean;
  };
}

interface IndividualsResponse {
  individuals: { agentId: string; name: string }[];
}

function formatRelativeTime(date: string): string {
  const now = new Date();
  const target = new Date(date);
  const diffMs = now.getTime() - target.getTime();
  const diffMins = Math.round(diffMs / 60000);
  const diffHours = Math.round(diffMs / 3600000);
  const diffDays = Math.round(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

const priorityColors: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  normal: 'bg-gray-100 text-gray-600 border-gray-200',
  low: 'bg-gray-50 text-gray-400 border-gray-100',
};

const statusColors: Record<string, string> = {
  unread: 'bg-blue-100 text-blue-700',
  read: 'bg-gray-100 text-gray-600',
  acknowledged: 'bg-green-100 text-green-700',
  completed: 'bg-gray-100 text-gray-400',
};

const typeColors: Record<string, string> = {
  message: 'bg-slate-100 text-slate-700',
  task_request: 'bg-purple-100 text-purple-700',
  session_resume: 'bg-blue-100 text-blue-700',
  notification: 'bg-amber-100 text-amber-700',
};

function MessageItem({ message }: { message: InboxMessage }) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center gap-2">
          {message.senderAgentId && (
            <Badge variant="outline" className="font-mono text-xs">
              {message.senderAgentId}
            </Badge>
          )}
          <Badge
            className={clsx('text-[10px]', typeColors[message.messageType] || typeColors.message)}
          >
            {message.messageType}
          </Badge>
          <Badge
            className={clsx('text-[10px]', statusColors[message.status] || statusColors.unread)}
          >
            {message.status}
          </Badge>
          {message.priority !== 'normal' && (
            <Badge
              className={clsx(
                'text-[10px]',
                priorityColors[message.priority] || priorityColors.normal
              )}
            >
              {message.priority}
            </Badge>
          )}
        </div>
        <span>{formatRelativeTime(message.createdAt)}</span>
      </div>
      {message.subject && (
        <p className="mb-1 text-sm font-medium text-gray-800">{message.subject}</p>
      )}
      <p className="whitespace-pre-wrap break-words text-sm text-gray-700">{message.content}</p>
      {(message.relatedSessionId || message.relatedArtifactUri) && (
        <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
          {message.relatedSessionId && (
            <Link
              href={`/sessions/${message.relatedSessionId}`}
              className="underline hover:text-gray-600"
            >
              Session
            </Link>
          )}
          {message.relatedArtifactUri && (
            <span className="font-mono">{message.relatedArtifactUri}</span>
          )}
        </div>
      )}
    </div>
  );
}

function ThreadCard({ thread }: { thread: ThreadGroup }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start justify-between p-4 text-left hover:bg-gray-50/50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="font-mono text-xs">
              {thread.threadKey}
            </Badge>
            <span className="text-xs text-gray-500">{thread.messageCount} messages</span>
            {thread.unreadCount > 0 && (
              <Badge className="bg-blue-100 text-blue-700 text-[10px]">
                {thread.unreadCount} unread
              </Badge>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
            <span>Participants:</span>
            {thread.participants.map((p) => (
              <Badge key={p} variant="outline" className="text-[10px] font-mono">
                {p}
              </Badge>
            ))}
          </div>
          <p className="mt-1.5 text-sm text-gray-600 line-clamp-2">
            {thread.latestMessage.subject || thread.latestMessage.content}
          </p>
        </div>
        <div className="ml-4 flex shrink-0 items-center gap-2">
          <span className="text-xs text-gray-400">{formatRelativeTime(thread.lastMessageAt)}</span>
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-400" />
          )}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-gray-200 bg-gray-50/30 p-4 space-y-3">
          {thread.messages.map((msg) => (
            <MessageItem key={msg.id} message={msg} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function InboxPage() {
  const params = useParams();
  const agentId = params.agentId as string;

  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const queryPath = useMemo(() => {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (typeFilter) params.set('messageType', typeFilter);
    return `/api/admin/individuals/${agentId}/inbox?${params.toString()}`;
  }, [agentId, statusFilter, typeFilter, offset]);

  const { data, isLoading, error } = useApiQuery<InboxResponse>(
    ['individuals', agentId, 'inbox', statusFilter, typeFilter, offset],
    queryPath,
    { refetchInterval: 15000 }
  );

  const { data: individualsData } = useApiQuery<IndividualsResponse>(
    ['individuals'],
    '/api/admin/individuals'
  );

  const agentName =
    individualsData?.individuals.find((i) => i.agentId === agentId)?.name || agentId;

  const stats = data?.stats;
  const threads = data?.threads || [];
  const flatMessages = data?.flatMessages || [];
  const pagination = data?.pagination;

  return (
    <div>
      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/individuals">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Individuals
          </Link>
        </Button>
      </div>

      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">
          <Inbox className="mr-2 inline h-8 w-8" />
          {agentName}&apos;s Inbox
        </h1>
        {stats && (
          <div className="mt-2 flex items-center gap-3">
            <Badge variant="outline">{stats.totalMessages} total</Badge>
            {stats.unreadCount > 0 && (
              <Badge className="bg-blue-100 text-blue-700">{stats.unreadCount} unread</Badge>
            )}
            <Badge variant="outline">{stats.threadCount} threads</Badge>
            <Badge variant="outline">{stats.flatCount} direct</Badge>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-4 text-red-700">
          <AlertCircle className="mr-1 inline h-4 w-4" />
          {error.message}
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setOffset(0);
          }}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700"
        >
          <option value="all">All statuses</option>
          <option value="unread">Unread</option>
          <option value="read">Read</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="completed">Completed</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value);
            setOffset(0);
          }}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700"
        >
          <option value="">All types</option>
          <option value="message">Message</option>
          <option value="task_request">Task Request</option>
          <option value="session_resume">Session Resume</option>
          <option value="notification">Notification</option>
        </select>
        {(statusFilter !== 'all' || typeFilter) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStatusFilter('all');
              setTypeFilter('');
              setOffset(0);
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading inbox...</p>
      ) : threads.length === 0 && flatMessages.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Mail className="mx-auto mb-3 h-12 w-12 text-gray-300" />
            <p className="text-gray-500">No messages found</p>
            <p className="mt-1 text-sm text-gray-400">
              Messages will appear here when other SBs send to {agentName}.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Threaded conversations */}
          {threads.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Threads
                </CardTitle>
                <CardDescription>
                  Messages grouped by thread key for conversation continuity.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {threads.map((thread) => (
                  <ThreadCard key={thread.threadKey} thread={thread} />
                ))}
              </CardContent>
            </Card>
          )}

          {/* Direct (unthreaded) messages */}
          {flatMessages.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Direct Messages
                </CardTitle>
                <CardDescription>
                  Messages without a thread key, routed to {agentName}&apos;s main process.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {flatMessages.map((msg) => (
                  <MessageItem key={msg.id} message={msg} />
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.totalThreads > limit && (
        <div className="mt-4 flex items-center justify-between border-t border-gray-200 pt-4">
          <p className="text-xs text-gray-500">
            Showing {pagination.offset + 1} -{' '}
            {Math.min(pagination.offset + pagination.limit, pagination.totalThreads)} of{' '}
            {pagination.totalThreads}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.offset === 0}
              onClick={() => setOffset(Math.max(0, pagination.offset - pagination.limit))}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!pagination.hasMore}
              onClick={() => setOffset(pagination.offset + pagination.limit)}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

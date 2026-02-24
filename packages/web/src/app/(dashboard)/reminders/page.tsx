'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bell, Clock, CheckCircle, XCircle, PauseCircle, User, Repeat, Hash } from 'lucide-react';
import { useApiQuery } from '@/lib/api';
import clsx from 'clsx';

interface Reminder {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  cronExpression: string | null;
  nextRunAt: string | null;
  lastRunAt: string | null;
  deliveryChannel: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  runCount: number;
  maxRuns: number | null;
  agentId: string | null;
  agentName: string | null;
  createdAt: string | null;
}

interface RemindersResponse {
  reminders: Reminder[];
}

type StatusFilter = 'all' | 'active' | 'paused' | 'completed' | 'cancelled';

const STATUS_ORDER: Record<string, number> = {
  active: 0,
  paused: 1,
  completed: 2,
  cancelled: 3,
};

const statusConfig = {
  active: {
    icon: Bell,
    label: 'Active',
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  paused: {
    icon: PauseCircle,
    label: 'Paused',
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100',
  },
  completed: {
    icon: CheckCircle,
    label: 'Completed',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  cancelled: {
    icon: XCircle,
    label: 'Cancelled',
    color: 'text-gray-500',
    bgColor: 'bg-gray-100',
  },
};

const channelLabels: Record<string, string> = {
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  email: 'Email',
  push: 'Push',
};

function formatCron(cron: string | null): string {
  if (!cron) return 'One-time';

  const parts = cron.split(' ');
  if (parts.length !== 5) return cron;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const timeStr = `${hour}:${minute.padStart(2, '0')}`;

  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return `Daily at ${timeStr}`;
  }
  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '1-5') {
    return `Weekdays at ${timeStr}`;
  }
  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '0,6') {
    return `Weekends at ${timeStr}`;
  }
  if (dayOfMonth === '*' && month === '*') {
    const dayNames: Record<string, string> = {
      '0': 'Sun', '1': 'Mon', '2': 'Tue', '3': 'Wed',
      '4': 'Thu', '5': 'Fri', '6': 'Sat',
    };
    const dayLabel = dayNames[dayOfWeek] || dayOfWeek;
    return `${dayLabel} at ${timeStr}`;
  }

  return cron;
}

function formatRelativeTime(date: string): string {
  const now = new Date();
  const target = new Date(date);
  const diffMs = target.getTime() - now.getTime();
  const diffMins = Math.round(diffMs / 60000);
  const diffHours = Math.round(diffMs / 3600000);
  const diffDays = Math.round(diffMs / 86400000);

  if (diffMs < 0) {
    if (diffMins > -60) return `${Math.abs(diffMins)} min ago`;
    if (diffHours > -24) return `${Math.abs(diffHours)} hours ago`;
    return `${Math.abs(diffDays)} days ago`;
  } else {
    if (diffMins < 60) return `in ${diffMins} min`;
    if (diffHours < 24) return `in ${diffHours} hours`;
    return `in ${diffDays} days`;
  }
}

export default function RemindersPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const { data, isLoading, error } = useApiQuery<RemindersResponse>(
    ['reminders'],
    '/api/admin/reminders'
  );

  const allReminders = data?.reminders ?? [];

  // Sort: active first, then paused, then completed/cancelled. Within each group, by next_run_at.
  const sortedReminders = useMemo(() => {
    return [...allReminders].sort((a, b) => {
      const statusDiff = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
      if (statusDiff !== 0) return statusDiff;
      // Within same status: soonest next_run_at first (nulls last)
      if (a.nextRunAt && b.nextRunAt) return new Date(a.nextRunAt).getTime() - new Date(b.nextRunAt).getTime();
      if (a.nextRunAt) return -1;
      if (b.nextRunAt) return 1;
      return 0;
    });
  }, [allReminders]);

  const reminders = statusFilter === 'all'
    ? sortedReminders
    : sortedReminders.filter((r) => r.status === statusFilter);

  const stats = {
    active: allReminders.filter((r) => r.status === 'active').length,
    paused: allReminders.filter((r) => r.status === 'paused').length,
    completed: allReminders.filter((r) => r.status === 'completed').length,
    total: allReminders.length,
  };

  const filterButtons: { key: StatusFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: stats.total },
    { key: 'active', label: 'Active', count: stats.active },
    { key: 'paused', label: 'Paused', count: stats.paused },
    { key: 'completed', label: 'Completed', count: stats.completed },
  ];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Reminders</h1>
          <p className="mt-2 text-gray-600">Scheduled reminders and recurring check-ins.</p>
        </div>
      </div>

      {error && <div className="mt-4 rounded-md bg-red-50 p-4 text-red-800">{error.message}</div>}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mt-6">
        <Card>
          <CardContent className="p-4 text-center">
            <Bell className="h-5 w-5 mx-auto text-green-600 mb-1" />
            <div className="text-2xl font-bold text-green-600">{stats.active}</div>
            <div className="text-xs text-gray-500">Active</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <PauseCircle className="h-5 w-5 mx-auto text-yellow-600 mb-1" />
            <div className="text-2xl font-bold text-yellow-600">{stats.paused}</div>
            <div className="text-xs text-gray-500">Paused</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle className="h-5 w-5 mx-auto text-blue-600 mb-1" />
            <div className="text-2xl font-bold text-blue-600">{stats.completed}</div>
            <div className="text-xs text-gray-500">Completed</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Clock className="h-5 w-5 mx-auto text-gray-600 mb-1" />
            <div className="text-2xl font-bold text-gray-600">{stats.total}</div>
            <div className="text-xs text-gray-500">Total</div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs + List */}
      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Reminders</CardTitle>
              <CardDescription>Active reminders sorted first, then by next run time</CardDescription>
            </div>
            <div className="flex gap-1">
              {filterButtons.map((btn) => (
                <button
                  key={btn.key}
                  onClick={() => setStatusFilter(btn.key)}
                  className={clsx(
                    'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                    statusFilter === btn.key
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  )}
                >
                  {btn.label}
                  {btn.count > 0 && (
                    <span className={clsx(
                      'ml-1.5 px-1.5 py-0.5 rounded-full text-[10px]',
                      statusFilter === btn.key ? 'bg-white/20' : 'bg-gray-200'
                    )}>
                      {btn.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-gray-500">Loading...</p>
          ) : reminders.length === 0 ? (
            <div className="text-center py-8">
              <Bell className="h-12 w-12 mx-auto text-gray-300 mb-3" />
              {statusFilter !== 'all' ? (
                <p className="text-gray-500">No {statusFilter} reminders.</p>
              ) : (
                <>
                  <p className="text-gray-500">No reminders scheduled yet.</p>
                  <p className="text-sm text-gray-400 mt-1">
                    Use the <code className="bg-gray-100 px-1 rounded">create_reminder</code> tool to
                    schedule one.
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {reminders.map((reminder) => {
                const config = statusConfig[reminder.status] || statusConfig.active;
                const StatusIcon = config.icon;
                const isRecurring = !!reminder.cronExpression;

                return (
                  <div
                    key={reminder.id}
                    className={clsx(
                      'rounded-lg border p-4 transition-colors',
                      reminder.status === 'active'
                        ? 'border-green-200 bg-green-50/50'
                        : reminder.status === 'paused'
                          ? 'border-yellow-200 bg-yellow-50/30'
                          : 'border-gray-200'
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-gray-900">{reminder.title}</h3>
                          <Badge className={clsx('text-xs', config.bgColor, config.color)}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {config.label}
                          </Badge>
                          {isRecurring && (
                            <Badge variant="outline" className="text-xs text-purple-600 border-purple-200">
                              <Repeat className="h-3 w-3 mr-1" />
                              Recurring
                            </Badge>
                          )}
                        </div>
                        {reminder.description && (
                          <p className="text-sm text-gray-600 mt-1">{reminder.description}</p>
                        )}
                        <div className="flex items-center gap-4 mt-3 text-xs text-gray-500 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatCron(reminder.cronExpression)}
                          </span>
                          <span className="flex items-center gap-1">
                            {channelLabels[reminder.deliveryChannel] || reminder.deliveryChannel}
                          </span>
                          {reminder.agentName && (
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {reminder.agentName}
                            </span>
                          )}
                          {reminder.runCount > 0 && (
                            <span className="flex items-center gap-1">
                              <Hash className="h-3 w-3" />
                              {reminder.runCount}{reminder.maxRuns ? `/${reminder.maxRuns}` : ''} run{reminder.runCount !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right text-sm ml-4 shrink-0">
                        {reminder.nextRunAt && reminder.status === 'active' && (
                          <div>
                            <div className="text-gray-500">Next run</div>
                            <div className="font-medium text-gray-900">
                              {formatRelativeTime(reminder.nextRunAt)}
                            </div>
                            <div className="text-xs text-gray-400">
                              {new Date(reminder.nextRunAt).toLocaleString()}
                            </div>
                          </div>
                        )}
                        {reminder.lastRunAt && (
                          <div className={reminder.nextRunAt && reminder.status === 'active' ? 'mt-2' : ''}>
                            <div className="text-xs text-gray-400">
                              Last: {formatRelativeTime(reminder.lastRunAt)}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  RefreshCw,
  Link2,
  Link2Off,
  Mail,
  ExternalLink,
  AlertCircle,
  CheckCircle,
  Clock,
} from 'lucide-react';
import { useApiQuery, useApiDelete, apiGet } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState, useEffect, useCallback } from 'react';

interface ConnectedAccount {
  id: string;
  provider: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  status: 'active' | 'expired' | 'revoked' | 'error';
  lastError: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  scopes: string[];
  createdAt: string;
}

interface Provider {
  name: string;
  configured: boolean;
  connected: boolean;
}

interface ConnectedAccountsResponse {
  accounts: ConnectedAccount[];
  providers: Provider[];
}

const providerConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  google: {
    label: 'Google',
    icon: <Mail className="h-5 w-5" />,
    color: 'text-red-600',
  },
};

const statusConfig = {
  active: {
    label: 'Active',
    icon: CheckCircle,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  expired: {
    label: 'Expired',
    icon: Clock,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100',
  },
  revoked: {
    label: 'Revoked',
    icon: Link2Off,
    color: 'text-red-600',
    bgColor: 'bg-red-100',
  },
  error: {
    label: 'Error',
    icon: AlertCircle,
    color: 'text-red-600',
    bgColor: 'bg-red-100',
  },
};

function formatRelativeTime(date: string): string {
  const now = new Date();
  const target = new Date(date);
  const diffMs = now.getTime() - target.getTime();
  const diffMins = Math.round(diffMs / 60000);
  const diffHours = Math.round(diffMs / 3600000);
  const diffDays = Math.round(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hours ago`;
  return `${diffDays} days ago`;
}

export default function ConnectedAccountsPage() {
  const queryClient = useQueryClient();
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useApiQuery<ConnectedAccountsResponse>(
    ['connected-accounts'],
    '/api/admin/connected-accounts'
  );

  const disconnectMutation = useApiDelete<{ success: boolean }>('/api/admin/connected-accounts');

  const accounts = data?.accounts ?? [];
  const providers = data?.providers ?? [];

  // Handle OAuth popup callback
  const handleOAuthMessage = useCallback((event: MessageEvent) => {
    if (event.data?.type === 'oauth-callback') {
      setConnectingProvider(null);
      if (event.data.success) {
        refetch();
      }
    }
  }, [refetch]);

  useEffect(() => {
    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, [handleOAuthMessage]);

  const handleConnect = async (provider: string) => {
    setConnectingProvider(provider);

    try {
      // Get the auth URL from the API (using authenticated client)
      const { authUrl } = await apiGet<{ authUrl: string }>(
        `/api/admin/oauth/${provider}/authorize`
      );

      // Open popup for OAuth
      const width = 500;
      const height = 600;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      const popup = window.open(
        authUrl,
        'oauth-popup',
        `width=${width},height=${height},left=${left},top=${top}`
      );

      // Check if popup was blocked
      if (!popup) {
        setConnectingProvider(null);
        alert('Popup was blocked. Please allow popups for this site.');
      }
    } catch (err) {
      setConnectingProvider(null);
      console.error('OAuth error:', err);
    }
  };

  const handleDisconnect = async (accountId: string) => {
    if (!confirm('Are you sure you want to disconnect this account?')) {
      return;
    }

    try {
      await disconnectMutation.mutateAsync(accountId);
      queryClient.invalidateQueries({ queryKey: ['connected-accounts'] });
    } catch (err) {
      console.error('Disconnect error:', err);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Connected Accounts</h1>
          <p className="mt-2 text-gray-600">
            Connect third-party accounts for enhanced integrations (email, calendar, etc.)
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline" size="sm">
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-4 text-red-800">
          {error.message}
        </div>
      )}

      {/* Available Providers */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Available Integrations</CardTitle>
          <CardDescription>
            Connect your accounts to enable additional features
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-gray-500">Loading...</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {providers.map((provider) => {
                const config = providerConfig[provider.name] || {
                  label: provider.name,
                  icon: <Link2 className="h-5 w-5" />,
                  color: 'text-gray-600',
                };
                const connectedAccount = accounts.find(
                  (a) => a.provider === provider.name && a.status === 'active'
                );

                return (
                  <div
                    key={provider.name}
                    className={clsx(
                      'rounded-lg border p-4',
                      connectedAccount
                        ? 'border-green-200 bg-green-50/50'
                        : 'border-gray-200'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={clsx('p-2 rounded-lg bg-white border', config.color)}>
                          {config.icon}
                        </div>
                        <div>
                          <h3 className="font-medium text-gray-900">{config.label}</h3>
                          {connectedAccount ? (
                            <p className="text-sm text-gray-500">{connectedAccount.email}</p>
                          ) : (
                            <p className="text-sm text-gray-400">Not connected</p>
                          )}
                        </div>
                      </div>
                      {!provider.configured ? (
                        <Badge variant="outline" className="text-gray-500">
                          Not configured
                        </Badge>
                      ) : connectedAccount ? (
                        <Badge className="bg-green-100 text-green-800">
                          <CheckCircle className="mr-1 h-3 w-3" />
                          Connected
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handleConnect(provider.name)}
                          disabled={connectingProvider === provider.name}
                        >
                          {connectingProvider === provider.name ? (
                            <>
                              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                              Connecting...
                            </>
                          ) : (
                            <>
                              <Link2 className="mr-2 h-4 w-4" />
                              Connect
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
              {providers.length === 0 && (
                <p className="col-span-full text-center text-gray-500 py-4">
                  No integrations available. Configure OAuth credentials in your environment.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Connected Accounts List */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Connected Accounts</CardTitle>
          <CardDescription>
            Manage your connected third-party accounts
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-gray-500">Loading...</p>
          ) : accounts.length === 0 ? (
            <div className="text-center py-8">
              <Link2Off className="h-12 w-12 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">No accounts connected yet.</p>
              <p className="text-sm text-gray-400 mt-1">
                Connect an account above to get started.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {accounts.map((account) => {
                const providerCfg = providerConfig[account.provider] || {
                  label: account.provider,
                  icon: <Link2 className="h-5 w-5" />,
                  color: 'text-gray-600',
                };
                const statusCfg = statusConfig[account.status];
                const StatusIcon = statusCfg.icon;

                return (
                  <div
                    key={account.id}
                    className={clsx(
                      'rounded-lg border p-4',
                      account.status === 'active'
                        ? 'border-gray-200'
                        : 'border-yellow-200 bg-yellow-50/50'
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4">
                        {account.avatarUrl ? (
                          <img
                            src={account.avatarUrl}
                            alt={account.displayName || ''}
                            className="h-12 w-12 rounded-full"
                          />
                        ) : (
                          <div className={clsx('p-3 rounded-full bg-gray-100', providerCfg.color)}>
                            {providerCfg.icon}
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-gray-900">
                              {account.displayName || account.email || providerCfg.label}
                            </h3>
                            <Badge className={clsx('text-xs', statusCfg.bgColor, statusCfg.color)}>
                              <StatusIcon className="mr-1 h-3 w-3" />
                              {statusCfg.label}
                            </Badge>
                          </div>
                          {account.email && account.displayName && (
                            <p className="text-sm text-gray-500">{account.email}</p>
                          )}
                          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Connected {new Date(account.createdAt).toLocaleDateString()}
                            </span>
                            {account.lastUsedAt && (
                              <span>Last used: {formatRelativeTime(account.lastUsedAt)}</span>
                            )}
                          </div>
                          {account.lastError && (
                            <p className="text-sm text-red-600 mt-2">
                              <AlertCircle className="inline h-3 w-3 mr-1" />
                              {account.lastError}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {account.status === 'expired' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleConnect(account.provider)}
                          >
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Reconnect
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleDisconnect(account.id)}
                        >
                          <Link2Off className="mr-2 h-4 w-4" />
                          Disconnect
                        </Button>
                      </div>
                    </div>

                    {/* Scopes */}
                    {account.scopes.length > 0 && (
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-xs text-gray-500 mb-2">Permissions granted:</p>
                        <div className="flex flex-wrap gap-1">
                          {account.scopes.map((scope) => {
                            // Simplify scope display
                            const simplifiedScope = scope
                              .replace('https://www.googleapis.com/auth/', '')
                              .replace('https://mail.google.com/', 'gmail.full');
                            return (
                              <Badge key={scope} variant="secondary" className="text-xs">
                                {simplifiedScope}
                              </Badge>
                            );
                          })}
                        </div>
                      </div>
                    )}
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

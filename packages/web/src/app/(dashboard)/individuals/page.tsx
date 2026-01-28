'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, History, ChevronDown, ChevronUp } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { createClient } from '@/lib/supabase/client';

interface Identity {
  id: string;
  agentId: string;
  name: string;
  role: string;
  description?: string;
  values?: string[];
  relationships?: Record<string, string>;
  capabilities?: string[];
  metadata?: Record<string, unknown>;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface HistoryEntry {
  id: string;
  version: number;
  name: string;
  role: string;
  description?: string;
  values?: string[];
  relationships?: Record<string, string>;
  capabilities?: string[];
  changeType: string;
  archivedAt: string;
}

/**
 * Generate IDENTITY.md content from identity data
 */
function generateIdentityMarkdown(identity: Identity): string {
  const lines: string[] = [];

  lines.push(`# IDENTITY.md - ${identity.name}`);
  lines.push('');
  lines.push('## Who I Am');
  lines.push('');
  lines.push(`- **Name:** ${identity.name}`);
  lines.push(`- **Role:** ${identity.role}`);
  lines.push('');

  if (identity.description) {
    lines.push('## Nature');
    lines.push('');
    lines.push(identity.description);
    lines.push('');
  }

  if (identity.values && identity.values.length > 0) {
    lines.push('## Values');
    lines.push('');
    for (const value of identity.values) {
      lines.push(`- ${value}`);
    }
    lines.push('');
  }

  if (identity.capabilities && identity.capabilities.length > 0) {
    lines.push('## Capabilities');
    lines.push('');
    for (const cap of identity.capabilities) {
      lines.push(`- ${cap}`);
    }
    lines.push('');
  }

  if (identity.relationships && Object.keys(identity.relationships).length > 0) {
    lines.push('## Relationships');
    lines.push('');
    for (const [agent, desc] of Object.entries(identity.relationships)) {
      lines.push(`- **${agent}:** ${desc}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  const updated = new Date(identity.updatedAt).toISOString().split('T')[0];
  lines.push(`*Updated: ${updated} (v${identity.version})*`);

  return lines.join('\n');
}

function IdentityCard({ identity }: { identity: Identity }) {
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const fetchHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`/api/admin/individuals/${identity.agentId}/history`, {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch history');
      const data = await response.json();
      setHistory(data.history);
    } catch (err) {
      console.error('Failed to fetch history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleToggleHistory = async () => {
    if (!showHistory && history.length === 0) {
      await fetchHistory();
    }
    setShowHistory(!showHistory);
  };

  const markdown = generateIdentityMarkdown(identity);

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              {identity.name}
              <Badge variant="outline" className="font-mono text-xs">
                {identity.agentId}
              </Badge>
            </CardTitle>
            <CardDescription className="mt-1">{identity.role}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">v{identity.version}</Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggleHistory}
              disabled={isLoadingHistory}
            >
              {isLoadingHistory ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <History className="mr-1 h-4 w-4" />
                  History
                  {showHistory ? (
                    <ChevronUp className="ml-1 h-4 w-4" />
                  ) : (
                    <ChevronDown className="ml-1 h-4 w-4" />
                  )}
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:mt-4 prose-headings:mb-2 prose-p:my-2 prose-ul:my-2 prose-li:my-0">
          <ReactMarkdown>{markdown}</ReactMarkdown>
        </div>

        {showHistory && (
          <div className="mt-6 border-t pt-4">
            <h4 className="mb-3 text-sm font-medium text-gray-700">Version History</h4>
            {history.length === 0 ? (
              <p className="text-sm text-gray-500">No history available (current is version 1)</p>
            ) : (
              <div className="space-y-2">
                {history.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <div>
                      <span className="font-medium">v{entry.version}</span>
                      <span className="ml-2 text-sm text-gray-500">
                        {entry.changeType === 'update' ? 'Updated' : entry.changeType}
                      </span>
                    </div>
                    <div className="text-sm text-gray-500">
                      {new Date(entry.archivedAt).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function IndividualsPage() {
  const [individuals, setIndividuals] = useState<Identity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchIndividuals = async () => {
    setIsLoading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/admin/individuals', {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch individuals');
      const data = await response.json();
      setIndividuals(data.individuals);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchIndividuals();
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Individuals</h1>
          <p className="mt-2 text-gray-600">
            AI beings with identity files - Wren, Myra, Benson, and others.
          </p>
        </div>
        <Button onClick={fetchIndividuals} variant="outline" size="sm">
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-4 text-red-800">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">
            Dismiss
          </button>
        </div>
      )}

      <div className="mt-6">
        {isLoading ? (
          <Card>
            <CardContent className="py-8">
              <p className="text-center text-gray-500">Loading individuals...</p>
            </CardContent>
          </Card>
        ) : individuals.length === 0 ? (
          <Card>
            <CardContent className="py-8">
              <p className="text-center text-gray-500">
                No individuals found. Use the <code>save_identity</code> MCP tool to create one.
              </p>
            </CardContent>
          </Card>
        ) : (
          individuals.map((individual) => (
            <IdentityCard key={individual.id} identity={individual} />
          ))
        )}
      </div>
    </div>
  );
}

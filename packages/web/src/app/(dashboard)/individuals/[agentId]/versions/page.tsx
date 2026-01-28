'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import clsx from 'clsx';

// Dynamic import for TipTap diff viewer (client-only, heavy deps)
const IdentityVersionDiff = dynamic(
  () => import('@/stories/diff-versions/identity-version-diff'),
  { ssr: false, loading: () => <p className="text-gray-500 p-4">Loading diff viewer...</p> }
);

interface Identity {
  id: string;
  agentId: string;
  name: string;
  role: string;
  description?: string;
  values?: string[];
  relationships?: Record<string, string>;
  capabilities?: string[];
  version: number;
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

export default function VersionExplorerPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.agentId as string;

  const [identity, setIdentity] = useState<Identity | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVersionIndex, setSelectedVersionIndex] = useState(0);

  // Build all versions array: current + history (newest to oldest)
  const allVersions: HistoryEntry[] = identity
    ? [
        {
          id: identity.id,
          version: identity.version,
          name: identity.name,
          role: identity.role,
          description: identity.description,
          values: identity.values,
          relationships: identity.relationships,
          capabilities: identity.capabilities,
          changeType: 'current',
          archivedAt: identity.updatedAt,
        },
        ...history,
      ]
    : [];

  const selectedVersion = allVersions[selectedVersionIndex];
  const comparisonVersion = allVersions[selectedVersionIndex + 1];

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers = { Authorization: `Bearer ${session?.access_token}` };

      // Fetch identity and history in parallel
      const [identityRes, historyRes] = await Promise.all([
        fetch('/api/admin/individuals', { headers }),
        fetch(`/api/admin/individuals/${agentId}/history`, { headers }),
      ]);

      if (!identityRes.ok || !historyRes.ok) {
        throw new Error('Failed to fetch data');
      }

      const identityData = await identityRes.json();
      const historyData = await historyRes.json();

      const foundIdentity = identityData.individuals.find(
        (i: Identity) => i.agentId === agentId
      );

      if (!foundIdentity) {
        throw new Error(`Identity not found: ${agentId}`);
      }

      setIdentity(foundIdentity);
      setHistory(historyData.history || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [agentId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
        <span className="ml-2 text-gray-500">Loading version history...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 p-4 text-red-800">
        {error}
        <Link href="/individuals" className="ml-2 underline">
          Back to Individuals
        </Link>
      </div>
    );
  }

  if (!identity) {
    return null;
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/individuals">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {identity.name} Version History
            </h1>
            <p className="text-gray-600">
              {allVersions.length} version{allVersions.length !== 1 ? 's' : ''} available
            </p>
          </div>
        </div>
        <Button onClick={fetchData} variant="outline" size="sm">
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Two-column layout */}
      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Left: Diff viewer */}
        <div className="flex-1 lg:w-2/3">
          <Card>
            <CardContent className="p-6">
              {allVersions.length > 1 && comparisonVersion ? (
                <>
                  <div className="mb-4 rounded-md border bg-gray-50 px-4 py-2">
                    <span>Comparing </span>
                    <span className="font-semibold">v{selectedVersion.version}</span>
                    <span> vs </span>
                    <span className="font-semibold">v{comparisonVersion.version}</span>
                  </div>
                  <IdentityVersionDiff
                    currentVersion={selectedVersion}
                    previousVersion={comparisonVersion}
                  />
                </>
              ) : (
                <div className="text-center text-gray-500 py-8">
                  <p className="font-medium">Original version</p>
                  <p className="text-sm mt-1">This is the first version - no previous version to compare.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Version timeline */}
        <div className="lg:w-1/3">
          <Card>
            <CardContent className="p-4">
              <h3 className="mb-4 font-semibold text-gray-700">Versions</h3>
              <ul className="relative flex flex-col">
                {allVersions.map((v, i) => {
                  const isFirst = i === 0;
                  const isLast = i === allVersions.length - 1;
                  const isActive = selectedVersionIndex === i;
                  const isCurrent = v.changeType === 'current';

                  return (
                    <li
                      key={v.id}
                      className={clsx(
                        'relative cursor-pointer rounded-md py-4 pl-8 pr-4 transition-colors',
                        isActive
                          ? 'bg-blue-50 text-blue-900'
                          : 'hover:bg-gray-50'
                      )}
                      onClick={() => setSelectedVersionIndex(i)}
                    >
                      {/* Timeline line */}
                      <span
                        className={clsx(
                          'absolute left-[11px] w-[2px]',
                          {
                            'top-1/2 bottom-0': isFirst,
                            'top-0 bottom-1/2': isLast,
                            'top-0 bottom-0': !isFirst && !isLast,
                          },
                          isActive
                            ? 'bg-blue-500'
                            : 'bg-gray-300'
                        )}
                      />
                      {/* Timeline dot */}
                      <span
                        className={clsx(
                          'absolute left-[7px] top-1/2 h-[10px] w-[10px] -translate-y-1/2 rounded-full border-2',
                          isActive
                            ? 'border-blue-500 bg-blue-500'
                            : 'border-gray-300 bg-white'
                        )}
                      />

                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center font-semibold">
                            <span>v{v.version}</span>
                            {isCurrent && (
                              <Badge variant="secondary" className="ml-2 text-xs">
                                Current
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-gray-500">
                            {new Date(v.archivedAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </div>
                        </div>
                        {isActive && !isLast && (
                          <Badge variant="outline" className="text-xs">
                            Selected
                          </Badge>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>

              {allVersions.length === 1 && (
                <p className="mt-4 text-center text-sm text-gray-500">
                  Only one version exists. Make changes to see version history.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

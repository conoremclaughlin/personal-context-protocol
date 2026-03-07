'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  FileText,
  BookOpen,
  Lightbulb,
  FileCheck,
  StickyNote,
  Eye,
  Users,
  Lock,
  History,
} from 'lucide-react';
import { apiPatch, useApiQuery, useQueryClient } from '@/lib/api';
import clsx from 'clsx';

interface Artifact {
  id: string;
  uri: string;
  title: string;
  artifactType: 'spec' | 'design' | 'decision' | 'document' | 'note';
  visibility: 'private' | 'shared' | 'public';
  editMode: 'workspace' | 'editors';
  editors: string[];
  version: number;
  tags: string[] | null;
  createdAt: string;
  updatedAt: string;
}

interface ArtifactsResponse {
  artifacts: Artifact[];
}

const typeConfig = {
  spec: {
    icon: BookOpen,
    label: 'Spec',
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
  },
  design: {
    icon: Lightbulb,
    label: 'Design',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  decision: {
    icon: FileCheck,
    label: 'Decision',
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  document: {
    icon: FileText,
    label: 'Document',
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
  },
  note: {
    icon: StickyNote,
    label: 'Note',
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100',
  },
};

const visibilityConfig = {
  private: {
    icon: Lock,
    label: 'Private',
  },
  shared: {
    icon: Users,
    label: 'Shared',
  },
  public: {
    icon: Eye,
    label: 'Public',
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
  if (diffDays < 7) return `${diffDays} days ago`;
  return target.toLocaleDateString();
}

export default function ArtifactsPage() {
  const queryClient = useQueryClient();
  const [bulkEditMode, setBulkEditMode] = useState<'workspace' | 'editors'>('workspace');
  const [bulkEditorsInput, setBulkEditorsInput] = useState('');
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkSuccess, setBulkSuccess] = useState<string | null>(null);

  const { data, isLoading, error } = useApiQuery<ArtifactsResponse>(
    ['artifacts'],
    '/api/admin/artifacts'
  );

  const artifacts = data?.artifacts ?? [];

  const parseEditorInput = (raw: string): string[] =>
    Array.from(
      new Set(
        raw
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
      )
    );

  const handleBulkPermissionUpdate = async () => {
    setBulkError(null);
    setBulkSuccess(null);
    setIsBulkUpdating(true);

    try {
      const editors = parseEditorInput(bulkEditorsInput);
      const payload =
        bulkEditMode === 'editors'
          ? { editMode: bulkEditMode, editors }
          : { editMode: bulkEditMode };

      const response = await apiPatch<{ updatedCount: number }>(
        '/api/admin/artifacts/permissions',
        payload
      );
      setBulkSuccess(`Updated ${response.updatedCount} document permissions.`);
      await queryClient.invalidateQueries({ queryKey: ['artifacts'] });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update permissions';
      setBulkError(message);
    } finally {
      setIsBulkUpdating(false);
    }
  };

  // Stats by type
  const stats = {
    spec: artifacts.filter((a) => a.artifactType === 'spec').length,
    design: artifacts.filter((a) => a.artifactType === 'design').length,
    decision: artifacts.filter((a) => a.artifactType === 'decision').length,
    document: artifacts.filter((a) => a.artifactType === 'document').length,
    note: artifacts.filter((a) => a.artifactType === 'note').length,
    total: artifacts.length,
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Documents</h1>
          <p className="mt-2 text-gray-600">
            Shared documents, specs, and designs that AI beings collaborate on.
          </p>
        </div>
      </div>

      {error && <div className="mt-4 rounded-md bg-red-50 p-4 text-red-800">{error.message}</div>}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Document edit permissions</CardTitle>
          <CardDescription>
            Apply a workspace-wide edit policy to all current documents.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-[220px_1fr_auto] md:items-end">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Edit mode</label>
              <select
                value={bulkEditMode}
                onChange={(event) => setBulkEditMode(event.target.value as 'workspace' | 'editors')}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="workspace">Workspace editors (recommended)</option>
                <option value="editors">Specific editor list</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Editors (comma-separated)
              </label>
              <input
                value={bulkEditorsInput}
                onChange={(event) => setBulkEditorsInput(event.target.value)}
                disabled={bulkEditMode !== 'editors'}
                placeholder="wren, lumen, myra"
                className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm focus:border-gray-400 focus:outline-none disabled:bg-gray-100 disabled:text-gray-400"
              />
            </div>

            <Button onClick={handleBulkPermissionUpdate} disabled={isBulkUpdating}>
              {isBulkUpdating ? 'Applying…' : 'Apply to all'}
            </Button>
          </div>

          {bulkError && <p className="text-sm text-red-700">{bulkError}</p>}
          {bulkSuccess && <p className="text-sm text-green-700">{bulkSuccess}</p>}
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-6 gap-4 mt-6">
        {Object.entries(typeConfig).map(([type, config]) => {
          const TypeIcon = config.icon;
          const count = stats[type as keyof typeof stats] || 0;
          return (
            <Card key={type}>
              <CardContent className="p-4 text-center">
                <TypeIcon className={clsx('h-5 w-5 mx-auto mb-1', config.color)} />
                <div className={clsx('text-2xl font-bold', config.color)}>{count}</div>
                <div className="text-xs text-gray-500">{config.label}s</div>
              </CardContent>
            </Card>
          );
        })}
        <Card>
          <CardContent className="p-4 text-center">
            <FileText className="h-5 w-5 mx-auto text-gray-600 mb-1" />
            <div className="text-2xl font-bold text-gray-600">{stats.total}</div>
            <div className="text-xs text-gray-500">Total</div>
          </CardContent>
        </Card>
      </div>

      {/* Documents List */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>All Documents</CardTitle>
          <CardDescription>Sorted by last updated</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-gray-500">Loading...</p>
          ) : artifacts.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">No documents yet.</p>
              <p className="text-sm text-gray-400 mt-1">
                Use the <code className="bg-gray-100 px-1 rounded">create_artifact</code> tool to
                create one.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {artifacts.map((artifact) => {
                const config = typeConfig[artifact.artifactType] || typeConfig.document;
                const visConfig = visibilityConfig[artifact.visibility] || visibilityConfig.private;
                const TypeIcon = config.icon;
                const VisIcon = visConfig.icon;

                return (
                  <Link
                    key={artifact.id}
                    href={`/artifacts/${artifact.id}`}
                    className="block rounded-lg border border-gray-200 p-4 hover:border-gray-400 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <TypeIcon className={clsx('h-4 w-4', config.color)} />
                          <h3 className="font-semibold text-gray-900">{artifact.title}</h3>
                          <Badge className={clsx('text-xs', config.bgColor, config.color)}>
                            {config.label}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            <VisIcon className="h-3 w-3 mr-1" />
                            {visConfig.label}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {artifact.editMode === 'workspace' ? 'Workspace edit' : 'Editors only'}
                          </Badge>
                          <span className="text-xs text-gray-400">v{artifact.version}</span>
                          {artifact.version > 1 && (
                            <span className="text-xs text-blue-500 flex items-center gap-1">
                              <History className="h-3 w-3" />
                              {artifact.version} versions
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 mt-1 font-mono">{artifact.uri}</p>
                        {artifact.tags && artifact.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {artifact.tags.map((tag) => (
                              <Badge key={tag} variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="text-right text-sm text-gray-500">
                        <div>Updated {formatRelativeTime(artifact.updatedAt)}</div>
                        <div className="text-xs text-gray-400 mt-1">
                          Created {formatRelativeTime(artifact.createdAt)}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

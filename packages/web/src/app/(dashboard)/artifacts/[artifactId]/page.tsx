'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, BookOpen, Lightbulb, FileCheck, FileText, StickyNote, Eye, Users, Lock, History, Loader2 } from 'lucide-react';
import { useApiQuery } from '@/lib/api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import clsx from 'clsx';

interface Artifact {
  id: string;
  uri: string;
  title: string;
  content: string;
  contentType: string;
  artifactType: 'spec' | 'design' | 'decision' | 'document' | 'note';
  createdByAgentId?: string;
  collaborators?: string[];
  visibility: 'private' | 'shared' | 'public';
  version: number;
  tags: string[] | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface ArtifactResponse {
  artifact: Artifact;
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

export default function ArtifactDetailPage() {
  const params = useParams();
  const artifactId = params.artifactId as string;

  const {
    data: artifactData,
    isLoading,
    error,
  } = useApiQuery<ArtifactResponse>(
    ['artifacts', artifactId],
    `/api/admin/artifacts/${artifactId}`
  );

  const artifact = artifactData?.artifact ?? null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        <span className="ml-2 text-gray-500">Loading artifact...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 p-4 text-red-800">
        {error.message}
        <Link href="/artifacts" className="ml-2 underline">
          Back to Artifacts
        </Link>
      </div>
    );
  }

  if (!artifact) {
    return (
      <div className="rounded-md bg-yellow-50 p-4 text-yellow-800">
        Artifact not found
        <Link href="/artifacts" className="ml-2 underline">
          Back to Artifacts
        </Link>
      </div>
    );
  }

  const config = typeConfig[artifact.artifactType] || typeConfig.document;
  const visConfig = visibilityConfig[artifact.visibility] || visibilityConfig.private;
  const TypeIcon = config.icon;
  const VisIcon = visConfig.icon;

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/artifacts">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <TypeIcon className={clsx('h-5 w-5', config.color)} />
              <h1 className="text-2xl font-bold text-gray-900">{artifact.title}</h1>
              <Badge className={clsx('text-xs', config.bgColor, config.color)}>
                {config.label}
              </Badge>
              <Badge variant="outline" className="text-xs">
                <VisIcon className="h-3 w-3 mr-1" />
                {visConfig.label}
              </Badge>
              <span className="text-sm text-gray-500">v{artifact.version}</span>
            </div>
            <p className="text-sm text-gray-500 font-mono mt-1">{artifact.uri}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/artifacts/${artifactId}/versions`}>
            <History className="mr-2 h-4 w-4" />
            {artifact.version} version{artifact.version !== 1 ? 's' : ''}
          </Link>
        </Button>
      </div>

      {/* Tags */}
      {artifact.tags && artifact.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-4">
          {artifact.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Content */}
      <Card>
        <CardContent className="p-6">
          <div className="prose prose-sm max-w-none prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{artifact.content}</ReactMarkdown>
          </div>
        </CardContent>
      </Card>

      {/* Metadata footer */}
      <div className="mt-6 flex items-center justify-between text-sm text-gray-500">
        <div className="flex items-center gap-4">
          {artifact.createdByAgentId && (
            <span>Created by: {artifact.createdByAgentId}</span>
          )}
          {artifact.collaborators && artifact.collaborators.length > 0 && (
            <span>Collaborators: {artifact.collaborators.join(', ')}</span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span>Created: {new Date(artifact.createdAt).toLocaleDateString()}</span>
          <span>Updated: {new Date(artifact.updatedAt).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
}

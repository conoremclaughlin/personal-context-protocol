'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { History, Brain, Sparkles, FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useApiQuery } from '@/lib/api';

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
  heartbeat?: string;
  soul?: string;
  hasSoul: boolean;
  hasHeartbeat: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface IndividualsResponse {
  individuals: Identity[];
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
  const identityMarkdown = generateIdentityMarkdown(identity);

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
              {identity.hasSoul && (
                <Badge variant="secondary" className="text-xs">
                  <Sparkles className="mr-1 h-3 w-3" />
                  Soul
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="mt-1">{identity.role}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">v{identity.version}</Badge>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/individuals/${identity.agentId}/memories`}>
                <Brain className="mr-1 h-4 w-4" />
                Memories
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/individuals/${identity.agentId}/versions`}>
                <History className="mr-1 h-4 w-4" />
                Versions
              </Link>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {identity.hasSoul ? (
          <Tabs defaultValue="identity" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="identity" className="flex items-center gap-1">
                <FileText className="h-4 w-4" />
                Identity
              </TabsTrigger>
              <TabsTrigger value="soul" className="flex items-center gap-1">
                <Sparkles className="h-4 w-4" />
                Soul
              </TabsTrigger>
            </TabsList>
            <TabsContent value="identity">
              <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:mt-4 prose-headings:mb-2 prose-p:my-2 prose-ul:my-2 prose-li:my-0">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{identityMarkdown}</ReactMarkdown>
              </div>
            </TabsContent>
            <TabsContent value="soul">
              <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:mt-4 prose-headings:mb-2 prose-p:my-2 prose-ul:my-2 prose-li:my-0">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{identity.soul || '*No soul content yet.*'}</ReactMarkdown>
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:mt-4 prose-headings:mb-2 prose-p:my-2 prose-ul:my-2 prose-li:my-0">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{identityMarkdown}</ReactMarkdown>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function IndividualsPage() {
  // Fetch individuals
  const { data, isLoading, error } = useApiQuery<IndividualsResponse>(
    ['individuals'],
    '/api/admin/individuals'
  );

  const individuals = data?.individuals ?? [];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Individuals</h1>
          <p className="mt-2 text-gray-600">
            AI beings with identity files - Wren, Myra, Benson, and others.
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-4 text-red-800">
          {error.message}
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

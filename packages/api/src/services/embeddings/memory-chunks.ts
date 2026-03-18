import type { Json, TablesInsert } from '../../data/supabase/types';
import type { EmbeddingResult } from './router';
import { type VettedEmbeddingModel } from './vetted-models';

export const MEMORY_EMBEDDING_CHUNKS_VERSION = 1;
const DEFAULT_MAX_CHARS = 1000;
const DEFAULT_OVERLAP_CHARS = 150;

export interface MemoryEmbeddingChunk {
  chunkIndex: number;
  chunkType: 'summary' | 'content';
  text: string;
  startOffset: number;
  endOffset: number;
}

export interface EmbeddedMemoryChunk extends MemoryEmbeddingChunk {
  embedding: EmbeddingResult;
}

function pickMaxChunkChars(model: VettedEmbeddingModel | null): number {
  if (!model?.maxInputChars) return DEFAULT_MAX_CHARS;
  return Math.max(200, model.maxInputChars - 100);
}

function findChunkBoundary(text: string, start: number, targetEnd: number): number {
  if (targetEnd >= text.length) return text.length;

  const minBoundary = Math.min(text.length, start + Math.floor((targetEnd - start) * 0.6));
  const window = text.slice(minBoundary, targetEnd);
  const breakCandidates = ['\n\n', '\n', '. ', ' '];

  for (const delimiter of breakCandidates) {
    const idx = window.lastIndexOf(delimiter);
    if (idx !== -1) return minBoundary + idx + delimiter.length;
  }

  return targetEnd;
}

function buildContentChunks(
  text: string,
  maxChars: number,
  overlapChars: number
): MemoryEmbeddingChunk[] {
  const normalized = text.trim();
  if (!normalized) return [];

  const chunks: MemoryEmbeddingChunk[] = [];
  let start = 0;
  let chunkIndex = 0;

  while (start < normalized.length) {
    const targetEnd = Math.min(normalized.length, start + maxChars);
    const end = findChunkBoundary(normalized, start, targetEnd);
    const chunkText = normalized.slice(start, end).trim();

    if (chunkText) {
      chunks.push({
        chunkIndex,
        chunkType: 'content',
        text: chunkText,
        startOffset: start,
        endOffset: end,
      });
      chunkIndex += 1;
    }

    if (end >= normalized.length) break;
    start = Math.max(end - overlapChars, start + 1);
  }

  return chunks;
}

export function buildMemoryEmbeddingChunks(params: {
  summary?: string | null;
  content: string;
  model?: VettedEmbeddingModel | null;
}): MemoryEmbeddingChunk[] {
  const { summary, content, model = null } = params;
  const chunks: MemoryEmbeddingChunk[] = [];
  const maxChars = pickMaxChunkChars(model);

  const normalizedSummary = summary?.trim();
  if (normalizedSummary) {
    chunks.push({
      chunkIndex: 0,
      chunkType: 'summary',
      text: normalizedSummary,
      startOffset: 0,
      endOffset: normalizedSummary.length,
    });
  }

  const contentChunks = buildContentChunks(content, maxChars, DEFAULT_OVERLAP_CHARS).map(
    (chunk) => ({
      ...chunk,
      chunkIndex: chunk.chunkIndex + chunks.length,
    })
  );

  return [...chunks, ...contentChunks];
}

export function formatVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

export function buildChunkRows(params: {
  memoryId: string;
  userId: string;
  chunks: EmbeddedMemoryChunk[];
}): TablesInsert<'memory_embedding_chunks'>[] {
  const { memoryId, userId, chunks } = params;

  return chunks.map((chunk) => ({
    memory_id: memoryId,
    user_id: userId,
    chunk_index: chunk.chunkIndex,
    chunk_type: chunk.chunkType,
    chunk_text: chunk.text,
    embedding: formatVectorLiteral(chunk.embedding.vector),
    metadata: {
      embedding: {
        provider: chunk.embedding.provider,
        model: chunk.embedding.model,
        dimensions: chunk.embedding.dimensions,
      },
      startOffset: chunk.startOffset,
      endOffset: chunk.endOffset,
      version: MEMORY_EMBEDDING_CHUNKS_VERSION,
    } satisfies Json,
  }));
}

export function buildChunkMetadataUpdate(params: {
  provider: string;
  model: string;
  chunkCount: number;
  existingMetadata?: Record<string, unknown> | null;
}): Record<string, unknown> {
  const { provider, model, chunkCount, existingMetadata } = params;
  return {
    ...(existingMetadata || {}),
    embedding_chunks: {
      provider,
      model,
      version: MEMORY_EMBEDDING_CHUNKS_VERSION,
      chunkCount,
      updatedAt: new Date().toISOString(),
    },
  };
}

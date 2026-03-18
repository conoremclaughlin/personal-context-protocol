-- Chunked semantic embeddings for memories so long memories keep full retrieval coverage.

ALTER TABLE public.memories
  ADD COLUMN IF NOT EXISTS embedding_chunks_version integer,
  ADD COLUMN IF NOT EXISTS embedding_chunk_count integer;

CREATE TABLE IF NOT EXISTS public.memory_embedding_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id uuid NOT NULL REFERENCES public.memories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  chunk_type text NOT NULL,
  chunk_text text NOT NULL,
  embedding vector(1024) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT memory_embedding_chunks_memory_chunk_key UNIQUE (memory_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_memory_embedding_chunks_memory_id
  ON public.memory_embedding_chunks(memory_id);

CREATE INDEX IF NOT EXISTS idx_memory_embedding_chunks_user_id
  ON public.memory_embedding_chunks(user_id);

CREATE INDEX IF NOT EXISTS idx_memory_embedding_chunks_embedding
  ON public.memory_embedding_chunks
  USING hnsw (embedding vector_cosine_ops);

DROP TRIGGER IF EXISTS set_memory_embedding_chunks_updated_at ON public.memory_embedding_chunks;
CREATE TRIGGER set_memory_embedding_chunks_updated_at
  BEFORE UPDATE ON public.memory_embedding_chunks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.match_memory_embedding_chunks(
  query_embedding vector,
  match_threshold double precision DEFAULT 0.2,
  match_count integer DEFAULT 20,
  p_user_id uuid DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_salience text DEFAULT NULL,
  p_topics text[] DEFAULT NULL,
  p_agent_id text DEFAULT NULL,
  p_include_shared boolean DEFAULT true,
  p_include_expired boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  content text,
  summary text,
  topic_key text,
  source text,
  salience text,
  topics text[],
  embedding vector,
  metadata jsonb,
  version integer,
  created_at timestamptz,
  expires_at timestamptz,
  agent_id text,
  identity_id uuid,
  matched_chunk_text text,
  matched_chunk_index integer,
  similarity double precision
)
LANGUAGE sql
STABLE
AS $$
  WITH ranked_matches AS (
    SELECT
      m.id,
      m.user_id,
      m.content,
      m.summary,
      m.topic_key,
      m.source,
      m.salience,
      m.topics,
      m.embedding,
      m.metadata,
      m.version,
      m.created_at,
      m.expires_at,
      m.agent_id,
      m.identity_id,
      c.chunk_text AS matched_chunk_text,
      c.chunk_index AS matched_chunk_index,
      1 - (c.embedding <=> query_embedding) AS similarity,
      row_number() OVER (
        PARTITION BY m.id
        ORDER BY c.embedding <=> query_embedding ASC, c.chunk_index ASC
      ) AS rank_within_memory
    FROM public.memory_embedding_chunks c
    JOIN public.memories m ON m.id = c.memory_id
    WHERE
      (p_user_id IS NULL OR m.user_id = p_user_id)
      AND (p_source IS NULL OR m.source = p_source)
      AND (p_salience IS NULL OR m.salience = p_salience)
      AND (p_topics IS NULL OR m.topics && p_topics)
      AND (
        p_agent_id IS NULL
        OR (
          p_include_shared
          AND (m.agent_id = p_agent_id OR m.agent_id IS NULL)
        )
        OR (
          NOT p_include_shared
          AND m.agent_id = p_agent_id
        )
      )
      AND (
        p_include_expired
        OR m.expires_at IS NULL
        OR m.expires_at > now()
      )
      AND 1 - (c.embedding <=> query_embedding) > match_threshold
  )
  SELECT
    id,
    user_id,
    content,
    summary,
    topic_key,
    source,
    salience,
    topics,
    embedding,
    metadata,
    version,
    created_at,
    expires_at,
    agent_id,
    identity_id,
    matched_chunk_text,
    matched_chunk_index,
    similarity
  FROM ranked_matches
  WHERE rank_within_memory = 1
  ORDER BY similarity DESC, created_at DESC
  LIMIT match_count;
$$;

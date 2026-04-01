-- Add sandbox_bypass flag to studios and agent_identities.
-- Precedence: studio override > SB default.

-- Per-studio override
ALTER TABLE public.studios
  ADD COLUMN IF NOT EXISTS sandbox_bypass boolean DEFAULT null;

COMMENT ON COLUMN public.studios.sandbox_bypass IS
  'Per-studio sandbox bypass override. null = inherit from agent identity. true/false = explicit override.';

-- Per-SB default
ALTER TABLE public.agent_identities
  ADD COLUMN IF NOT EXISTS sandbox_bypass boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.agent_identities.sandbox_bypass IS
  'SB-level default for sandbox bypass. When true, all studios for this agent default to bypassing sandbox restrictions unless overridden per-studio.';

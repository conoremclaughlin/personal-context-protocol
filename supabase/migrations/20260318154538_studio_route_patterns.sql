-- Add route_patterns to studios table for pattern-based trigger routing.
-- Studios declare which threadKey patterns they handle (e.g., 'pr:*', 'spec:*').
-- See spec: pcp://specs/trigger-studio-routing

ALTER TABLE studios ADD COLUMN IF NOT EXISTS route_patterns text[] DEFAULT '{}';

-- Index for efficient lookup of studios with non-empty patterns
CREATE INDEX IF NOT EXISTS idx_studios_route_patterns
  ON studios USING gin (route_patterns)
  WHERE route_patterns != '{}';

COMMENT ON COLUMN studios.route_patterns IS 'ThreadKey glob patterns this studio handles (e.g., pr:*, spec:*, branch:wren/feat/auth). Used by trigger routing to select the right studio.';

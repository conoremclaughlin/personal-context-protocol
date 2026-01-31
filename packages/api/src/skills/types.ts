/**
 * Unified Skill Types
 *
 * Future-proof skill system supporting multiple skill types:
 * - mini-app: Code-based skills with functions (e.g., bill-split)
 * - cli: External CLI tools (e.g., gh, aws, gcloud)
 * - guide: Markdown-based guides for handling situations (e.g., group chat etiquette)
 */

// ============================================================================
// Skill Types
// ============================================================================

export type SkillType = 'mini-app' | 'cli' | 'guide';

export type SkillStatus = 'available' | 'installed' | 'needs-setup' | 'disabled';

// ============================================================================
// Installation & Requirements (inspired by Clawdbot)
// ============================================================================

export type InstallKind = 'brew' | 'npm' | 'pip' | 'go' | 'cargo' | 'manual' | 'builtin';

export interface InstallSpec {
  kind: InstallKind;
  /** Package/formula name */
  package?: string;
  /** For brew: formula name */
  formula?: string;
  /** Binary names this installs */
  bins?: string[];
  /** For npm: global vs local */
  global?: boolean;
  /** For manual: URL to download */
  url?: string;
  /** Installation instructions for manual */
  instructions?: string;
}

export interface RequirementsSpec {
  /** Required binaries (all must exist) */
  bins?: string[];
  /** Alternative binaries (at least one must exist) */
  anyBins?: string[];
  /** Required environment variables */
  env?: string[];
  /** Required config files */
  config?: string[];
  /** Supported operating systems */
  os?: Array<'macos' | 'linux' | 'windows'>;
  /** Minimum version requirements */
  versions?: Record<string, string>;
}

export interface EligibilityResult {
  eligible: boolean;
  missingBins?: string[];
  missingEnv?: string[];
  missingConfig?: string[];
  unsupportedOs?: boolean;
  message?: string;
}

// ============================================================================
// Skill Manifest (unified format)
// ============================================================================

export interface SkillManifest {
  /** Unique identifier (lowercase, hyphens) */
  name: string;
  /** Semantic version */
  version: string;
  /** Human-readable display name */
  displayName?: string;
  /** Short description */
  description: string;
  /** Skill type */
  type: SkillType;
  /** Visual identifier */
  emoji?: string;
  /** Category for organization */
  category?: string;
  /** Tags for search */
  tags?: string[];
  /** Author/maintainer */
  author?: string;
  /** Documentation URL */
  homepage?: string;
  /** Repository URL */
  repository?: string;

  // ---- Triggers (when to suggest this skill) ----
  triggers?: {
    /** Keywords that suggest this skill */
    keywords?: string[];
    /** Intent identifiers */
    intents?: string[];
    /** Regex patterns */
    patterns?: string[];
    /** Always include in prompts */
    always?: boolean;
  };

  // ---- Capabilities (what the skill can do) ----
  capabilities?: {
    /** Can process images */
    vision?: boolean;
    /** Uses persistent memory */
    memory?: boolean;
    /** Makes external API calls */
    network?: boolean;
    /** Accesses file system */
    filesystem?: boolean;
    /** Runs shell commands */
    shell?: boolean;
  };

  // ---- Requirements & Installation ----
  requirements?: RequirementsSpec;
  install?: InstallSpec[];

  // ---- Type-specific configuration ----

  /** For mini-app: function definitions */
  functions?: SkillFunction[];

  /** For cli: command configuration */
  cli?: {
    /** Primary binary name */
    bin: string;
    /** Subcommands exposed as tools */
    commands?: CliCommand[];
    /** Environment variables to pass */
    env?: Record<string, string>;
  };

  /** For guide: context configuration */
  guide?: {
    /** When to inject this guide */
    contexts?: Array<'group-chat' | 'direct-message' | 'channel' | 'email' | 'any'>;
    /** Priority (higher = more important) */
    priority?: number;
  };

  /** Entry point file (SKILL.md for documentation) */
  entry?: string;
}

// ============================================================================
// Function Definitions (for mini-apps)
// ============================================================================

export interface SkillFunction {
  name: string;
  description: string;
  input: Record<string, SkillFieldType>;
  output: Record<string, SkillFieldType>;
}

export type SkillFieldType =
  | 'string'
  | 'string?'
  | 'number'
  | 'number?'
  | 'boolean'
  | 'boolean?'
  | 'array'
  | 'array?'
  | 'object'
  | 'object?';

// ============================================================================
// CLI Commands (for cli skills)
// ============================================================================

export interface CliCommand {
  /** Command name (e.g., "pr list") */
  name: string;
  /** Description */
  description: string;
  /** Tool name to register */
  toolName?: string;
  /** Arguments template */
  args?: string;
  /** How to handle arguments */
  argMode?: 'raw' | 'json' | 'flags';
}

// ============================================================================
// Loaded Skill (runtime representation)
// ============================================================================

export interface LoadedSkill {
  manifest: SkillManifest;
  /** Full SKILL.md content */
  skillContent: string;
  /** Source path */
  sourcePath: string;
  /** Eligibility check result */
  eligibility: EligibilityResult;
  /** For mini-apps: loaded functions */
  functions?: Record<string, (...args: unknown[]) => unknown>;
}

// ============================================================================
// User Skill Settings
// ============================================================================

export interface UserSkillSettings {
  skillName: string;
  enabled: boolean;
  /** User-specific configuration */
  config?: Record<string, unknown>;
  /** Last time skill was used */
  lastUsedAt?: string;
  /** Usage count */
  usageCount?: number;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface SkillSummary {
  name: string;
  displayName: string;
  description: string;
  type: SkillType;
  emoji?: string;
  category?: string;
  tags?: string[];
  version: string;
  status: SkillStatus;
  triggers?: string[];
  functionCount?: number;
  capabilities?: SkillManifest['capabilities'];
  eligibility: EligibilityResult;
}

export interface SkillDetail extends SkillSummary {
  skillContent: string;
  manifest: SkillManifest;
  userSettings?: UserSkillSettings;
  usageStats?: {
    totalRecords: number;
    lastUsedAt?: string;
  };
}

export interface SkillsListResponse {
  skills: SkillSummary[];
  categories: string[];
  totalCount: number;
}

import * as sharedPolicyCore from '@personal-context/shared';

export type ToolGroupMap = Record<string, string[]>;

function normalizeLocal(value: string): string {
  return value.trim().toLowerCase();
}

function escapeRegex(value: string): string {
  return value.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

function compileLocal(pattern: string): RegExp | null {
  const normalized = normalizeLocal(pattern);
  if (!normalized) return null;
  if (normalized === '*') return /^.*$/i;
  if (!normalized.includes('*')) return new RegExp(`^${escapeRegex(normalized)}$`, 'i');
  return new RegExp(`^${escapeRegex(normalized).replaceAll('*', '.*')}$`, 'i');
}

function matchesLocal(value: string, pattern: string): boolean {
  const compiled = compileLocal(pattern);
  if (!compiled) return false;
  return compiled.test(normalizeLocal(value));
}

function matchesAnyLocal(value: string, patterns: Iterable<string>): boolean {
  const normalized = normalizeLocal(value);
  for (const pattern of patterns) {
    if (matchesLocal(normalized, pattern)) {
      return true;
    }
  }
  return false;
}

function expandLocal(specs: string[], groups: ToolGroupMap): string[] {
  const expanded: string[] = [];
  for (const spec of specs) {
    const normalized = normalizeLocal(spec);
    if (!normalized) continue;
    const groupMembers = groups[normalized];
    if (groupMembers && groupMembers.length > 0) {
      for (const member of groupMembers) {
        const normalizedMember = normalizeLocal(member);
        if (normalizedMember) expanded.push(normalizedMember);
      }
    } else {
      expanded.push(normalized);
    }
  }
  return Array.from(new Set(expanded));
}

const normalizeShared = (sharedPolicyCore as { normalizePolicyToken?: (value: string) => string })
  .normalizePolicyToken;
const compileShared = (
  sharedPolicyCore as { compilePolicyPattern?: (pattern: string) => RegExp | null }
).compilePolicyPattern;
const matchesShared = (
  sharedPolicyCore as { matchesPolicyPattern?: (value: string, pattern: string) => boolean }
).matchesPolicyPattern;
const matchesAnyShared = (
  sharedPolicyCore as {
    matchesAnyPolicyPattern?: (value: string, patterns: Iterable<string>) => boolean;
  }
).matchesAnyPolicyPattern;
const expandShared = (
  sharedPolicyCore as {
    expandPolicySpecs?: (specs: string[], groups: ToolGroupMap) => string[];
  }
).expandPolicySpecs;

export function normalizePolicyToken(value: string): string {
  return normalizeShared ? normalizeShared(value) : normalizeLocal(value);
}

export function compilePolicyPattern(pattern: string): RegExp | null {
  return compileShared ? compileShared(pattern) : compileLocal(pattern);
}

export function matchesPolicyPattern(value: string, pattern: string): boolean {
  return matchesShared ? matchesShared(value, pattern) : matchesLocal(value, pattern);
}

export function matchesAnyPolicyPattern(value: string, patterns: Iterable<string>): boolean {
  return matchesAnyShared ? matchesAnyShared(value, patterns) : matchesAnyLocal(value, patterns);
}

export function expandPolicySpecs(specs: string[], groups: ToolGroupMap): string[] {
  return expandShared ? expandShared(specs, groups) : expandLocal(specs, groups);
}

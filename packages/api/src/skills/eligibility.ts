/**
 * Skill Eligibility Checker
 *
 * Checks if a skill's requirements are met on the current system.
 * Inspired by Clawdbot's eligibility checking.
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { platform } from 'os';
import type { RequirementsSpec, EligibilityResult } from './types';

/**
 * Check if a binary exists in PATH
 */
function binExists(bin: string): boolean {
  try {
    const command = platform() === 'win32' ? `where ${bin}` : `which ${bin}`;
    execSync(command, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if an environment variable is set
 */
function envExists(envVar: string): boolean {
  return process.env[envVar] !== undefined && process.env[envVar] !== '';
}

/**
 * Check if a config file exists
 */
function configExists(configPath: string): boolean {
  // Expand ~ to home directory
  const expandedPath = configPath.replace(/^~/, process.env.HOME || '');
  return existsSync(expandedPath);
}

/**
 * Get current OS identifier
 */
function getCurrentOs(): 'macos' | 'linux' | 'windows' {
  const p = platform();
  if (p === 'darwin') return 'macos';
  if (p === 'win32') return 'windows';
  return 'linux';
}

/**
 * Check if a skill's requirements are met
 */
export function checkEligibility(requirements?: RequirementsSpec): EligibilityResult {
  if (!requirements) {
    return { eligible: true };
  }

  const missingBins: string[] = [];
  const missingEnv: string[] = [];
  const missingConfig: string[] = [];
  let unsupportedOs = false;

  // Check OS
  if (requirements.os && requirements.os.length > 0) {
    const currentOs = getCurrentOs();
    if (!requirements.os.includes(currentOs)) {
      unsupportedOs = true;
    }
  }

  // Check required binaries (all must exist)
  if (requirements.bins) {
    for (const bin of requirements.bins) {
      if (!binExists(bin)) {
        missingBins.push(bin);
      }
    }
  }

  // Check alternative binaries (at least one must exist)
  if (requirements.anyBins && requirements.anyBins.length > 0) {
    const hasAny = requirements.anyBins.some(binExists);
    if (!hasAny) {
      missingBins.push(`one of: ${requirements.anyBins.join(', ')}`);
    }
  }

  // Check environment variables
  if (requirements.env) {
    for (const env of requirements.env) {
      if (!envExists(env)) {
        missingEnv.push(env);
      }
    }
  }

  // Check config files
  if (requirements.config) {
    for (const config of requirements.config) {
      if (!configExists(config)) {
        missingConfig.push(config);
      }
    }
  }

  // Determine eligibility
  const eligible =
    !unsupportedOs &&
    missingBins.length === 0 &&
    missingEnv.length === 0 &&
    missingConfig.length === 0;

  // Build message
  const messages: string[] = [];
  if (unsupportedOs) {
    messages.push(`Not supported on ${getCurrentOs()}`);
  }
  if (missingBins.length > 0) {
    messages.push(`Missing binaries: ${missingBins.join(', ')}`);
  }
  if (missingEnv.length > 0) {
    messages.push(`Missing environment variables: ${missingEnv.join(', ')}`);
  }
  if (missingConfig.length > 0) {
    messages.push(`Missing config files: ${missingConfig.join(', ')}`);
  }

  return {
    eligible,
    missingBins: missingBins.length > 0 ? missingBins : undefined,
    missingEnv: missingEnv.length > 0 ? missingEnv : undefined,
    missingConfig: missingConfig.length > 0 ? missingConfig : undefined,
    unsupportedOs: unsupportedOs || undefined,
    message: messages.length > 0 ? messages.join('; ') : undefined,
  };
}

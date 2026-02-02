/**
 * Tests for Skill Eligibility Checking
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkEligibility } from './eligibility';
import type { RequirementsSpec } from './types';

// Mock child_process.execSync
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

// Mock fs.existsSync
vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

// Mock os.platform
vi.mock('os', () => ({
  platform: vi.fn(() => 'darwin'),
}));

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { platform } from 'os';

describe('checkEligibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mocks
    vi.mocked(platform).mockReturnValue('darwin');
    vi.mocked(execSync).mockImplementation(() => Buffer.from(''));
    vi.mocked(existsSync).mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('with no requirements', () => {
    it('should return eligible when requirements is undefined', () => {
      const result = checkEligibility(undefined);
      expect(result.eligible).toBe(true);
      expect(result.message).toBeUndefined();
    });

    it('should return eligible when requirements is empty', () => {
      const result = checkEligibility({});
      expect(result.eligible).toBe(true);
    });
  });

  describe('binary requirements', () => {
    it('should pass when all required binaries exist', () => {
      vi.mocked(execSync).mockImplementation(() => Buffer.from('/usr/bin/node'));

      const requirements: RequirementsSpec = {
        bins: ['node', 'npm'],
      };

      const result = checkEligibility(requirements);
      expect(result.eligible).toBe(true);
      expect(result.missingBins).toBeUndefined();
    });

    it('should fail when a required binary is missing', () => {
      vi.mocked(execSync).mockImplementation((cmd) => {
        if (cmd.includes('missing-binary')) {
          throw new Error('not found');
        }
        return Buffer.from('/usr/bin/node');
      });

      const requirements: RequirementsSpec = {
        bins: ['node', 'missing-binary'],
      };

      const result = checkEligibility(requirements);
      expect(result.eligible).toBe(false);
      expect(result.missingBins).toContain('missing-binary');
      expect(result.message).toContain('Missing binaries');
    });

    it('should pass anyBins when at least one exists', () => {
      vi.mocked(execSync).mockImplementation((cmd) => {
        if (cmd.includes('yarn')) {
          return Buffer.from('/usr/bin/yarn');
        }
        throw new Error('not found');
      });

      const requirements: RequirementsSpec = {
        anyBins: ['pnpm', 'yarn', 'npm'],
      };

      const result = checkEligibility(requirements);
      expect(result.eligible).toBe(true);
    });

    it('should fail anyBins when none exist', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('not found');
      });

      const requirements: RequirementsSpec = {
        anyBins: ['pnpm', 'yarn'],
      };

      const result = checkEligibility(requirements);
      expect(result.eligible).toBe(false);
      expect(result.missingBins).toContain('one of: pnpm, yarn');
    });
  });

  describe('environment variable requirements', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should pass when all env vars are set', () => {
      process.env.API_KEY = 'secret';
      process.env.DATABASE_URL = 'postgres://localhost';

      const requirements: RequirementsSpec = {
        env: ['API_KEY', 'DATABASE_URL'],
      };

      const result = checkEligibility(requirements);
      expect(result.eligible).toBe(true);
      expect(result.missingEnv).toBeUndefined();
    });

    it('should fail when an env var is missing', () => {
      process.env.API_KEY = 'secret';
      delete process.env.MISSING_VAR;

      const requirements: RequirementsSpec = {
        env: ['API_KEY', 'MISSING_VAR'],
      };

      const result = checkEligibility(requirements);
      expect(result.eligible).toBe(false);
      expect(result.missingEnv).toContain('MISSING_VAR');
      expect(result.message).toContain('Missing environment variables');
    });

    it('should treat empty string as missing', () => {
      process.env.EMPTY_VAR = '';

      const requirements: RequirementsSpec = {
        env: ['EMPTY_VAR'],
      };

      const result = checkEligibility(requirements);
      expect(result.eligible).toBe(false);
      expect(result.missingEnv).toContain('EMPTY_VAR');
    });
  });

  describe('config file requirements', () => {
    it('should pass when all config files exist', () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const requirements: RequirementsSpec = {
        config: ['~/.config/app/config.json', '/etc/app.conf'],
      };

      const result = checkEligibility(requirements);
      expect(result.eligible).toBe(true);
      expect(result.missingConfig).toBeUndefined();
    });

    it('should fail when a config file is missing', () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        return !String(path).includes('missing');
      });

      const requirements: RequirementsSpec = {
        config: ['~/.config/exists.json', '~/.config/missing.json'],
      };

      const result = checkEligibility(requirements);
      expect(result.eligible).toBe(false);
      expect(result.missingConfig).toContain('~/.config/missing.json');
      expect(result.message).toContain('Missing config files');
    });

    it('should expand ~ to home directory', () => {
      const requirements: RequirementsSpec = {
        config: ['~/.config/app.json'],
      };

      checkEligibility(requirements);

      // existsSync should be called with expanded path
      expect(existsSync).toHaveBeenCalled();
      const calledWith = vi.mocked(existsSync).mock.calls[0][0];
      expect(String(calledWith)).not.toContain('~');
    });
  });

  describe('OS requirements', () => {
    it('should pass when current OS is in allowed list', () => {
      vi.mocked(platform).mockReturnValue('darwin');

      const requirements: RequirementsSpec = {
        os: ['macos', 'linux'],
      };

      const result = checkEligibility(requirements);
      expect(result.eligible).toBe(true);
      expect(result.unsupportedOs).toBeUndefined();
    });

    it('should fail when current OS is not in allowed list', () => {
      vi.mocked(platform).mockReturnValue('win32');

      const requirements: RequirementsSpec = {
        os: ['macos', 'linux'],
      };

      const result = checkEligibility(requirements);
      expect(result.eligible).toBe(false);
      expect(result.unsupportedOs).toBe(true);
      expect(result.message).toContain('Not supported on windows');
    });

    it('should map platform names correctly', () => {
      // darwin -> macos
      vi.mocked(platform).mockReturnValue('darwin');
      let result = checkEligibility({ os: ['macos'] });
      expect(result.eligible).toBe(true);

      // win32 -> windows
      vi.mocked(platform).mockReturnValue('win32');
      result = checkEligibility({ os: ['windows'] });
      expect(result.eligible).toBe(true);

      // linux -> linux
      vi.mocked(platform).mockReturnValue('linux');
      result = checkEligibility({ os: ['linux'] });
      expect(result.eligible).toBe(true);
    });
  });

  describe('combined requirements', () => {
    it('should check all requirements and combine messages', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('not found');
      });
      vi.mocked(existsSync).mockReturnValue(false);
      process.env.MISSING_ENV = '';
      vi.mocked(platform).mockReturnValue('win32');

      const requirements: RequirementsSpec = {
        bins: ['missing-bin'],
        env: ['MISSING_ENV'],
        config: ['~/.missing.conf'],
        os: ['macos'],
      };

      const result = checkEligibility(requirements);
      expect(result.eligible).toBe(false);
      expect(result.missingBins).toContain('missing-bin');
      expect(result.missingEnv).toContain('MISSING_ENV');
      expect(result.missingConfig).toContain('~/.missing.conf');
      expect(result.unsupportedOs).toBe(true);
      expect(result.message).toContain(';'); // Multiple messages joined
    });

    it('should pass only if all requirements are met', () => {
      vi.mocked(execSync).mockImplementation(() => Buffer.from('/usr/bin/node'));
      vi.mocked(existsSync).mockReturnValue(true);
      process.env.REQUIRED_ENV = 'value';
      vi.mocked(platform).mockReturnValue('darwin');

      const requirements: RequirementsSpec = {
        bins: ['node'],
        env: ['REQUIRED_ENV'],
        config: ['~/.config.json'],
        os: ['macos'],
      };

      const result = checkEligibility(requirements);
      expect(result.eligible).toBe(true);
    });
  });
});

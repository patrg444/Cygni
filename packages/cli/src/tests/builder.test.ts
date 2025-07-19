import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildProject, BuildConfig } from '../lib/builder';
import { exec } from 'child_process';
import fs from 'fs/promises';
import * as frameworkDetector from '../utils/framework-detector';

vi.mock('child_process');
vi.mock('fs/promises');
vi.mock('../utils/framework-detector');

describe('Builder', () => {
  const mockConfig: BuildConfig = {
    name: 'test-app',
    framework: 'nextjs',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('buildProject', () => {
    it('should get git info successfully', async () => {
      const mockExec = vi.mocked(exec);
      mockExec.mockImplementation((_cmd: any, cb: any) => {
        if (_cmd === 'git rev-parse HEAD') {
          cb(null, { stdout: 'abc123def456\n' });
        } else if (_cmd === 'git rev-parse --abbrev-ref HEAD') {
          cb(null, { stdout: 'main\n' });
        }
        return {} as any;
      });

      vi.mocked(fs.access).mockRejectedValue(new Error('No Dockerfile'));

      const result = await buildProject(mockConfig);

      expect(result.commitSha).toBe('abc123def456');
      expect(result.branch).toBe('main');
      expect(result.hasDockerfile).toBe(false);
    });

    it('should handle non-git repository gracefully', async () => {
      const mockExec = vi.mocked(exec);
      mockExec.mockImplementation((_cmd: any, cb: any) => {
        cb(new Error('Not a git repository'));
        return {} as any;
      });

      vi.mocked(fs.access).mockRejectedValue(new Error('No Dockerfile'));

      const result = await buildProject(mockConfig);

      expect(result.commitSha).toMatch(/^[a-f0-9]{40}$/); // SHA1 hash
      expect(result.branch).toBe('main');
    });

    it('should detect Dockerfile when present', async () => {
      const mockExec = vi.mocked(exec);
      mockExec.mockImplementation((_cmd: any, cb: any) => {
        if (_cmd === 'git rev-parse HEAD') {
          cb(null, { stdout: 'abc123def456\n' });
        } else if (_cmd === 'git rev-parse --abbrev-ref HEAD') {
          cb(null, { stdout: 'main\n' });
        }
        return {} as any;
      });

      vi.mocked(fs.access).mockResolvedValueOnce(undefined); // Dockerfile exists

      const result = await buildProject(mockConfig);

      expect(result.hasDockerfile).toBe(true);
      expect(result.dockerfilePath).toBe('Dockerfile');
    });

    it('should auto-detect framework when not specified', async () => {
      const mockExec = vi.mocked(exec);
      mockExec.mockImplementation((_cmd: any, cb: any) => {
        if (_cmd === 'git rev-parse HEAD') {
          cb(null, { stdout: 'abc123def456\n' });
        } else if (_cmd === 'git rev-parse --abbrev-ref HEAD') {
          cb(null, { stdout: 'main\n' });
        }
        return {} as any;
      });

      vi.mocked(fs.access).mockRejectedValue(new Error('No Dockerfile'));
      vi.mocked(frameworkDetector.detectFramework).mockResolvedValue('react');

      const configWithoutFramework = { ...mockConfig, framework: undefined };
      const result = await buildProject(configWithoutFramework);

      expect(result.detectedFramework).toBe('react');
      expect(frameworkDetector.detectFramework).toHaveBeenCalled();
    });

    it('should run pre-build commands when specified', async () => {
      const mockExec = vi.mocked(exec);
      let prebuildCommandRun = false;

      mockExec.mockImplementation((_cmd: any, cb: any) => {
        if (_cmd === 'git rev-parse HEAD') {
          cb(null, { stdout: 'abc123def456\n' });
        } else if (_cmd === 'git rev-parse --abbrev-ref HEAD') {
          cb(null, { stdout: 'main\n' });
        } else if (_cmd === 'npm run prebuild') {
          prebuildCommandRun = true;
          cb(null, { stdout: 'Prebuild complete\n' });
        }
        return {} as any;
      });

      vi.mocked(fs.access).mockRejectedValue(new Error('No Dockerfile'));

      const configWithPrebuild: BuildConfig = {
        ...mockConfig,
        services: {
          web: {
            build: {
              command: 'npm run prebuild',
            },
          },
        },
      };

      await buildProject(configWithPrebuild);

      expect(prebuildCommandRun).toBe(true);
    });

    it('should set correct buildpack args for Next.js', async () => {
      const mockExec = vi.mocked(exec);
      mockExec.mockImplementation((_cmd: any, cb: any) => {
        if (_cmd === 'git rev-parse HEAD') {
          cb(null, { stdout: 'abc123def456\n' });
        } else if (_cmd === 'git rev-parse --abbrev-ref HEAD') {
          cb(null, { stdout: 'main\n' });
        }
        return {} as any;
      });

      vi.mocked(fs.access).mockRejectedValue(new Error('No Dockerfile'));

      const result = await buildProject(mockConfig);

      expect(result.buildArgs).toEqual({
        NODE_ENV: 'production',
        NEXT_TELEMETRY_DISABLED: '1',
      });
    });

    it('should check lowercase dockerfile variant', async () => {
      const mockExec = vi.mocked(exec);
      mockExec.mockImplementation((_cmd: any, cb: any) => {
        if (_cmd === 'git rev-parse HEAD') {
          cb(null, { stdout: 'abc123def456\n' });
        } else if (_cmd === 'git rev-parse --abbrev-ref HEAD') {
          cb(null, { stdout: 'main\n' });
        }
        return {} as any;
      });

      vi.mocked(fs.access)
        .mockRejectedValueOnce(new Error('No Dockerfile')) // Dockerfile
        .mockResolvedValueOnce(undefined); // dockerfile exists

      const result = await buildProject(mockConfig);

      expect(result.hasDockerfile).toBe(true);
      expect(result.dockerfilePath).toBe('dockerfile');
    });
  });
});
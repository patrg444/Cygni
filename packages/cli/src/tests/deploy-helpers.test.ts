import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  validateDeploymentOptions,
  checkBuildCache,
  displayDeploymentSummary,
  checkDeploymentHealth,
  getDeploymentHistory,
} from '../lib/deploy-helpers';
import * as apiClient from '../lib/api-client';
import { exec } from 'child_process';
import chalk from 'chalk';

vi.mock('../lib/api-client');
vi.mock('child_process');

// Mock console methods
const originalLog = console.log;
const originalError = console.error;

describe('Deploy Helpers', () => {
  let mockApi: any;
  let consoleOutput: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock console
    console.log = (...args: any[]) => {
      consoleOutput.push(args.map(arg => String(arg)).join(' '));
    };
    console.error = (...args: any[]) => {
      consoleOutput.push('ERROR: ' + args.map(arg => String(arg)).join(' '));
    };
    consoleOutput = [];

    // Mock API client
    mockApi = {
      get: vi.fn(),
      post: vi.fn(),
    };
    vi.mocked(apiClient.getApiClient).mockResolvedValue(mockApi);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    console.log = originalLog;
    console.error = originalError;
  });

  describe('validateDeploymentOptions', () => {
    it('should validate valid deployment strategy', () => {
      expect(() => validateDeploymentOptions({ strategy: 'rolling' })).not.toThrow();
      expect(() => validateDeploymentOptions({ strategy: 'canary' })).not.toThrow();
      expect(() => validateDeploymentOptions({ strategy: 'blue-green' })).not.toThrow();
    });

    it('should throw for invalid deployment strategy', () => {
      expect(() => validateDeploymentOptions({ strategy: 'invalid' }))
        .toThrow('Invalid deployment strategy. Must be one of: rolling, canary, blue-green');
    });

    it('should validate valid health gate levels', () => {
      expect(() => validateDeploymentOptions({ healthGate: 'strict' })).not.toThrow();
      expect(() => validateDeploymentOptions({ healthGate: 'normal' })).not.toThrow();
      expect(() => validateDeploymentOptions({ healthGate: 'off' })).not.toThrow();
    });

    it('should throw for invalid health gate level', () => {
      expect(() => validateDeploymentOptions({ healthGate: 'invalid' }))
        .toThrow('Invalid health gate level. Must be one of: strict, normal, off');
    });

    it('should pass with empty options', () => {
      expect(() => validateDeploymentOptions({})).not.toThrow();
    });
  });

  describe('checkBuildCache', () => {
    it('should return cached build when found', async () => {
      const mockExec = vi.mocked(exec);
      mockExec.mockImplementation((cmd: any, cb: any) => {
        cb(null, { stdout: 'abc123def456789  Dockerfile\n' });
      });

      mockApi.get.mockResolvedValueOnce({
        data: {
          cached: true,
          entry: {
            gitSha: 'abc123',
            dockerfileHash: 'abc123def456789',
            imageId: 'img-12345',
            timestamp: Date.now(),
          },
        },
      });

      const result = await checkBuildCache('abc123', 'Dockerfile');

      expect(result).toEqual({
        gitSha: 'abc123',
        dockerfileHash: 'abc123def456789',
        imageId: 'img-12345',
        timestamp: expect.any(Number),
      });
    });

    it('should return null when cache miss', async () => {
      mockApi.get.mockResolvedValueOnce({
        data: { cached: false },
      });

      const result = await checkBuildCache('abc123');

      expect(result).toBeNull();
    });

    it('should handle API errors gracefully', async () => {
      mockApi.get.mockRejectedValueOnce(new Error('API error'));

      const result = await checkBuildCache('abc123');

      expect(result).toBeNull();
    });

    it('should calculate dockerfile hash when provided', async () => {
      const mockExec = vi.mocked(exec);
      mockExec.mockImplementation((cmd: any, cb: any) => {
        expect(cmd).toBe('sha256sum Dockerfile');
        cb(null, { stdout: 'hash123  Dockerfile\n' });
      });

      mockApi.get.mockResolvedValueOnce({
        data: { cached: false },
      });

      await checkBuildCache('abc123', 'Dockerfile');

      expect(mockApi.get).toHaveBeenCalledWith('/builds/cache', {
        params: {
          gitSha: 'abc123',
          dockerfileHash: 'hash123',
        },
      });
    });
  });

  describe('displayDeploymentSummary', () => {
    it('should display basic deployment info', () => {
      const deployment = {
        id: 'dep-123',
        url: 'https://myapp.cygni.dev',
        status: 'active',
        environment: 'production',
      };

      displayDeploymentSummary(deployment, { env: 'production' });

      expect(consoleOutput).toContain(expect.stringContaining('✅ Deployment Complete!'));
      expect(consoleOutput).toContain(expect.stringContaining('https://myapp.cygni.dev'));
      expect(consoleOutput).toContain(expect.stringContaining('dep-123'));
      expect(consoleOutput).toContain(expect.stringContaining('production'));
    });

    it('should display strategy when not rolling', () => {
      const deployment = {
        id: 'dep-123',
        url: 'https://myapp.cygni.dev',
        status: 'active',
        environment: 'production',
      };

      displayDeploymentSummary(deployment, { env: 'production', strategy: 'canary' });

      expect(consoleOutput).toContain(expect.stringContaining('canary'));
    });
  });

  describe('checkDeploymentHealth', () => {
    it('should return true when deployment is healthy', async () => {
      mockApi.get.mockResolvedValueOnce({
        data: { healthy: true },
      });

      const result = await checkDeploymentHealth('dep-123', 'normal');

      expect(result).toBe(true);
      expect(mockApi.get).toHaveBeenCalledTimes(1);
    });

    it('should retry on unhealthy with normal gate', async () => {
      mockApi.get
        .mockResolvedValueOnce({ data: { healthy: false } })
        .mockResolvedValueOnce({ data: { healthy: false } })
        .mockResolvedValueOnce({ data: { healthy: true } });

      const result = await checkDeploymentHealth('dep-123', 'normal');

      expect(result).toBe(true);
      expect(mockApi.get).toHaveBeenCalledTimes(3);
    });

    it('should return true immediately when gate is off', async () => {
      mockApi.get.mockResolvedValueOnce({
        data: { healthy: false },
      });

      const result = await checkDeploymentHealth('dep-123', 'off');

      expect(result).toBe(true);
      expect(mockApi.get).toHaveBeenCalledTimes(1);
    });

    it('should retry more times with strict gate', async () => {
      mockApi.get.mockResolvedValue({ data: { healthy: false } });

      const result = await checkDeploymentHealth('dep-123', 'strict');

      expect(result).toBe(false);
      expect(mockApi.get).toHaveBeenCalledTimes(10); // strict = 10 attempts
    });

    it('should handle API errors during health check', async () => {
      mockApi.get
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ data: { healthy: true } });

      const result = await checkDeploymentHealth('dep-123', 'normal');

      expect(result).toBe(true);
      expect(mockApi.get).toHaveBeenCalledTimes(2);
    });
  });

  describe('getDeploymentHistory', () => {
    it('should fetch deployment history with default limit', async () => {
      const mockDeployments = [
        { id: 'dep-1', status: 'active' },
        { id: 'dep-2', status: 'inactive' },
      ];

      mockApi.get.mockResolvedValueOnce({
        data: { deployments: mockDeployments },
      });

      const result = await getDeploymentHistory('proj-123', 'production');

      expect(result).toEqual(mockDeployments);
      expect(mockApi.get).toHaveBeenCalledWith('/projects/proj-123/deployments', {
        params: {
          environment: 'production',
          limit: 10,
        },
      });
    });

    it('should use custom limit when provided', async () => {
      mockApi.get.mockResolvedValueOnce({
        data: { deployments: [] },
      });

      await getDeploymentHistory('proj-123', 'staging', 20);

      expect(mockApi.get).toHaveBeenCalledWith('/projects/proj-123/deployments', {
        params: {
          environment: 'staging',
          limit: 20,
        },
      });
    });
  });
});
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import { detectFramework, getFrameworkDefaults } from '../utils/framework-detector';

vi.mock('fs/promises');

describe('Framework Detector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('detectFramework', () => {
    it('should detect Next.js by config file', async () => {
      vi.mocked(fs.access).mockResolvedValueOnce(undefined);
      
      const result = await detectFramework();
      
      expect(result).toBe('nextjs');
      expect(fs.access).toHaveBeenCalledWith('next.config.js');
    });

    it('should detect React by package.json dependencies', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('Not found'));
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify({
        dependencies: {
          react: '^18.0.0',
          'react-dom': '^18.0.0',
        },
      }));
      
      const result = await detectFramework();
      
      expect(result).toBe('react');
    });

    it('should detect Django by manage.py file', async () => {
      vi.mocked(fs.access)
        .mockRejectedValueOnce(new Error('Not found')) // next.config.js
        .mockRejectedValueOnce(new Error('Not found')) // next.config.mjs
        .mockRejectedValueOnce(new Error('Not found')) // next.config.ts
        .mockRejectedValueOnce(new Error('Not found')) // vite.config.js
        .mockRejectedValueOnce(new Error('Not found')) // vite.config.ts
        .mockRejectedValueOnce(new Error('Not found')) // vue.config.js
        .mockRejectedValueOnce(new Error('Not found')) // vite.config.js (vue)
        .mockRejectedValueOnce(new Error('Not found')) // angular.json
        .mockRejectedValueOnce(new Error('Not found')) // svelte.config.js
        .mockResolvedValueOnce(undefined); // manage.py
      
      const result = await detectFramework();
      
      expect(result).toBe('django');
    });

    it('should detect Flask by requirements.txt content', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('Not found'));
      vi.mocked(fs.readFile)
        .mockRejectedValueOnce(new Error('No package.json'))
        .mockResolvedValueOnce('flask==2.3.0\nrequests==2.31.0\n');
      
      const result = await detectFramework();
      
      expect(result).toBe('flask');
    });

    it('should detect Rails by Gemfile content', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('Not found'));
      vi.mocked(fs.readFile)
        .mockRejectedValueOnce(new Error('No package.json'))
        .mockRejectedValueOnce(new Error('No requirements.txt'))
        .mockResolvedValueOnce('gem "rails", "~> 7.0.0"');
      
      const result = await detectFramework();
      
      expect(result).toBe('rails');
    });

    it('should return undefined if no framework detected', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('Not found'));
      vi.mocked(fs.readFile).mockRejectedValue(new Error('Not found'));
      
      const result = await detectFramework();
      
      expect(result).toBeUndefined();
    });

    it('should detect framework from scripts in package.json', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('Not found'));
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify({
        scripts: {
          start: 'react-scripts start',
          build: 'react-scripts build',
        },
      }));
      
      const result = await detectFramework();
      
      expect(result).toBe('react');
    });
  });

  describe('getFrameworkDefaults', () => {
    it('should return Next.js defaults', () => {
      const defaults = getFrameworkDefaults('nextjs');
      
      expect(defaults).toEqual({
        buildCommand: 'npm run build',
        startCommand: 'npm start',
        port: 3000,
        outputDir: '.next',
      });
    });

    it('should return Django defaults', () => {
      const defaults = getFrameworkDefaults('django');
      
      expect(defaults).toEqual({
        startCommand: 'python manage.py runserver 0.0.0.0:8000',
        port: 8000,
      });
    });

    it('should return empty object for unknown framework', () => {
      const defaults = getFrameworkDefaults('unknown');
      
      expect(defaults).toEqual({});
    });

    it('should return Express defaults', () => {
      const defaults = getFrameworkDefaults('express');
      
      expect(defaults).toEqual({
        startCommand: 'node index.js',
        port: 3000,
      });
    });

    it('should return Laravel defaults', () => {
      const defaults = getFrameworkDefaults('laravel');
      
      expect(defaults).toEqual({
        buildCommand: 'npm run build',
        startCommand: 'php artisan serve --host=0.0.0.0',
        port: 8000,
      });
    });
  });
});
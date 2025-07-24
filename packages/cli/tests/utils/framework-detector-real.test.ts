import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  detectFramework,
  getFrameworkDefaults,
} from "../../src/utils/framework-detector";
import { RealFileSystem } from "../services/real-file-system";
import path from "path";

describe("Framework Detector - Real Implementation", () => {
  let fileSystem: RealFileSystem;
  let testDir: string;

  beforeEach(async () => {
    fileSystem = new RealFileSystem("framework-detector");
    testDir = await fileSystem.createTestDir();
  });

  afterEach(async () => {
    await fileSystem.cleanup();
  });

  describe("detectFramework", () => {
    describe("Next.js detection", () => {
      it("should detect Next.js by next.config.js", async () => {
        await fileSystem.createFile("next.config.js", "module.exports = {};");

        const result = await detectFramework(testDir);
        expect(result).toBe("nextjs");
      });

      it("should detect Next.js by next.config.mjs", async () => {
        await fileSystem.createFile("next.config.mjs", "export default {};");

        const result = await detectFramework(testDir);
        expect(result).toBe("nextjs");
      });

      it("should detect Next.js by next.config.ts", async () => {
        await fileSystem.createFile("next.config.ts", "export default {};");

        const result = await detectFramework(testDir);
        expect(result).toBe("nextjs");
      });

      it("should detect Next.js by package.json dependencies", async () => {
        await fileSystem.createFile(
          "package.json",
          JSON.stringify({
            dependencies: {
              next: "^13.0.0",
              react: "^18.0.0",
              "react-dom": "^18.0.0",
            },
          }),
        );

        const result = await detectFramework(testDir);
        expect(result).toBe("nextjs");
      });
    });

    describe("React detection", () => {
      it("should detect React with vite.config.js", async () => {
        await fileSystem.createFile("vite.config.js", "export default {};");

        const result = await detectFramework(testDir);
        expect(result).toBe("react");
      });

      it("should detect React by dependencies when no config files", async () => {
        await fileSystem.createFile(
          "package.json",
          JSON.stringify({
            dependencies: {
              react: "^18.0.0",
              "react-dom": "^18.0.0",
            },
          }),
        );

        const result = await detectFramework(testDir);
        expect(result).toBe("react");
      });

      it("should detect React by react-scripts", async () => {
        await fileSystem.createFile(
          "package.json",
          JSON.stringify({
            scripts: {
              start: "react-scripts start",
              build: "react-scripts build",
            },
          }),
        );

        const result = await detectFramework(testDir);
        expect(result).toBe("react");
      });
    });

    describe("Django detection", () => {
      it("should detect Django by manage.py", async () => {
        await fileSystem.createFile(
          "manage.py",
          "#!/usr/bin/env python\n# Django manage file",
        );

        const result = await detectFramework(testDir);
        expect(result).toBe("django");
      });

      it("should detect Django by requirements.txt", async () => {
        await fileSystem.createFile(
          "requirements.txt",
          "django>=4.0\npsycopg2-binary\n",
        );

        const result = await detectFramework(testDir);
        expect(result).toBe("django");
      });
    });

    describe("Flask detection", () => {
      it("should detect Flask by app.py file", async () => {
        await fileSystem.createFile(
          "app.py",
          "from flask import Flask\napp = Flask(__name__)",
        );

        const result = await detectFramework(testDir);
        expect(result).toBe("flask");
      });

      it("should detect Flask from package.json dependencies", async () => {
        // Flask can also be in a Node.js project as a backend
        await fileSystem.createFile(
          "package.json",
          JSON.stringify({
            dependencies: {
              flask: "^2.0.0",
            },
          }),
        );

        const result = await detectFramework(testDir);
        expect(result).toBe("flask");
      });

      it("should detect Flask by application.py", async () => {
        await fileSystem.createFile(
          "application.py",
          "from flask import Flask\napp = Flask(__name__)",
        );

        const result = await detectFramework(testDir);
        expect(result).toBe("flask");
      });
    });

    describe("Rails detection", () => {
      it("should detect Rails by Gemfile", async () => {
        await fileSystem.createFile(
          "Gemfile",
          'source "https://rubygems.org"\ngem "rails", "~> 7.0.0"',
        );

        const result = await detectFramework(testDir);
        expect(result).toBe("rails");
      });

      it("should detect Rails by config.ru", async () => {
        await fileSystem.createFile(
          "config.ru",
          "require_relative 'config/environment'\nrun Rails.application",
        );

        const result = await detectFramework(testDir);
        expect(result).toBe("rails");
      });
    });

    describe("Vue detection", () => {
      it("should detect Vue by vue.config.js", async () => {
        await fileSystem.createFile("vue.config.js", "module.exports = {};");

        const result = await detectFramework(testDir);
        expect(result).toBe("vue");
      });

      it("should detect Vue by dependencies", async () => {
        await fileSystem.createFile(
          "package.json",
          JSON.stringify({
            dependencies: {
              vue: "^3.0.0",
            },
          }),
        );

        const result = await detectFramework(testDir);
        expect(result).toBe("vue");
      });
    });

    describe("Express detection", () => {
      it("should detect Express by dependencies", async () => {
        await fileSystem.createFile(
          "package.json",
          JSON.stringify({
            dependencies: {
              express: "^4.18.0",
            },
          }),
        );

        const result = await detectFramework(testDir);
        expect(result).toBe("express");
      });
    });

    describe("Framework priority", () => {
      it("should prioritize file-based detection over dependencies", async () => {
        // Create both Next.js config and React dependencies
        await fileSystem.createFile("next.config.js", "module.exports = {};");
        await fileSystem.createFile(
          "package.json",
          JSON.stringify({
            dependencies: {
              react: "^18.0.0",
              "react-dom": "^18.0.0",
            },
          }),
        );

        const result = await detectFramework(testDir);
        expect(result).toBe("nextjs"); // Should detect Next.js first
      });

      it("should handle projects with multiple framework files", async () => {
        // Create config files for multiple frameworks
        await fileSystem.createFile("next.config.js", "module.exports = {};");
        await fileSystem.createFile("vue.config.js", "module.exports = {};");
        await fileSystem.createFile("angular.json", "{}");

        const result = await detectFramework(testDir);
        expect(result).toBe("nextjs"); // First in the list wins
      });
    });

    describe("Edge cases", () => {
      it("should return undefined for unknown project", async () => {
        await fileSystem.createFile("index.html", "<html></html>");
        await fileSystem.createFile("style.css", "body { margin: 0; }");

        const result = await detectFramework(testDir);
        expect(result).toBeUndefined();
      });

      it("should handle empty directory", async () => {
        const result = await detectFramework(testDir);
        expect(result).toBeUndefined();
      });

      it("should handle invalid package.json", async () => {
        await fileSystem.createFile("package.json", "{ invalid json");

        const result = await detectFramework(testDir);
        expect(result).toBeUndefined();
      });

      it("should handle package.json without dependencies", async () => {
        await fileSystem.createFile(
          "package.json",
          JSON.stringify({
            name: "my-project",
            version: "1.0.0",
          }),
        );

        const result = await detectFramework(testDir);
        expect(result).toBeUndefined();
      });

      it("should detect from devDependencies", async () => {
        await fileSystem.createFile(
          "package.json",
          JSON.stringify({
            devDependencies: {
              next: "^13.0.0",
            },
          }),
        );

        const result = await detectFramework(testDir);
        expect(result).toBe("nextjs");
      });
    });

    describe("Real project structures", () => {
      it("should detect a typical Next.js project", async () => {
        await fileSystem.createStructure({
          "package.json": JSON.stringify({
            dependencies: {
              next: "13.4.0",
              react: "18.2.0",
              "react-dom": "18.2.0",
            },
          }),
          "next.config.js": "module.exports = { reactStrictMode: true };",
          pages: {
            "index.js":
              "export default function Home() { return <h1>Home</h1>; }",
            "_app.js":
              "export default function App({ Component, pageProps }) { return <Component {...pageProps} />; }",
          },
          public: {
            "favicon.ico": "",
          },
        });

        const result = await detectFramework(testDir);
        expect(result).toBe("nextjs");
      });

      it("should detect a typical Django project", async () => {
        await fileSystem.createStructure({
          "manage.py": `#!/usr/bin/env python
import os
import sys

if __name__ == '__main__':
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myproject.settings')
    from django.core.management import execute_from_command_line
    execute_from_command_line(sys.argv)
`,
          "requirements.txt": `Django==4.2.0
djangorestframework==3.14.0
psycopg2-binary==2.9.6
gunicorn==20.1.0
`,
          myproject: {
            "__init__.py": "",
            "settings.py": "# Django settings",
            "urls.py": "# URL configuration",
            "wsgi.py": "# WSGI config",
          },
        });

        const result = await detectFramework(testDir);
        expect(result).toBe("django");
      });

      it("should detect a Create React App project", async () => {
        await fileSystem.createStructure({
          "package.json": JSON.stringify({
            dependencies: {
              react: "^18.2.0",
              "react-dom": "^18.2.0",
              "react-scripts": "5.0.1",
            },
            scripts: {
              start: "react-scripts start",
              build: "react-scripts build",
              test: "react-scripts test",
              eject: "react-scripts eject",
            },
          }),
          public: {
            "index.html":
              '<!DOCTYPE html><html><head><title>React App</title></head><body><div id="root"></div></body></html>',
          },
          src: {
            "App.js": "function App() { return <div>Hello</div>; }",
            "index.js":
              "ReactDOM.render(<App />, document.getElementById('root'));",
          },
        });

        const result = await detectFramework(testDir);
        expect(result).toBe("react");
      });
    });

    describe("Custom project paths", () => {
      it("should detect framework in subdirectory", async () => {
        const subdir = await fileSystem.createTestDir("subproject");
        await fileSystem.createFile(
          path.join("subproject", "manage.py"),
          "#!/usr/bin/env python",
        );

        const result = await detectFramework(subdir);
        expect(result).toBe("django");
      });

      it("should handle absolute paths", async () => {
        await fileSystem.createFile("next.config.js", "module.exports = {};");

        // Use absolute path to test directory
        const result = await detectFramework(testDir);
        expect(result).toBe("nextjs");
      });
    });
  });

  describe("getFrameworkDefaults", () => {
    it("should return Next.js defaults", () => {
      const defaults = getFrameworkDefaults("nextjs");

      expect(defaults).toEqual({
        buildCommand: "npm run build",
        startCommand: "npm start",
        port: 3000,
        outputDir: ".next",
      });
    });

    it("should return Django defaults", () => {
      const defaults = getFrameworkDefaults("django");

      expect(defaults).toEqual({
        startCommand: "python manage.py runserver 0.0.0.0:8000",
        port: 8000,
      });
    });

    it("should return empty object for unknown framework", () => {
      const defaults = getFrameworkDefaults("unknown-framework");

      expect(defaults).toEqual({});
    });

    it("should return Express defaults", () => {
      const defaults = getFrameworkDefaults("express");

      expect(defaults).toEqual({
        startCommand: "node index.js",
        port: 3000,
      });
    });

    it("should return Laravel defaults", () => {
      const defaults = getFrameworkDefaults("laravel");

      expect(defaults).toEqual({
        buildCommand: "npm run build",
        startCommand: "php artisan serve --host=0.0.0.0",
        port: 8000,
      });
    });
  });
});

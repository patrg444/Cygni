import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { FastCliExecutor } from "../services/cli-executor-fast";
import { RealFileSystem } from "../services/real-file-system";
import path from "path";

describe("Fullstack Deployment Integration", () => {
  let cli: FastCliExecutor;
  let fileSystem: RealFileSystem;
  let testDir: string;

  beforeEach(async () => {
    cli = new FastCliExecutor();
    fileSystem = new RealFileSystem("fullstack-deployment-test");
    testDir = await fileSystem.createTestDir();
  });

  afterEach(async () => {
    await fileSystem.cleanup();
  });

  it("should analyze, build, and deploy a fullstack monorepo", async () => {
    // Create a fullstack monorepo structure
    await fileSystem.createFile(
      "package.json",
      JSON.stringify(
        {
          name: "my-fullstack-app",
          private: true,
          workspaces: ["frontend", "backend"],
          scripts: {
            build: "npm run build:frontend && npm run build:backend",
            "build:frontend": "cd frontend && npm run build",
            "build:backend": "cd backend && npm run build",
          },
        },
        null,
        2,
      ),
    );

    // Backend service
    await fileSystem.createFile(
      "backend/package.json",
      JSON.stringify(
        {
          name: "backend",
          version: "1.0.0",
          scripts: {
            start: "node index.js",
            build: "node -e \"console.log('Backend build complete')\"",
          },
          dependencies: {
            express: "^4.18.0",
            cors: "^2.8.5",
          },
        },
        null,
        2,
      ),
    );

    await fileSystem.createFile(
      "backend/index.js",
      `
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'backend' });
});

app.get('/api/users', (req, res) => {
  res.json([
    { id: 1, name: 'John Doe' },
    { id: 2, name: 'Jane Smith' }
  ]);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(\`Backend running on port \${PORT}\`);
});
    `,
    );

    await fileSystem.createFile(
      "backend/.env.example",
      `
PORT=3001
DATABASE_URL=
JWT_SECRET=
    `,
    );

    // Frontend service
    await fileSystem.createFile(
      "frontend/package.json",
      JSON.stringify(
        {
          name: "frontend",
          version: "1.0.0",
          scripts: {
            dev: "vite",
            build:
              "node -e \"console.log('Frontend build complete with API URL: ' + process.env.VITE_API_URL)\"",
            preview: "vite preview",
          },
          dependencies: {
            react: "^18.2.0",
            "react-dom": "^18.2.0",
            axios: "^1.6.0",
          },
          devDependencies: {
            "@vitejs/plugin-react": "^4.0.0",
            vite: "^4.4.0",
          },
        },
        null,
        2,
      ),
    );

    await fileSystem.createFile(
      "frontend/vite.config.js",
      `
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.VITE_API_URL': JSON.stringify(process.env.VITE_API_URL || 'http://localhost:3001')
  }
})
    `,
    );

    await fileSystem.createFile(
      "frontend/.env.example",
      `
VITE_API_URL=
    `,
    );

    await fileSystem.createFile(
      "frontend/index.html",
      `
<!DOCTYPE html>
<html>
<head>
  <title>My App</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>
    `,
    );

    // Create the missing main.jsx file
    await fileSystem.createFile(
      "frontend/src/main.jsx",
      `
import React from 'react';
import ReactDOM from 'react-dom/client';

const App = () => {
  return <h1>Hello World</h1>;
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
    `,
    );

    // Step 1: Analyze with fullstack flag
    const analyzeResult = await cli.execute(["analyze", "--fullstack"], {
      cwd: testDir,
    });

    console.log("Analyze stdout:", analyzeResult.stdout);
    console.log("Analyze stderr:", analyzeResult.stderr);
    console.log("Analyze code:", analyzeResult.code);

    expect(analyzeResult.code).toBe(0);
    expect(analyzeResult.stdout).toContain("Analysis complete!");
    expect(analyzeResult.stdout).toContain("Found 2 services");
    expect(analyzeResult.stdout).toContain("frontend");
    expect(analyzeResult.stdout).toContain("backend");

    // Check runtime.yaml files were created
    const backendRuntimePath = path.join(testDir, "backend", "runtime.yaml");
    const frontendRuntimePath = path.join(testDir, "frontend", "runtime.yaml");

    expect(await fileSystem.exists(backendRuntimePath)).toBe(true);
    expect(await fileSystem.exists(frontendRuntimePath)).toBe(true);

    // Check cloudexpress.yaml was created
    const cloudexpressPath = path.join(testDir, "cloudexpress.yaml");
    expect(await fileSystem.exists(cloudexpressPath)).toBe(true);

    // Step 2: Build the project
    const buildResult = await cli.execute(
      ["build", "--api-url", "https://api.example.com"],
      { cwd: testDir },
    );

    console.log("Build stdout:", buildResult.stdout);
    console.log("Build stderr:", buildResult.stderr);
    console.log("Build code:", buildResult.code);

    expect(buildResult.code).toBe(0);
    expect(buildResult.stdout).toContain("Building services");
    expect(buildResult.stdout).toContain("2 services built successfully");
    expect(buildResult.stdout).toContain("All services built successfully");

    // Check build manifest was created
    const buildManifestPath = path.join(testDir, "build-manifest.json");
    expect(await fileSystem.exists(buildManifestPath)).toBe(true);

    // Step 3: Deploy with dry-run
    const deployResult = await cli.execute(["deploy:fullstack", "--dry-run"], {
      cwd: testDir,
    });

    expect(deployResult.code).toBe(0);
    expect(deployResult.stdout).toContain("Detected Services:");
    expect(deployResult.stdout).toContain("Deployment Plan:");
    expect(deployResult.stdout).toContain("This is a dry run");
  }, 30000); // Extended timeout for multiple operations

  it("should handle frontend-backend relationships correctly", async () => {
    // Create separate frontend/backend directories (not monorepo)
    await fileSystem.createFile(
      "frontend/package.json",
      JSON.stringify({
        name: "my-frontend",
        dependencies: {
          react: "^18.0.0",
          "react-dom": "^18.0.0",
        },
      }),
    );

    await fileSystem.createFile("frontend/.env.example", "REACT_APP_API_URL=");

    await fileSystem.createFile(
      "backend/package.json",
      JSON.stringify({
        name: "my-backend",
        dependencies: {
          express: "^4.18.0",
        },
      }),
    );

    await fileSystem.createFile("backend/.env", "PORT=3001");

    const result = await cli.execute(["analyze", "--fullstack"], {
      cwd: testDir,
    });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Architecture:");
    expect(result.stdout).toContain("Frontend:");
    expect(result.stdout).toContain("Backend:");
    expect(result.stdout).toContain("API URL:");
  });

  it("should detect Next.js as fullstack framework", async () => {
    await fileSystem.createFile(
      "package.json",
      JSON.stringify({
        name: "nextjs-fullstack",
        dependencies: {
          next: "^13.0.0",
          react: "^18.0.0",
        },
      }),
    );

    await fileSystem.createFile("next.config.js", "module.exports = {}");

    // Create API routes directory
    await fileSystem.createFile(
      "app/api/hello/route.js",
      `
export async function GET() {
  return Response.json({ message: 'Hello from Next.js API' });
}
    `,
    );

    const result = await cli.execute(["analyze", "--fullstack"], {
      cwd: testDir,
    });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Found 1 services");
    expect(result.stdout).toContain("fullstack");
    expect(result.stdout).toContain("nextjs");
  });

  it("should inject API URL into frontend build", async () => {
    // Create simple frontend/backend setup
    await fileSystem.createFile(
      "frontend/package.json",
      JSON.stringify({
        name: "frontend",
        scripts: {
          build:
            "node -e \"console.log('Building with REACT_APP_API_URL=' + process.env.REACT_APP_API_URL)\"",
        },
        dependencies: {
          react: "^18.0.0",
        },
      }),
    );

    await fileSystem.createFile(
      "backend/package.json",
      JSON.stringify({
        name: "backend",
        scripts: {
          build: "node -e \"console.log('Building backend')\"",
        },
        dependencies: {
          express: "^4.18.0",
        },
      }),
    );

    // First analyze
    await cli.execute(["analyze", "--fullstack"], { cwd: testDir });

    // Then build with API URL
    const buildResult = await cli.execute(
      ["build", "--api-url", "https://api.production.com"],
      { cwd: testDir },
    );

    expect(buildResult.code).toBe(0);
    // The build output should show successful builds
    expect(buildResult.stdout).toContain("Building services");
    expect(buildResult.stdout).toContain("2 services built successfully");
  });

  it("should handle build failures gracefully", async () => {
    await fileSystem.createFile(
      "package.json",
      JSON.stringify({
        name: "failing-app",
        workspaces: ["service-a", "service-b"],
      }),
    );

    await fileSystem.createFile(
      "service-a/package.json",
      JSON.stringify({
        name: "service-a",
        scripts: {
          build: "node -e \"console.log('service-a build'); process.exit(0)\"", // Success
        },
        dependencies: {
          express: "^4.18.0",
        },
      }),
    );

    await fileSystem.createFile(
      "service-b/package.json",
      JSON.stringify({
        name: "service-b",
        scripts: {
          build:
            "node -e \"console.error('service-b build failed'); process.exit(1)\"", // Failure
        },
        dependencies: {
          react: "^18.0.0",
        },
      }),
    );

    // Analyze first
    await cli.execute(["analyze", "--fullstack"], { cwd: testDir });

    // Try to build
    const buildResult = await cli.execute(["build"], { cwd: testDir });

    expect(buildResult.code).toBe(1);
    expect(buildResult.stdout).toContain("1 services built successfully");
    expect(buildResult.stdout).toContain("1 services failed to build");
    expect(buildResult.stderr).toContain("service-b build failed");
  });
});

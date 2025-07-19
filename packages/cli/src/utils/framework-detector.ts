import fs from "fs/promises";
import path from "path";

interface FrameworkSignature {
  name: string;
  files?: string[];
  dependencies?: string[];
  scripts?: string[];
}

const FRAMEWORKS: FrameworkSignature[] = [
  {
    name: "nextjs",
    files: ["next.config.js", "next.config.mjs", "next.config.ts"],
    dependencies: ["next"],
  },
  {
    name: "react",
    files: ["vite.config.js", "vite.config.ts"],
    dependencies: ["react", "react-dom"],
    scripts: ["react-scripts"],
  },
  {
    name: "vue",
    files: ["vue.config.js", "vite.config.js"],
    dependencies: ["vue", "@vue/cli-service"],
  },
  {
    name: "angular",
    files: ["angular.json"],
    dependencies: ["@angular/core"],
  },
  {
    name: "svelte",
    files: ["svelte.config.js"],
    dependencies: ["svelte", "@sveltejs/kit"],
  },
  {
    name: "express",
    dependencies: ["express"],
  },
  {
    name: "fastify",
    dependencies: ["fastify"],
  },
  {
    name: "django",
    files: ["manage.py", "requirements.txt"],
  },
  {
    name: "flask",
    files: ["requirements.txt", "app.py", "application.py"],
    dependencies: ["flask"],
  },
  {
    name: "rails",
    files: ["Gemfile", "config.ru"],
  },
  {
    name: "laravel",
    files: ["artisan", "composer.json"],
  },
  {
    name: "nuxt",
    files: ["nuxt.config.js", "nuxt.config.ts"],
    dependencies: ["nuxt"],
  },
  {
    name: "gatsby",
    files: ["gatsby-config.js", "gatsby-config.ts"],
    dependencies: ["gatsby"],
  },
];

export async function detectFramework(
  projectPath: string = ".",
): Promise<string | undefined> {
  // Check for framework-specific files
  for (const framework of FRAMEWORKS) {
    if (framework.files) {
      for (const file of framework.files) {
        try {
          await fs.access(path.join(projectPath, file));
          return framework.name;
        } catch {
          // File doesn't exist, continue
        }
      }
    }
  }

  // Check package.json dependencies
  try {
    const packageJsonPath = path.join(projectPath, "package.json");
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf-8"));
    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    for (const framework of FRAMEWORKS) {
      if (framework.dependencies) {
        for (const dep of framework.dependencies) {
          if (allDeps[dep]) {
            return framework.name;
          }
        }
      }

      if (framework.scripts && packageJson.scripts) {
        for (const script of framework.scripts) {
          const scriptValues = Object.values(packageJson.scripts) as string[];
          if (scriptValues.some((value) => value.includes(script))) {
            return framework.name;
          }
        }
      }
    }
  } catch {
    // No package.json or error reading it
  }

  // Check for Python requirements files
  try {
    const requirementsPath = path.join(projectPath, "requirements.txt");
    const requirements = await fs.readFile(requirementsPath, "utf-8");

    if (requirements.includes("django")) return "django";
    if (requirements.includes("flask")) return "flask";
    if (requirements.includes("fastapi")) return "fastapi";
  } catch {
    // No requirements.txt
  }

  // Check for Ruby Gemfile
  try {
    const gemfilePath = path.join(projectPath, "Gemfile");
    const gemfile = await fs.readFile(gemfilePath, "utf-8");

    if (gemfile.includes("rails")) return "rails";
    if (gemfile.includes("sinatra")) return "sinatra";
  } catch {
    // No Gemfile
  }

  return undefined;
}

export function getFrameworkDefaults(framework: string): {
  buildCommand?: string;
  startCommand?: string;
  port?: number;
  outputDir?: string;
} {
  const defaults: Record<string, any> = {
    nextjs: {
      buildCommand: "npm run build",
      startCommand: "npm start",
      port: 3000,
      outputDir: ".next",
    },
    react: {
      buildCommand: "npm run build",
      startCommand: "npm run preview",
      port: 3000,
      outputDir: "dist",
    },
    vue: {
      buildCommand: "npm run build",
      startCommand: "npm run preview",
      port: 3000,
      outputDir: "dist",
    },
    angular: {
      buildCommand: "npm run build",
      startCommand: "npm start",
      port: 4200,
      outputDir: "dist",
    },
    svelte: {
      buildCommand: "npm run build",
      startCommand: "npm run preview",
      port: 3000,
      outputDir: "build",
    },
    express: {
      startCommand: "node index.js",
      port: 3000,
    },
    fastify: {
      startCommand: "node index.js",
      port: 3000,
    },
    django: {
      startCommand: "python manage.py runserver 0.0.0.0:8000",
      port: 8000,
    },
    flask: {
      startCommand: "python app.py",
      port: 5000,
    },
    rails: {
      buildCommand: "bundle exec rake assets:precompile",
      startCommand: "bundle exec rails server -b 0.0.0.0",
      port: 3000,
    },
    laravel: {
      buildCommand: "npm run build",
      startCommand: "php artisan serve --host=0.0.0.0",
      port: 8000,
    },
  };

  return defaults[framework] || {};
}

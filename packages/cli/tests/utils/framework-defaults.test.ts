import { describe, it, expect } from "vitest";
import { getFrameworkDefaults } from "../../src/utils/framework-detector";

describe("Framework defaults mapping", () => {
  describe("Node.js frameworks", () => {
    it("should return correct defaults for Express", () => {
      const defaults = getFrameworkDefaults("express");
      expect(defaults.port).toBe(3000);
      expect(defaults.startCommand).toBe("node index.js");
      expect(defaults.buildCommand).toBeUndefined();
    });

    it("should return correct defaults for Fastify", () => {
      const defaults = getFrameworkDefaults("fastify");
      expect(defaults.port).toBe(3000);
      expect(defaults.startCommand).toBe("node index.js");
      expect(defaults.buildCommand).toBeUndefined();
    });

    it("should return correct defaults for Next.js", () => {
      const defaults = getFrameworkDefaults("nextjs");
      expect(defaults.port).toBe(3000);
      expect(defaults.buildCommand).toBe("npm run build");
      expect(defaults.startCommand).toBe("npm start");
      expect(defaults.outputDir).toBe(".next");
    });

    it("should return correct defaults for Nuxt", () => {
      const defaults = getFrameworkDefaults("nuxt");
      expect(defaults.port).toBe(3000);
      expect(defaults.buildCommand).toBe("npm run build");
      expect(defaults.startCommand).toBe("npm start");
      expect(defaults.outputDir).toBe(".nuxt");
    });

    it("should return correct defaults for Gatsby", () => {
      const defaults = getFrameworkDefaults("gatsby");
      expect(defaults.port).toBe(9000);
      expect(defaults.buildCommand).toBe("npm run build");
      expect(defaults.startCommand).toBe("npm run serve");
      expect(defaults.outputDir).toBe("public");
    });
  });

  describe("Python frameworks", () => {
    it("should return correct defaults for Django", () => {
      const defaults = getFrameworkDefaults("django");
      expect(defaults.port).toBe(8000);
      expect(defaults.startCommand).toBe(
        "python manage.py runserver 0.0.0.0:8000",
      );
      expect(defaults.buildCommand).toBeUndefined();
    });

    it("should return correct defaults for Flask", () => {
      const defaults = getFrameworkDefaults("flask");
      expect(defaults.port).toBe(5000);
      expect(defaults.startCommand).toBe("python app.py");
      expect(defaults.buildCommand).toBeUndefined();
    });

    it("should return correct defaults for FastAPI", () => {
      const defaults = getFrameworkDefaults("fastapi");
      expect(defaults.port).toBe(8000);
      expect(defaults.startCommand).toBe(
        "uvicorn main:app --host 0.0.0.0 --port 8000",
      );
      expect(defaults.buildCommand).toBeUndefined();
    });
  });

  describe("Ruby frameworks", () => {
    it("should return correct defaults for Rails", () => {
      const defaults = getFrameworkDefaults("rails");
      expect(defaults.port).toBe(3000);
      expect(defaults.buildCommand).toBe("bundle exec rake assets:precompile");
      expect(defaults.startCommand).toBe("bundle exec rails server -b 0.0.0.0");
    });

    it("should return correct defaults for Sinatra", () => {
      const defaults = getFrameworkDefaults("sinatra");
      expect(defaults.port).toBe(4567);
      expect(defaults.startCommand).toBe("ruby app.rb");
      expect(defaults.buildCommand).toBeUndefined();
    });
  });

  describe("PHP frameworks", () => {
    it("should return correct defaults for Laravel", () => {
      const defaults = getFrameworkDefaults("laravel");
      expect(defaults.port).toBe(8000);
      expect(defaults.buildCommand).toBe("npm run build");
      expect(defaults.startCommand).toBe("php artisan serve --host=0.0.0.0");
    });
  });

  describe("Frontend frameworks", () => {
    it("should return correct defaults for React", () => {
      const defaults = getFrameworkDefaults("react");
      expect(defaults.port).toBe(3000);
      expect(defaults.buildCommand).toBe("npm run build");
      expect(defaults.startCommand).toBe("npm run preview");
      expect(defaults.outputDir).toBe("dist");
    });

    it("should return correct defaults for Vue", () => {
      const defaults = getFrameworkDefaults("vue");
      expect(defaults.port).toBe(3000);
      expect(defaults.buildCommand).toBe("npm run build");
      expect(defaults.startCommand).toBe("npm run preview");
      expect(defaults.outputDir).toBe("dist");
    });

    it("should return correct defaults for Angular", () => {
      const defaults = getFrameworkDefaults("angular");
      expect(defaults.port).toBe(4200);
      expect(defaults.buildCommand).toBe("npm run build");
      expect(defaults.startCommand).toBe("npm start");
      expect(defaults.outputDir).toBe("dist");
    });

    it("should return correct defaults for Svelte", () => {
      const defaults = getFrameworkDefaults("svelte");
      expect(defaults.port).toBe(3000);
      expect(defaults.buildCommand).toBe("npm run build");
      expect(defaults.startCommand).toBe("npm run preview");
      expect(defaults.outputDir).toBe("build");
    });
  });

  describe("Unknown frameworks", () => {
    it("should return empty object for unknown framework", () => {
      const defaults = getFrameworkDefaults("unknown-framework");
      expect(defaults).toEqual({});
    });

    it("should return empty object for empty string", () => {
      const defaults = getFrameworkDefaults("");
      expect(defaults).toEqual({});
    });
  });

  describe("Port validation", () => {
    const frameworks = [
      "express",
      "fastify",
      "nextjs",
      "react",
      "vue",
      "angular",
      "svelte",
      "django",
      "flask",
      "fastapi",
      "rails",
      "sinatra",
      "laravel",
      "nuxt",
      "gatsby",
    ];

    frameworks.forEach((framework) => {
      it(`should have valid port for ${framework}`, () => {
        const defaults = getFrameworkDefaults(framework);
        if (defaults.port) {
          expect(defaults.port).toBeGreaterThan(0);
          expect(defaults.port).toBeLessThan(65536);
        }
      });
    });
  });

  describe("Command validation", () => {
    const frameworks = [
      "express",
      "fastify",
      "nextjs",
      "react",
      "vue",
      "angular",
      "svelte",
      "django",
      "flask",
      "fastapi",
      "rails",
      "sinatra",
      "laravel",
      "nuxt",
      "gatsby",
    ];

    frameworks.forEach((framework) => {
      it(`should have non-empty commands for ${framework}`, () => {
        const defaults = getFrameworkDefaults(framework);
        if (defaults.startCommand) {
          expect(defaults.startCommand).toBeTruthy();
          expect(defaults.startCommand.length).toBeGreaterThan(0);
        }
        if (defaults.buildCommand) {
          expect(defaults.buildCommand).toBeTruthy();
          expect(defaults.buildCommand.length).toBeGreaterThan(0);
        }
      });
    });
  });
});

describe("resolveDefaults helper", () => {
  // Helper function to test resolving defaults
  const resolveDefaults = (framework: string) => {
    return getFrameworkDefaults(framework);
  };

  it("should resolve Flask defaults correctly", () => {
    expect(resolveDefaults("flask").port).toBe(5000);
  });

  it("should resolve Django defaults correctly", () => {
    expect(resolveDefaults("django").port).toBe(8000);
  });

  it("should resolve Rails defaults correctly", () => {
    expect(resolveDefaults("rails").port).toBe(3000);
  });

  it("should resolve Fastify defaults correctly", () => {
    expect(resolveDefaults("fastify").port).toBe(3000);
  });

  it("should resolve FastAPI defaults correctly", () => {
    expect(resolveDefaults("fastapi").port).toBe(8000);
  });
});

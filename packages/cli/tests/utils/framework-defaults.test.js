"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const framework_detector_1 = require("../../src/utils/framework-detector");
(0, vitest_1.describe)("Framework defaults mapping", () => {
    (0, vitest_1.describe)("Node.js frameworks", () => {
        (0, vitest_1.it)("should return correct defaults for Express", () => {
            const defaults = (0, framework_detector_1.getFrameworkDefaults)("express");
            (0, vitest_1.expect)(defaults.port).toBe(3000);
            (0, vitest_1.expect)(defaults.startCommand).toBe("node index.js");
            (0, vitest_1.expect)(defaults.buildCommand).toBeUndefined();
        });
        (0, vitest_1.it)("should return correct defaults for Fastify", () => {
            const defaults = (0, framework_detector_1.getFrameworkDefaults)("fastify");
            (0, vitest_1.expect)(defaults.port).toBe(3000);
            (0, vitest_1.expect)(defaults.startCommand).toBe("node index.js");
            (0, vitest_1.expect)(defaults.buildCommand).toBeUndefined();
        });
        (0, vitest_1.it)("should return correct defaults for Next.js", () => {
            const defaults = (0, framework_detector_1.getFrameworkDefaults)("nextjs");
            (0, vitest_1.expect)(defaults.port).toBe(3000);
            (0, vitest_1.expect)(defaults.buildCommand).toBe("npm run build");
            (0, vitest_1.expect)(defaults.startCommand).toBe("npm start");
            (0, vitest_1.expect)(defaults.outputDir).toBe(".next");
        });
        (0, vitest_1.it)("should return correct defaults for Nuxt", () => {
            const defaults = (0, framework_detector_1.getFrameworkDefaults)("nuxt");
            (0, vitest_1.expect)(defaults.port).toBe(3000);
            (0, vitest_1.expect)(defaults.buildCommand).toBe("npm run build");
            (0, vitest_1.expect)(defaults.startCommand).toBe("npm start");
            (0, vitest_1.expect)(defaults.outputDir).toBe(".nuxt");
        });
        (0, vitest_1.it)("should return correct defaults for Gatsby", () => {
            const defaults = (0, framework_detector_1.getFrameworkDefaults)("gatsby");
            (0, vitest_1.expect)(defaults.port).toBe(9000);
            (0, vitest_1.expect)(defaults.buildCommand).toBe("npm run build");
            (0, vitest_1.expect)(defaults.startCommand).toBe("npm run serve");
            (0, vitest_1.expect)(defaults.outputDir).toBe("public");
        });
    });
    (0, vitest_1.describe)("Python frameworks", () => {
        (0, vitest_1.it)("should return correct defaults for Django", () => {
            const defaults = (0, framework_detector_1.getFrameworkDefaults)("django");
            (0, vitest_1.expect)(defaults.port).toBe(8000);
            (0, vitest_1.expect)(defaults.startCommand).toBe("python manage.py runserver 0.0.0.0:8000");
            (0, vitest_1.expect)(defaults.buildCommand).toBeUndefined();
        });
        (0, vitest_1.it)("should return correct defaults for Flask", () => {
            const defaults = (0, framework_detector_1.getFrameworkDefaults)("flask");
            (0, vitest_1.expect)(defaults.port).toBe(5000);
            (0, vitest_1.expect)(defaults.startCommand).toBe("python app.py");
            (0, vitest_1.expect)(defaults.buildCommand).toBeUndefined();
        });
        (0, vitest_1.it)("should return correct defaults for FastAPI", () => {
            const defaults = (0, framework_detector_1.getFrameworkDefaults)("fastapi");
            (0, vitest_1.expect)(defaults.port).toBe(8000);
            (0, vitest_1.expect)(defaults.startCommand).toBe("uvicorn main:app --host 0.0.0.0 --port 8000");
            (0, vitest_1.expect)(defaults.buildCommand).toBeUndefined();
        });
    });
    (0, vitest_1.describe)("Ruby frameworks", () => {
        (0, vitest_1.it)("should return correct defaults for Rails", () => {
            const defaults = (0, framework_detector_1.getFrameworkDefaults)("rails");
            (0, vitest_1.expect)(defaults.port).toBe(3000);
            (0, vitest_1.expect)(defaults.buildCommand).toBe("bundle exec rake assets:precompile");
            (0, vitest_1.expect)(defaults.startCommand).toBe("bundle exec rails server -b 0.0.0.0");
        });
        (0, vitest_1.it)("should return correct defaults for Sinatra", () => {
            const defaults = (0, framework_detector_1.getFrameworkDefaults)("sinatra");
            (0, vitest_1.expect)(defaults.port).toBe(4567);
            (0, vitest_1.expect)(defaults.startCommand).toBe("ruby app.rb");
            (0, vitest_1.expect)(defaults.buildCommand).toBeUndefined();
        });
    });
    (0, vitest_1.describe)("PHP frameworks", () => {
        (0, vitest_1.it)("should return correct defaults for Laravel", () => {
            const defaults = (0, framework_detector_1.getFrameworkDefaults)("laravel");
            (0, vitest_1.expect)(defaults.port).toBe(8000);
            (0, vitest_1.expect)(defaults.buildCommand).toBe("npm run build");
            (0, vitest_1.expect)(defaults.startCommand).toBe("php artisan serve --host=0.0.0.0");
        });
    });
    (0, vitest_1.describe)("Frontend frameworks", () => {
        (0, vitest_1.it)("should return correct defaults for React", () => {
            const defaults = (0, framework_detector_1.getFrameworkDefaults)("react");
            (0, vitest_1.expect)(defaults.port).toBe(3000);
            (0, vitest_1.expect)(defaults.buildCommand).toBe("npm run build");
            (0, vitest_1.expect)(defaults.startCommand).toBe("npm run preview");
            (0, vitest_1.expect)(defaults.outputDir).toBe("dist");
        });
        (0, vitest_1.it)("should return correct defaults for Vue", () => {
            const defaults = (0, framework_detector_1.getFrameworkDefaults)("vue");
            (0, vitest_1.expect)(defaults.port).toBe(3000);
            (0, vitest_1.expect)(defaults.buildCommand).toBe("npm run build");
            (0, vitest_1.expect)(defaults.startCommand).toBe("npm run preview");
            (0, vitest_1.expect)(defaults.outputDir).toBe("dist");
        });
        (0, vitest_1.it)("should return correct defaults for Angular", () => {
            const defaults = (0, framework_detector_1.getFrameworkDefaults)("angular");
            (0, vitest_1.expect)(defaults.port).toBe(4200);
            (0, vitest_1.expect)(defaults.buildCommand).toBe("npm run build");
            (0, vitest_1.expect)(defaults.startCommand).toBe("npm start");
            (0, vitest_1.expect)(defaults.outputDir).toBe("dist");
        });
        (0, vitest_1.it)("should return correct defaults for Svelte", () => {
            const defaults = (0, framework_detector_1.getFrameworkDefaults)("svelte");
            (0, vitest_1.expect)(defaults.port).toBe(3000);
            (0, vitest_1.expect)(defaults.buildCommand).toBe("npm run build");
            (0, vitest_1.expect)(defaults.startCommand).toBe("npm run preview");
            (0, vitest_1.expect)(defaults.outputDir).toBe("build");
        });
    });
    (0, vitest_1.describe)("Unknown frameworks", () => {
        (0, vitest_1.it)("should return empty object for unknown framework", () => {
            const defaults = (0, framework_detector_1.getFrameworkDefaults)("unknown-framework");
            (0, vitest_1.expect)(defaults).toEqual({});
        });
        (0, vitest_1.it)("should return empty object for empty string", () => {
            const defaults = (0, framework_detector_1.getFrameworkDefaults)("");
            (0, vitest_1.expect)(defaults).toEqual({});
        });
    });
    (0, vitest_1.describe)("Port validation", () => {
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
            (0, vitest_1.it)(`should have valid port for ${framework}`, () => {
                const defaults = (0, framework_detector_1.getFrameworkDefaults)(framework);
                if (defaults.port) {
                    (0, vitest_1.expect)(defaults.port).toBeGreaterThan(0);
                    (0, vitest_1.expect)(defaults.port).toBeLessThan(65536);
                }
            });
        });
    });
    (0, vitest_1.describe)("Command validation", () => {
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
            (0, vitest_1.it)(`should have non-empty commands for ${framework}`, () => {
                const defaults = (0, framework_detector_1.getFrameworkDefaults)(framework);
                if (defaults.startCommand) {
                    (0, vitest_1.expect)(defaults.startCommand).toBeTruthy();
                    (0, vitest_1.expect)(defaults.startCommand.length).toBeGreaterThan(0);
                }
                if (defaults.buildCommand) {
                    (0, vitest_1.expect)(defaults.buildCommand).toBeTruthy();
                    (0, vitest_1.expect)(defaults.buildCommand.length).toBeGreaterThan(0);
                }
            });
        });
    });
});
(0, vitest_1.describe)("resolveDefaults helper", () => {
    // Helper function to test resolving defaults
    const resolveDefaults = (framework) => {
        return (0, framework_detector_1.getFrameworkDefaults)(framework);
    };
    (0, vitest_1.it)("should resolve Flask defaults correctly", () => {
        (0, vitest_1.expect)(resolveDefaults("flask").port).toBe(5000);
    });
    (0, vitest_1.it)("should resolve Django defaults correctly", () => {
        (0, vitest_1.expect)(resolveDefaults("django").port).toBe(8000);
    });
    (0, vitest_1.it)("should resolve Rails defaults correctly", () => {
        (0, vitest_1.expect)(resolveDefaults("rails").port).toBe(3000);
    });
    (0, vitest_1.it)("should resolve Fastify defaults correctly", () => {
        (0, vitest_1.expect)(resolveDefaults("fastify").port).toBe(3000);
    });
    (0, vitest_1.it)("should resolve FastAPI defaults correctly", () => {
        (0, vitest_1.expect)(resolveDefaults("fastapi").port).toBe(8000);
    });
});
//# sourceMappingURL=framework-defaults.test.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const cli_executor_fast_1 = require("../services/cli-executor-fast");
const real_file_system_1 = require("../services/real-file-system");
const config_service_1 = require("../services/config-service");
(0, vitest_1.describe)("init command - single test", () => {
    let cli;
    let fileSystem;
    let testDir;
    let configService;
    (0, vitest_1.beforeEach)(async () => {
        cli = new cli_executor_fast_1.FastCliExecutor();
        fileSystem = new real_file_system_1.RealFileSystem("init-single");
        testDir = await fileSystem.createTestDir();
        configService = new config_service_1.ConfigService(testDir);
    });
    (0, vitest_1.afterEach)(async () => {
        await fileSystem.cleanup();
    });
    (0, vitest_1.it)("should use provided project name argument", async () => {
        console.log("Starting test...");
        console.log("Test dir:", testDir);
        const result = await cli.execute(["init", "my-awesome-project"], {
            cwd: testDir,
        });
        console.log("Exit code:", result.code);
        console.log("STDOUT:", result.stdout);
        console.log("STDERR:", result.stderr);
        (0, vitest_1.expect)(result.code).toBe(0);
        (0, vitest_1.expect)(result.stdout).toContain("Welcome to CloudExpress!");
        (0, vitest_1.expect)(result.stderr).toContain("Configuration created!");
        (0, vitest_1.expect)(result.stdout).toContain("Your project is ready!");
        const config = await configService.loadConfig();
        (0, vitest_1.expect)(config.name).toBe("my-awesome-project");
    }, 10000);
});
//# sourceMappingURL=init-single.test.js.map
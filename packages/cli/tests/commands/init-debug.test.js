"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const cli_executor_1 = require("../services/cli-executor");
const real_file_system_1 = require("../services/real-file-system");
const config_service_1 = require("../services/config-service");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
(0, vitest_1.describe)("init command debug", () => {
    (0, vitest_1.it)("should run init and check what happens", async () => {
        const cli = new cli_executor_1.CliExecutor();
        const fileSystem = new real_file_system_1.RealFileSystem("init-debug");
        const testDir = await fileSystem.createTestDir();
        const configService = new config_service_1.ConfigService(testDir);
        console.log("Test directory:", testDir);
        const result = await cli.execute(["init", "debug-project", "--framework", "nextjs"], { cwd: testDir });
        console.log("Exit code:", result.code);
        console.log("STDOUT:", result.stdout);
        console.log("STDERR:", result.stderr);
        // List files created
        const files = await promises_1.default.readdir(testDir);
        console.log("Files created:", files);
        // Try to read any yml file
        for (const file of files) {
            if (file.endsWith(".yml") || file.endsWith(".yaml")) {
                const content = await promises_1.default.readFile(path_1.default.join(testDir, file), "utf-8");
                console.log(`Content of ${file}:`, content);
            }
        }
        await fileSystem.cleanup();
    }, 30000);
});
//# sourceMappingURL=init-debug.test.js.map
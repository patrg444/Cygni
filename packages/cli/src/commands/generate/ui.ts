import { Command } from "commander";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import chalk from "chalk";
import ora from "ora";
import { OpenAPIResourceAnalyzer } from "../../lib/openapi-resource-analyzer";
import { UIGenerator } from "../../lib/ui-generator";

export const generateUICommand = new Command()
  .name("ui")
  .description("Generate UI components from OpenAPI specification")
  .option("--openapi <path>", "Path to OpenAPI spec file", "./openapi.json")
  .option(
    "-o, --output <path>",
    "Output directory for generated UI components",
    "../web-ui/src",
  )
  .option("-f, --force", "Overwrite existing files", false)
  .action(async (options) => {
    // Check if OpenAPI spec exists
    const openApiPath = join(process.cwd(), options.openapi);
    if (!existsSync(openApiPath)) {
      console.error(
        chalk.red(
          `❌ OpenAPI spec not found at ${openApiPath}. Run 'cx analyze' first to generate it.`,
        ),
      );
      process.exit(1);
    }

    console.log(chalk.blue("🔍 Reading OpenAPI specification..."));

    // Read and parse OpenAPI spec
    const openApiContent = readFileSync(openApiPath, "utf-8");
    const openApiSpec = JSON.parse(openApiContent);

    // Analyze resources
    console.log(chalk.blue("🔎 Analyzing API resources..."));
    const analyzer = new OpenAPIResourceAnalyzer(openApiSpec);
    const resources = analyzer.analyze();

    if (resources.length === 0) {
      console.warn(
        chalk.yellow(
          "⚠ No RESTful resources found in the OpenAPI specification.",
        ),
      );
      return;
    }

    console.log(chalk.green(`✅ Found ${resources.length} resources:`));
    resources.forEach((resource) => {
      console.log(
        `  - ${resource.name} (${resource.operations.length} operations)`,
      );
    });

    // Generate UI components
    console.log(chalk.blue("\n🏗️  Generating UI components..."));
    const generator = new UIGenerator({
      outputDir: options.output,
      force: options.force,
    });

    const spinner = ora("Generating components...").start();

    for (const resource of resources) {
      try {
        await generator.generateResource(resource);
        spinner.succeed(`Generated components for ${resource.name}`);
        spinner.start("Generating components...");
      } catch (error) {
        spinner.fail(`Failed to generate ${resource.name}: ${error}`);
        spinner.start("Generating components...");
      }
    }

    // Generate SDK hooks
    spinner.text = "Generating SDK hooks...";
    try {
      await generator.generateSDKHooks(resources);
      spinner.succeed("Generated SDK hooks");
    } catch (error) {
      spinner.fail(`Failed to generate SDK hooks: ${error}`);
    }

    console.log(chalk.green("\n✨ UI generation complete!"));
    console.log(chalk.gray("Next steps:"));
    console.log(chalk.gray("  1. cd " + options.output));
    console.log(chalk.gray("  2. Review the generated components"));
    console.log(chalk.gray("  3. Import them into your app"));
  });

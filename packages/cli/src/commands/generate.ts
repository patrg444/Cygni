import { Command } from "commander";
import { generateUICommand } from "./generate/ui";

export const generateCommand = new Command()
  .name("generate")
  .description("Generate code from specifications")
  .addCommand(generateUICommand);

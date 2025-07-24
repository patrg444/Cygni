import { Command } from "commander";
import { gitListenCommand } from "./git-listen";

export const gitCommand = new Command()
  .name("git")
  .description("Git integration commands")
  .addCommand(gitListenCommand);

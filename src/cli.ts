#!/usr/bin/env bun

import {
  ClaudeAgentError,
  CodexAgentError,
  DeepSeekHarnessAgentError,
  PiAgentError,
} from "./agents";
import { runCreateCommand } from "./cli/create";
import { CliUsageError } from "./cli/errors";
import { runWorkflowCommand } from "./cli/run";
import { runSkillCommand } from "./cli/skill";

const [command, ...values] = Bun.argv.slice(2);

try {
  if (command === "--help" || command === "-h") {
    printUsage();
  } else if (command === "create") {
    await runCreateCommand(values);
  } else if (command === "run") {
    await runWorkflowCommand(values);
  } else if (command === "skill") {
    await runSkillCommand(values);
  } else if (command === undefined) {
    printUsage();
    process.exitCode = 1;
  } else {
    throw new CliUsageError(`Unknown command: ${command}`);
  }
} catch (error) {
  if (
    error instanceof CodexAgentError ||
    error instanceof ClaudeAgentError ||
    error instanceof DeepSeekHarnessAgentError ||
    error instanceof PiAgentError
  ) {
    console.error(error.message);
    if (error.stderr.trim()) {
      console.error(error.stderr.trimEnd());
    }
  } else if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(String(error));
  }
  process.exitCode = 1;
}

function printUsage(): void {
  console.log(`deer-workflow

Usage:
  deer-workflow create [--agent codex|claude|dsh|pi] "Describe the Workflow"
  echo "Describe the Workflow" | deer-workflow create [--agent codex|claude|dsh|pi]
  deer-workflow skill install
  deer-workflow run <workflow> [--print] [--input '<json>']
  deer-workflow run <workflow> [--input-file <path>]
  echo '<json>' | deer-workflow run <workflow>

Commands:
  create  Generate a Workflow with the bundled workflow-creator Skill
  skill   Manage bundled Agent Skills
  run     Execute a Workflow module

Agent selection:
  --agent <codex|claude|dsh|pi>  Agent runtime for create (default: codex)
`);
}

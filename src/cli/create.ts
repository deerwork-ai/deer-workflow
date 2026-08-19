import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ClaudeAgent,
  CodexAgent,
  DeepSeekHarnessAgent,
  PiAgent,
} from "../agents";
import type { AgentFunction, JsonSchema, JsonValue } from "../agents";
import { TerminalUI } from "../tui";
import { formatAgentName, parseAgentSelection } from "./agent-selection";
import { CliUsageError } from "./errors";

const workflowCreatorSkillPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../skills/workflow-creator/SKILL.md",
);

const defaultCreateAgent = new CodexAgent({
  skipGitRepositoryCheck: true,
});

interface CreatedWorkflow {
  readonly source: string;
  readonly exampleArgsJson: string;
}

const workflowCreatorOutputSchema: JsonSchema = {
  type: "object",
  properties: {
    source: { type: "string", minLength: 1 },
    exampleArgsJson: { type: "string", minLength: 2 },
  },
  required: ["source", "exampleArgsJson"],
  additionalProperties: false,
};

/**
 * Executes the `deer-workflow create` command.
 *
 * @remarks
 * The command explicitly directs the selected Agent to read the bundled
 * Workflow Creator Skill, then appends the user's request. Codex is selected
 * by default. Generated source is written to stdout and may be redirected to
 * a file.
 *
 * @param values - Prompt fragments following the `create` command.
 * @param runAgent - Agent function used to generate the Workflow.
 * @returns A Promise that resolves after generated source is written.
 * @internal
 */
export async function runCreateCommand(
  values: readonly string[],
  runAgent?: AgentFunction,
): Promise<void> {
  if (values.includes("--help") || values.includes("-h")) {
    printCreateUsage();
    return;
  }

  const selection = parseAgentSelection(values);
  const userPrompt = await readCreatePrompt(selection.values);
  const selectedRuntime =
    selection.agentName === "claude"
      ? new ClaudeAgent()
      : selection.agentName === "dsh"
        ? new DeepSeekHarnessAgent()
        : selection.agentName === "pi"
          ? new PiAgent()
          : defaultCreateAgent;
  const selectedAgent: AgentFunction =
    runAgent ?? ((prompt, options) => selectedRuntime.run(prompt, options));
  const agentName = formatAgentName(selection.agentName);
  await assertWorkflowCreatorSkillExists();
  process.stdout.write(
    `/* Generating a DeerFlow Dynamic Workflow with ${agentName} */\n`,
  );

  const task = new TerminalUI().startTask({
    activity: `Generating a Workflow with ${agentName}`,
    estimate: "Usually takes 1–5 minutes",
    successMessage: "Workflow generated",
    failureMessage: "Workflow generation failed",
  });

  try {
    const output = await selectedAgent<CreatedWorkflow>(
      buildWorkflowCreatorPrompt(userPrompt),
      {
        cwd: process.cwd(),
        sandbox: "read-only",
        schema: workflowCreatorOutputSchema,
      },
    );
    const source = unwrapSourceFence(output.source);
    const exampleArgs = parseExampleArgsJson(output.exampleArgsJson);

    task.succeed({
      nextSteps: [
        {
          label: "Run the generated Workflow",
          command: buildRunCommand(exampleArgs),
        },
      ],
    });
    console.log(source);
  } catch (error) {
    task.fail();
    throw error;
  } finally {
    task.dispose();
  }
}

/**
 * Builds the explicit Workflow Creator Skill invocation sent to the Agent.
 *
 * @param userPrompt - User's description of the desired Workflow.
 * @returns A self-contained Agent prompt ending with the user's request.
 * @internal
 */
export function buildWorkflowCreatorPrompt(userPrompt: string): string {
  return [
    "$workflow-creator",
    "",
    "Execute the bundled workflow-creator Skill located at:",
    workflowCreatorSkillPath,
    "",
    "Read SKILL.md completely and follow every referenced file required for the task.",
    "Return a response matching the supplied JSON Schema.",
    "Put the complete Workflow module in `source` as raw source text without Markdown fences.",
    "Put a compact JSON object string with a minimal runnable example for the Handler's `args` parameter in `exampleArgsJson`.",
    "The example keys must match actual properties used from `args` (for example, `args.topic` becomes `topic`).",
    "Use the same example object in the module's `meta.exampleArgs`.",
    "",
    "--- USER REQUEST ---",
    userPrompt,
  ].join("\n");
}

/**
 * Builds the copyable command shown after Workflow generation.
 *
 * @param exampleArgs - Minimal caller input produced with the Workflow.
 * @returns A shell command with safely single-quoted compact JSON.
 * @internal
 */
export function buildRunCommand(
  exampleArgs: Readonly<Record<string, JsonValue>>,
): string {
  const json = JSON.stringify(exampleArgs);
  const shellValue = `'${json.replaceAll("'", "'\\''")}'`;
  return `deer-workflow run ./workflow.ts --input ${shellValue}`;
}

function parseExampleArgsJson(
  value: string,
): Readonly<Record<string, JsonValue>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch (cause) {
    throw new Error(
      "The workflow-creator Agent returned invalid example args.",
      {
        cause,
      },
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      "The workflow-creator Agent must return example args as a JSON object.",
    );
  }
  return parsed as Record<string, JsonValue>;
}

/**
 * Prints help for the `create` command.
 *
 * @internal
 */
export function printCreateUsage(): void {
  console.log(`Usage:
  deer-workflow create [--agent codex|claude|dsh|pi] "Describe the Workflow"
  echo "Describe the Workflow" | deer-workflow create [--agent codex|claude|dsh|pi]

Options:
  --agent <codex|claude|dsh|pi>  Agent runtime (default: codex)

Output:
  stdout  Generated Workflow source
  stderr  Interactive progress and Agent errors
`);
}

async function readCreatePrompt(values: readonly string[]): Promise<string> {
  const argumentPrompt = values.join(" ").trim();
  const prompt =
    argumentPrompt ||
    (process.stdin.isTTY ? "" : (await Bun.stdin.text()).trim());

  if (!prompt) {
    throw new CliUsageError(
      "The create command requires a prompt argument or stdin.",
    );
  }

  return prompt;
}

async function assertWorkflowCreatorSkillExists(): Promise<void> {
  try {
    await access(workflowCreatorSkillPath);
  } catch (cause) {
    throw new Error(
      `The bundled workflow-creator Skill is missing at ${workflowCreatorSkillPath}. Reinstall deer-workflow.`,
      { cause },
    );
  }
}

function unwrapSourceFence(output: string): string {
  const normalized = output.trim();
  if (!normalized) {
    throw new Error("The workflow-creator Agent returned an empty response.");
  }

  const match =
    /^```(?:typescript|ts|javascript|js)?\r?\n([\s\S]*?)\r?\n```$/.exec(
      normalized,
    );
  return match?.[1] ?? normalized;
}

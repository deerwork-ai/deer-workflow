import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { delimiter, join, resolve } from "node:path";

import { buildRunCommand } from "../../src/cli/create";

const projectDirectory = resolve(".");
const cliPath = resolve("src/cli.ts");

let temporaryDirectory: string;

beforeAll(async () => {
  temporaryDirectory = await mkdtemp(
    join(process.env.TMPDIR ?? "/tmp", "deer-workflow-create-test-"),
  );

  const codexStubPath = join(temporaryDirectory, "codex");
  await writeFile(
    codexStubPath,
    `#!/usr/bin/env bun
const args = Bun.argv.slice(2);
const prompt = await Bun.stdin.text();
const outputIndex = args.indexOf("--output-last-message");
const outputPath = args[outputIndex + 1];
const sandboxIndex = args.indexOf("--sandbox");

if (!outputPath) {
  console.error("missing output path");
  process.exit(8);
}

if (!args.includes("--skip-git-repo-check")) {
  console.error("missing --skip-git-repo-check");
  process.exit(9);
}

if (args[sandboxIndex + 1] !== "read-only") {
  console.error("create must use the read-only sandbox");
  process.exit(10);
}

await Bun.write(outputPath, JSON.stringify({
  source: \`\\\`\\\`\\\`ts\\n\${prompt}\\n\\\`\\\`\\\`\`,
  exampleArgsJson: JSON.stringify({ topic: "Example topic" }),
}));
`,
    "utf8",
  );
  await chmod(codexStubPath, 0o755);

  const claudeStubPath = join(temporaryDirectory, "claude");
  await writeFile(
    claudeStubPath,
    `#!/usr/bin/env bun
const args = Bun.argv.slice(2);
const prompt = await Bun.stdin.text();
const permissionIndex = args.indexOf("--permission-mode");

if (!args.includes("--json-schema")) {
  console.error("missing --json-schema");
  process.exit(8);
}

if (args[permissionIndex + 1] !== "plan") {
  console.error("create must use the read-only sandbox");
  process.exit(9);
}

console.log(JSON.stringify({
  type: "result",
  subtype: "success",
  is_error: false,
  result: "",
  structured_output: {
    source: prompt,
    exampleArgsJson: JSON.stringify({ topic: "Example topic" }),
  },
}));
`,
    "utf8",
  );
  await chmod(claudeStubPath, 0o755);

  const piStubPath = join(temporaryDirectory, "pi");
  await writeFile(
    piStubPath,
    `#!/usr/bin/env bun
const args = Bun.argv.slice(2);
const prompt = await Bun.stdin.text();
const modeIndex = args.indexOf("--mode");
const toolsIndex = args.indexOf("--tools");
const extensionIndex = args.indexOf("--extension");

if (args[modeIndex + 1] !== "json" || !args[extensionIndex + 1]) {
  console.error("create must use Pi structured output mode");
  process.exit(8);
}

if (args[toolsIndex + 1] !== "read,grep,find,ls,deer_workflow_final_response") {
  console.error("create must use Pi read-only tools");
  process.exit(9);
}

console.log(JSON.stringify({ type: "agent_start" }));
console.log(JSON.stringify({
  type: "tool_execution_end",
  toolName: "deer_workflow_final_response",
  result: {
    details: {
      source: prompt,
      exampleArgsJson: JSON.stringify({ topic: "Example topic" }),
    },
  },
  isError: false,
}));
console.log(JSON.stringify({ type: "agent_end", messages: [] }));
`,
    "utf8",
  );
  await chmod(piStubPath, 0o755);
  const dshStubPath = join(temporaryDirectory, "dsh");
  await writeFile(
    dshStubPath,
    `#!/usr/bin/env bun
const args = Bun.argv.slice(2);

if (args[0] !== "--profile" || args[1] !== "headless") {
  console.error("missing --profile headless launcher arguments");
  process.exit(5);
}

const task = args[args.length - 1];

if (!task.includes("STRUCTURED OUTPUT CONTRACT") || !task.includes("JSON Schema")) {
  console.error("create must embed the schema contract in the dsh task");
  process.exit(8);
}

console.log(JSON.stringify({
  source: task,
  exampleArgsJson: JSON.stringify({ topic: "Example topic" }),
}));
`,
    "utf8",
  );
  await chmod(dshStubPath, 0o755);
});

afterAll(async () => {
  await rm(temporaryDirectory, { recursive: true, force: true });
});

describe("deer-workflow create", () => {
  test("invokes the bundled Skill and appends an argument prompt", async () => {
    const result = await runCli(["create", "Research", "three", "markets"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toStartWith(
      "/* Generating a DeerFlow Dynamic Workflow with Codex */\n",
    );
    expect(result.stdout).toContain("$workflow-creator\n");
    expect(result.stdout).toContain("skills/workflow-creator/SKILL.md");
    expect(result.stdout).toEndWith(
      "--- USER REQUEST ---\nResearch three markets",
    );
    expect(result.stdout).not.toStartWith("```");
  });

  test("accepts the user prompt from stdin", async () => {
    const result = await runCli(
      ["create"],
      "Build a release verification Workflow",
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toEndWith(
      "--- USER REQUEST ---\nBuild a release verification Workflow",
    );
  });

  test("generates through Claude when selected", async () => {
    const result = await runCli([
      "create",
      "--agent",
      "claude",
      "Research",
      "three",
      "markets",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toStartWith(
      "/* Generating a DeerFlow Dynamic Workflow with Claude */\n",
    );
    expect(result.stdout).toEndWith(
      "--- USER REQUEST ---\nResearch three markets",
    );
  });

  test("generates through Pi when selected with equals syntax", async () => {
    const result = await runCli([
      "create",
      "--agent=pi",
      "Research",
      "three",
      "markets",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toStartWith(
      "/* Generating a DeerFlow Dynamic Workflow with Pi */\n",
    );
    expect(result.stdout).toEndWith(
      "--- USER REQUEST ---\nResearch three markets",
    );
  });

  test("generates through DeepSeek Harness when selected", async () => {
    const result = await runCli([
      "create",
      "--agent",
      "dsh",
      "Research",
      "three",
      "markets",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toStartWith(
      "/* Generating a DeerFlow Dynamic Workflow with DeepSeek Harness */\n",
    );
    expect(result.stdout).toContain(
      "--- USER REQUEST ---\nResearch three markets",
    );
  });

  test("rejects an empty prompt", async () => {
    const result = await runCli(["create"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(
      "The create command requires a prompt argument or stdin.",
    );
  });

  test("prints create help without starting an Agent", async () => {
    const result = await runCli(["create", "--agent", "claude", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      "deer-workflow create [--agent codex|claude|dsh|pi]",
    );
    expect(result.stdout).toContain(
      "--agent <codex|claude|dsh|pi>  Agent runtime (default: codex)",
    );
  });

  test("lists create in top-level help", async () => {
    const result = await runCli(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      "deer-workflow create [--agent codex|claude|dsh|pi]",
    );
    expect(result.stdout).toContain(
      "create  Generate a Workflow with the bundled workflow-creator Skill",
    );
    expect(result.stdout).toContain(
      "--agent <codex|claude|dsh|pi>  Agent runtime for create (default: codex)",
    );
    expect(result.stdout).not.toContain("deer-workflow agent");
  });

  test("rejects the removed agent command", async () => {
    const result = await runCli(["agent", "Inspect the repository"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Unknown command: agent");
  });

  test("bundles the meta and args authoring contract", async () => {
    const skill = await readFile(
      resolve("skills/workflow-creator/SKILL.md"),
      "utf8",
    );

    expect(skill).toContain("export const meta");
    expect(skill).toContain('name: "workflow-name"');
    expect(skill).toContain('description: "One-line description');
    expect(skill).toContain('phases: [{ title: "Plan" }');
    expect(skill).toContain("exampleArgs");
    expect(skill).toContain("args: WorkflowInput");
    expect(skill).toContain("`args` is not a JavaScript global");
  });

  test("builds a runnable next command from the generated args shape", () => {
    expect(buildRunCommand({ topic: "Agent workflows" })).toBe(
      `deer-workflow run ./workflow.ts --input '{"topic":"Agent workflows"}'`,
    );
    expect(buildRunCommand({ topic: "What's new" })).toBe(
      `deer-workflow run ./workflow.ts --input '{"topic":"What'\\''s new"}'`,
    );
  });
});

async function runCli(args: readonly string[], stdin = "") {
  const path = [temporaryDirectory, process.env.PATH ?? ""].join(delimiter);
  const subprocess = Bun.spawn([process.execPath, cliPath, ...args], {
    cwd: projectDirectory,
    env: {
      ...process.env,
      PATH: path,
    },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });

  subprocess.stdin.write(stdin);
  subprocess.stdin.end();

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(subprocess.stdout).text(),
    new Response(subprocess.stderr).text(),
    subprocess.exited,
  ]);

  return {
    stdout: stdout.trim(),
    stderr: stderr.trim(),
    exitCode,
  };
}

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  DeepSeekHarnessAgent,
  DeepSeekHarnessAgentError,
  DeepSeekHarnessCliNotFoundError,
} from "@deerwork-ai/deer-workflow/agents";

let temporaryDirectory: string;
let stubPath: string;

beforeAll(async () => {
  temporaryDirectory = await mkdtemp(
    join(tmpdir(), "deer-workflow-deepseek-harness-agent-test-"),
  );
  stubPath = join(temporaryDirectory, "dsh-stub.ts");

  await writeFile(
    stubPath,
    `
const args = Bun.argv.slice(2);

if (args[0] !== "--profile" || args[1] !== "headless") {
  console.error("missing --profile headless launcher arguments");
  process.exit(5);
}

const task = args[args.length - 1];

if (task === undefined) {
  console.error("task must be the final argument");
  process.exit(6);
}

if (task.startsWith("fail")) {
  console.error("mock dsh failure");
  process.exit(3);
}

if (task.startsWith("sandbox-ro:") && process.env.DSH_PERMISSION_MODE !== "read-only") {
  console.error("expected DSH_PERMISSION_MODE=read-only");
  process.exit(7);
}

if (task.startsWith("sandbox-full:") && process.env.DSH_PERMISSION_MODE !== "danger-full-access") {
  console.error("expected DSH_PERMISSION_MODE=danger-full-access");
  process.exit(7);
}

if (task.includes("STRUCTURED OUTPUT CONTRACT")) {
  if (!task.includes("JSON Schema")) {
    console.error("schema contract missing from the task");
    process.exit(8);
  }

  if (task.includes("no-json")) {
    console.log("no json here");
    process.exit(0);
  }

  if (task.includes("bare")) {
    console.log('{"ok":true,"mode":"bare"}');
    process.exit(0);
  }

  console.log("Here is the requested JSON object:");
  console.log("\`\`\`json");
  console.log('{"ok":true,"mode":"fenced"}');
  console.log("\`\`\`");
  console.log("Done.");
  process.exit(0);
}

console.log("mock: " + task);
`,
    "utf8",
  );
});

afterAll(async () => {
  await rm(temporaryDirectory, { recursive: true, force: true });
});

describe("DeepSeekHarnessAgent", () => {
  test("returns the final text response sent as the headless task", async () => {
    const runtime = createStubAgent();

    const result = await runtime.run("hello");

    expect(result).toBe("mock: hello");
  });

  test("maps the read-only sandbox onto DSH_PERMISSION_MODE", async () => {
    const runtime = createStubAgent();

    const result = await runtime.run("sandbox-ro: inspect", {
      sandbox: "read-only",
    });

    expect(result).toBe("mock: sandbox-ro: inspect");
  });

  test("maps danger-full-access onto DSH_PERMISSION_MODE", async () => {
    const runtime = createStubAgent();

    const result = await runtime.run("sandbox-full: inspect", {
      sandbox: "danger-full-access",
    });

    expect(result).toBe("mock: sandbox-full: inspect");
  });

  test("parses a schema-backed response from prose-wrapped fenced JSON", async () => {
    const runtime = createStubAgent();

    const result = await runtime.run<{ ok: boolean; mode: string }>("inspect", {
      schema: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          mode: { type: "string" },
        },
        required: ["ok", "mode"],
        additionalProperties: false,
      },
    });

    expect(result).toEqual({ ok: true, mode: "fenced" });
  });

  test("parses a schema-backed response from a bare JSON message", async () => {
    const runtime = createStubAgent();

    const result = await runtime.run<{ ok: boolean; mode: string }>(
      "inspect bare",
      {
        schema: { type: "object" },
      },
    );

    expect(result).toEqual({ ok: true, mode: "bare" });
  });

  test("preserves DeepSeek Harness stderr and exit code on failure", async () => {
    const runtime = createStubAgent();

    try {
      await runtime.run("fail now");
      throw new Error("Expected the Agent run to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(DeepSeekHarnessAgentError);
      expect((error as DeepSeekHarnessAgentError).exitCode).toBe(3);
      expect((error as DeepSeekHarnessAgentError).stderr).toContain(
        "mock dsh failure",
      );
    }
  });

  test("fails clearly when no JSON object is returned for a schema", async () => {
    const runtime = createStubAgent();

    try {
      await runtime.run("inspect no-json", { schema: { type: "object" } });
      throw new Error("Expected the Agent run to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(DeepSeekHarnessAgentError);
      expect((error as DeepSeekHarnessAgentError).message).toContain(
        "did not return the JSON object",
      );
    }
  });

  test("explains how to install DeepSeek Harness when the command is missing", async () => {
    const runtime = new DeepSeekHarnessAgent({
      command: "deer-workflow-missing-dsh-command",
    });

    try {
      await runtime.run("inspect");
      throw new Error("Expected the DeepSeek Harness CLI lookup to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(DeepSeekHarnessCliNotFoundError);
      expect((error as Error).message).toContain(
        "bun install --global @deepseek-ai/dsh",
      );
      expect((error as Error).message).toContain("deepseek-harness");
    }
  });

  test("rejects per-run model overrides", async () => {
    const runtime = createStubAgent();

    try {
      await runtime.run("inspect", { model: "deepseek-chat" });
      throw new Error("Expected the model override to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(TypeError);
      expect((error as Error).message).toContain("agent-default-model");
    }
  });

  test("rejects additional writable directories", async () => {
    const runtime = createStubAgent();

    try {
      await runtime.run("inspect", {
        additionalWritableDirectories: ["/tmp/extra"],
      });
      throw new Error("Expected the writable directory option to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(TypeError);
      expect((error as Error).message).toContain(
        "additionalWritableDirectories",
      );
    }
  });
});

function createStubAgent(): DeepSeekHarnessAgent {
  return new DeepSeekHarnessAgent({
    command: process.execPath,
    commandArgs: [stubPath],
    cwd: temporaryDirectory,
  });
}

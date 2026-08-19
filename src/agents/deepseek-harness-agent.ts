import { resolve } from "node:path";

import type {
  Agent,
  AgentOptions,
  DeepSeekHarnessAgentConfig,
  DeepSeekHarnessAgentErrorDetails,
  JsonValue,
  ResolvedDeepSeekHarnessAgentConfig,
} from "./types";

/**
 * Error raised when the configured DeepSeek Harness CLI executable is
 * unavailable.
 */
export class DeepSeekHarnessCliNotFoundError extends Error {
  /** Executable name or path that could not be resolved. */
  readonly command: string;

  /**
   * Creates an actionable DeepSeek Harness CLI installation error.
   *
   * @param command - Executable name or path that was not found.
   */
  constructor(command: string) {
    super(`DeepSeek Harness CLI command "${command}" was not found.

Install DeepSeek Harness CLI:
  bun install --global @deepseek-ai/dsh
  dsh --version

Installation guide: https://github.com/deepseek-ai/deepseek-harness`);
    this.name = "DeepSeekHarnessCliNotFoundError";
    this.command = command;
  }
}

/**
 * Error raised when DeepSeek Harness cannot complete an Agent run or return
 * the requested structured output.
 */
export class DeepSeekHarnessAgentError extends Error {
  /** DeepSeek Harness CLI process exit status. */
  readonly exitCode: number;

  /** Complete standard output captured from DeepSeek Harness CLI. */
  readonly stdout: string;

  /** Complete standard error captured from DeepSeek Harness CLI. */
  readonly stderr: string;

  /**
   * Creates an error with the original DeepSeek Harness process diagnostics.
   *
   * @param message - Human-readable failure summary.
   * @param details - Exit status and captured process output.
   */
  constructor(message: string, details: DeepSeekHarnessAgentErrorDetails) {
    super(message);
    this.name = "DeepSeekHarnessAgentError";
    this.exitCode = details.exitCode;
    this.stdout = details.stdout;
    this.stderr = details.stderr;
  }
}

/**
 * Agent runtime backed by the non-interactive
 * `dsh --profile headless "<task>"` command.
 *
 * @remarks
 * Each call starts a complete DeepSeek Harness Agent Loop that answers one
 * task, prints the final assistant message to stdout, and exits. Unlike the
 * other built-in Harnesses, the headless surface receives the task as a
 * command-line argument because it has no stdin prompt channel; processes are
 * still spawned with argument arrays, never through a shell.
 *
 * `AgentOptions.sandbox` maps one-to-one onto the `DSH_PERMISSION_MODE`
 * environment variable (`read-only`, `workspace-write`,
 * `danger-full-access`). The model cannot be overridden per run: DeepSeek
 * Harness resolves it from its own `agent-default-model` setting, so
 * `AgentOptions.model` throws instead of being silently ignored. Session
 * records persist under the DeepSeek Harness home directory (`$DSH_HOME`)
 * for audit; there is no ephemeral switch to fake. Schema-backed calls embed
 * a structured-output contract in the task and parse the JSON object from the
 * final message, tolerating surrounding prose or Markdown fences.
 *
 * @example
 * ```ts
 * const runtime = new DeepSeekHarnessAgent({ sandbox: "read-only" });
 * const result = await runtime.run("Inspect this repository.");
 * ```
 */
export class DeepSeekHarnessAgent implements Agent {
  readonly #config: ResolvedDeepSeekHarnessAgentConfig;

  /**
   * Creates a DeepSeek Harness-backed Agent runtime.
   *
   * @param config - Defaults applied to every DeepSeek Harness invocation.
   */
  constructor(config: DeepSeekHarnessAgentConfig = {}) {
    this.#config = {
      command: config.command ?? "dsh",
      commandArgs: config.commandArgs ?? [],
      cwd: config.cwd,
      sandbox: config.sandbox,
      extraArgs: config.extraArgs ?? [],
      env: config.env,
    };
  }

  /**
   * Runs DeepSeek Harness until it produces a final response.
   *
   * @typeParam TOutput - Expected final response type.
   * @param prompt - Task instructions sent to DeepSeek Harness.
   * @param options - Per-run options that override constructor defaults.
   * @returns Text when no schema is supplied, otherwise parsed JSON.
   * @throws {@link DeepSeekHarnessAgentError} When DeepSeek Harness exits
   * unsuccessfully or omits the requested structured response.
   * @throws {@link DeepSeekHarnessCliNotFoundError} When the configured
   * executable cannot be resolved.
   * @throws TypeError When `prompt` is empty or an unsupported option is set.
   */
  async run<TOutput = string>(
    prompt: string,
    options: AgentOptions = {},
  ): Promise<TOutput> {
    if (prompt.trim().length === 0) {
      throw new TypeError("DeepSeekHarnessAgent requires a non-empty prompt.");
    }

    if (options.model !== undefined) {
      throw new TypeError(
        "DeepSeekHarnessAgent does not support per-run model overrides. Configure the agent-default-model setting in $DSH_HOME/settings.yaml instead.",
      );
    }

    if (options.additionalWritableDirectories !== undefined) {
      throw new TypeError(
        "DeepSeekHarnessAgent does not support additionalWritableDirectories. DeepSeek Harness confines writes to the session workspace and platform temporary roots.",
      );
    }

    options.signal?.throwIfAborted();
    this.#assertCommandAvailable();

    const task = options.schema
      ? buildStructuredTask(prompt, options.schema)
      : prompt;
    const sandbox = options.sandbox ?? this.#config.sandbox;
    const environment = mergeEnvironment(
      process.env,
      this.#config.env,
      options.env,
    );
    if (sandbox !== undefined) {
      environment.DSH_PERMISSION_MODE = sandbox;
    }
    const subprocess = Bun.spawn(this.#buildCommand(task), {
      cwd: resolve(options.cwd ?? this.#config.cwd ?? process.cwd()),
      env: environment,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });

    const abort = (): void => {
      subprocess.kill();
    };
    options.signal?.addEventListener("abort", abort, { once: true });

    try {
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(subprocess.stdout).text(),
        new Response(subprocess.stderr).text(),
        subprocess.exited,
      ]);

      if (options.signal?.aborted) {
        throw (
          options.signal.reason ??
          new DOMException("The Agent run was aborted.", "AbortError")
        );
      }

      const details: DeepSeekHarnessAgentErrorDetails = {
        exitCode,
        stdout,
        stderr,
      };

      if (exitCode !== 0) {
        throw new DeepSeekHarnessAgentError(
          `DeepSeek Harness CLI exited with status ${exitCode}.`,
          details,
        );
      }

      if (!options.schema) {
        return stdout.trimEnd() as TOutput;
      }

      return parseStructuredOutput(stdout, details) as TOutput;
    } finally {
      options.signal?.removeEventListener("abort", abort);
    }
  }

  #assertCommandAvailable(): void {
    if (Bun.which(this.#config.command) === null) {
      throw new DeepSeekHarnessCliNotFoundError(this.#config.command);
    }
  }

  #buildCommand(task: string): string[] {
    return [
      this.#config.command,
      ...this.#config.commandArgs,
      "--profile",
      "headless",
      ...this.#config.extraArgs,
      task,
    ];
  }
}

/**
 * Appends the structured-output contract to a task.
 *
 * @param prompt - Task instructions for the Agent.
 * @param schema - JSON Schema the final message must satisfy.
 * @returns The task text carrying the schema contract.
 */
function buildStructuredTask(
  prompt: string,
  schema: AgentOptions["schema"],
): string {
  return [
    prompt,
    "",
    "--- STRUCTURED OUTPUT CONTRACT ---",
    "Return exactly one JSON object as your final message and nothing else.",
    "The JSON object must validate against this JSON Schema:",
    JSON.stringify(schema),
    "Do not wrap the JSON in Markdown fences. Do not add prose before or after it. Include every required property.",
  ].join("\n");
}

/**
 * Parses the schema-backed response from the final assistant message.
 *
 * @param stdout - Complete final message printed by DeepSeek Harness.
 * @param details - Process diagnostics attached to a thrown failure.
 * @returns The parsed JSON value.
 */
function parseStructuredOutput(
  stdout: string,
  details: DeepSeekHarnessAgentErrorDetails,
): JsonValue {
  const trimmed = stdout.trim();

  const direct = tryParseJson(trimmed);
  if (direct !== undefined) {
    return direct;
  }

  const fenced = unwrapCodeFence(trimmed);
  if (fenced !== undefined) {
    const parsed = tryParseJson(fenced);
    if (parsed !== undefined) {
      return parsed;
    }
  }

  const extracted = extractFirstJsonObject(trimmed);
  if (extracted !== undefined) {
    return extracted;
  }

  throw new DeepSeekHarnessAgentError(
    "DeepSeek Harness CLI did not return the JSON object requested by the schema.",
    details,
  );
}

function tryParseJson(text: string): JsonValue | undefined {
  try {
    return JSON.parse(text) as JsonValue;
  } catch {
    return undefined;
  }
}

function unwrapCodeFence(text: string): string | undefined {
  const match = /^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```$/.exec(text);
  return match?.[1];
}

function extractFirstJsonObject(text: string): JsonValue | undefined {
  for (
    let start = text.indexOf("{");
    start !== -1;
    start = text.indexOf("{", start + 1)
  ) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < text.length; index += 1) {
      const character = text[index];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (character === "\\") {
          escaped = true;
        } else if (character === '"') {
          inString = false;
        }
        continue;
      }
      if (character === '"') {
        inString = true;
      } else if (character === "{") {
        depth += 1;
      } else if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          const parsed = tryParseJson(text.slice(start, index + 1));
          if (parsed !== undefined) {
            return parsed;
          }
          break;
        }
      }
    }
  }

  return undefined;
}

function mergeEnvironment(
  ...sources: Array<Record<string, string | undefined> | undefined>
): Record<string, string> {
  const environment: Record<string, string> = {};

  for (const source of sources) {
    for (const [key, value] of Object.entries(source ?? {})) {
      if (value === undefined) {
        delete environment[key];
      } else {
        environment[key] = value;
      }
    }
  }

  return environment;
}

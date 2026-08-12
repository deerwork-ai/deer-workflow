import { isAbsolute, resolve } from "node:path";

import { resolveExecutable } from "./resolve-executable";
import type {
  Agent,
  AgentOptions,
  AgentSandbox,
  ClaudeAgentConfig,
  ClaudeAgentErrorDetails,
  ClaudeAgentResultMessage,
  ResolvedClaudeAgentConfig,
} from "./types";

/**
 * Error raised when the configured Claude Code CLI executable is unavailable.
 */
export class ClaudeCliNotFoundError extends Error {
  /** Executable name or path that could not be resolved. */
  readonly command: string;

  /**
   * Creates an actionable Claude Code CLI installation error.
   *
   * @param command - Executable name or path that was not found.
   */
  constructor(command: string) {
    super(`Claude Code CLI command "${command}" was not found.

Install Claude Code CLI:
  npm install -g @anthropic-ai/claude-code
  claude auth login
  claude --version

Installation guide: https://docs.claude.com/en/docs/claude-code`);
    this.name = "ClaudeCliNotFoundError";
    this.command = command;
  }
}

/**
 * Error raised when Claude Code CLI cannot complete an Agent run or return
 * the requested structured output.
 */
export class ClaudeAgentError extends Error {
  /** Claude Code CLI process exit status. */
  readonly exitCode: number;

  /** Complete standard output captured from Claude Code CLI. */
  readonly stdout: string;

  /** Complete standard error captured from Claude Code CLI. */
  readonly stderr: string;

  /**
   * Creates an error with the original Claude Code process diagnostics.
   *
   * @param message - Human-readable failure summary.
   * @param details - Exit status and captured process output.
   */
  constructor(message: string, details: ClaudeAgentErrorDetails) {
    super(message);
    this.name = "ClaudeAgentError";
    this.exitCode = details.exitCode;
    this.stdout = details.stdout;
    this.stderr = details.stderr;
  }
}

/**
 * Agent runtime backed by the non-interactive `claude --print` command.
 *
 * @remarks
 * Each call starts a complete Claude Code Agent Loop. Prompts are sent over
 * stdin, responses are parsed from `--output-format json`, and sessions are
 * ephemeral by default via `--no-session-persistence`.
 *
 * @example
 * ```ts
 * const runtime = new ClaudeAgent({ sandbox: "read-only" });
 * const result = await runtime.run("Inspect this repository.");
 * ```
 */
export class ClaudeAgent implements Agent {
  readonly #config: ResolvedClaudeAgentConfig;

  /**
   * Creates a Claude Code-backed Agent runtime.
   *
   * @param config - Defaults applied to every Claude Code invocation.
   */
  constructor(config: ClaudeAgentConfig = {}) {
    this.#config = {
      command: config.command ?? "claude",
      commandArgs: config.commandArgs ?? [],
      cwd: config.cwd,
      model: config.model,
      sandbox: config.sandbox,
      ephemeral: config.ephemeral ?? true,
      extraArgs: config.extraArgs ?? [],
      env: config.env,
    };
  }

  /**
   * Runs Claude Code CLI until it produces a final response.
   *
   * @typeParam TOutput - Expected final response type.
   * @param prompt - Task instructions sent to Claude Code over stdin.
   * @param options - Per-run options that override constructor defaults.
   * @returns Text when no schema is supplied, otherwise parsed JSON.
   * @throws {@link ClaudeAgentError} When Claude Code exits unsuccessfully or
   * returns invalid JSON for a schema-backed call.
   * @throws TypeError When `prompt` is empty.
   */
  async run<TOutput = string>(
    prompt: string,
    options: AgentOptions = {},
  ): Promise<TOutput> {
    if (prompt.trim().length === 0) {
      throw new TypeError("ClaudeAgent requires a non-empty prompt.");
    }

    options.signal?.throwIfAborted();
    const resolvedCommand = this.#resolveCommandOrThrow();

    const command = this.#buildCommand(options, resolvedCommand);
    const cwd = resolve(options.cwd ?? this.#config.cwd ?? process.cwd());
    const subprocess = Bun.spawn(command, {
      cwd,
      env: mergeEnvironment(process.env, this.#config.env, options.env),
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    const abort = (): void => {
      subprocess.kill();
    };
    options.signal?.addEventListener("abort", abort, { once: true });

    subprocess.stdin.write(prompt);
    subprocess.stdin.end();

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

      const message = this.#parseResultMessage(stdout, {
        exitCode,
        stdout,
        stderr,
      });

      if (exitCode !== 0 || message.is_error) {
        throw new ClaudeAgentError(
          `Claude Code CLI reported a failure: ${message.result ?? `exit status ${exitCode}`}`,
          { exitCode, stdout, stderr },
        );
      }

      if (!options.schema) {
        return (message.result ?? "").trimEnd() as TOutput;
      }

      if (message.structured_output !== undefined) {
        return message.structured_output as TOutput;
      }

      try {
        return JSON.parse(message.result ?? "") as TOutput;
      } catch (cause) {
        throw new ClaudeAgentError(
          `Claude Code CLI returned invalid JSON for the requested schema: ${formatCause(cause)}`,
          { exitCode, stdout, stderr },
        );
      }
    } finally {
      options.signal?.removeEventListener("abort", abort);
    }
  }

  #resolveCommandOrThrow(): string {
    const resolved = resolveExecutable(this.#config.command);
    if (resolved === null) {
      throw new ClaudeCliNotFoundError(this.#config.command);
    }
    return resolved;
  }

  #parseResultMessage(
    stdout: string,
    details: ClaudeAgentErrorDetails,
  ): ClaudeAgentResultMessage {
    try {
      return JSON.parse(stdout) as ClaudeAgentResultMessage;
    } catch (cause) {
      throw new ClaudeAgentError(
        `Claude Code CLI returned a non-JSON response: ${formatCause(cause)}`,
        details,
      );
    }
  }

  #buildCommand(options: AgentOptions, resolvedCommand: string): string[] {
    const command = [
      resolvedCommand,
      ...this.#config.commandArgs,
      "--print",
      "--output-format",
      "json",
    ];

    if (this.#config.ephemeral) {
      command.push("--no-session-persistence");
    }

    const model = options.model ?? this.#config.model;
    if (model) {
      command.push("--model", model);
    }

    const sandbox = options.sandbox ?? this.#config.sandbox;
    this.#pushSandboxArgs(command, sandbox);

    for (const directory of options.additionalWritableDirectories ?? []) {
      command.push("--add-dir", absolutePath(directory));
    }

    if (options.schema) {
      command.push("--json-schema", JSON.stringify(options.schema));
    }

    command.push(...this.#config.extraArgs);
    return command;
  }

  #pushSandboxArgs(command: string[], sandbox: AgentSandbox | undefined) {
    switch (sandbox) {
      case "read-only":
        command.push("--permission-mode", "plan");
        break;
      case "workspace-write":
        command.push("--permission-mode", "acceptEdits");
        break;
      case "danger-full-access":
        command.push("--dangerously-skip-permissions");
        break;
      case undefined:
        break;
    }
  }
}

function absolutePath(path: string): string {
  return isAbsolute(path) ? path : resolve(path);
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

function formatCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

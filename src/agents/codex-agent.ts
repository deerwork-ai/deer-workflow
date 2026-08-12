import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import { resolveExecutable } from "./resolve-executable";
import type {
  Agent,
  AgentOptions,
  CodexAgentConfig,
  CodexAgentErrorDetails,
  ResolvedCodexAgentConfig,
} from "./types";

/**
 * Error raised when the configured Codex CLI executable is unavailable.
 */
export class CodexCliNotFoundError extends Error {
  /** Executable name or path that could not be resolved. */
  readonly command: string;

  /**
   * Creates an actionable Codex CLI installation error.
   *
   * @param command - Executable name or path that was not found.
   */
  constructor(command: string) {
    super(`Codex CLI command "${command}" was not found.

Install Codex CLI:
  npm install -g @openai/codex
  codex login
  codex --version

Codex CLI and Codex Desktop are separate installations. Installing Codex Desktop does not install the \`codex\` terminal command.

Installation guide: https://help.openai.com/en/articles/11096431`);
    this.name = "CodexCliNotFoundError";
    this.command = command;
  }
}

/**
 * Error raised when Codex CLI cannot complete an Agent run or return the
 * requested structured output.
 */
export class CodexAgentError extends Error {
  /** Codex CLI process exit status. */
  readonly exitCode: number;

  /** Complete standard output captured from Codex CLI. */
  readonly stdout: string;

  /** Complete standard error captured from Codex CLI. */
  readonly stderr: string;

  /**
   * Creates an error with the original Codex process diagnostics.
   *
   * @param message - Human-readable failure summary.
   * @param details - Exit status and captured process output.
   */
  constructor(message: string, details: CodexAgentErrorDetails) {
    super(message);
    this.name = "CodexAgentError";
    this.exitCode = details.exitCode;
    this.stdout = details.stdout;
    this.stderr = details.stderr;
  }
}

/**
 * Agent runtime backed by the non-interactive `codex exec` command.
 *
 * @remarks
 * Each call starts a complete Codex Agent Loop. Prompts are sent over stdin,
 * schema-backed responses use `--output-schema`, and temporary files are
 * removed after completion.
 *
 * @example
 * ```ts
 * const runtime = new CodexAgent({ sandbox: "read-only" });
 * const result = await runtime.run("Inspect this repository.");
 * ```
 */
export class CodexAgent implements Agent {
  readonly #config: ResolvedCodexAgentConfig;

  /**
   * Creates a Codex-backed Agent runtime.
   *
   * @param config - Defaults applied to every Codex invocation.
   */
  constructor(config: CodexAgentConfig = {}) {
    this.#config = {
      command: config.command ?? "codex",
      commandArgs: config.commandArgs ?? [],
      cwd: config.cwd,
      model: config.model,
      sandbox: config.sandbox,
      ephemeral: config.ephemeral ?? true,
      skipGitRepositoryCheck: config.skipGitRepositoryCheck ?? false,
      extraArgs: config.extraArgs ?? [],
      env: config.env,
    };
  }

  /**
   * Runs Codex CLI until it produces a final response.
   *
   * @typeParam TOutput - Expected final response type.
   * @param prompt - Task instructions sent to Codex over stdin.
   * @param options - Per-run options that override constructor defaults.
   * @returns Text when no schema is supplied, otherwise parsed JSON.
   * @throws {@link CodexAgentError} When Codex exits unsuccessfully or returns
   * invalid JSON for a schema-backed call.
   * @throws TypeError When `prompt` is empty.
   */
  async run<TOutput = string>(
    prompt: string,
    options: AgentOptions = {},
  ): Promise<TOutput> {
    if (prompt.trim().length === 0) {
      throw new TypeError("CodexAgent requires a non-empty prompt.");
    }

    options.signal?.throwIfAborted();
    const resolvedCommand = this.#resolveCommandOrThrow();

    const temporaryDirectory = await mkdtemp(
      join(tmpdir(), "deer-workflow-codex-"),
    );
    const outputPath = join(temporaryDirectory, "last-message.txt");
    const schemaPath = join(temporaryDirectory, "output-schema.json");

    try {
      const command = this.#buildCommand(
        options,
        resolvedCommand,
        outputPath,
        schemaPath,
      );

      if (options.schema) {
        await writeFile(
          schemaPath,
          `${JSON.stringify(options.schema, null, 2)}\n`,
          "utf8",
        );
      }

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

        if (exitCode !== 0) {
          throw new CodexAgentError(
            `Codex CLI exited with status ${exitCode}.`,
            { exitCode, stdout, stderr },
          );
        }

        const lastMessage = await readFile(outputPath, "utf8");

        if (!options.schema) {
          return lastMessage.trimEnd() as TOutput;
        }

        try {
          return JSON.parse(lastMessage) as TOutput;
        } catch (cause) {
          throw new CodexAgentError(
            `Codex CLI returned invalid JSON for the requested schema: ${formatCause(cause)}`,
            { exitCode, stdout, stderr },
          );
        }
      } finally {
        options.signal?.removeEventListener("abort", abort);
      }
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }

  #resolveCommandOrThrow(): string {
    const resolved = resolveExecutable(this.#config.command);
    if (resolved === null) {
      throw new CodexCliNotFoundError(this.#config.command);
    }
    return resolved;
  }

  #buildCommand(
    options: AgentOptions,
    resolvedCommand: string,
    outputPath: string,
    schemaPath: string,
  ): string[] {
    const command = [
      resolvedCommand,
      ...this.#config.commandArgs,
      "exec",
      "--color",
      "never",
      "--output-last-message",
      outputPath,
    ];

    if (this.#config.ephemeral) {
      command.push("--ephemeral");
    }

    if (this.#config.skipGitRepositoryCheck) {
      command.push("--skip-git-repo-check");
    }

    const cwd = options.cwd ?? this.#config.cwd;
    if (cwd) {
      command.push("--cd", absolutePath(cwd));
    }

    const model = options.model ?? this.#config.model;
    if (model) {
      command.push("--model", model);
    }

    const sandbox = options.sandbox ?? this.#config.sandbox;
    if (sandbox) {
      command.push("--sandbox", sandbox);
    }

    for (const directory of options.additionalWritableDirectories ?? []) {
      command.push("--add-dir", absolutePath(directory));
    }

    if (options.schema) {
      command.push("--output-schema", schemaPath);
    }

    command.push(...this.#config.extraArgs, "-");
    return command;
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

/**
 * A scalar value that can be represented directly in JSON.
 */
export type JsonPrimitive = boolean | number | string | null;

/**
 * Any recursively serializable JSON value.
 */
export type JsonValue =
  JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

/**
 * A JSON Schema document passed to an Agent runtime to constrain its final
 * response.
 *
 * @remarks
 * The runtime is responsible for enforcing the schema. Deer Workflow only
 * transports the schema and parses the validated response.
 */
export type JsonSchema = {
  [key: string]: JsonValue;
};

/**
 * Filesystem and command-execution isolation available to an Agent.
 */
export type AgentSandbox =
  "read-only" | "workspace-write" | "danger-full-access";

/**
 * Options shared by all Agent runtime implementations.
 */
export interface AgentOptions {
  /** Working directory presented to the Agent. */
  cwd?: string;

  /** Runtime-specific model identifier. */
  model?: string;

  /** JSON Schema that constrains and types the final response. */
  schema?: JsonSchema;

  /** Sandbox policy applied to tools used by the Agent. */
  sandbox?: AgentSandbox;

  /** Extra directories the Agent may write outside {@link AgentOptions.cwd}. */
  additionalWritableDirectories?: string[];

  /** Environment variables merged into the Agent process environment. */
  env?: Record<string, string | undefined>;

  /** Signal used to cancel the complete Agent run. */
  signal?: AbortSignal;
}

/**
 * Vendor-neutral contract for a complete tool-using Agent Loop.
 */
export interface Agent {
  /**
   * Runs an Agent until it produces a final response.
   *
   * @typeParam TOutput - Expected final response type. Use an object type when
   * {@link AgentOptions.schema} is provided; otherwise it defaults to text.
   * @param prompt - Task instructions for the Agent.
   * @param options - Runtime, output, and cancellation options.
   * @returns The final text or parsed schema-backed response.
   */
  run<TOutput = string>(
    prompt: string,
    options?: AgentOptions,
  ): Promise<TOutput>;
}

/**
 * Callable form of {@link Agent.run}.
 *
 * @typeParam TOutput - Expected final response type.
 */
export type AgentFunction = <TOutput = string>(
  prompt: string,
  options?: AgentOptions,
) => Promise<TOutput>;

/**
 * Construction options for {@link CodexAgent}.
 */
export interface CodexAgentConfig {
  /** Codex executable name or absolute path. Defaults to `codex`. */
  command?: string;

  /** Arguments inserted between the executable and `codex exec`. */
  commandArgs?: string[];

  /** Default working directory for Agent runs. */
  cwd?: string;

  /** Default Codex model identifier. */
  model?: string;

  /** Default Codex sandbox policy. */
  sandbox?: AgentSandbox;

  /** Whether Codex should avoid persisting session files. Defaults to `true`. */
  ephemeral?: boolean;

  /** Whether Codex may run outside a Git repository. */
  skipGitRepositoryCheck?: boolean;

  /** Additional raw arguments inserted before the prompt placeholder. */
  extraArgs?: string[];

  /** Environment variables applied to every Codex process. */
  env?: Record<string, string | undefined>;
}

/**
 * Fully normalized Codex Agent configuration.
 *
 * @internal
 */
export interface ResolvedCodexAgentConfig {
  command: string;
  commandArgs: string[];
  cwd?: string;
  model?: string;
  sandbox?: AgentSandbox;
  ephemeral: boolean;
  skipGitRepositoryCheck: boolean;
  extraArgs: string[];
  env?: Record<string, string | undefined>;
}

/**
 * Captured process details used to construct a {@link CodexAgentError}.
 *
 * @internal
 */
export interface CodexAgentErrorDetails {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Construction options for {@link ClaudeAgent}.
 */
export interface ClaudeAgentConfig {
  /** Claude Code executable name or absolute path. Defaults to `claude`. */
  command?: string;

  /** Arguments inserted between the executable and the `--print` flags. */
  commandArgs?: string[];

  /** Default working directory for Agent runs. */
  cwd?: string;

  /** Default Claude Code model identifier or alias (e.g. `sonnet`, `opus`). */
  model?: string;

  /** Default Claude Code sandbox policy. */
  sandbox?: AgentSandbox;

  /** Whether Claude Code should avoid persisting session files. Defaults to `true`. */
  ephemeral?: boolean;

  /** Additional raw arguments inserted before the prompt is sent over stdin. */
  extraArgs?: string[];

  /** Environment variables applied to every Claude Code process. */
  env?: Record<string, string | undefined>;
}

/**
 * Fully normalized Claude Code Agent configuration.
 *
 * @internal
 */
export interface ResolvedClaudeAgentConfig {
  command: string;
  commandArgs: string[];
  cwd?: string;
  model?: string;
  sandbox?: AgentSandbox;
  ephemeral: boolean;
  extraArgs: string[];
  env?: Record<string, string | undefined>;
}

/**
 * Captured process details used to construct a {@link ClaudeAgentError}.
 *
 * @internal
 */
export interface ClaudeAgentErrorDetails {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Shape of the JSON object Claude Code prints to stdout with
 * `--output-format json`.
 *
 * @internal
 */
export interface ClaudeAgentResultMessage {
  type: string;
  subtype?: string;
  is_error: boolean;
  result?: string;
  structured_output?: JsonValue;
  session_id?: string;
}

/**
 * Construction options for {@link PiAgent}.
 */
export interface PiAgentConfig {
  /** Pi executable name or absolute path. Defaults to `pi`. */
  command?: string;

  /** Arguments inserted immediately after the executable. */
  commandArgs?: string[];

  /** Default working directory for Agent runs. */
  cwd?: string;

  /** Default Pi model identifier or provider-qualified pattern. */
  model?: string;

  /** Default tool-isolation policy enforced by the Pi Harness. */
  sandbox?: AgentSandbox;

  /** Whether Pi should avoid persisting sessions. Defaults to `true`. */
  ephemeral?: boolean;

  /**
   * Additional raw Pi arguments applied to every run. Protocol, session,
   * extension, trust, and tool-control options are reserved by the Harness.
   */
  extraArgs?: string[];

  /** Environment variables applied to every Pi process. */
  env?: Record<string, string | undefined>;
}

/**
 * Fully normalized Pi Agent configuration.
 *
 * @internal
 */
export interface ResolvedPiAgentConfig {
  command: string;
  commandArgs: string[];
  cwd?: string;
  model?: string;
  sandbox?: AgentSandbox;
  ephemeral: boolean;
  extraArgs: string[];
  env?: Record<string, string | undefined>;
}

/**
 * Captured process details used to construct a {@link PiAgentError}.
 *
 * @internal
 */
export interface PiAgentErrorDetails {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Construction options for {@link DeepSeekHarnessAgent}.
 */
export interface DeepSeekHarnessAgentConfig {
  /**
   * DeepSeek Harness executable name or absolute path. Defaults to `dsh`.
   */
  command?: string;

  /**
   * Arguments inserted between the executable and `--profile headless`.
   * Launcher-level options such as `--patch` belong here.
   */
  commandArgs?: string[];

  /** Default working directory for Agent runs. */
  cwd?: string;

  /**
   * Default DeepSeek Harness permission policy. Applied through the
   * `DSH_PERMISSION_MODE` environment variable.
   */
  sandbox?: AgentSandbox;

  /**
   * Additional raw arguments inserted after `--profile headless` and before
   * the task.
   */
  extraArgs?: string[];

  /** Environment variables applied to every DeepSeek Harness process. */
  env?: Record<string, string | undefined>;
}

/**
 * Fully normalized DeepSeek Harness Agent configuration.
 *
 * @internal
 */
export interface ResolvedDeepSeekHarnessAgentConfig {
  command: string;
  commandArgs: string[];
  cwd?: string;
  sandbox?: AgentSandbox;
  extraArgs: string[];
  env?: Record<string, string | undefined>;
}

/**
 * Captured process details used to construct a
 * {@link DeepSeekHarnessAgentError}.
 *
 * @internal
 */
export interface DeepSeekHarnessAgentErrorDetails {
  exitCode: number;
  stdout: string;
  stderr: string;
}

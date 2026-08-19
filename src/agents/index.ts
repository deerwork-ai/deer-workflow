import { bindAgent } from "./agent";
import { CodexAgent } from "./codex-agent";

export type {
  Agent,
  AgentFunction,
  AgentOptions,
  AgentSandbox,
  ClaudeAgentConfig,
  CodexAgentConfig,
  DeepSeekHarnessAgentConfig,
  JsonPrimitive,
  JsonSchema,
  JsonValue,
  PiAgentConfig,
} from "./types";
export {
  ClaudeAgent,
  ClaudeAgentError,
  ClaudeCliNotFoundError,
} from "./claude-agent";
export {
  CodexAgent,
  CodexAgentError,
  CodexCliNotFoundError,
} from "./codex-agent";
export {
  DeepSeekHarnessAgent,
  DeepSeekHarnessAgentError,
  DeepSeekHarnessCliNotFoundError,
} from "./deepseek-harness-agent";
export { PiAgent, PiAgentError, PiCliNotFoundError } from "./pi-agent";

/**
 * Shared default Agent runtime backed by Codex CLI.
 */
export const defaultAgent = new CodexAgent();

/**
 * Runs a task through the default {@link CodexAgent}.
 *
 * @example
 * ```ts
 * const result = await agent<{ ok: boolean }>("Run the checks.", {
 *   schema: {
 *     type: "object",
 *     properties: { ok: { type: "boolean" } },
 *     required: ["ok"],
 *   },
 * });
 * ```
 */
export const agent = bindAgent(defaultAgent);

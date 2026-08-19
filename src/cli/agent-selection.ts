import { CliUsageError } from "./errors";

export type CliAgentName = "claude" | "codex" | "dsh" | "pi";

interface ParsedAgentSelection {
  readonly agentName: CliAgentName;
  readonly values: string[];
}

/**
 * Extracts the CLI Agent runtime selector from command arguments.
 *
 * @param values - Arguments supplied after an Agent-backed command.
 * @returns The selected Agent name and remaining command arguments.
 * @internal
 */
export function parseAgentSelection(
  values: readonly string[],
): ParsedAgentSelection {
  let agentName: CliAgentName = "codex";
  const remainingValues: string[] = [];
  let hasAgentOption = false;

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === undefined) {
      break;
    }
    if (value !== "--agent" && !value.startsWith("--agent=")) {
      remainingValues.push(value);
      continue;
    }

    if (hasAgentOption) {
      throw new CliUsageError("The --agent option may only be specified once.");
    }
    hasAgentOption = true;

    const selected =
      value === "--agent" ? values[index + 1] : value.slice("--agent=".length);
    if (value === "--agent") {
      index += 1;
    }

    if (
      selected !== "codex" &&
      selected !== "claude" &&
      selected !== "dsh" &&
      selected !== "pi"
    ) {
      throw new CliUsageError(
        `Invalid --agent value: ${selected || "(missing)"}. Expected codex, claude, dsh, or pi.`,
      );
    }
    agentName = selected;
  }

  return { agentName, values: remainingValues };
}

/**
 * Returns the display name for a CLI Agent runtime.
 *
 * @param agentName - Canonical CLI Agent name.
 * @returns Human-readable runtime name.
 * @internal
 */
export function formatAgentName(agentName: CliAgentName): string {
  if (agentName === "claude") {
    return "Claude";
  }
  if (agentName === "dsh") {
    return "DeepSeek Harness";
  }
  return agentName === "pi" ? "Pi" : "Codex";
}

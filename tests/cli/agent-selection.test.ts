import { describe, expect, test } from "bun:test";

import { parseAgentSelection } from "../../src/cli/agent-selection";
import { CliUsageError } from "../../src/cli/errors";

describe("parseAgentSelection", () => {
  test("selects Codex by default", () => {
    expect(parseAgentSelection(["Create", "a", "Workflow"])).toEqual({
      agentName: "codex",
      values: ["Create", "a", "Workflow"],
    });
  });

  test("selects Claude from a separate option value", () => {
    expect(parseAgentSelection(["--agent", "claude", "Create it"])).toEqual({
      agentName: "claude",
      values: ["Create it"],
    });
  });

  test("selects Pi from an inline option value", () => {
    expect(parseAgentSelection(["--agent=pi", "Create it"])).toEqual({
      agentName: "pi",
      values: ["Create it"],
    });
  });

  test("rejects a missing option value", () => {
    expect(() => parseAgentSelection(["--agent"])).toThrow(
      new CliUsageError(
        "Invalid --agent value: (missing). Expected codex, claude, or pi.",
      ),
    );
  });

  test("rejects an unknown Agent", () => {
    expect(() => parseAgentSelection(["--agent", "unknown"])).toThrow(
      new CliUsageError(
        "Invalid --agent value: unknown. Expected codex, claude, or pi.",
      ),
    );
  });

  test("rejects duplicate Agent options", () => {
    expect(() =>
      parseAgentSelection(["--agent=pi", "--agent", "claude"]),
    ).toThrow(
      new CliUsageError("The --agent option may only be specified once."),
    );
  });

  test("preserves the order of remaining values", () => {
    expect(
      parseAgentSelection(["first", "--agent", "claude", "second", "third"]),
    ).toEqual({
      agentName: "claude",
      values: ["first", "second", "third"],
    });
  });
});

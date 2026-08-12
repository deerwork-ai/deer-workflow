import { describe, expect, test } from "bun:test";

import { resolveExecutable } from "../../src/agents/resolve-executable";

describe("resolveExecutable", () => {
  test("on non-Windows platforms, resolves the bare command as-is", () => {
    const which = (command: string): string | null =>
      command === "claude" ? "/usr/local/bin/claude" : null;

    expect(resolveExecutable("claude", "darwin", which)).toBe(
      "/usr/local/bin/claude",
    );
  });

  test("on non-Windows platforms, does not probe Windows extensions", () => {
    const seen: string[] = [];
    const which = (command: string): string | null => {
      seen.push(command);
      return null;
    };

    resolveExecutable("claude", "linux", which);

    expect(seen).toEqual(["claude"]);
  });

  test("on Windows, prefers a resolved .exe over the bare npm shim name", () => {
    const which = (command: string): string | null => {
      if (command === "claude.exe") return "C:\\bin\\claude.exe";
      if (command === "claude") return "C:\\bin\\claude";
      return null;
    };

    expect(resolveExecutable("claude", "win32", which)).toBe(
      "C:\\bin\\claude.exe",
    );
  });

  test("on Windows, falls back to .cmd when no .exe is present", () => {
    const which = (command: string): string | null => {
      if (command === "claude.cmd") return "C:\\bin\\claude.cmd";
      if (command === "claude") return "C:\\bin\\claude";
      return null;
    };

    expect(resolveExecutable("claude", "win32", which)).toBe(
      "C:\\bin\\claude.cmd",
    );
  });

  test("on Windows, falls back to the bare name when no Windows-executable extension resolves", () => {
    const which = (command: string): string | null =>
      command === "claude" ? "C:\\bin\\claude" : null;

    expect(resolveExecutable("claude", "win32", which)).toBe("C:\\bin\\claude");
  });

  test("on Windows, returns null when nothing resolves at all", () => {
    const which = (): string | null => null;

    expect(resolveExecutable("claude", "win32", which)).toBeNull();
  });

  test("on Windows, an absolute Windows path bypasses extension probing", () => {
    const seen: string[] = [];
    const which = (command: string): string | null => {
      seen.push(command);
      return command;
    };

    const result = resolveExecutable("C:\\tools\\claude", "win32", which);

    expect(result).toBe("C:\\tools\\claude");
    expect(seen).toEqual(["C:\\tools\\claude"]);
  });

  test("on Windows, an absolute POSIX-style path bypasses extension probing", () => {
    const seen: string[] = [];
    const which = (command: string): string | null => {
      seen.push(command);
      return command;
    };

    const result = resolveExecutable("/tools/claude", "win32", which);

    expect(result).toBe("/tools/claude");
    expect(seen).toEqual(["/tools/claude"]);
  });
});

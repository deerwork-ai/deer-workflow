import { posix, win32 } from "node:path";

/**
 * Extensions checked, in priority order, when resolving a bare command name
 * on Windows.
 *
 * @remarks
 * npm installs a cross-platform executable as a set of sibling files sharing
 * one base name: an extension-less POSIX shell script, a `.cmd` batch
 * wrapper, and (for some packages) a `.ps1` PowerShell wrapper. `Bun.spawn`
 * performs no PATHEXT-style resolution and executes the literal string it is
 * given, so handing it the bare, extension-less name on Windows raises
 * `ENOENT: no such file or directory, uv_spawn`. Resolving to the `.cmd`
 * sibling first lets the underlying process-creation call land on a file
 * Windows can execute directly.
 */
const WINDOWS_EXECUTABLE_EXTENSIONS = [".exe", ".cmd", ".bat"];

/**
 * `Bun.which`-compatible executable resolver.
 */
export type ExecutableResolver = (command: string) => string | null;

/**
 * Resolves the actual path to spawn for a configured command name, working
 * around `Bun.spawn`'s lack of Windows PATHEXT resolution.
 *
 * @param command - Configured executable name or path.
 * @param platform - Current `process.platform`. Injectable so behavior can be
 * exercised for `win32` from tests running on any host OS.
 * @param which - `Bun.which`-compatible resolver. Injectable for tests.
 * @returns The resolved path to spawn, or `null` when nothing resolves.
 */
export function resolveExecutable(
  command: string,
  platform: NodeJS.Platform = process.platform,
  which: ExecutableResolver = Bun.which,
): string | null {
  if (platform !== "win32") {
    return which(command);
  }

  if (win32.isAbsolute(command) || posix.isAbsolute(command)) {
    return which(command);
  }

  for (const extension of WINDOWS_EXECUTABLE_EXTENSIONS) {
    const resolved = which(`${command}${extension}`);
    if (resolved !== null) {
      return resolved;
    }
  }

  return which(command);
}

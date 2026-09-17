import { lstat, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

function inside(root: string, target: string): boolean {
  const path = relative(root, target);
  return path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

export async function checkWorkspacePath(cwd: string, path: string): Promise<void> {
  const root = await realpath(cwd);
  let current = resolve(root, path);
  if (!inside(root, current)) throw new Error("Evaluation file access must remain inside the task workspace.");
  while (true) {
    try { await lstat(current); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = dirname(current);
      if (parent === current) throw error;
      current = parent;
      continue;
    }
    if (!inside(root, await realpath(current))) throw new Error("Evaluation file access cannot follow an outside symlink.");
    return;
  }
}

export function shellEnvironment(cwd: string): NodeJS.ProcessEnv {
  return {
    PATH: [dirname(process.execPath), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"].join(delimiter),
    HOME: join(cwd, ".home"), TMPDIR: join(cwd, ".tmp"), LANG: "en_US.UTF-8",
  };
}

/** The live benchmark currently requires macOS Seatbelt. It never silently runs unsandboxed. */
export function sandboxProfile(cwd: string, protectedRoots: string[], options: { allowLoopback?: boolean } = {}): string {
  // Candidates and evaluator reference checkouts share the host temporary
  // roots. Protect their contents as well as the user's home. The explicit
  // workspace allowance below still permits this candidate's own dependencies
  // and TMPDIR. Include canonical and symlink spellings used on macOS.
  const privateRoots = new Set([...protectedRoots, "/tmp", "/private/tmp", "/var/folders", "/private/var/folders", tmpdir()]);
  const ancestors: string[] = [];
  for (let path = dirname(cwd); path !== dirname(path); path = dirname(path)) ancestors.push(path);
  return [
    "(version 1)", "(allow default)", "(deny network*)", "(deny file-write*)",
    ...(options.allowLoopback ? [
      '(allow network* (local ip "localhost:*") (remote ip "localhost:*"))',
      `(allow network* (local unix-socket (subpath ${JSON.stringify(cwd)})) (remote unix-socket (subpath ${JSON.stringify(cwd)})))`,
    ] : []),
    ...[...privateRoots].map((root) => `(deny file-read* (subpath ${JSON.stringify(root)}))`),
    // Node resolves absolute entrypoints by lstat-ing ancestor directories.
    // Metadata access does not permit their enumeration or sibling contents.
    ...(ancestors.length ? [`(allow file-read-metadata ${ancestors.map((path) => `(literal ${JSON.stringify(path)})`).join(" ")})`] : []),
    `(allow file-read* (subpath ${JSON.stringify(cwd)}))`,
    `(allow file-write* (subpath ${JSON.stringify(cwd)}) (literal \"/dev/null\"))`,
  ].join("\n");
}

export function shellQuote(value: string): string { return `'${value.replaceAll("'", `'\\''`)}'`; }

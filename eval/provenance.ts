import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, readFile, readlink, readdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const sourcePaths = ["src", "bin", "eval", "test", "package.json", "package-lock.json", "tsconfig.json", "tsconfig.build.json"];

async function digest(root: string, files: string[]): Promise<string> {
  const hash = createHash("sha256");
  for (const path of [...files].sort()) {
    const file = join(root, path);
    const info = await lstat(file).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return undefined; throw error; });
    const type = !info ? "missing" : info.isSymbolicLink() ? "symlink" : info.isFile() ? "file" : "other";
    const content = !info ? "" : info.isSymbolicLink() ? await readlink(file) : info.isFile() ? await readFile(file) : "";
    hash.update(JSON.stringify([path, type, info ? info.mode & 0o111 : 0, createHash("sha256").update(content).digest("hex")]));
    hash.update("\n");
  }
  return hash.digest("hex");
}

async function builtFiles(root: string, path = "dist"): Promise<string[]> {
  const entries = await readdir(join(root, path), { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return []; throw error; });
  const nested = await Promise.all(entries.map((entry) => entry.isDirectory() ? builtFiles(root, join(path, entry.name)) : [join(path, entry.name)]));
  return nested.flat();
}

/** Hash only code/build inputs and built artifacts; never discover .env or session contents. */
export async function captureSourceProvenance(project: string) {
  const git = async (args: string[]) => (await exec("git", args, { cwd: project, maxBuffer: 4 * 1024 * 1024 })).stdout;
  const [head, trackedText, untrackedText, status, built] = await Promise.all([
    git(["rev-parse", "HEAD"]),
    git(["ls-files", "-z", "--cached", "--", ...sourcePaths]),
    git(["ls-files", "-z", "--others", "--exclude-standard", "--", ...sourcePaths]),
    git(["status", "--porcelain=v1", "-z", "--", ...sourcePaths]),
    builtFiles(project),
  ]);
  const tracked = [...new Set(trackedText.split("\0").filter(Boolean))];
  const untracked = [...new Set(untrackedText.split("\0").filter(Boolean))];
  const [trackedSourceDigest, untrackedSourceDigest, sourceDigest, builtRuntimeDigest] = await Promise.all([
    digest(project, tracked), digest(project, untracked), digest(project, [...new Set([...tracked, ...untracked])]), digest(project, built),
  ]);
  return { head: head.trim(), dirty: status.length > 0, sourceDigest, trackedSourceDigest, untrackedSourceDigest, builtRuntimeDigest, trackedSourceFiles: tracked.length, untrackedSourceFiles: untracked.length, builtRuntimeFiles: built.length };
}

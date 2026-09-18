import { execFile } from "node:child_process";
import { cp, mkdir, readFile, realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { sandboxProfile, shellEnvironment } from "./sandbox.js";

export interface EvaluationResult {
  passed: boolean;
  checks: Record<string, boolean>;
  details?: string;
}

export interface EvaluationTask {
  id: string;
  prompt: string;
  setup(cwd: string): Promise<void>;
  verify(cwd: string): Promise<EvaluationResult>;
  reference(cwd: string): Promise<void>;
}

const exec = promisify(execFile);
const fixtureRoot = fileURLToPath(new URL("./fixtures/", import.meta.url));

async function task(id: string): Promise<EvaluationTask> {
  const root = join(fixtureRoot, id);
  return {
    id,
    prompt: await readFile(join(root, "prompt.md"), "utf8"),
    async setup(cwd) {
      await mkdir(cwd, { recursive: true });
      // No oracle, reference patches, hidden settings or credentials enter the workspace.
      await cp(join(root, "project"), cwd, { recursive: true });
    },
    async reference(cwd) {
      await cp(join(root, "reference"), cwd, { recursive: true });
    },
    async verify(cwd) {
      try {
        // Reload the trusted inventory at verification time, not at the start of a long agent run.
        const inventory: unknown = JSON.parse(await readFile(join(root, "checks.json"), "utf8"));
        if (!Array.isArray(inventory) || inventory.length === 0 || inventory.some((name) => typeof name !== "string" || !name) || new Set(inventory).size !== inventory.length) throw new Error("Invalid trusted acceptance inventory");
        const expectedChecks = inventory as string[];
        const workspace = await realpath(cwd);
        const holdout = await realpath(join(root, "holdout.mjs"));
        const helper = await realpath(join(fixtureRoot, "acceptance-helpers.mjs"));
        const args = [holdout, workspace];
        let command = process.execPath;
        if (process.platform === "darwin") {
          const protectedRoots = await Promise.all([
            realpath(homedir()),
            realpath(fileURLToPath(new URL("../", import.meta.url))),
          ]);
          const ancestors = new Set<string>();
          for (const allowedFile of [holdout, helper]) {
            let directory = dirname(allowedFile);
            while (directory !== dirname(directory)) {
              ancestors.add(directory);
              directory = dirname(directory);
            }
          }
          const profile = [
            sandboxProfile(workspace, [...new Set(protectedRoots)]),
            `(allow file-read-metadata ${[...ancestors].map((directory) => `(literal ${JSON.stringify(directory)})`).join(" ")})`,
            `(allow file-read* (literal ${JSON.stringify(holdout)}) (literal ${JSON.stringify(helper)}))`,
          ].join("\n");
          command = "/usr/bin/sandbox-exec";
          args.unshift("-p", profile, process.execPath);
        }
        // Linux fallback is for trusted fixture tests only; the live runner requires Seatbelt.
        const { stdout } = await exec(command, args, {
          cwd: workspace,
          env: { ...shellEnvironment(workspace), NODE_NO_WARNINGS: "1" },
          timeout: 4000,
          killSignal: "SIGKILL",
          maxBuffer: 128 * 1024,
        });
        const line = stdout.trim().split("\n").at(-1);
        const result: unknown = JSON.parse(line ?? "");
        if (!result || typeof result !== "object" || !("checks" in result) || !result.checks || typeof result.checks !== "object" || Array.isArray(result.checks)) throw new Error("Malformed acceptance output");
        const entries = Object.entries(result.checks);
        if (entries.length !== expectedChecks.length || entries.some(([name, value]) => !expectedChecks.includes(name) || typeof value !== "boolean")) throw new Error("Incomplete or unexpected acceptance checks");
        const checks = Object.fromEntries(entries) as Record<string, boolean>;
        return {
          passed: Object.values(checks).every(Boolean),
          checks,
          ...("details" in result && typeof result.details === "string" ? { details: result.details.slice(0, 12000) } : {}),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { passed: false, checks: { "acceptance-process": false }, details: message.slice(0, 2000) };
      }
    },
  };
}

export const TASKS: EvaluationTask[] = await Promise.all([
  task("document-request-lifecycle"),
  task("queue-cursor-pagination"),
]);

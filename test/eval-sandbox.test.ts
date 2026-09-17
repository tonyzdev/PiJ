import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import { checkWorkspacePath, sandboxProfile, shellEnvironment } from "../eval/sandbox.js";

test("evaluation tools reject paths and symlinks outside the workspace", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pij-sandbox-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cwd = join(root, "workspace");
  await mkdir(cwd);
  await writeFile(join(root, "outside.txt"), "private fixture");
  const { symlink } = await import("node:fs/promises");
  await symlink(root, join(cwd, "escape"));
  await assert.rejects(checkWorkspacePath(cwd, "../outside.txt"));
  await assert.rejects(checkWorkspacePath(cwd, "escape/outside.txt"));
  await assert.rejects(checkWorkspacePath(cwd, "escape/new/file.txt"));
  await checkWorkspacePath(cwd, "new/deep/file.txt");
});

test("evaluation shell inherits no provider secrets or user startup configuration", () => {
  const env = shellEnvironment("/synthetic/workspace");
  assert.equal(env.HOME, "/synthetic/workspace/.home");
  assert.equal(env.AI_GATEWAY_API_KEY, undefined);
  assert.equal(env.BASH_ENV, undefined);
  assert.deepEqual(Object.keys(env).sort(), ["HOME", "LANG", "PATH", "TMPDIR"]);
});

test("macOS benchmark sandbox allows workspace work and rejects protected reads/outside writes", { skip: process.platform !== "darwin" }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pij-sandbox-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cwd = join(root, "workspace");
  const protectedDir = join(root, "private");
  await mkdir(cwd);
  await mkdir(protectedDir);
  await writeFile(join(protectedDir, "secret.txt"), "synthetic private value");
  const { realpath } = await import("node:fs/promises");
  const profile = sandboxProfile(await realpath(cwd), [await realpath(protectedDir)]);
  const execute = (command: string) => promisify(execFile)("/usr/bin/sandbox-exec", ["-p", profile, "/bin/bash", "--noprofile", "--norc", "-c", command], { cwd, env: shellEnvironment(cwd) });
  await execute("echo permitted > proof.txt");
  assert.equal((await readFile(join(cwd, "proof.txt"), "utf8")).trim(), "permitted");
  await assert.rejects(execute("cat ../private/secret.txt"));
  await assert.rejects(execute("echo denied > ../outside.txt"));
});

test("real-repository sandbox can explicitly allow loopback fixture servers", { skip: process.platform !== "darwin" }, async (t) => {
  const { realpath } = await import("node:fs/promises");
  const cwd = await realpath(await mkdtemp(join(tmpdir(), "pij-loopback-test-")));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const program = `const http=require('node:http'); const server=http.createServer((req,res)=>res.end('fixture')); server.listen(0,'127.0.0.1',async()=>{console.log(await (await fetch('http://127.0.0.1:'+server.address().port)).text());server.closeAllConnections();server.close();});`;
  const run = (allowLoopback: boolean) => promisify(execFile)("/usr/bin/sandbox-exec", ["-p", sandboxProfile(cwd, [], { allowLoopback }), process.execPath, "-e", program], { cwd, env: shellEnvironment(cwd), timeout: 5000 });
  await assert.rejects(run(false));
  assert.equal((await run(true)).stdout.trim(), "fixture");
});

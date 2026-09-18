"""Screen candidate PRs into SWE-bench-style instances with a pytest oracle.

For each PR: checkout base, install, apply the test patch and run the PR's test files
(expect failures), then apply the code patch too (expect all of those tests to pass).
Keep the PR only if the oracle discriminates in this environment.
"""
import json, os, re, subprocess, sys, time, shutil
from concurrent.futures import ThreadPoolExecutor

OUT = "/private/tmp/claude-501/-Users-tonglin-Documents-PiJ/b9b0a3fa-096c-42ee-957d-c89d2ec7782c/scratchpad/unfamiliar"
PY = sys.argv[1] if len(sys.argv) > 1 else "3.12"
PRS = json.load(open(f"{OUT}/prs.json"))
os.makedirs(f"{OUT}/repos", exist_ok=True); os.makedirs(f"{OUT}/work", exist_ok=True)

def sh(cmd, cwd=None, timeout=300, env=None):
    try:
        r = subprocess.run(cmd, cwd=cwd, shell=isinstance(cmd, str), capture_output=True, text=True, timeout=timeout, env=env)
        return r.returncode, r.stdout + r.stderr
    except subprocess.TimeoutExpired as e:
        return 124, (e.stdout or "") + (e.stderr or "") + "\nTIMEOUT"

RESULT = re.compile(r"^(PASSED|FAILED|ERROR|XFAIL|XPASS|SKIPPED) (\S+)", re.M)
def run_tests(work, tests):
    env = {**os.environ, "HOME": work, "PYTHONDONTWRITEBYTECODE": "1", "PYTHONHASHSEED": "0"}
    code, out = sh([f"{work}/.venv/bin/python", "-m", "pytest", *tests, "-rA", "-q", "--no-header", "-p", "no:cacheprovider", "-o", "addopts=", "-x", "--maxfail=50"], cwd=work, timeout=420, env=env)
    status = {}
    for m in RESULT.finditer(out):
        status[m.group(2)] = m.group(1)
    return code, status, out[-3000:]

def screen(pr):
    tag = f"{pr['repo'].replace('/', '__')}-{pr['pr']}"
    repo_dir = f"{OUT}/repos/{pr['repo'].replace('/', '__')}"
    work = f"{OUT}/work/{tag}"
    t0 = time.time()
    rec = {"tag": tag, "repo": pr["repo"], "pr": pr["pr"], "title": pr["title"], "verdict": "UNUSABLE", "why": ""}
    try:
        if not os.path.exists(repo_dir):
            code, out = sh(["git", "clone", "-q", "--filter=blob:none", f"https://github.com/{pr['repo']}.git", repo_dir], timeout=300)
            if code: rec["why"] = "clone: " + out[-200:]; return rec
        shutil.rmtree(work, ignore_errors=True); os.makedirs(work)
        code, out = sh(f"git -C {repo_dir} archive {pr['base']} | tar -x -C {work}", timeout=300)
        if code: rec["why"] = "archive: " + out[-200:]; return rec
        sh(["git", "init", "-q"], cwd=work); sh(["git", "-c", "user.name=e", "-c", "user.email=e@e", "add", "-A"], cwd=work); sh(["git", "-c", "user.name=e", "-c", "user.email=e@e", "commit", "-qm", "base"], cwd=work)
        code, out = sh(["uv", "venv", "-q", "--python", PY, ".venv"], cwd=work, timeout=120)
        if code: rec["why"] = "venv: " + out[-200:]; return rec
        # Install the project plus whatever test extras exist; tolerate missing extras.
        installed = False; log = ""
        for spec in ['-e ".[test]"', '-e ".[tests]"', '-e ".[dev]"', '-e "."']:
            code, out = sh(f"uv pip install -q -p .venv {spec} pytest", cwd=work, timeout=240); log = out[-300:]
            if code == 0: installed = True; break
        if not installed:
            for req in ("requirements-dev.txt", "requirements-test.txt", "requirements.txt", "dev-requirements.txt"):
                if os.path.exists(f"{work}/{req}"):
                    code, out = sh(f"uv pip install -q -p .venv -r {req} pytest", cwd=work, timeout=240); log = out[-300:]
                    if code == 0: installed = True; break
        if not installed: rec["why"] = "install: " + log; return rec
        rec["installSec"] = round(time.time() - t0)
        open(f"{work}.test.patch", "w").write(pr["test_patch"]); open(f"{work}.gold.patch", "w").write(pr["patch"])
        code, out = sh(["git", "apply", f"{work}.test.patch"], cwd=work)
        if code: rec["why"] = "test patch: " + out[-200:]; return rec
        tests = [t for t in pr["tests"] if t.endswith(".py") and os.path.exists(f"{work}/{t}")]
        if not tests: rec["why"] = "no test files after patch"; return rec
        t1 = time.time()
        _, neg, negtail = run_tests(work, tests)
        sh(["git", "checkout", "-q", "--", "."], cwd=work); sh(["git", "clean", "-qfd", "-e", ".venv"], cwd=work)
        code, out = sh(["git", "apply", f"{work}.gold.patch", f"{work}.test.patch"], cwd=work)
        if code: rec["why"] = "gold patch: " + out[-200:]; return rec
        _, pos, postail = run_tests(work, tests)
        rec["testSec"] = round(time.time() - t1)
        f2p = sorted(t for t, s in pos.items() if s == "PASSED" and neg.get(t) in ("FAILED", "ERROR", None))
        p2p = sorted(t for t, s in pos.items() if s == "PASSED" and neg.get(t) == "PASSED")
        broken = [t for t, s in pos.items() if s in ("FAILED", "ERROR")]
        rec.update(f2p=f2p, p2p=p2p, negCounts={k: sum(1 for v in neg.values() if v == k) for k in set(neg.values())}, posCounts={k: sum(1 for v in pos.values() if v == k) for k in set(pos.values())}, tests=tests)
        if not neg and not pos: rec["why"] = "no tests collected: " + negtail[-300:]; return rec
        if f2p and not broken: rec["verdict"] = "DISCRIMINATES"
        elif not f2p: rec["why"] = "no test flips fail->pass"
        else: rec["why"] = f"{len(broken)} tests still failing with gold patch"
        return rec
    except Exception as e:
        rec["why"] = f"exception: {e}"; return rec
    finally:
        if os.path.isdir(f"{work}/.git"):
            sh(["git", "checkout", "-q", "--", "."], cwd=work); sh(["git", "clean", "-qfd", "-e", ".venv"], cwd=work)

results = []
with ThreadPoolExecutor(max_workers=3) as ex:
    for rec in ex.map(screen, PRS):
        results.append(rec)
        print(f"{rec['verdict']:<14} {rec['repo']} #{rec['pr']}  install {rec.get('installSec','-')}s tests {rec.get('testSec','-')}s  f2p={len(rec.get('f2p',[]))} p2p={len(rec.get('p2p',[]))}  {rec['why'][:90]}", flush=True)
        json.dump(results, open(f"{OUT}/screened.json", "w"), indent=1)
ok = [r for r in results if r["verdict"] == "DISCRIMINATES"]
print(f"\n{len(ok)}/{len(results)} discriminate:"); [print(f"  {r['repo']} #{r['pr']}  f2p={len(r['f2p'])}  {r['title'][:70]}") for r in ok]

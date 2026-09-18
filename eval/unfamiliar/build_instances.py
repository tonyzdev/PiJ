"""Turn screened PRs into instances the agent harness can run.

problem_statement: the linked issue when there is one (what SWE-bench uses); otherwise the
PR title and body with code blocks removed, so the fix is not leaked verbatim.
"""
import json, re, os
OUT = "/private/tmp/claude-501/-Users-tonglin-Documents-PiJ/b9b0a3fa-096c-42ee-957d-c89d2ec7782c/scratchpad/unfamiliar"
prs = {(p["repo"], p["pr"]): p for p in json.load(open(f"{OUT}/prs.json"))}
screened = [r for r in json.load(open(f"{OUT}/screened.json")) if r["verdict"] == "DISCRIMINATES"]
INSTALL = 'for s in \'-e ".[test]"\' \'-e ".[tests]"\' \'-e ".[dev]"\' \'-e "."\'; do eval uv pip install -q -p .venv $s pytest && exit 0; done; for r in requirements-dev.txt requirements-test.txt requirements.txt dev-requirements.txt; do [ -f $r ] && uv pip install -q -p .venv -r $r pytest && exit 0; done; exit 1'

def strip_code(text):
    text = re.sub(r"```.*?```", "[code omitted]", text or "", flags=re.S)
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    return text.strip()

instances = []
for r in screened:
    p = prs[(r["repo"], r["pr"])]
    if p["issues"]:
        i = p["issues"][0]; statement = f"{i['title']}\n\n{strip_code(i['body'])}"; source = f"issue #{i['number']}"
    else:
        statement = f"{p['title']}\n\n{strip_code(p['body'])}"; source = "pr body"
    if len(statement) < 60: continue  # too thin to be a task
    owner, name = r["repo"].split("/")
    instances.append({
        "repo": r["repo"], "instance_id": f"{owner}__{name}-{r['pr']}", "base_commit": p["base"], "problem_statement": statement, "statement_source": source,
        "patch": p["patch"], "test_patch": p["test_patch"], "FAIL_TO_PASS": json.dumps(r["f2p"]), "PASS_TO_PASS": json.dumps(r["p2p"]), "difficulty": "unscreened",
        "runner": "pytest", "repo_dir": f"{owner}__{name}", "install": INSTALL, "test_files": r["tests"], "gold_files": sorted({m.group(1) for m in re.finditer(r"^diff --git a/(\S+) b/", p["patch"], re.M)}),
        "stars": p["stars"], "created": p["created"], "merged": p["merged"], "title": p["title"],
    })
json.dump(instances, open(f"{OUT}/instances.json", "w"), indent=1)
print(f"{len(instances)} instances → {OUT}/instances.json")
for i in instances: print(f"  {i['instance_id']:<48} ★{i['stars']:<4} {i['statement_source']:<9} f2p={len(json.loads(i['FAIL_TO_PASS']))} gold={i['gold_files']}")

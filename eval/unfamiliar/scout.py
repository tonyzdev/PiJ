"""Find repositories a 2026 model is unlikely to have memorised (created mid-2025 or later,
modest stars) that have merged bug-fix PRs touching both library code and tests."""
import json, re, subprocess, sys, time
OUT="/private/tmp/claude-501/-Users-tonglin-Documents-PiJ/b9b0a3fa-096c-42ee-957d-c89d2ec7782c/scratchpad/unfamiliar"
def gh(*args, timeout=60):
    r=subprocess.run(["gh",*args],capture_output=True,text=True,timeout=timeout)
    return r.stdout if r.returncode==0 else ""
BAD=re.compile(r"awesome|curated|list of|proxy|collection|tutorial|course|cheat ?sheet|wallpaper|dataset|leetcode|interview|notes|roadmap|bot for|scraper|crawler",re.I)
repos={}
for q in ["library","sdk","parser","client","framework","toolkit","cli","validation","async","orm","http","cache","serializer","plugin","engine"]:
    out=gh("search","repos",q,"--language=python","--created=>2025-06-01","--stars=60..1500","--sort=stars","--limit=40","--json","fullName,stargazersCount,createdAt,pushedAt,description,isArchived")
    for r in (json.loads(out) if out else []):
        if r["isArchived"] or BAD.search(r.get("description") or ""): continue
        repos[r["fullName"]]=r
print(f"{len(repos)} candidate repos", flush=True)
found=[]; checked=0
for name,r in sorted(repos.items(), key=lambda kv:-kv[1]["stargazersCount"]):
    if len(found)>=60 or checked>=90: break
    checked+=1
    prs=gh("pr","list","-R",name,"--state","merged","--limit","80","--json","number,title,mergedAt,baseRefOid,mergeCommit,additions,deletions,changedFiles")
    hits=0
    for pr in (json.loads(prs) if prs else []):
        t=pr["title"]
        if not re.search(r"\bfix|bug|incorrect|wrong|crash|regress|broken|handle|error",t,re.I) or re.search(r"\b(typo|docs?|readme|ci|lint|format|bump|version|release|changelog|deps?|dependenc)",t,re.I): continue
        if pr["changedFiles"]>6 or pr["additions"]+pr["deletions"]>400 or not pr.get("mergeCommit"): continue
        files=gh("pr","view",str(pr["number"]),"-R",name,"--json","files")
        paths=[f["path"] for f in (json.loads(files)["files"] if files else [])]
        tests=[p for p in paths if re.search(r"(^|/)tests?(/|_)|_test\.py$|test_.*\.py$|conftest",p)]
        src=[p for p in paths if p.endswith(".py") and p not in tests]
        if tests and src:
            found.append(dict(repo=name,stars=r["stargazersCount"],created=r["createdAt"][:10],pr=pr["number"],title=t,base=pr["baseRefOid"],merge=pr["mergeCommit"]["oid"],src=src,tests=tests,add=pr["additions"],del_=pr["deletions"]))
            hits+=1
            print(f"  ✓ {name} #{pr['number']} {t[:70]} | src {src[:2]} | tests {tests[:1]}", flush=True)
        if hits>=4: break
    time.sleep(0.3)
json.dump(found, open(f"{OUT}/candidates.json","w"), indent=1)
from collections import Counter
print(f"\n{len(found)} candidate PRs across {len(Counter(f['repo'] for f in found))} repos → {OUT}/candidates.json")
for repo,n in Counter(f['repo'] for f in found).most_common(): print(f"  {n}  {repo}")

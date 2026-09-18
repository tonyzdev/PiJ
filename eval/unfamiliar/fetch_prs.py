import json, re, subprocess
OUT="/private/tmp/claude-501/-Users-tonglin-Documents-PiJ/b9b0a3fa-096c-42ee-957d-c89d2ec7782c/scratchpad/unfamiliar"
C=json.load(open(f"{OUT}/candidates.json"))
def gh(*a):
    r=subprocess.run(["gh",*a],capture_output=True,text=True,timeout=120); return r.stdout if r.returncode==0 else ""
TEST=re.compile(r"(^|/)tests?(/|_)|_test\.py$|test_.*\.py$|conftest")
def split_diff(diff):
    parts=re.split(r'(?m)^(?=diff --git )', diff); src=[]; tst=[]
    for p in parts:
        if not p.strip(): continue
        m=re.match(r'diff --git a/(\S+) b/', p); path=m.group(1) if m else ""
        (tst if TEST.search(path) else src).append(p)
    return "".join(src), "".join(tst)
out=[]
for c in C:
    v=gh("pr","view",str(c["pr"]),"-R",c["repo"],"--json","body,closingIssuesReferences,baseRefOid,mergeCommit,title,mergedAt")
    if not v: continue
    v=json.loads(v); diff=gh("pr","diff",str(c["pr"]),"-R",c["repo"])
    if not diff: continue
    patch,test_patch=split_diff(diff)
    issues=[]
    for ref in v.get("closingIssuesReferences") or []:
        iv=gh("issue","view",str(ref["number"]),"-R",c["repo"],"--json","title,body")
        if iv: iv=json.loads(iv); issues.append({"number":ref["number"],"title":iv["title"],"body":iv["body"]})
    out.append({**c,"title":v["title"],"body":v["body"] or "","issues":issues,"patch":patch,"test_patch":test_patch,"merged":v["mergedAt"][:10]})
    print(f"  {c['repo']} #{c['pr']}: issue={'yes' if issues else 'no '} patch={len(patch)}B test_patch={len(test_patch)}B", flush=True)
json.dump(out, open(f"{OUT}/prs.json","w"), indent=1)
n_issue=sum(1 for o in out if o["issues"]); print(f"\n{len(out)} PRs fetched, {n_issue} with a linked issue → {OUT}/prs.json")

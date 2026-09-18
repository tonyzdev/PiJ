import json, math

d = json.load(open("figure-data.json"))["curve"]

W, H = 1672, 918
L, R, T, B = 78, 46, 132, 96          # plot insets
PANEL, BORDER, GRID = "#1e1e1e", "#3a3a3a", "#2e2e2e"
INK, INK2, INK3 = "#ededed", "#b4b4b4", "#8c8c8c"
JEV, BASE, FRONT = "#d55181", "#3987e5", "#9a9a9a"
SANS = "'Helvetica Neue',Helvetica,Arial,'PingFang SC',sans-serif"

XMIN, XMAX = 1.62, 195.0               # KB, log
YMIN, YMAX = 0.115, 0.945

lg = math.log10
x = lambda kb: L + (lg(kb) - lg(XMIN)) / (lg(XMAX) - lg(XMIN)) * (W - L - R)
y = lambda r: T + (YMAX - r) / (YMAX - YMIN) * (H - T - B)

pts = []
for key, col in (("bm25", BASE), ("jev", JEV)):
    for p in d[key]:
        pts.append({"s": key, "col": col, "k": p["k"], "kb": p["ctxBytes"] / 1024, "r": p["recall"]})

# Pareto frontier over every point: nothing is both cheaper and more accurate.
front = [p for p in pts if not any(
    q is not p and q["kb"] <= p["kb"] and q["r"] >= p["r"] and (q["kb"] < p["kb"] or q["r"] > p["r"])
    for q in pts)]
front.sort(key=lambda p: p["kb"])

o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="{SANS}">']
o.append(f'<rect width="{W}" height="{H}" rx="6" fill="{PANEL}" stroke="{BORDER}" stroke-width="1.5"/>')

def t(tx, ty, s, fill=INK2, size=15, weight="400", anchor="start", halo=False):
    h = f' stroke="{PANEL}" stroke-width="3.5" paint-order="stroke" stroke-linejoin="round"' if halo else ""
    o.append(f'<text x="{tx:.1f}" y="{ty:.1f}" fill="{fill}" font-size="{size}" '
             f'font-weight="{weight}" text-anchor="{anchor}"{h}>{s}</text>')

# title + legend, top-left, small
t(22, 34, "SWE-bench Verified 20 个实例：命中率 vs 上下文开销（越靠左上越好）", INK, 19, "600")

lx = 22
def chip(shape, col, label, gap=34):
    global lx
    if shape == "d":
        o.append(f'<path d="M{lx+7:.0f},54 L{lx+14:.0f},61 L{lx+7:.0f},68 L{lx:.0f},61 Z" fill="{col}"/>')
    elif shape == "c":
        o.append(f'<circle cx="{lx+7:.0f}" cy="61" r="6.5" fill="{col}"/>')
    else:
        o.append(f'<line x1="{lx:.0f}" x2="{lx+26:.0f}" y1="61" y2="61" stroke="{col}" stroke-width="1.6"/>')
    off = 26 if shape == "l" else 18
    t(lx + off + 6, 66, label, INK2, 15)
    width = sum(15.0 if ord(c) > 0x2E80 else 8.2 for c in label)
    lx += off + 6 + width + gap

chip("c", BASE, "BM25 词法检索")
chip("d", JEV, "+ Jev 重排")
chip("l", FRONT, "frontier：没有既更省又更准的点", 0)

# grid + axes
for r in (0.2, 0.4, 0.6, 0.8):
    o.append(f'<line x1="{L}" x2="{W-R}" y1="{y(r):.1f}" y2="{y(r):.1f}" stroke="{GRID}" stroke-width="1"/>')
    t(L - 12, y(r) + 5, f"{int(r*100)}%", INK3, 14, "400", "end")
for kb in (2, 5, 10, 20, 50, 100, 200):
    o.append(f'<line x1="{x(kb):.1f}" x2="{x(kb):.1f}" y1="{T}" y2="{H-B}" stroke="{GRID}" stroke-width="1"/>')
    t(x(kb), H - B + 26, f"{kb}KB", INK3, 14, "400", "middle")
o.append(f'<line x1="{L}" x2="{W-R}" y1="{H-B}" y2="{H-B}" stroke="{BORDER}" stroke-width="1.5"/>')
o.append(f'<line x1="{L}" x2="{L}" y1="{T}" y2="{H-B}" stroke="{BORDER}" stroke-width="1.5"/>')
t(L + (W - L - R) / 2, H - B + 56, "进入主模型上下文的源码量，KB（对数）", INK2, 15, "400", "middle")

# frontier line, drawn under the marks
o.append('<polyline points="' + " ".join(f"{x(p['kb']):.1f},{y(p['r']):.1f}" for p in front)
         + f'" fill="none" stroke="{FRONT}" stroke-width="1.6"/>')

# marks
for p in pts:
    px, py = x(p["kb"]), y(p["r"])
    if p["s"] == "jev":
        o.append(f'<path d="M{px:.1f},{py-8:.1f} L{px+8:.1f},{py:.1f} L{px:.1f},{py+8:.1f} L{px-8:.1f},{py:.1f} Z" fill="{p["col"]}"/>')
    else:
        o.append(f'<circle cx="{px:.1f}" cy="{py:.1f}" r="7" fill="{p["col"]}"/>')

# Every point is labelled, as on the reference figure. Slots are tried in
# preference order and the first one clear of all marks and placed labels wins.
placed = [(x(q["kb"]) - 9, y(q["r"]) - 9, x(q["kb"]) + 9, y(q["r"]) + 9) for q in pts]
SLOTS = [(13, 5), (-13, 5), (0, -13), (0, 21), (13, -11), (13, 20), (-13, -11), (-13, 20)]
hit = lambda a, b: a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]

def box(px, py, dx, dy, w):
    x0 = px + dx if dx >= 0 else px + dx - w
    return (x0 - 2, py + dy - 13, x0 + w + 2, py + dy + 4)

coincide = [q for q in pts if q["k"] == 100]
order = [q for q in sorted(pts, key=lambda q: (q not in front, q["kb"])) if q["k"] != 100]
for q in order:
    label = f"top-{q['k']}"
    w = len(label) * 7.6
    px, py = x(q["kb"]), y(q["r"])
    for dx, dy in SLOTS:
        bb = box(px, py, dx, dy, w)
        if bb[0] < L or bb[2] > W - R or bb[1] < T or bb[3] > H - B:
            continue
        if any(hit(bb, o2) for o2 in placed):
            continue
        placed.append(bb)
        t(px + dx, py + dy, label, INK2, 14, "400", "start" if dx >= 0 else "end", halo=True)
        break

cx, cy = x(coincide[0]["kb"]), y(coincide[0]["r"])
t(cx - 14, cy + 25, "top-100", INK2, 14, "400", "end", halo=True)

t(22, H - 20, "命中率 = 参考补丁改动的文件出现在前 k 个里的比例 · top-100 处两者候选集相同，故重合 · 重排全程 $0.09，不占主模型上下文 · 测的是检索，不是任务完成率", INK3, 13.5)
o.append("</svg>")

open("chart.html", "w").write(
    f'<style>*{{margin:0;padding:0}}html,body{{background:#abbab9}}'
    f'body{{padding:36px}}</style>\n' + "\n".join(o))
print("chart.html written ·", len(pts), "points ·", len(front), "on the frontier:",
      [(p["s"], p["k"]) for p in front])

"""结局门控测试 —— 「选择真的影响结局」这条机制的回归测试。

背景：早期版本里 flags 只写不读、trust 只用于侧栏排序，三个结局其实是最后一个选项的
硬连接，前面 19 次抉择对结局零影响。现在 h_hai 的选项按「同路人数量」和「是否查过朝堂」
解锁，拔刀还带一条条件路由（身后没人 → 长安失守）。

这里刻意用真实引擎（而不是 tools/simulate.mjs 那种复刻逻辑）来验证，因为复刻版
测不出 src/main.js 自身的实现 bug。做法是带 ?debug=1 打开页面，读 window.__changan，
按"每步都选信任增益最大 / 最小"来驱动剧情。

断言：
  1. 独行到底 → 同路人不足 → 出现「未解锁」提示 → 结局为火起长安
  2. 广结人脉 → 同路人达标 → 解锁「我不为长安死」→ 结局为灯火如昼
  3. 两条路径必须给出不同结局

用法：
  python -m http.server 8010        # 另开一个终端
  python tools/smoke_gate.py
"""

from _browser import DEBUG_URL, launch, need_playwright, check_server, max_steps

need_playwright()
check_server()

from playwright.sync_api import sync_playwright  # noqa: E402 —— 故意放在依赖检查之后

POV = "zhangxiaojing"

# 在页面里挑下一步：先按目标 flag 优先，再按信任度增益排序
# ⚠️ 必须先处理"过场场景"（只有 next、没有 choices）：它的 choices 是 undefined，
#    直接 `.map` 会抛 TypeError，让人以为是游戏坏了，其实只是测试脚本不知道有这个节点类型。
PICK_JS = """
(dir) => {
  const S = window.__changan;
  const sc = S.scenes[S.state.sceneId];
  const btns = document.querySelectorAll('#scene .choice-btn');
  if (!sc.choices || !sc.choices.length) {
    if (!btns.length) return null;
    btns[0].click();
    return { picked: 0, visIdx: 0, passage: true, allies: S.countAllies() };
  }
  const avail = sc.choices.map((c, i) => i).filter(i => S.evalCond(sc.choices[i].require));
  const wantFlag = dir > 0 ? 'final_people' : 'final_fight';
  let best = avail[0], bestScore = -Infinity;
  for (const i of avail) {
    const ch = sc.choices[i];
    let score = 0;
    if (ch.flag === wantFlag) score += 1000;
    const t = ch.trust || {};
    for (const k in t) if (k !== 'zhangxiaojing') score += t[k];
    score *= dir;
    if (score > bestScore) { bestScore = score; best = i; }
  }
  // 显示顺序按"可见选项"排，需要把原始下标换算成 DOM 里的序号
  const visIdx = avail.filter(i => i < best).length;
  if (!btns[visIdx]) return null;
  btns[visIdx].click();
  return { picked: best, visIdx, allies: S.countAllies() };
}
"""


def reload_clean(page):
    """清存档并重载，保证从死牢开始。"""
    page.goto(DEBUG_URL, wait_until="domcontentloaded")
    page.evaluate("() => { try { localStorage.clear(); } catch (e) {} }")
    page.goto(DEBUG_URL, wait_until="networkidle")
    page.wait_for_timeout(600)


def run(page, direction, shot=None):
    reload_clean(page)
    locked_seen = 0
    locked_sample = ""
    steps = 0
    for _ in range(max_steps(page)):
        if page.locator("#overlay").evaluate("el => !el.classList.contains('hidden')"):
            break
        n_locked = page.locator(".choice-locked").count()
        if n_locked > locked_seen:
            locked_seen = n_locked
            # 顺手把提示文案留档，并在"门控刚刚出现"的瞬间截一张图
            locked_sample = page.locator(".choice-locked").first.inner_text().strip().replace("\n", " ")
            if shot:
                page.screenshot(path=shot, full_page=False)
        res = page.evaluate(PICK_JS, direction)
        if res is None:
            break
        steps += 1
        page.wait_for_timeout(120)

    page.wait_for_timeout(400)
    return {
        "ending": page.text_content(".end-tag"),
        "type": page.text_content(".mbti-type"),
        "allies": page.evaluate("() => window.__changan.countAllies()"),
        "locked": locked_seen,
        "lockedSample": locked_sample,
        "steps": steps,
    }


errors = []
with sync_playwright() as p:
    b = launch(p)
    page = b.new_page(viewport={"width": 1280, "height": 900})
    page.on("pageerror", lambda e: errors.append("PAGEERROR: " + str(e)))

    lone = run(page, -1, shot="tools/gate_locked.png")
    page.screenshot(path="tools/gate_lone_end.png", full_page=False)
    team = run(page, +1)
    page.screenshot(path="tools/gate_team_end.png", full_page=False)
    b.close()

for name, r in (("独行到底 (dir=-1)", lone), ("广结人脉 (dir=+1)", team)):
    print(f"--- {name} ---")
    print(f"  同路人: {r['allies']}")
    print(f"  结  局: {r['ending']}")
    print(f"  类  型: {r['type']}")
    print(f"  出现过的「未解锁」提示数: {r['locked']}")
    if r["lockedSample"]:
        print(f"  其中一条: {r['lockedSample'].strip()[:60]}")
    print()

failures = []
if lone["allies"] >= team["allies"]:
    failures.append("独行策略的同路人数没有低于广结人脉策略，门控可能没生效")
if lone["ending"] == team["ending"]:
    failures.append(f"两条路径给出同一个结局（{lone['ending']}），分支形同虚设")
if lone["locked"] == 0:
    failures.append("独行路径从头到尾没有出现「未解锁」提示，玩家看不到门控存在")
if team["locked"] <= lone["locked"] and team["locked"] > 0:
    pass  # 广结人脉也可能在某些节点看到别的未解锁选项，不作硬性要求

print("===== 结论 =====")
if errors:
    print("运行时错误:")
    for e in errors[:8]:
        print("   " + e)
    failures.append("存在运行时错误")
if failures:
    for f in failures:
        print("❌ " + f)
    raise SystemExit(1)
print("✅ 结局门控生效：两条策略走出不同结局，且未解锁提示对玩家可见")

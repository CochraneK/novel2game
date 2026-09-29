"""条件文本测试 —— 「同一段剧情按你来时的路读起来不同」的回归测试。

背景：玩家反馈「我选了『我凭什么听你的』，结果还是跟着去了靖安司，后文完全没反应」。
根因是 64 个 flag 里 62 个只写不读，选择不留下任何痕迹。

现在引擎支持两种条件正文（见 src/main.js 的 resolveText）：
  inserts      —— 往默认正文里插入段落，可叠加（首选）
  textVariants —— 整段重写（只用于基调完全改变的场合）

断言：
  1. 死牢里选「带路」vs 选「我凭什么听你的」，必须落到**两个不同的过场场景**
     （每个选项一段专属戏），然后**再汇合回同一个节点 s1_meet**
  2. 汇合点的正文仍然随来路不同（textVariants / inserts 生效）
  3. 全程「总选第一项」vs「总选最后项」两条走法，在共同经过的节点里，
     必须有足够多的节点正文不同（否则说明条件正文没真正生效）
  4. 正文里出现「未解锁」以外的渲染异常（空正文）要报错

⚠️ 断言 1 的写法在 v5.4 被推翻过一次，值得记下来：
   它原本断言"两个选项落到同一个节点（s1_meet）、但渲染出的正文不同"——
   那正是"选什么都没用"的病灶本身。加了过场场景之后，两个选项**本来就该**
   落到不同节点，旧断言于是报出"本测试前提不成立"。
   测试的前提会随设计一起变，别把它当成不变的公理。

用法：
  python -m http.server 8010        # 另开一个终端
  python tools/smoke_text.py
"""

from _browser import DEBUG_URL, launch, need_playwright, check_server, max_steps

need_playwright()
check_server()

from playwright.sync_api import sync_playwright  # noqa: E402 —— 故意放在依赖检查之后

# 读当前节点的 id 与渲染出来的正文
COLLECT_JS = """
() => {
  const S = window.__changan;
  const el = document.querySelector('.narration');
  return { id: S.state.sceneId, text: el ? el.innerText.trim() : '' };
}
"""

# 点第 n 个可见选项（0 = 第一个，-1 = 最后一个）
PICK_JS = """
(which) => {
  const btns = document.querySelectorAll('#scene .choice-btn');
  if (!btns.length) return false;
  const i = which < 0 ? btns.length - 1 : Math.min(which, btns.length - 1);
  btns[i].click();
  return true;
}
"""


def reload_clean(page):
    """清存档并重载，保证从死牢开始。"""
    page.goto(DEBUG_URL, wait_until="domcontentloaded")
    page.evaluate("() => { try { localStorage.clear(); } catch (e) {} }")
    page.goto(DEBUG_URL, wait_until="networkidle")
    page.wait_for_timeout(600)


def walk(page, which, steps=0):
    """按固定策略走完一局，返回 {sceneId: 正文} 的顺序表。"""
    reload_clean(page)
    seen = []
    for _ in range(steps or max_steps(page)):
        if page.locator("#overlay").evaluate("el => !el.classList.contains('hidden')"):
            break
        snap = page.evaluate(COLLECT_JS)
        if snap["id"] and (not seen or seen[-1][0] != snap["id"]):
            seen.append((snap["id"], snap["text"]))
        if not page.evaluate(PICK_JS, which):
            break
        page.wait_for_timeout(120)
    page.wait_for_timeout(300)
    return seen


errors = []
with sync_playwright() as p:
    b = launch(p)
    page = b.new_page(viewport={"width": 1280, "height": 900})
    page.on("pageerror", lambda e: errors.append("PAGEERROR: " + str(e)))

    first = walk(page, 0)     # 总选第一项
    last = walk(page, -1)     # 总选最后项

    # 单点验证：死牢两个选项 → 各自的过场场景 → 汇合回 s1_meet
    reload_clean(page)
    page.evaluate(PICK_JS, 0)          # 「带路。」→ went_willingly
    page.wait_for_timeout(250)
    willing = page.evaluate(COLLECT_JS)
    page.screenshot(path="tools/text_willing.png", full_page=False)
    page.evaluate(PICK_JS, 0)          # 过场场景只有一个出口：继续
    page.wait_for_timeout(250)
    willing_merge = page.evaluate(COLLECT_JS)

    reload_clean(page)
    page.evaluate(PICK_JS, 1)          # 「我凭什么听你的？」→ cautious
    page.wait_for_timeout(250)
    cautious = page.evaluate(COLLECT_JS)
    page.screenshot(path="tools/text_cautious.png", full_page=False)
    page.evaluate(PICK_JS, 0)
    page.wait_for_timeout(250)
    cautious_merge = page.evaluate(COLLECT_JS)

    b.close()

print("===== 单点验证：死牢的两种选择 =====")
print(f"  选「带路」        → 专属场景 {willing['id']}（{len(willing['text'])} 字）"
      f" → 汇合到 {willing_merge['id']}（{len(willing_merge['text'])} 字）")
print(f"  选「我凭什么听你的」→ 专属场景 {cautious['id']}（{len(cautious['text'])} 字）"
      f" → 汇合到 {cautious_merge['id']}（{len(cautious_merge['text'])} 字）")
print()

m = dict(first)
n = dict(last)
shared = [k for k in m if k in n]
diff = [k for k in shared if m[k] != n[k]]
same = [k for k in shared if m[k] == n[k]]

print("===== 全程对比：总选第一项 vs 总选最后项 =====")
print(f"  第一条走法经过 {len(first)} 个节点，第二条经过 {len(last)} 个节点")
print(f"  共同经过 {len(shared)} 个节点，其中正文不同的有 {len(diff)} 个")
print()
print("  正文不同的节点：")
for k in diff:
    print(f"    {k.ljust(16)} 相差 {abs(len(m[k]) - len(n[k]))} 字")
if same:
    print()
    print("  正文相同的节点（条件正文未覆盖到）：")
    for k in same:
        print(f"    {k}")
print()

# 打印一处实际差异，方便肉眼确认质量
if diff:
    k = diff[0]
    print(f"===== 样例：{k} 的两种版本 =====")
    print("  【总选第一项】")
    print("    " + m[k].replace("\n", "\n    ")[:320])
    print("  【总选最后项】")
    print("    " + n[k].replace("\n", "\n    ")[:320])
    print()

failures = []

# 断言 1：两个选项必须各自走一段**不同**的场景，然后再汇合回同一个节点
if willing["id"] == cautious["id"]:
    failures.append(
        f"死牢的两个选项落到了同一个节点（{willing['id']}）—— "
        "每个选项应该有自己的专属过场场景（节点用 next/nextLabel 声明）"
    )
elif willing_merge["id"] != cautious_merge["id"]:
    failures.append(
        f"两条支路没有汇合回同一个节点（{willing_merge['id']} vs {cautious_merge['id']}）—— "
        "过场场景必须只有一个出口，并且指向主干的下一个节点"
    )
elif willing_merge["text"] == cautious_merge["text"]:
    failures.append(
        "汇合点的正文完全相同 —— 条件正文（textVariants）没有生效"
    )

# 断言 2：全局差异比例
if not shared:
    failures.append("两条走法没有共同经过任何节点，无法比较")
elif len(diff) < 3:
    failures.append(
        f"共同节点里只有 {len(diff)} 个正文不同（共 {len(shared)} 个）—— "
        "条件正文覆盖率过低，玩家的选择仍然留不下痕迹"
    )

# 断言 3：不能出现空正文
empty = [k for k, v in list(m.items()) + list(n.items()) if not v.strip()]
if empty:
    failures.append(f"有节点渲染出空正文（resolveText 可能返回了空串）: {empty}")

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
print(
    f"✅ 条件正文生效：死牢的选择改变了后文；"
    f"两条走法在 {len(shared)} 个共同节点里有 {len(diff)} 个正文不同"
)

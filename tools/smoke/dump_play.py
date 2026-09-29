"""把一局完整流程按玩家视角导出成可读文本 —— 剧情连贯性的人工审阅工具。

用途：scripts 只能测结构（连通性、flag、权重），测不出"读起来是否通顺"。
      这个工具把真实浏览器渲染出来的每一段正文按顺序打印出来，
      像读者一样从头读到尾，用来发现叙事断裂（例如选了"我凭什么听你的"，
      后文却像什么都没发生）。

用法：
  python -m http.server 8010
  python tools/dump_play.py first      # 每步都选第一项
  python tools/dump_play.py last       # 每步都选最后一项
  python tools/dump_play.py random 7   # 随机，种子 7（可复现）
  python tools/dump_play.py seq 1,1,2,1,1   # 按序号走指定支路（1-based，越界取最后一项）
  python tools/dump_play.py endings    # 只打 4 个结局正文（改过 h_hai 后必跑）

⚠️ seq 的序号只数「抉择点」，不数「过场场景」（只有 next、没有 choices 的那种）——
   过场是给你一个选项的专属戏，不是一次抉择。所以新加过场不会打乱已有的 seq 序列。

为什么要有 endings 模式：这 4 个结局是同一个分流点（h_hai）的四个出口，
而 h_hai 之前的 22 个节点**全部**能走到这 4 个结局 —— 也就是主线是共享的。
所以改任何一段主线正文，都得回来把这 4 段并排读一遍，
确认没有哪一句被某个结局当面否掉（例如正文说"他们全都上来了"，
e_burn_fire 却说"你身后没有人"）。
"""

import random
import re
import sys

from _browser import DEBUG_URL, launch, need_playwright, check_server

need_playwright()
check_server()

from playwright.sync_api import sync_playwright  # noqa: E402

# 与 src/text.js 的 INSERT_MARK 保持一致：这个标记一旦出现在渲染结果里就是 bug。
INSERT_MARK = "{{inserts}}"

COLLECT_JS = """
() => {
  const S = window.__changan;
  const el = document.querySelector('.narration');
  return { id: S.state.sceneId, text: el ? el.innerText.trim() : '' };
}
"""

# 返回当前可见选项的文案，然后点第 n 个
COUNT_JS = """
() => {
  const btns = document.querySelectorAll('#scene .choice-btn');
  return Array.from(btns).map(b => b.innerText.replace(/\\s+/g, ' ').trim());
}
"""

# 结局浮层正文：剔掉人格画像 / 六维画像，只留结局叙事与结语
ENDING_JS = """
() => {
  const el = document.querySelector('#overlayBody');
  if (!el) return '';
  const clone = el.cloneNode(true);
  clone.querySelectorAll('.mbti-wrap, .psy-wrap, .psy-sec-title').forEach(n => n.remove());
  return clone.innerText.trim();
}
"""

PICK_JS = """
(n) => {
  const btns = document.querySelectorAll('#scene .choice-btn');
  if (!btns.length) return false;
  btns[Math.min(n, btns.length - 1)].click();
  return true;
}
"""

# 当前节点是不是"过场场景"（只有 next、没有 choices）。
# 用来在 seq 模式下不把过场算进"选择序号"—— 过场不是抉择，
# 若算进去，加了几段过场就会让已有的 seq 序列整体错位。
IS_PASSAGE_JS = """
() => {
  const S = window.__changan;
  const sc = S.scenes[S.state.sceneId];
  return !!(sc && !sc.ending && sc.next && !(sc.choices && sc.choices.length));
}
"""


def reload_clean(page):
    page.goto(DEBUG_URL, wait_until="domcontentloaded")
    page.evaluate("() => { try { localStorage.clear(); } catch (e) {} }")
    page.goto(DEBUG_URL, wait_until="networkidle")
    page.wait_for_timeout(500)


# 把所有能到 75 的角色一次拉满 / 全部归零，用来构造结局正文的两种极端。
# 名单从数据里算，不写死 —— 写死的话改了角色就静默失效。
MAX_TRUST_JS = """
() => {
  const S = window.__changan;
  const t = {};
  for (const id in S.characters) t[id] = S.ALLY_TRUST;
  return t;
}
"""

MIN_TRUST_JS = """
() => {
  const S = window.__changan;
  const t = {};
  for (const id in S.characters) t[id] = 0;
  return t;
}
"""


def dump_endings(page):
    """把 4 个结局正文各打两遍：同路人拉满 / 一个都没有。

    拉满那遍看条件插段，归零那遍看兜底正文 —— 两个极端都读得通，中间态才不会出丑。
    顺带断言渲染出的正文里没有 {{inserts}} 标记：主引擎曾经直接读 sc.text，
    导致结局的插段不渲染、标记原样显示给玩家。
    """
    ids = page.evaluate("() => Object.keys(window.__changan.scenes)"
                        ".filter(k => window.__changan.scenes[k].ending)")
    bad = []
    for eid in ids:
        tag = page.evaluate("(id) => window.__changan.scenes[id].endTag", eid)
        for label, js in (("同路人拉满", MAX_TRUST_JS), ("一个都没有", MIN_TRUST_JS)):
            page.evaluate("(t) => window.__changan.setTrust(t)", page.evaluate(js))
            page.evaluate("(id) => window.__changan.goto(id)", eid)
            page.wait_for_timeout(120)
            body = page.evaluate(ENDING_JS)
            print("\n" + "=" * 72)
            print(f"【{tag}】({eid}) — {label}")
            print("=" * 72)
            print(body)
            if INSERT_MARK in body:
                bad.append(eid)
    if bad:
        print("\n" + "!" * 72)
        print(f"❌ 结局正文渲染出了 {INSERT_MARK} 标记：{', '.join(sorted(set(bad)))}")
        print("   说明该渲染路径绕过了 resolveText（见 src/text.js）—— 玩家会看到标记本身。")
        raise SystemExit(1)
    print(f"\n✅ {len(ids)} 个结局在两个极端下均无标记残留")


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "first"
    arg2 = sys.argv[2] if len(sys.argv) > 2 else None
    rng = random.Random(int(arg2) if (arg2 or "").isdigit() else 1)

    # seq 模式：按给定的 1-based 选择序号逐步走，用来复读某一条特定支路。
    # 超出该节点选项数时退回最后一项，所以序列可以写得比实际步数短。
    seq = []
    if mode == "seq":
        if not arg2:
            raise SystemExit("seq 模式需要给一串选择序号，例如：seq 1,1,2,1")
        seq = [int(x) for x in arg2.replace("，", ",").split(",") if x.strip()]

    with sync_playwright() as p:
        b = launch(p)
        page = b.new_page(viewport={"width": 1280, "height": 900})
        reload_clean(page)

        if mode == "endings":
            dump_endings(page)
            b.close()
            return

        n = 0
        cp = 0          # 只数「抉择点」的序号 —— 过场场景不占 seq 的位
        while n < 120:
            if page.locator("#overlay").evaluate("el => !el.classList.contains('hidden')"):
                break
            snap = page.evaluate(COLLECT_JS)
            is_passage = page.evaluate(IS_PASSAGE_JS)
            print("\n" + "=" * 72)
            print(f"【{snap['id']}】" + ("   ～～过场场景～～" if is_passage else ""))
            print("=" * 72)
            print(snap["text"])

            opts = page.evaluate(COUNT_JS)
            if not opts:
                break
            if mode == "first":
                pick = 0
            elif mode == "last":
                pick = len(opts) - 1
            elif mode == "seq":
                if is_passage:
                    pick = 0                      # 过场只有一个出口，不消耗序号
                else:
                    want = seq[cp] if cp < len(seq) else len(opts)  # 越界 → 最后一项
                    pick = max(0, min(want - 1, len(opts) - 1))
                    cp += 1
            else:
                pick = rng.randrange(len(opts))

            if not is_passage:
                print("\n  ── 可选：")
                for i, o in enumerate(opts):
                    mark = " ← 选了" if i == pick else ""
                    # 按钮文案里已经带了游戏自己的序号，这里剥掉，免得打印成 "1. 1. xxx"
                    label = re.sub(r"^\s*\d+\s*[.、]\s*", "", o)
                    print(f"     {i + 1}. {label}{mark}")
            else:
                print(f"\n  ── 过场（唯一出口）：{opts[0]}")

            page.evaluate(PICK_JS, pick)
            page.wait_for_timeout(120)
            n += 1

        # 结局页
        page.wait_for_timeout(400)
        tag = page.text_content(".end-tag")
        print("\n" + "=" * 72)
        print(f"结局：{tag}")
        print("=" * 72)
        # 结局正文是整局的落点，必须打印出来 —— 早先只打了标签，
        # 结果"读起来通不通"的检查漏掉了最该读的一段。
        # 人格画像 / 六维画像与叙事无关，剔掉以免淹没正文。
        body = page.evaluate(ENDING_JS)
        if body:
            print(body)
        b.close()


if __name__ == "__main__":
    main()

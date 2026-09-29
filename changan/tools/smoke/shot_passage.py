"""一次性脚本：截一张「过场场景」的图，确认 .continue-btn 的观感。

过场是本轮新增的节点类型（只有 next、没有 choices，渲染成一个「继续」按钮）。
结构测试只能证明按钮存在且能点，证明不了它看起来像不像"该点一下"。

用法：python tools/smoke/shot_passage.py
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

import _browser as B
from _browser import check_server, launch, need_playwright, reset_storage, max_steps

# 截图固定落在本脚本旁边 —— 否则从 tools/ 里跑会写成 tools/tools/*.png
SHOT = Path(__file__).resolve().parent / "passage_shot.png"

# 走到第一个过场：start 的第 1 个选项 → x_start_willing
WALK_JS = """
() => {
  const S = window.__changan;
  const sc = S.scenes[S.state.sceneId];
  if (!sc.choices || !sc.choices.length) return { passage: true, id: S.state.sceneId };
  return { passage: false };
}
"""


def main() -> int:
    need_playwright()
    check_server()
    with sync_playwright() as p:
        br = launch(p, headless=True)
        page = br.new_page()
        try:
            reset_storage(page, B.DEBUG_URL)
            page.wait_for_timeout(600)

            # start 有 2 个选项：点第 1 个 → 进 x_start_willing（过场）
            page.eval_on_selector_all(".choice-btn", "els => els[0].click()")
            page.wait_for_timeout(500)

            state = page.evaluate(WALK_JS)
            if not state.get("passage"):
                print("❌ 没有走到过场，当前节点:", state)
                return 1

            n = page.eval_on_selector_all(".choice-btn.continue-btn", "els => els.length")
            label = page.inner_text(".choice-btn.continue-btn") if n else ""
            print(f"✅ 走到过场 [{state['id']}]")
            print(f"   继续按钮数量: {n}（应恰好 1）")
            print(f"   按钮文案: {label!r}")

            page.screenshot(path=str(SHOT), full_page=False)
            print(f"   截图: {SHOT}")

            # 点一下继续，确认真的能往下走（按钮不是摆设）
            page.eval_on_selector_all(".choice-btn.continue-btn", "els => els[0].click()")
            page.wait_for_timeout(500)
            after = page.evaluate("() => window.__changan.state.sceneId")
            print(f"   点「继续」之后 → {after}（应为 s1_meet）")
            if after != "s1_meet":
                print("❌ 继续按钮没有把人带下去")
                return 1
            print("OK: 过场渲染与跳转正常")
        finally:
            br.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())

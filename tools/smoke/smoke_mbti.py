# 浏览器路径 / 端口 / 依赖统一交给 tools/_browser.py 自动探测，不再写死
from _browser import URL, launch, need_playwright, check_server, reset_storage, max_steps

need_playwright()   # 缺依赖时给出可操作的提示，而不是 ImportError 堆栈
check_server()      # 确认静态服务器已经起来（启动服务器是使用者的动作）

from playwright.sync_api import sync_playwright  # noqa: E402 —— 故意放在依赖检查之后

errors = []


def playthrough(page, pick):
    reset_storage(page)   # 必须清存档，否则会直接恢复到上一局的结局页
    page.wait_for_timeout(900)
    for _ in range(max_steps(page)):
        try:
            if not page.locator("#overlay").evaluate("el => el.classList.contains('hidden')"):
                break
        except Exception:
            pass
        btns = page.locator(".choice-btn")
        n = btns.count()
        if n == 0:
            break
        idx = 0 if pick == "first" else (n - 1 if pick == "last" else min(1, n - 1))
        btns.nth(idx).click()
        page.wait_for_timeout(170)
    page.wait_for_timeout(500)

    def t(sel):
        try:
            return page.text_content(sel)
        except Exception:
            return None

    # 四维倾向
    dims = []
    try:
        for d in page.locator(".mbti-dim").all():
            letters = [x.strip() for x in d.locator(".mbti-letter").all_inner_texts()]
            pcts = [x.strip() for x in d.locator(".mbti-pct").all_inner_texts()]
            dims.append(f"{letters[0]}{pcts[0]}/{letters[1]}{pcts[1]}")
    except Exception:
        pass

    return {
        "type": t(".mbti-type"),
        "name": t(".mbti-name"),
        "who": t(".mbti-match-name"),
        "end": t(".end-tag"),
        "dims": dims,
        # 无偏好维度数：新计分模型下 dev 恰为 0 时不硬判字母，UI 必须如实标出来
        "ties": page.locator(".mbti-dim.tie").count(),
    }


with sync_playwright() as p:
    b = launch(p)
    page = b.new_page(viewport={"width": 1280, "height": 900})
    page.on("pageerror", lambda e: errors.append("PAGEERROR: " + str(e)))
    page.on("console", lambda m: errors.append("CONSOLE: " + m.text)
            if m.type == "error" and "favicon" not in m.text else None)

    seen = {}
    for strategy in ["first", "last", "middle"]:
        r = playthrough(page, strategy)
        seen[strategy] = r["type"]
        print(f"--- {strategy} ---")
        print("  结局:", r["end"])
        print("  类型:", r["type"], "|", r["name"])
        print("  同型人物:", r["who"])
        print("  四维:", "  ".join(r["dims"]), f"| 无偏好维度 {r['ties']}")
        page.screenshot(path=f"tools/mbti_{strategy}.png", full_page=True)
        print("")

    print("不同类型数:", len(set(seen.values())), "->", seen)
    b.close()

print("")
if errors:
    print("运行时错误:")
    for e in errors[:8]:
        print("   " + e)
else:
    print("OK: 无运行时错误")

# 浏览器路径 / 端口 / 依赖统一交给 tools/_browser.py 自动探测，不再写死
from _browser import URL, launch, need_playwright, check_server, reset_storage, max_steps

need_playwright()   # 缺依赖时给出可操作的提示，而不是 ImportError 堆栈
check_server()      # 确认静态服务器已经起来（启动服务器是使用者的动作）

from playwright.sync_api import sync_playwright  # noqa: E402 —— 故意放在依赖检查之后

errors = []

with sync_playwright() as p:
    b = launch(p)
    page = b.new_page(viewport={"width": 1280, "height": 860})
    page.on("console", lambda m: errors.append("CONSOLE: " + m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append("PAGEERROR: " + str(e)))

    reset_storage(page)
    page.wait_for_timeout(1200)

    def txt(sel):
        try:
            return page.text_content(sel)
        except Exception:
            return None

    print("首页时辰:", txt(".act-hour"))
    print("地点标题:", txt(".act-title"))
    print("当前视角:", txt(".view-who"))
    print("选项数量:", page.locator(".choice-btn").count())
    page.screenshot(path="tools/shot1_start.png")

    # 走一步
    page.locator(".choice-btn").first.click()
    page.wait_for_timeout(600)
    print("第二步时辰:", txt(".act-hour"))
    print("线索数:", page.locator("#clueList .list-item").count())
    page.screenshot(path="tools/shot2_step.png")

    # 自动点击到结局
    for _ in range(max_steps(page)):
        try:
            if not page.locator("#overlay").evaluate("el => el.classList.contains('hidden')"):
                break
        except Exception:
            pass
        btn = page.locator(".choice-btn").first
        if btn.count() == 0:
            break
        btn.click()
        page.wait_for_timeout(220)

    page.wait_for_timeout(600)
    try:
        end_visible = not page.locator("#overlay").evaluate("el => el.classList.contains('hidden')")
    except Exception:
        end_visible = False
    print("结局浮层:", end_visible)
    if end_visible:
        try:
            print("结局标签:", page.text_content(".end-tag"))
        except Exception:
            pass
    page.screenshot(path="tools/shot3_ending.png")
    b.close()

print("")
if errors:
    print("运行时错误:")
    for e in errors[:10]:
        print("   " + e)
else:
    print("OK: 无运行时错误")

"""results.html（结局与人物图鉴页）的冒烟测试。

为什么单独需要一个：index.html 有 5 个测试盯着，results.html 一个都没有，
结果它带着一个 TDZ 错误（`flagLabel` 声明在使用之后）上线了很久 ——
页面结构完整、CSS 正常、`index.html` 一切正常，**就是渲染不出任何卡片**。
自动化的 `verify` / `simulate` 全都只加载 `src/data/*.js`，从不加载这个页面，
所以什么都不会报。

这里只断言"页面真的渲染出了东西"，以及不泄漏 {{inserts}} 标记。
"""
import sys

from _browser import URL, launch, need_playwright, check_server

need_playwright()
check_server()

from playwright.sync_api import sync_playwright  # noqa: E402

URL_RESULTS = URL.rsplit("/", 1)[0] + "/results.html"

CHECKS = [
    # (选择器, 最少个数, 说明)
    (".ending-card", 4, "结局卡片"),
    (".ending-card p", 20, "结局正文段落（分段渲染后每张卡有多个 <p>）"),
    ("#mbtiGrid > *", 16, "MBTI 16 型卡片"),
    ("#charGrid > *", 16, "人物卡片"),
]

failures = []

with sync_playwright() as p:
    b = launch(p)
    page = b.new_page(viewport={"width": 1400, "height": 1200})
    page_errors = []
    page.on("pageerror", lambda e: page_errors.append(str(e)))

    page.goto(URL_RESULTS, wait_until="networkidle")
    page.wait_for_timeout(800)

    print("=" * 70)
    print("results.html 图鉴页冒烟测试")
    print("=" * 70)

    for sel, least, label in CHECKS:
        n = page.evaluate("(s) => document.querySelectorAll(s).length", sel)
        ok = n >= least
        print(f"  {'✅' if ok else '❌'} {label:<32} {n} 个（要求 >= {least}）")
        if not ok:
            failures.append(f"{label} 只渲染出 {n} 个，要求 >= {least}")

    leak = page.evaluate("() => document.body.innerText.includes('{{inserts}}')")
    print(f"  {'❌' if leak else '✅'} {'是否泄漏 {{inserts}} 标记':<32} {'是' if leak else '否'}")
    if leak:
        failures.append("页面正文里出现了 {{inserts}} 标记 —— 有渲染路径绕过了 resolveText（src/text.js）")

    if page_errors:
        print("\n  页面运行时错误：")
        for e in page_errors:
            print("    " + e)
        failures.append(f"页面抛出 {len(page_errors)} 个运行时错误")
    else:
        print("  ✅ 无页面运行时错误")

    b.close()

print()
if failures:
    print("❌ 失败：")
    for f in failures:
        print("   " + f)
    sys.exit(1)
print("OK: results.html 图鉴页渲染正常")

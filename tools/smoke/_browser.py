"""浏览器 / 地址 / 依赖的公共解析工具，供 smoke*.py 与 mbti_dist.py 共用。

原来的脚本把 Chrome 路径写死成 C:/Program Files/Google/Chrome/Application/chrome.exe，
换一台机器（或只装了 Edge）就直接报一句看不懂的路径错误。这里改成自动探测：

  1. 环境变量 CHANGAN_BROWSER（显式指定，优先级最高）
  2. Chrome / Edge 的常见安装位置（Windows / macOS / Linux）
  3. 扫一遍常见安装目录

端口也可以用环境变量 CHANGAN_PORT 覆盖，默认 8010。
"""

import glob
import os
import urllib.request

PORT = os.environ.get("CHANGAN_PORT", "8010")
URL = f"http://127.0.0.1:{PORT}/index.html"
# 带 ?debug=1 时会页面会暴露 window.__changan，供按"结论"驱动剧情的测试使用
DEBUG_URL = f"{URL}?debug=1"

# 一局最多要走多少步？**从数据里算，不要写死。**
#
# 早先各脚本写的是 range(30) / range(40)。加了"过场场景"（每个选项后面那段
# 专属短场景，只有 next、没有 choices）之后，一局的步数几乎翻倍，
# 写死的上限会让测试在剧情走完之前就停下 —— 然后报出"没走到结局"这种假故障，
# 让人去查一个根本不存在的 bug。
#
# 上界取「非结局节点数」：一局里每个节点最多经过一次，再加一点余量。
MAX_STEPS_JS = """
() => {
  const S = window.__changan;
  if (!S || !S.scenes) return 120;
  return Object.keys(S.scenes).filter(k => !S.scenes[k].ending).length + 8;
}
"""


def max_steps(page) -> int:
    """从页面上的剧情数据算出一局需要的步数上限。"""
    try:
        return int(page.evaluate(MAX_STEPS_JS))
    except Exception:
        return 120

_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/microsoft-edge",
]

_SCAN_GLOBS = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
]


def find_browser() -> str:
    """返回可用的 Chromium 内核浏览器路径，找不到就给出可操作的提示。"""
    env = os.environ.get("CHANGAN_BROWSER")
    if env:
        if os.path.exists(env):
            return env
        raise SystemExit(f"环境变量 CHANGAN_BROWSER 指向的文件不存在：{env}")

    for path in _CANDIDATES:
        if path and os.path.exists(path):
            return path

    for pattern in _SCAN_GLOBS:
        for hit in glob.glob(pattern):
            return hit

    raise SystemExit(
        "找不到可用的 Chromium 内核浏览器。\n"
        "请安装 Chrome 或 Edge，或设置环境变量 CHANGAN_BROWSER 指向浏览器可执行文件，例如：\n"
        r'  set CHANGAN_BROWSER=C:\Program Files\Google\Chrome\Application\chrome.exe'
    )


def need_playwright() -> None:
    """确认 playwright 可用；缺了就告诉用户装什么，而不是抛 ImportError 堆栈。"""
    try:
        import playwright  # noqa: F401
    except ImportError:
        raise SystemExit(
            "缺少 playwright。请先安装：\n"
            "  pip install playwright\n"
            "（本项目的脚本复用系统已装的 Chrome/Edge，不需要再执行 playwright install）"
        )


def launch(p, headless: bool = False):
    """统一的浏览器启动方式。

    两个要点：
      1. executable_path 用探测到的系统浏览器，不依赖 playwright 下载的内核；
      2. 加 --no-proxy-server —— 本机 127.0.0.1 不该走代理。
         很多环境会设 HTTP_PROXY（公司网络、代理客户端、沙箱），
         那样 Chrome 访问 localhost 会被转发出去，报 502 之类的怪错。
    """
    return p.chromium.launch(
        executable_path=BROWSER,
        headless=headless,
        args=["--no-proxy-server"],
    )


def check_server() -> None:
    """确认静态服务器已经起来。启动服务器是使用者的动作，脚本不代劳。

    注意：显式用空 ProxyHandler 绕过系统代理，否则在设了 HTTP_PROXY 的机器上
    访问 127.0.0.1 会被转发到代理，误报"服务器没起来"。
    """
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        opener.open(URL, timeout=3)
    except Exception:
        raise SystemExit(
            f"打不开 {URL}\n"
            "请先在项目根目录另开一个终端启动静态服务器：\n"
            f"  python -m http.server {PORT}\n"
            "（Windows 上也可以直接双击 start.bat；端口可用 CHANGAN_PORT 覆盖）"
        )


def reset_storage(page, url: str = URL) -> None:
    """清掉存档并重新加载，保证每局都从「死牢」重新开始。

    游戏会把进度写进 localStorage（刷新可续），所以浏览器测试必须在每局开始前
    显式清空 —— 否则第二局会直接恢复到上一局的结局页，三个策略会得到同一个结果，
    看上去像"测评没有区分度"，其实是测试没清状态。
    """
    page.goto(url, wait_until="domcontentloaded")
    page.evaluate("() => { try { localStorage.clear(); } catch (e) {} }")
    page.goto(url, wait_until="networkidle")


BROWSER = find_browser()

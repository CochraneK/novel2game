"""build_dist.py — 将项目打包为可直接运行的 dist/（file:// 协议可打开）。

用法：python tools/gen/build_dist.py
"""

import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
DIST = ROOT / "dist"

NODE = r"C:\Users\SCZ_2207\.workbuddy\binaries\node\versions\22.22.2-2\node.exe"
NODE_PATH = r"C:\Users\SCZ_2207\.workbuddy\binaries\node\workspace\node_modules"


# ── 工具 ──────────────────────────────────────────────────

def decode_bytes(raw: bytes) -> str:
    """解码字节为文本，自动尝试多种编码。"""
    for enc in ("utf-8", "gbk", "gb18030"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    # fallback: 逐个字符解码
    result = []
    i = 0
    while i < len(raw):
        b = raw[i]
        if b < 0x80:
            result.append(chr(b))
            i += 1
            continue
        if b >= 0xC0 and i + 1 < len(raw):
            try:
                dec = raw[i:i+4].decode("utf-8")
                result.append(dec)
                i += len(dec.encode("utf-8"))
                continue
            except:
                pass
        if i + 1 < len(raw):
            try:
                dec = raw[i:i+2].decode("gbk")
                result.append(dec)
                i += 2
                continue
            except:
                pass
        i += 1
    return "".join(result)


# ── esbuild ────────────────────────────────────────────────

def esbuild_bundle(entry: Path, outfile: Path) -> bool:
    """打包 JS 为 iife（消除 import 语句）。"""
    outfile.parent.mkdir(parents=True, exist_ok=True)
    env = {**os.environ, "NODE_PATH": NODE_PATH}
    js = (
        "const e=require('esbuild');const ep=process.argv[1],o=process.argv[2];"
        "e.build({entryPoints:[ep],bundle:true,format:'iife',"
        "platform:'browser',target:'es2020',outfile:o,logLevel:'warning'})"
        ".catch(x=>{console.error(x.message);process.exit(1)})"
    )
    r = subprocess.run(
        [NODE, "-e", js, str(entry), str(outfile)],
        env=env, capture_output=True, text=True,
    )
    if r.returncode != 0:
        print(f"  [FAIL] esbuild: {r.stderr.strip() or r.stdout.strip()}")
        return False
    print(f"  [OK] {outfile.name} ({outfile.stat().st_size // 1000}KB)")
    return True


# ── 处理 index.html 的特殊路径 ─────────────────────────────

def handle_index_html() -> bool:
    """打包 src/main.js → dist/game.js，生成 dist/index.html 引用 game.js。"""
    # 1. 打包 main.js
    src_main = ROOT / "src" / "main.js"
    dist_game = DIST / "game.js"
    if not esbuild_bundle(src_main, dist_game):
        return False

    # 2. 读取 index.html，替换 <script type="module" src="./src/main.js">
    raw = (ROOT / "index.html").read_bytes()
    text = decode_bytes(raw)

    # 匹配: <script type="module" src="./src/main.js"></script>
    new_text = re.sub(
        r'<script\s+type=["\']module["\']\s+src=["\']./src/main\.js["\']\s*></script>',
        '<script src="./game.js"></script>',
        text,
    )
    if new_text == text:
        print("  [WARN] index.html: 未找到 <script type=module src=./src/main.js>，已复制原文")
        shutil.copy2(ROOT / "index.html", DIST / "index.html")
    else:
        (DIST / "index.html").write_text(new_text, encoding="utf-8")
        print(f"  [BUNDLE] index.html → game.js (from src/main.js)")
    return True


# ── 处理 inline module script ──────────────────────────────

def handle_inline_html(html_path: Path) -> bool:
    """处理有 inline <script type="module">...</script> 的 HTML。"""
    rel = html_path.relative_to(ROOT)
    dist_path = DIST / rel
    in_ext = False
    try:
        html_path.relative_to(ROOT / "extensions")
        in_ext = True
    except ValueError:
        pass

    raw = html_path.read_bytes()

    # 按字节查找 inline module tag
    tag_open = b'<script type="module">'
    idx = raw.find(tag_open)
    if idx < 0:
        tag_open = b"<script type='module'>"
        idx = raw.find(tag_open)
    if idx < 0:
        # 没有 inline module
        dist_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(html_path, dist_path)
        print(f"  [COPY] {rel}")
        return True

    offset = idx + len(tag_open)
    end = raw.find(b"</script>", offset)
    if end < 0:
        dist_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(html_path, dist_path)
        print(f"  [COPY] {rel} (找不到 script 结束)")
        return True

    script_bytes = raw[offset:end]
    rest_html = raw[:idx] + b"<!-- BUNDLE_PLACEHOLDER -->" + raw[end + len(b"</script>"):]

    # 解码并修正路径
    script = decode_bytes(script_bytes)
    script = script.replace('.\\/', './')
    if in_ext:
        for old, new in [
            ("'./src/data/", "'../src/data/"),
            ('"./src/data/', '"../src/data/'),
            ("'./src/text.js'", "'../src/text.js'"),
            ('"./src/text.js"', '"../src/text.js"'),
        ]:
            script = script.replace(old, new)

    # 写 temp file（在 HTML 同目录）
    tmp = html_path.parent / f"_{html_path.stem}_inline_temp.js"
    tmp.write_text(script, encoding="utf-8")

    bundle_name = html_path.stem + ".bundle.js"
    bundle_out = DIST / rel.parent / bundle_name

    ok = esbuild_bundle(tmp, bundle_out)
    tmp.unlink(missing_ok=True)
    if not ok:
        return False

    # 构建 dist HTML
    rest_text = decode_bytes(rest_html)
    dist_html = rest_text.replace("<!-- BUNDLE_PLACEHOLDER -->", f'<script src="./{bundle_name}"></script>')
    dist_path.parent.mkdir(parents=True, exist_ok=True)
    dist_path.write_text(dist_html, encoding="utf-8")
    print(f"  [BUNDLE] {rel} → {bundle_name}")
    return True


# ── 杂项 ──────────────────────────────────────────────────

def copy_static():
    for src in [ROOT / "styles.css"]:
        if src.exists():
            shutil.copy2(src, DIST / src.name)
            print(f"  [COPY] {src.name}")


# ── 主入口 ────────────────────────────────────────────────

def main():
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir(parents=True)
    print(f"Building {DIST}")

    # 1. 处理 index.html（特殊：外链 module → bundle）
    fail = []
    if not handle_index_html():
        fail.append("index.html")

    # 2. 处理 results.html
    if not handle_inline_html(ROOT / "results.html"):
        fail.append("results.html")

    # 3. 处理 extensions/
    ext_dir = ROOT / "extensions"
    if ext_dir.exists():
        for f in sorted(ext_dir.glob("*.html")):
            if not handle_inline_html(f):
                fail.append(f.relative_to(ROOT))
                # 兜底：直接复制原文件到 dist/（离线无法用 module，但至少存在）
                rel = f.relative_to(ROOT)
                dist_path = DIST / rel
                dist_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(f, dist_path)
                print(f"  ↳ [FALLBACK COPY] {rel}")

    copy_static()

    # 报告
    total = len(list(DIST.rglob("*")))
    size_kb = sum(f.stat().st_size for f in DIST.rglob("*") if f.is_file()) // 1024
    print(f"\n{'─' * 40}")
    print(f"✔ dist/ 打包完成：{total} 个文件 / {size_kb}KB")
    print(f"  → index.html + game.js        主游戏（离线可打开）")
    print(f"  → results.html + bundle.js    结局图鉴")
    print(f"  → extensions/                 扩展页面")
    print(f"  → styles.css                  样式")
    if fail:
        print(f"\n⚠ 失败的页面（{len(fail)} 个）：")
        for f in fail:
            print(f"    {f}")
    print("\n直接用浏览器打开 dist/index.html 即可游玩")


if __name__ == "__main__":
    main()

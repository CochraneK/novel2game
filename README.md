# Novel2Game

小说 / 公众号文章改编的**文字叙事游戏**合集。一个游戏一个目录，互不混用。

**在线游玩**：<https://cochranek.github.io/novel2game/>（GitHub Pages，落地页 + 两款游戏均可直接在线玩）

## 游戏

| 游戏 | 目录 | 素材来源 | 形态 |
|------|------|----------|------|
| 长安十二时辰 · 灯火如昼 | [changan/](changan/) | 电视剧《长安十二时辰》 | ES Modules 引擎 + 数据分离，带审计 / 模拟 / 构建脚本 |
| 一叠钱 | [yidieqian/](yidieqian/) | 公众号「陈穆行纪」《一叠钱》 | 单文件自包含，零依赖，双击即开 |

## 新增游戏约定

1. **一个游戏一个子目录** `novel2game/<游戏名>/`，与其他游戏零共享文件。
2. **优先单文件自包含** `index.html`（CSS+JS 内联、零外部依赖、离线双击可开）——架构上杜绝串味。
3. **原文素材**（公众号/小说全文）只存本地 `wechat/`，不入仓库（版权考虑）。
4. 新游戏完成后，在本文件的「游戏」表加一行。

## 快速开始

- **changan**：`cd changan && python -m http.server 8010` → http://localhost:8010（审计 / 构建 / 文档见 [changan/README.md](changan/README.md)）
- **yidieqian**：双击打开 `yidieqian/index.html`

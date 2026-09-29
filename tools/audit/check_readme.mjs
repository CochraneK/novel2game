// 核对 README 里引用的 verify 输出与实际运行结果是否一致。
// README 里的输出块是手工贴的，很容易在改完数据后忘记同步 —— 这个脚本就是防止它腐化。
import fs from 'node:fs';
import { execSync } from 'node:child_process';

// ⚠️ 必须先归一化换行符。下面那几个正则写的是 `\n`，只认 LF；
//    而 README 一旦被 Windows 上的编辑器/脚本改存成 CRLF（\r\n），
//    就会出现「verify 输出块明明在文件里，脚本却说找不到」——
//    2026-09-11 真实踩到一次（用 Python 文本模式写 README，整文件被转成 CRLF）。
//    归一化在这里做一次，比去改每个正则可靠。
const md = fs.readFileSync('README.md', 'utf8').replace(/\r\n/g, '\n');
const actual = execSync('node tools/audit/verify.mjs', { encoding: 'utf8' });

const m = md.match(/### `verify` 覆盖项目\s*\n+```\n([\s\S]*?)```/);
if (!m) {
  console.log('❌ README 里找不到 verify 输出块');
  process.exit(1);
}

const lines = m[1].split('\n').filter(l => l.trim());

// 只比较"内容"，不比较对齐用的连续空格 —— README 会把几行并排写以省版面，
// 实际输出则是每行一条。这里把连续空白压成单个空格再比。
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const hay = norm(actual);

let ok = 0, bad = 0;
for (const line of lines) {
  // README 允许把两行并排写在一行里，用 2 个以上空格分隔
  const parts = line.split(/\s{2,}/).map(s => s.trim()).filter(Boolean);
  for (const p of parts) {
    const hit = hay.includes(norm(p));
    console.log((hit ? '  ✅ ' : '  ❌ ') + p);
    hit ? ok++ : bad++;
  }
}
console.log(`\nREADME 引用输出核对：${ok} 项一致` + (bad ? `，${bad} 项不一致 ❌` : '，全部一致 ✅'));
if (bad) process.exit(1);

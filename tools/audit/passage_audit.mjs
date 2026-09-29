#!/usr/bin/env node
/**
 * passage_audit —— 过场场景（passage）与汇合点的**重复**检查。
 *
 * 为什么需要它：
 *   本轮把 22 个抉择点的每个选项都接了一段"只属于那个选项"的过场，再汇合回主干。
 *   新的失败模式是**复述**：过场把下一场戏的句子提前说了，于是汇合点读起来像重复；
 *   或者过场说了下游条件插段要说的话，插段一进来就撞车。
 *   这是纯文案层面的问题，结构检查（verify）看不见，人眼要对比 59 对也很吃力。
 *
 * 度量方式：最长公共子串（LCS, 字符级）。
 *   - 过场 ↔ 汇合点正文：>= 8 个汉字连着一样，就报。—— 8 字已经是一个完整的
 *     短句片段（"你出了靖安司，没有直接"），读到会明显觉得在重复。
 *   - 过场 ↔ 汇合点插段：阈值放宽到 12，因为插段不一定触发（条件成立才显示），
 *     而且插段之间本来就允许与正文呼应。
 *   - 同级过场 ↔ 同级过场：阈值 20，用来抓复制粘贴（同一次抉择的几段过场
 *     本该是不同的话，如果大段雷同说明抄漏了没改）。
 *
 * 注意：这个工具**不判断文笔好坏**，只报"字面重复"。它给的是人眼该看哪里。
 */
import { scenes, isPassage } from '../../src/data/scenes.js';

// 归一化：去掉空白、{{inserts}} 锚点、以及所有标点/符号。
// 只留汉字、字母、数字 —— 否则「。」这种重复会刷满屏，而"李必"两字相同又不是问题。
const CJK = /[\u4e00-\u9fff\u3400-\u4dbfa-zA-Z0-9]/;
function norm(s) {
  return [...(s || '')]
    .filter(ch => CJK.test(ch))
    .join('');
}

// 最长公共子串：返回 { len, frag }。用滚动 DP，O(n*m) 足够（单段正文几千字以内）。
function lcs(a, b) {
  if (!a || !b) return { len: 0, frag: '' };
  const m = a.length, n = b.length;
  let prev = new Uint16Array(n + 1), cur = new Uint16Array(n + 1);
  let best = 0, end = 0;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : 0;
      if (cur[j] > best) { best = cur[j]; end = i; }
    }
    const t = prev; prev = cur; cur = t; cur.fill(0);
  }
  return { len: best, frag: a.slice(end - best, end) };
}

// 三元组（3 字连续片段）重合度。
// 为什么光有 LCS 不够：整句照抄能靠 LCS 抓，但"换了个字"的重复抓不到 ——
// 例如过场写「文书你先送回了靖安司」、插段写「文书你先送去了靖安司」，
// LCS 只有 5 字（差一个"回/了"就断），可读起来明明是同一句话。
// 三元组对单字替换不敏感，能把这层抓出来。
function trigrams(s) {
  const set = new Set();
  for (let i = 0; i + 3 <= s.length; i++) set.add(s.slice(i, i + 3));
  return set;
}
function overlap(a, b) {
  const A = trigrams(a), B = trigrams(b);
  if (!A.size || !B.size) return { shared: 0, coeff: 0 };
  let shared = 0;
  for (const g of A) if (B.has(g)) shared++;
  return { shared, coeff: shared / Math.min(A.size, B.size) };
}

const T_JUNCTION = 8;
const T_INSERT = 12;
const T_SIBLING = 20;
const T_NOTE_LCS = 5;     // 5-7 字的字面重合：不一定错（短句撞车很正常），但要看一眼
const T_NOTE_SHARED = 4;  // 三元组重合 >= 4 且系数 >= 0.28：疑似"换了说法的重复"

const ids = Object.keys(scenes);
const choicePoints = ids.filter(id => !scenes[id].ending && !isPassage(scenes[id]));

// 每个选项的"当场去处"。条件路由会把 to 写成数组，把所有分支都算上——
// 只取第一个分支会漏掉（跟 verify 的支路饱满度不一样，那里取代表即可，
// 这里要做完整对比，漏一个分支就漏一次重复）。
function targetsOfChoice(ch) {
  const to = ch && ch.to;
  if (typeof to === 'string') return [to];
  if (Array.isArray(to)) return to.map(r => r && r.then).filter(Boolean);
  return [];
}

const problems = [];   // 硬问题：过场复述汇合点 / 上游抉择点正文
const softs = [];      // 软提示：过场与某个插段撞车（插段未必触发）
const siblings = [];   // 同级过场互相雷同
const notes = [];      // 5-7 字短重合、或"换了说法的重复"—— 需要人眼判断
const digest = [];     // 给人眼看的紧凑清单

let passageCount = 0;
let shortPassages = [];

for (const id of choicePoints) {
  const sc = scenes[id];
  const chs = sc.choices || [];
  const here = [];

  chs.forEach((ch, i) => {
    const tgs = targetsOfChoice(ch);
    // 展开过场链（允许过场连过场，取链尾作为汇合点；本轮都是一层，但不能写死）
    for (const t of tgs) {
      let nodeId = t;
      const chain = [];
      let guard = 0;
      while (scenes[nodeId] && isPassage(scenes[nodeId]) && guard++ < 10) {
        chain.push(nodeId);
        nodeId = scenes[nodeId].next;
      }
      const junction = scenes[nodeId];
      if (!junction) continue;

      // 上游抉择点：过场是从它长出来的，所以最容易"复述上一场"的地方不是汇合点，
      // 而是这个节点本身。（这一条是通读 59 段时手抓出来的漏检：
      //  x_doc_confront 里有「他站在李必身后，一言不发，眼神里全是军人的骄傲」，
      //  而那正是它上游 h_si_doc 正文里的一句。工具只看下游，就看不见。）
      const parent = scenes[id];

      for (const pid of chain) {
        passageCount++;
        const p = scenes[pid];
        const pn = norm(p.text);
        if (pn.length < 24) {
          shortPassages.push(`[${pid}] 只有 ${pn.length} 字，过场太短，撑不起"一段专属戏"`);
        }

        // ① 过场 vs 汇合点正文
        const r1 = lcs(pn, norm(junction.text));
        if (r1.len >= T_JUNCTION) {
          problems.push(
            `[${pid}] → [${nodeId}]  过场复述了汇合点正文 ${r1.len} 字：「${r1.frag}」\n` +
            `        汇合点读起来会像重复。把过场这句删掉，或换一种说法（写"之后"而不是"当时"）。`
          );
        }

        // ② 过场 vs 上游抉择点正文
        const r0 = lcs(pn, norm(parent.text));
        if (r0.len >= T_JUNCTION) {
          problems.push(
            `[${pid}] 复述了上游 [${id}] 的正文 ${r0.len} 字：「${r0.frag}」\n` +
            `        你刚在那个节点读过这句，过场又念一遍 = 原地踏步。`
          );
        }

        // ③ 过场 vs 汇合点 / 上游的插段
        const against = [
          ...(junction.inserts || []).map(x => ({ x, where: nodeId })),
          ...(parent.inserts || []).map(x => ({ x, where: id })),
        ];
        for (const { x: ins, where } of against) {
          const r2 = lcs(pn, norm(ins.text));
          if (r2.len >= T_INSERT) {
            softs.push(
              `[${pid}] 与 [${where}] 的插段撞车 ${r2.len} 字：「${r2.frag}」\n` +
              `        插段条件: ${JSON.stringify(ins.when || {})}（不一定触发，触发了就是重复）`
            );
          }
        }

        // ④ 人眼提示：短字面重合 + 换了说法的重复
        const best = Math.max(r1.len, r0.len);
        if (best >= T_NOTE_LCS && best < T_JUNCTION) {
          const src = r0.len >= r1.len ? `上游 [${id}]` : `汇合点 [${nodeId}]`;
          notes.push(`[${pid}] 与 ${src} 有 ${best} 字字面重合：「${r0.len >= r1.len ? r0.frag : r1.frag}」`);
        }
        for (const { label, text } of [
          { label: `上游 [${id}]`, text: parent.text },
          { label: `汇合点 [${nodeId}]`, text: junction.text },
          ...against.map(o => ({ label: `[${o.where}] 插段`, text: o.x.text })),
        ]) {
          const o = overlap(pn, norm(text));
          if (o.shared >= T_NOTE_SHARED && o.coeff >= 0.28) {
            notes.push(
              `[${pid}] 与 ${label} 疑似"换了说法的重复"（三元组重合 ${o.shared}，系数 ${(o.coeff * 100).toFixed(0)}%）`
            );
          }
        }

        here.push({ pid, junction: nodeId, ptext: p.text, jtext: junction.text, r1, r0 });
      }
    }
  });

  // ⑤ 同级过场互相雷同
  for (let i = 0; i < here.length; i++) {
    for (let j = i + 1; j < here.length; j++) {
      const r = lcs(norm(here[i].ptext), norm(here[j].ptext));
      if (r.len >= T_SIBLING) {
        siblings.push(
          `[${id}] 的 [${here[i].pid}] 与 [${here[j].pid}] 雷同 ${r.len} 字：「${r.frag}」`
        );
      }
    }
  }

  if (here.length) {
    digest.push({
      id,
      opts: chs.map((ch, i) => ({ i: i + 1, t: ch.t, to: targetsOfChoice(ch).join(' | ') })),
      items: here,
    });
  }
}

// ===== 输出 =====
const arg = process.argv[2];

if (arg === 'digest') {
  // 紧凑清单：给"人眼通读"用的。只打过场正文 + 汇合点的头两段，
  // 不打印整条主线（dump_play.py 那 888 行是给"完整走一遍"用的，不是给这个用的）。
  for (const d of digest) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`【${d.id}】`);
    d.opts.forEach(o => console.log(`   ${o.i}. ${o.t}\n      → ${o.to}`));
    for (const it of d.items) {
      console.log(`\n  ── 过场 [${it.pid}] ──`);
      console.log(it.ptext.split('\n').filter(Boolean).map(l => '     ' + l).join('\n'));
      const head = it.jtext.split('\n').filter(Boolean).slice(0, 2).join('\n');
      console.log(`  ── 汇合于 [${it.junction}]（开头）──`);
      console.log(head.split('\n').map(l => '     ' + l).join('\n'));
      console.log(`     ↳ 最长重复：上游 ${it.r0.len} 字 / 汇合点 ${it.r1.len} 字`
        + (it.r1.len >= T_JUNCTION || it.r0.len >= T_JUNCTION ? ' ⚠️' : ''));
    }
  }
  console.log(`\n（以上 ${digest.length} 个抉择点 / ${passageCount} 段过场）`);
  process.exit(0);
}

console.log('--- 过场场景 ↔ 汇合点 / 上游抉择点 重复检查 ---');
console.log(`  覆盖抉择点: ${choicePoints.length} 个，过场: ${passageCount} 段`);
console.log(`  阈值: 正文 ${T_JUNCTION} 字 / 条件插段 ${T_INSERT} 字 / 同级过场 ${T_SIBLING} 字`);
console.log(`  另报: ${T_NOTE_LCS}-${T_JUNCTION - 1} 字短重合、三元组系数 >= 28% 的"换了说法的重复"（需人眼判断）`);
console.log('  （比较对象有三个：上游抉择点、汇合点、以及两处的条件插段。）');

if (shortPassages.length) {
  console.log(`\n--- 过场过短（撑不起一段专属戏）${shortPassages.length} 段 ---`);
  shortPassages.forEach(s => console.log('  ' + s));
}

if (problems.length) {
  console.log(`\n--- ❌ 过场复述了正文（${problems.length} 处）---`);
  problems.forEach(p => console.log('  ' + p));
} else {
  console.log(`\n--- ✅ 没有过场复述上游抉择点 / 汇合点的正文（阈值 ${T_JUNCTION} 字）---`);
}

if (softs.length) {
  console.log(`\n--- ⚠️ 过场与条件插段撞车（${softs.length} 处，插段不一定触发）---`);
  softs.forEach(s => console.log('  ' + s));
}

if (siblings.length) {
  console.log(`\n--- ⚠️ 同级过场之间雷同（${siblings.length} 处）---`);
  siblings.forEach(s => console.log('  ' + s));
}

if (notes.length) {
  console.log(`\n--- 👁 需要人眼判断的短重合 / 换说法重复（${notes.length} 处）---`);
  notes.forEach(s => console.log('  ' + s));
}

console.log(`\n提示: 用 \`node tools/passage_audit.mjs digest\` 打印紧凑清单，逐对人工通读。`);
process.exit(problems.length || shortPassages.length ? 1 : 0);

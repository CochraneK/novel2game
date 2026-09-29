#!/usr/bin/env node
/**
 * continuity_audit —— 把**每一次转场**摊开：上一站在哪、下一站在哪、中间有没有交代。
 *
 * 为什么需要它：
 *   verify / branch_audit / passage_audit 证明的是"接线通、不复述"。
 *   它们**完全不检查"跳跃"** —— 你上一秒在平康坊的地下暗市，下一秒在靖安司的案牍库，
 *   结构上完全合法（节点连通），测试全绿，但读者读起来就是"跳"。
 *
 * 跳跃有三个维度，这个工具逐个列：
 *   ① 时辰跳跃：node.hour 变了，而且跨过了中间时辰 → 读者会问"中间那两个时辰呢"
 *   ② 空间跳跃：node.place 变了 → 必须有转场句，否则就是瞬移
 *   ③ 视角跳跃：node.pov 变了 → 读者会突然换了个身体
 *
 * 它**不判断"跳得好不好"**，只把每一次换场连同下一节点的开场句摆出来。
 * 判断"这句算不算交代了"必须人眼看 —— 工具没有这个能力，不要假装有。
 *
 * 用法：
 *   node tools/continuity_audit.mjs            # 全量
 *   node tools/continuity_audit.mjs jumps      # 只看换场（place 变化）与跨时辰
 */
import { scenes, isPassage, nextTargets, START_SCENE } from '../../src/data/scenes.js';
import { hours, characters } from '../../src/data/characters.js';

const HOUR_ORDER = hours.map(h => h.key);
const hourLabel = Object.fromEntries(hours.map(h => [h.key, h.name]));

const ids = Object.keys(scenes);

// 正文首句（把插段标记与空行去掉），用来判断"下一节点有没有交代这次换场"
function opening(sc, n = 2) {
  if (!sc || typeof sc.text !== 'string') return '';
  return sc.text
    .split('\n')
    .map(s => s.trim())
    .filter(s => s && s !== '{{inserts}}')
    .slice(0, n)
    .join(' / ');
}

// 收集所有边
const edges = [];
for (const id of ids) {
  const sc = scenes[id];
  for (const t of nextTargets(sc)) {
    if (!scenes[t]) continue;   // 悬空边交给 verify 报
    edges.push({ from: id, to: t });
  }
}

const placeJumps = [];
const hourJumps = [];
const povJumps = [];
const passageToChoice = [];

for (const { from, to } of edges) {
  const a = scenes[from], b = scenes[to];
  if (a.place !== b.place) {
    placeJumps.push({ from, to, a: a.place, b: b.place, hour: a.hour, open: opening(b) });
  }
  const ia = HOUR_ORDER.indexOf(a.hour), ib = HOUR_ORDER.indexOf(b.hour);
  if (ia >= 0 && ib >= 0 && ib > ia + 1) {
    hourJumps.push({ from, to, skip: ib - ia, a: a.hour, b: b.hour, open: opening(b, 1) });
  }
  if (a.pov !== b.pov) {
    povJumps.push({ from, to, a: a.pov, b: b.pov, open: opening(b, 1) });
  }
  if (isPassage(a) && !isPassage(b)) {
    passageToChoice.push({ from, to });
  }
}

// 文本里自称的时辰 vs node.hour —— 写错一格就是读者当场能发现的矛盾
//
// ⚠️ 两种写法都要查：
//   ① "子时。" 这种「X时」写法（最常见）
//   ② "夜半。" 这种**时辰别名**写法。别名只在 game 自己的 hours 表里定义，
//      所以玩家会用同一套词汇去读它 —— 酉时说"夜半"就是硬矛盾。
//      （真实踩到：h_you_xubin 正文开头写"夜半。"，而 夜半 = 子时，差了 2 个时辰。）
// 别名只在**正文开头且独立成句**时才算自称，否则"黄昏""日出"这类普通词会满屏误报。
const hourMismatch = [];
for (const id of ids) {
  const sc = scenes[id];
  if (typeof sc.text !== 'string' || !sc.hour) continue;

  const named = Object.entries(hourLabel).find(([, name]) => name === sc.hour); // 反查，其实用不上
  const m1 = sc.text.match(/^(子|丑|寅|卯|辰|巳|午|未|申|酉|戌|亥)时/);
  if (m1) {
    const said = HOUR_ORDER.find(k => hours.find(h => h.key === k).name === m1[1] + '时');
    if (said && said !== sc.hour) {
      hourMismatch.push(`[${id}] 正文自称「${m1[1]}时」(${hourLabel[said]})，但 node.hour = ${hourLabel[sc.hour]}`);
    }
  }
  const m2 = sc.text.match(/^(夜半|鸡鸣|平旦|日出|食时|隅中|日中|日昳|哺时|日入|黄昏|人定)[。，、]/);
  if (m2) {
    const said = hours.find(h => h.label === m2[1]);
    if (said && said.key !== sc.hour) {
      hourMismatch.push(`[${id}] 正文自称「${m2[1]}」= ${said.name}，但 node.hour = ${hourLabel[sc.hour]}`);
    }
  }
}

// ===== ⑤ 基座正文的条件依赖（穷举来路）=====
//
// 这是本项目踩得最痛的一类 bug，比"复述"更隐蔽：
//   **正文写死了一个只在部分来路上成立的事实。**
//
// 真实踩到两次：
//   · h_shen —— 正文写死「李必在你旁边」，可 breakout/decoy/observe 三条来路里，
//               后两条李必是后来才找回你的 → 他会凭空出现。
//   · h_chen —— 正文写死「李必听完你的回报」，可穷举 13,608 条来路里，
//               **11,664 条（86%）根本没报过**（报不报由西市那个选项决定）。
//
// 关键洞察：**这两处都有对应的插段存在**，所以问题不是"没人接住"，
// 而是"正文自己也断言了一遍" —— 于是插段变成废话，没插段的那条路变成矛盾。
//
// 可自动化的部分（本节的职责）：
//   ① 用状态可达性 (node, hasFlag) 算出：**某个 flag 在到达该节点时是不是必然的**。
//   ② flag 非必然 + 该节点有插段依赖它 ⇒ 正文在**没有它**的来路上也必须读得通。
//   ③ 再判"没有它"的那条路有没有被接住：
//       - 有 `flagsNone:[F]` 的插段 → 已接住
//       - 或者 F 的**互斥兄弟**（同一抉择点其它选项的 flag）各有插段 → 已接住
//         （兄弟互斥，所以"没有 F"必然落到某个兄弟身上）
//       - 两个都没有 → ⚠️ 请看：那条来路上正文大概率在断言不存在的事
//
// 不可自动化的部分（必须人看）：正文那句话到底算不算"断言了 F 所代表的事"。
// 工具把范围从"85 个节点全读一遍"缩到"下面这几条"，这已经是它能做的全部。

// 同一抉择点上不同选项的 flag = 互斥。用来判"没有 F 时会落到谁身上"。
const siblingsOf = new Map();   // flag -> Set(同一抉择点的其它 flag)
for (const id of ids) {
  const chs = scenes[id].choices;
  if (!chs) continue;
  const group = chs.map(c => c.flag).filter(Boolean);
  for (const f of group) {
    if (!siblingsOf.has(f)) siblingsOf.set(f, new Set());
    group.filter(x => x !== f).forEach(x => siblingsOf.get(f).add(x));
  }
}

// 从 START_SCENE 出发，在 (node, hasFlag) 状态空间上做可达性。
// 状态数 = 节点数 × 2，比穷举 13,608 条路径便宜得多，但结论等价（只问"有没有"）。
const key = (n, h) => n + (h ? '|1' : '|0');
function reachStates(F) {
  const seen = new Set([key(START_SCENE, false)]);
  const stack = [[START_SCENE, false]];
  while (stack.length) {
    const [n, h] = stack.pop();
    const sc = scenes[n];
    if (!sc) continue;
    const chs = sc.choices;
    for (const t of nextTargets(sc)) {
      let h2 = h;
      if (chs) {
        const c = chs.find(c => c.to === t);
        if (c && c.flag === F) h2 = true;
      } else if (sc.flag === F) h2 = true;
      const k = key(t, h2);
      if (!seen.has(k)) { seen.add(k); stack.push([t, h2]); }
    }
  }
  return seen;
}

const insertFlags = new Set();
for (const id of ids) {
  for (const ins of (scenes[id].inserts || [])) {
    for (const f of (ins.when?.flagsAll || [])) insertFlags.add(f);
    for (const f of (ins.when?.flagsAny || [])) insertFlags.add(f);
  }
}

// 人工确认登记表：`节点|flag` → 为什么读得通。
//
// 为什么需要它：这个检查**只负责把范围缩小**，它没有能力判断"正文那句话算不算断言了
// 这个 flag 代表的事"。所以每一条都必须要有人读过、并且把结论写下来。
// 不写下来 = 下次跑还是红的；写下来 = 下一个人知道"这条被谁、按什么标准放过了"。
//
// ⚠️ 加进来之前必须真的把该节点的正文从头读到尾。这里是"我读过了"，不是"我看着像没事"。
const CONFIRMED_OK = new Map([
  ['s1_task|went_willingly',
    '正文只交代舆图与阙勒霍多，完全不提"路上问没问过话"。went_willingly 的插段补的是语气，不是正文断言的事实。已通读。'],
  ['h_mao_snack|searched_body',
    '正文「你跑了一整夜，胃里翻江倒海」讲的是疲惫，不涉及"有没有搜过尸"。该 flag 与兄弟 reported 只影响插段语气，不影响正文。已通读。'],
  ['h_si_doc|promised',
    '正文首句「你翻开文书」发生在 {{inserts}} 之后；promised 的插段演的是"她把文书推过来／我等着"，正好把"翻开"接上，方向一致。已通读。'],
  ['h_si_doc|cold',
    '⚠️ 这条原本是真问题：插段写「你没打算看」，紧接着正文却写「你翻开文书」，读起来是硬拗。'
    + '已改插段结尾为「你盯了很久。最后还是伸手把它拿了过来。」，让"不接"到"翻开"之间有动作。已通读。'],
  ['e_final_fight|try_destroy',
    '本节点基座正文（你拔刀了／阙勒霍多被推下灯楼／圣人赦你死罪／你出城往西）从不断言"你砸过油罐"——'
    + '那句只存在于 when:{flagsAll:["try_destroy"]} 的插段里（纯增量：解释「为什么这一刀砍得下去」）。'
    + '没有 try_destroy 的来路靠 allies≥3 插段兜底，核心胜负与赦免叙事完全成立。已通读。'],
]);

const condDeps = [];    // { id, flag, state: 'ok' | 'uncovered' }
const stateCache = new Map();
const reach = (F) => {
  if (!stateCache.has(F)) stateCache.set(F, reachStates(F));
  return stateCache.get(F);
};

for (const id of ids) {
  const ins = scenes[id].inserts || [];
  if (!ins.length) continue;
  const flagset = new Set();
  for (const x of ins) {
    for (const f of (x.when?.flagsAll || [])) flagset.add(f);
    for (const f of (x.when?.flagsAny || [])) flagset.add(f);
  }
  for (const F of flagset) {
    const seen = reach(F);
    const withF = seen.has(key(id, true));
    const withoutF = seen.has(key(id, false));
    if (!(withF && withoutF)) continue;   // 必然成立（或必然不成立）→ 正文写死没风险
    // "没有 F" 的那条路有没有被接住？
    const hasNoneIns = ins.some(x => (x.when?.flagsNone || []).includes(F));
    const sibs = siblingsOf.get(F) || new Set();
    const sibFlagKeys = new Set();
    for (const x of ins) for (const f of (x.when?.flagsAll || [])) sibFlagKeys.add(f);
    const allSibsCovered = sibs.size > 0 && [...sibs].every(s => sibFlagKeys.has(s));
    condDeps.push({
      id, flag: F,
      siblings: [...sibs],
      covered: hasNoneIns || allSibsCovered,
      how: hasNoneIns ? 'flagsNone 插段' : (allSibsCovered ? '互斥兄弟全有插段' : ''),
      confirmed: CONFIRMED_OK.get(`${id}|${F}`) || null,
      base: opening(scenes[id], 3),
      withF, withoutF,
    });
  }
}
const uncovered = condDeps.filter(d => !d.covered && !d.confirmed);
const confirmedOnes = condDeps.filter(d => d.confirmed);

// ===== ⑥ 人物出场检查：角色表里有、但正剧里从没被"演"过的人 =====
//
// 真实踩到：**檀棋**。她在 `characters.js` 的 16 人表里，还带着人格向量和 MBTI 向量，
// 但 `grep -rn "檀棋" src/` 只有两处 —— 人物表 + `e_final_people` 那一句
// 「檀棋就站在你左手边」。也就是说：玩家在最后一屏被点名了一个从没见过的人。
//
// 这一类完全可自动检测：**一个角色名在全剧正文里只出现 1 次（或只在结局出现）**，
// 就等于"没有出场，只有被点名"。
//
// 判据（按"玩家有没有机会认识他"分档，而不是按出现次数硬切）：
//   · 0 节点            → 角色表里有、正文里从来没进过。多数是给结果页做人格参照用的
//                          （何执正/林九郎… 会出现在"你最像谁"里），也可能是我漏接的线。
//   · 只在**结局**里出现 → ⚠️ 严格档：玩家到最后一屏才第一次听到这个名字（檀棋）。
//   · 只在 1 个**非结局**节点出现 → 提示档：可能就是他自己那场戏（鱼肠在 h_you 有整场
//                          三选项的戏，这是"出场"），也可能只是被提了一嘴。要人看。
//   · ≥2 节点            → 不算问题
//
// 工具**不能**判断"这次点名在叙事上够不够"（那要人读），它只把名单和出现位置列出来。
//
// 同 ⑤ 节：判过之后要把结论写进下面的 CHARACTER_ACK，否则每次跑都还是提示。

const CHARACTER_ACK = new Map([
  ['何执正', '结果页"你最像谁"的人格参照（MBTI 同型人物），设计上不出现在剧情里。'],
  ['林九郎', '同上，人格参照。'],
  ['丁瞳儿', '同上，人格参照。'],
  ['王蕴秀', '同上，人格参照。'],
  ['长安百姓', '不是人物，是"百姓"这一方的信任度目标（trust.baixing），按阵营处理。'],
  ['姚汝能', '在 h_wei 与 h_wei_roof 被提及，点出靖安司还有别的官吏在做事；h_wei_roof 明确他是望楼旗语信号系统的设计者。已真正出场。'],
  ['鱼肠', 'h_you 是她的整场戏（有独立抉择点 + 三条过场），属于真正出场。仅计 1 个节点是判据的粗糙处，不是问题。'],
  ['檀棋', '已给正戏：h_chen 李必身后的侍女，递茶退回，自十岁进靖安司；e_final_people 左手边「李必的侍女檀棋」。两处出场，已真正成立。'],
]);

const mentionAt = new Map();   // 角色名 -> [节点 id]
for (const id of ids) {
  const sc = scenes[id];
  const chunks = [];
  if (typeof sc.text === 'string') chunks.push(sc.text);
  for (const ins of (sc.inserts || [])) if (typeof ins.text === 'string') chunks.push(ins.text);
  for (const v of (sc.variants || sc.textVariants || [])) if (typeof v.text === 'string') chunks.push(v.text);
  if (sc.choices) for (const c of sc.choices) if (c.t) chunks.push(c.t);
  const all = chunks.join('\n');
  for (const ch of Object.values(characters)) {
    const names = [ch.name, ...(ch.aliases || [])].filter(Boolean);
    if (names.some(n => all.includes(n))) {
      if (!mentionAt.has(ch.name)) mentionAt.set(ch.name, []);
      mentionAt.get(ch.name).push(id);
    }
  }
}
const neverSeen = [];
for (const ch of Object.values(characters)) {
  const at = [...new Set(mentionAt.get(ch.name) || [])];
  let level = null, hard = false;
  if (at.length === 0) { level = '正文里从未出现'; hard = false; }
  else if (at.length === 1 && scenes[at[0]]?.ending) { level = '只在结局里被点名'; hard = true; }
  else if (at.length === 1) { level = `只在 1 个非结局节点出现（${at[0]}）`; hard = false; }
  if (level) neverSeen.push({ name: ch.name, at, level, hard, ack: CHARACTER_ACK.get(ch.name) || null });
}
const unackedChars = neverSeen.filter(d => !d.ack);


// ===== 输出 =====
const only = process.argv[2];

console.log('--- 转场连续性审计 ---');
console.log(`  节点 ${ids.length} 个，边 ${edges.length} 条`);
console.log(`  换场（place 变化）${placeJumps.length} 条 · 跨时辰 ${hourJumps.length} 条 · 换视角 ${povJumps.length} 条`);
console.log('  ⚠️ 本工具只列出"换场了"，不判断"交代了没有" —— 那是人眼的事。');

if (hourMismatch.length) {
  console.log(`\n--- ❌ 正文自称的时辰与 node.hour 不符（${hourMismatch.length} 处）---`);
  hourMismatch.forEach(s => console.log('  ' + s));
} else {
  console.log(`\n--- ✅ 正文自称的时辰与 node.hour 一致 ---`);
}

console.log(`\n${'='.repeat(78)}`);
console.log('① 换场：place 变了，下面给出**下一节点的开场句** —— 看它有没有交代"怎么到这儿的"');
console.log('='.repeat(78));
const byPlace = new Map();
for (const j of placeJumps) {
  const k = `${j.a}  →  ${j.b}`;
  if (!byPlace.has(k)) byPlace.set(k, []);
  byPlace.get(k).push(j);
}
for (const [k, list] of byPlace) {
  console.log(`\n  ◆ ${k}   （${list.length} 条边）`);
  list.slice(0, 6).forEach(j => {
    console.log(`     ${j.from} → ${j.to}   [${hourLabel[j.hour]}]`);
    console.log(`        开场: ${j.open || '（无正文？）'}`);
  });
  if (list.length > 6) console.log(`     …余下 ${list.length - 6} 条同向边省略`);
}

if (only !== 'jumps') {
  console.log(`\n${'='.repeat(78)}`);
  console.log('② 跨时辰：node.hour 之间跳过了中间时辰');
  console.log('='.repeat(78));
  if (!hourJumps.length) {
    console.log('  ✅ 没有跨时辰的边 —— 每一步都落在相邻时辰');
  } else {
    hourJumps.forEach(j => {
      console.log(`  ${j.from} [${hourLabel[j.a]}] → ${j.to} [${hourLabel[j.b]}]`
        + `  跳过 ${j.skip - 1} 个时辰`);
      console.log(`     开场: ${j.open}`);
    });
  }

  console.log(`\n${'='.repeat(78)}`);
  console.log('③ 换视角：pov 变了 —— 读者会突然换了个身体');
  console.log('='.repeat(78));
  if (!povJumps.length) console.log('  ✅ 没有换视角的边');
  else povJumps.forEach(j => console.log(`  ${j.from} [${j.a}] → ${j.to} [${j.b}]   开场: ${j.open}`));
}

console.log(`\n${'='.repeat(78)}`);
console.log('④ 时辰推进表（按 node.hour 排，看主线是否单调向前）');
console.log('='.repeat(78));
for (const h of HOUR_ORDER) {
  const at = ids.filter(id => scenes[id].hour === h && !scenes[id].ending);
  if (!at.length) continue;
  const ch = at.filter(id => !isPassage(scenes[id]));
  const ps = at.filter(id => isPassage(scenes[id]));
  console.log(`  ${hourLabel[h]}  ${String(at.length).padStart(2)} 节点`
    + `   （抉择 ${ch.length} / 过场 ${ps.length}）`);
}

console.log(`\n${'='.repeat(78)}`);
console.log('⑤ 基座正文的条件依赖：某个 flag 不是"必然"，而本节点有插段依赖它');
console.log('='.repeat(78));
console.log('  意即：正文在**没有这个 flag** 的来路上也必须读得通。');
console.log('  "已接住" = 那条来路另有插段兜底（flagsNone 插段，或互斥兄弟各有插段）。');
console.log('  "已人工确认" = 有人把该节点正文通读过，并把结论写进了工具里的 CONFIRMED_OK。');
console.log('  "请看" = 那条来路没有任何插段、也没人确认过 —— 正文大概率在断言一件没发生的事。');
if (!condDeps.length) {
  console.log('  （没有"非必然 flag + 该节点有插段"的组合）');
} else {
  const okOnes = condDeps.filter(d => d.covered);
  console.log(`\n  合计 ${condDeps.length} 组：已接住 ${okOnes.length}`
    + ` · 已人工确认 ${confirmedOnes.length} · 请看 ${uncovered.length}`);
  if (uncovered.length) {
    console.log(`\n  --- ⚠️ 请看（${uncovered.length} 组）---`);
    uncovered.forEach(d => {
      console.log(`  [${d.id}] flag「${d.flag}」不是必然 —— 有的来路有它、有的没有。`);
      console.log(`     互斥兄弟: ${d.siblings.join(' / ') || '（找不到，可能不是选项 flag）'}`);
      console.log(`     正文开头: ${d.base || '（无）'}`);
      console.log(`     → 确认这句在**没有 ${d.flag}** 的来路上也成立；不成立就拆成 flagsAll / flagsNone 两条插段。`);
    });
  } else {
    console.log('\n  ✅ 没有"未接住且未确认"的来路');
  }
  if (confirmedOnes.length) {
    console.log(`\n  --- 已人工确认的明细（${confirmedOnes.length} 组）---`);
    confirmedOnes.forEach(d => {
      console.log(`  [${d.id}] ${d.flag}`);
      console.log(`     结论: ${d.confirmed}`);
    });
  }
  if (only === 'deps') {
    console.log(`\n  --- 已接住的明细（${okOnes.length} 组）---`);
    okOnes.forEach(d => console.log(`  [${d.id}] ${d.flag}  ← ${d.how}`));
  }
}

// 时辰自称不符是**硬错误**（读者当场能发现），要能让 CI 拦住。
// "未接住的条件依赖"也是硬错误：那条来路会读到一句矛盾的话。
// 换场/跨时辰只是"列出来给人看"，不判失败 —— 判断"交代了没有"是人的事。
console.log(`\n${'='.repeat(78)}`);
console.log('⑥ 人物出场检查：角色表里有、正剧里从没"演"过的人');
console.log('='.repeat(78));
console.log('  "只在结局里被点名" = 玩家到最后一屏才第一次听到这个名字，最严格的一档。');
if (!neverSeen.length) {
  console.log('  ✅ 角色表里每个人都在正剧里出现过');
} else {
  const hard = neverSeen.filter(d => d.hard);
  console.log(`\n  合计 ${neverSeen.length} 人：严格档 ${hard.length} · 其余为提示档`);
  neverSeen
    .sort((a, b) => (b.hard - a.hard) || a.at.length - b.at.length)
    .forEach(d => {
      console.log(`\n  ${d.hard ? '❌' : '⚠️'} ${d.name} —— ${d.level}`);
      if (d.at.length) console.log(`     出现于: ${d.at.join(', ')}`);
      if (d.ack) console.log(`     已确认: ${d.ack}`);
      else console.log('     → 未确认：请人读一遍，再把结论写进工具里的 CHARACTER_ACK。');
    });
}
if (only === 'deps') {
  console.log('  （⑥ 没有额外明细）');
}

// 时辰自称不符是**硬错误**（读者当场能发现），要能让 CI 拦住。
// "未接住的条件依赖"也是硬错误：那条来路会读到一句矛盾的话。
// "只在结局里被点名且无人确认"同样是硬错误：那一屏会凭空冒出一个陌生人。
// 换场/跨时辰/其余人物档位只是"列出来给人看" —— 判断"交代了够不够"是人的事。
process.exit(hourMismatch.length || uncovered.length || unackedChars.length ? 1 : 0);

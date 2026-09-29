// 剧情分叉审计：这个剧本到底有多少「真选择」？
//
// 背景：玩家反馈「选了『我凭什么听你的』，结果还是跟着去了靖安司」。
// 这说明存在「伪选择」——选项文案不同、但跳转目标完全一样，剧情照旧走。
//
// 本脚本量化三件事：
//   ① 每个节点的跳转目标集合 → 区分「真分叉」/「伪选择」
//   ② flag 的写入与读取比 → 有多少 flag 是"只写不读"的死标记
//   ③ 从起点到结局的必经主干长度 → 有多少节点是无论如何都要经过的
//
// 运行：node tools/branch_audit.mjs

import { scenes, START_SCENE, PROTAGONIST, ALLY_TRUST, isPassage, nextTargets } from '../../src/data/scenes.js';
import { characters } from '../../src/data/characters.js';

const ids = Object.keys(scenes);
const endings = ids.filter(i => scenes[i].ending);
const play = ids.filter(i => !scenes[i].ending);

// 过场场景（只有 next、没有 choices）**不是抉择点** —— 它没有任何选项，
// 所以既不该算"真分叉"也不该算"伪选择"。若把它算进分母，
// 「选择会留下后果的节点占比」会被无理由稀释掉。
const passages = play.filter(i => isPassage(scenes[i]));
const choicePoints = play.filter(i => !isPassage(scenes[i]));

// ===== ① 跳转目标分析 =====
// 一个选项的 to 可能是字符串，也可能是 [{when, then}] 条件路由，
// 后者要把它所有可能的 then 都算作潜在目标。
function targetsOf(ch) {
  const to = ch.to;
  if (typeof to === 'string') return [to];
  if (Array.isArray(to)) return to.map(r => r.then).filter(Boolean);
  return [null]; // 没有 to —— 引擎里会让剧情中断
}

// 先算清楚「哪些 flag 会被消费」——被 require / 路由 when / 插段 when 读取就算数。
// 一个选项哪怕不改变走向，只要它设的 flag 后面被读到了，读到的文本就会不同，
// 玩家能感觉出"我那次选择留下了东西"。所以判定要分三档，不能只看跳转目标。
const consumed = new Set();
const COND_KEYS = ['flagsAll', 'flagsAny', 'flagsNone'];
function markConsumed(cond) {
  if (!cond) return;
  COND_KEYS.forEach(k => { if (cond[k]) cond[k].forEach(f => consumed.add(f)); });
}
for (const id of ids) {
  const sc = scenes[id];
  (sc.choices || []).forEach(c => {
    markConsumed(c.require);
    if (Array.isArray(c.to)) c.to.forEach(r => markConsumed(r && r.when));
  });
  (sc.inserts || []).forEach(it => markConsumed(it && it.when));
  (sc.textVariants || []).forEach(v => markConsumed(v && v.when));
}

let trueBranch = [], traceBranch = [], fakeBranch = [], noTarget = [];
const rows = [];

for (const id of choicePoints) {
  const sc = scenes[id];
  const chs = sc.choices || [];
  const all = new Set();
  chs.forEach(c => targetsOf(c).forEach(t => all.add(t)));
  const distinct = [...all].filter(Boolean);
  const withTrace = chs.filter(c => c.flag && consumed.has(c.flag)).length;
  rows.push({ id, place: sc.place, hour: sc.hour, n: chs.length, targets: distinct, withTrace });

  if (chs.some(c => targetsOf(c)[0] === null)) noTarget.push(id);
  if (distinct.length >= 2) trueBranch.push(id);
  else if (withTrace > 0) traceBranch.push(id);
  else fakeBranch.push(id);
}

console.log('='.repeat(70));
console.log('① 分叉结构：选项是否真的把剧情导向不同地方');
console.log('='.repeat(70));
console.log(`  抉择点 ${choicePoints.length} 个   ·   过场场景 ${passages.length} 个   ·   结局 ${endings.length} 个\n`);
// 标记随数值变化，不要写死 —— 否则「无痕迹 0 个」会配着一个 ❌，
// 读起来像失败，其实 0 才是理想值。
const mark = (good) => (good ? '✅' : '⚠️ ');
console.log(`  ${mark(trueBranch.length > 0)} 真分叉（选项指向 ≥2 个不同节点）        ：${String(trueBranch.length).padStart(2)} 个`);
console.log(`  ◐  有痕迹（走向相同，但所设 flag 之后被读到）：${String(traceBranch.length).padStart(2)} 个`);
console.log(`  ${mark(fakeBranch.length === 0)} 无痕迹（走向相同，且没有任何后续后果）    ：${String(fakeBranch.length).padStart(2)} 个`);
if (noTarget.length) console.log(`  ⚠️  无 to 的节点：${noTarget.join(', ')}`);

const pctFake = (fakeBranch.length / choicePoints.length) * 100;
const pctReal = ((trueBranch.length + traceBranch.length) / choicePoints.length) * 100;
console.log(`\n  ➤ 完全没有后果的抉择点：${pctFake.toFixed(0)}%（${fakeBranch.length}/${choicePoints.length}）`);
console.log(`  ➤ 选择会留下某种后果的抉择点：${pctReal.toFixed(0)}%（${trueBranch.length + traceBranch.length}/${choicePoints.length}）`);

console.log('\n  有痕迹节点 —— 走向不变，但读到的内容随你怎么选而变：');
if (!traceBranch.length) console.log('    （无）');
traceBranch.forEach(id => {
  const r = rows.find(x => x.id === id);
  const names = (scenes[id].choices || []).filter(c => c.flag && consumed.has(c.flag)).map(c => c.flag);
  console.log(`    ${id.padEnd(16)} ${r.n} 选项，其中 ${r.withTrace} 个产生后果 → ${names.join(', ')}`);
});

console.log('\n  无痕迹节点清单（玩家会觉得"选什么都没用"）：');
if (!fakeBranch.length) console.log('    （无）');
fakeBranch.forEach(id => {
  const r = rows.find(x => x.id === id);
  console.log(`    ${id.padEnd(16)} ${String(r.place || '').padEnd(14)} ${r.n} 选项 → 全部指向 ${r.targets[0]}`);
});

console.log('\n  真分叉节点清单：');
trueBranch.forEach(id => {
  const r = rows.find(x => x.id === id);
  console.log(`    ${id.padEnd(16)} ${String(r.place || '').padEnd(14)} ${r.n} 选项 → ${r.targets.join(' / ')}`);
});

// ===== ② flag 只写不读 =====
// 「终局标记」单独排除：结局节点是流程终点，那里设的 flag 按定义不可能再被读到，
// 把它们算作死标记会虚增问题（就像批评一本书最后一页没有伏笔回收）。
const written = new Set();
const terminalFlags = new Set();
for (const id of play) {
  for (const c of (scenes[id].choices || [])) {
    if (!c.flag) continue;
    written.add(c.flag);
    const tg = targetsOf(c).filter(Boolean);
    if (tg.length && tg.every(t => scenes[t] && scenes[t].ending)) terminalFlags.add(c.flag);
  }
}
// 复用 ① 里算好的 consumed —— 它已经把 require / 路由 when / inserts / textVariants 全算进去了
const read = consumed;

console.log('\n' + '='.repeat(70));
console.log('② flag 写入 vs 读取：有多少标记是"只写不读"的死标记');
console.log('='.repeat(70));
console.log(`  被写入的 flag：${written.size} 个`);
console.log(`  被读取的 flag：${read.size} 个（被读取 = 选项 require / 路由 when / 剧情插段 when 引用到）`);
const dead = [...written].filter(f => !read.has(f) && !terminalFlags.has(f));
const terminalDead = [...written].filter(f => !read.has(f) && terminalFlags.has(f));
console.log(`  ➤ 死标记：${dead.length} 个（占 ${((dead.length / written.size) * 100).toFixed(0)}%）——写了之后没有任何后果`);
if (terminalDead.length) {
  console.log(`  （另有 ${terminalDead.length} 个终局标记，位于结局分支上，按定义无处可读，不计入死标记：`);
  console.log(`    ${terminalDead.join(', ')}）`);
}
console.log(`\n  仍是死标记的：${dead.length ? dead.join(', ') : '（无）'}`);

// ===== ③ 主干必经节点 =====
//
// ⚠️ 早先的写法是"顺着唯一出口走，遇到多出口就停"。加入过场场景后这个定义失效了：
//    现在**每个**抉择点的选项都通向不同的过场，于是它会在第一个节点就停下，
//    报出"主干长度 1"这种没有意义的结论。
//
// 换成一个不会随结构变化而失真的定义：
//    **不可绕过 = 从 start 出发，删掉它之后就没有任何一个结局还能到达。**
//    这才是玩家真正感知到的"主线"。
function reachFrom(start, banned) {
  const seen = new Set();
  const q = [start];
  while (q.length) {
    const cur = q.shift();
    if (cur === banned || seen.has(cur) || !scenes[cur]) continue;
    seen.add(cur);
    for (const t of nextTargets(scenes[cur])) if (t && scenes[t] && !seen.has(t)) q.push(t);
  }
  return seen;
}
const reachAll = reachFrom(START_SCENE, null);
const endingIds = [...endings];
const unavoidable = ids.filter(id => {
  if (!reachAll.has(id)) return false;
  if (id === START_SCENE) return true;
  if (scenes[id].ending) return true;
  const r = reachFrom(START_SCENE, id);
  return !endingIds.some(e => r.has(e));
});
// 按从起点出发的最短距离排序 —— 不可绕过节点本身就是一条链
const dist = new Map([[START_SCENE, 0]]);
{
  const q = [START_SCENE];
  while (q.length) {
    const cur = q.shift();
    for (const t of nextTargets(scenes[cur])) {
      if (t && scenes[t] && !dist.has(t)) { dist.set(t, dist.get(cur) + 1); q.push(t); }
    }
  }
}
unavoidable.sort((a, b) => (dist.get(a) ?? 1e9) - (dist.get(b) ?? 1e9));

console.log('\n' + '='.repeat(70));
console.log('③ 主干：从开始到结局，有哪些节点是无论如何都要经过的');
console.log('='.repeat(70));
const spineNodes = unavoidable.filter(i => !scenes[i].ending);
console.log(`  不可绕过的节点：${spineNodes.length} 个（非结局）+ ${unavoidable.length - spineNodes.length} 个结局`);
spineNodes.forEach(i => {
  const sc = scenes[i];
  const kind = isPassage(sc) ? '过场' : '抉择';
  console.log(`    ${i.padEnd(18)} ${kind}  ${String(sc.place || '').padEnd(16)} ${sc.hour || ''}`);
});
const avoidable = play.filter(i => !unavoidable.includes(i));
console.log(`\n  可绕过的场景：${avoidable.length} 个（${avoidable.filter(i => !isPassage(scenes[i])).length} 抉择点 + ${avoidable.filter(i => isPassage(scenes[i])).length} 过场）`);
console.log(`  → 这些就是"你选了才会走进去"的地方。`);

// ===== ④ 每个结局的独立路径数（粗估）=====
console.log('\n' + '='.repeat(70));
console.log('④ 结局可达性：不同结局是否真的靠不同选择区分');
console.log('='.repeat(70));
const h_hai = scenes['h_hai'];
if (h_hai) {
  console.log('  h_hai（灯楼对峙）的选项 → 目标：');
  (h_hai.choices || []).forEach((c, i) => {
    const cond = c.require ? `  需要 ${JSON.stringify(c.require)}` : '';
    const tg = Array.isArray(c.to) ? c.to.map(r => `${r.when ? JSON.stringify(r.when) + ' → ' : '(兜底) → '}${r.then}`).join('  |  ') : c.to;
    console.log(`    ${i + 1}. ${c.t.slice(0, 22)}…${cond}`);
    console.log(`        → ${tg}`);
  });
  const distinctEnds = new Set();
  (h_hai.choices || []).forEach(c => targetsOf(c).forEach(t => { if (scenes[t] && scenes[t].ending) distinctEnds.add(t); }));
  const earlierForks = choicePoints.filter(id => id !== 'h_hai' &&
    (scenes[id].choices || []).some(c => targetsOf(c).some(t => scenes[t] && scenes[t].ending)));
  console.log(`\n  结论：${endingIds.length} 个结局由「${h_hai.id}」的 ${(h_hai.choices || []).length} 个选项区分`
    + `（其中 ${distinctEnds.size} 个是真正的出口）。`);
  console.log(`        ${choicePoints.length - 1} 个更早的抉择点只通过 trust / flag 间接影响"能不能选"，不直接改变走向。`);
  if (earlierForks.length) {
    console.log(`        例外：${earlierForks.join(', ')} 也直接指向结局节点。`);
  }
}

// 无浏览器的剧情 / 测评回归模拟
//
// 作用：不去点浏览器，直接按 src/main.js 的同一套规则把整棵树走完，
//       统计「结局分布」与「MBTI 分布」，用来回答两个问题：
//         1) 每个结局是否真的可达？（剧情分支有没有变成摆设）
//         2) 随机乱选的 MBTI 分布是否接近 50/50？（测评有没有系统性偏向）
//
// 因为不依赖 playwright / Chrome，任何装了 Node 的机器都能跑：
//   node tools/simulate.mjs
//
// ⚠️ 这里的规则实现刻意与 src/main.js 保持一致。改动引擎的条件语义或计分逻辑时，
//    两边都要改，否则模拟结果就不再代表真实游戏。

import { scenes, START_SCENE, PROTAGONIST, ALLY_TRUST, isPassage } from '../../src/data/scenes.js';
import { characters } from '../../src/data/characters.js';
import { TRAITS, CHOICE_TRAITS, nodeMax } from '../../src/data/traits.js';
import { MBTI_DIMS, MBTI_CHOICE, computeMBTI, mbtiNodeStats } from '../../src/data/mbti.js';
import { checkNewUnlocks } from '../../src/data/puzzles.js';

const DIM_KEYS = MBTI_DIMS.map(d => d.key);

// ===== 状态机（对应 main.js 的 state / initState）=====
function newState() {
  const st = {
    sceneId: START_SCENE, flags: new Set(), clues: [], choicesMade: 0,
    trust: {}, hoursPassed: [],
    traitRaw: {}, traitMax: {},
    mbtiRaw: {}, mbtiBase: {}, mbtiHi: {}, mbtiLo: {}, mbtiItems: {},
  };
  for (const id in characters) st.trust[id] = characters[id].trust ?? 0;
  TRAITS.forEach(t => { st.traitRaw[t.key] = 0; st.traitMax[t.key] = 0; });
  DIM_KEYS.forEach(k => {
    st.mbtiRaw[k] = 0; st.mbtiBase[k] = 0;
    st.mbtiHi[k] = 0; st.mbtiLo[k] = 0; st.mbtiItems[k] = 0;
  });
  return st;
}

function countAllies(st) {
  let n = 0;
  for (const id in st.trust) {
    if (id === PROTAGONIST) continue;
    if (st.trust[id] >= ALLY_TRUST) n++;
  }
  return n;
}

function evalCond(st, cond) {
  if (!cond) return true;
  if (cond.flagsAll && !cond.flagsAll.every(f => st.flags.has(f))) return false;
  if (cond.flagsAny && !cond.flagsAny.some(f => st.flags.has(f))) return false;
  if (cond.flagsNone && cond.flagsNone.some(f => st.flags.has(f))) return false;
  if (cond.trust) {
    for (const id in cond.trust) if ((st.trust[id] ?? 0) < cond.trust[id]) return false;
  }
  if (typeof cond.allies === 'number' && countAllies(st) < cond.allies) return false;
  if (typeof cond.clues === 'number' && st.clues.length < cond.clues) return false;
  return true;
}

function resolveTo(st, to) {
  if (typeof to === 'string') return to;
  if (Array.isArray(to)) {
    for (const rule of to) if (!rule.when || evalCond(st, rule.when)) return rule.then;
  }
  return null;
}

function availableIdx(sc, st) {
  return (sc.choices || []).map((_, i) => i).filter(i => evalCond(st, sc.choices[i].require));
}

// ===== 过场场景：只有一条路，不是抉择（对应 main.js 的 advance）=====
// 刻意不计 choicesMade / 不累加六维与 MBTI —— 过场不是一次抉择。
function passageStep(st) {
  const sc = scenes[st.sceneId];
  if (sc.hour && !st.hoursPassed.includes(sc.hour)) st.hoursPassed.push(sc.hour);
  st.sceneId = sc.next;
}

// ===== 走一步（对应 main.js 的 choose）=====
function step(st, index) {
  const sc = scenes[st.sceneId];
  if (sc.hour && !st.hoursPassed.includes(sc.hour)) st.hoursPassed.push(sc.hour);
  st.choicesMade++;

  const avail = availableIdx(sc, st);

  const cap = nodeMax(st.sceneId, avail);
  TRAITS.forEach(t => { st.traitMax[t.key] += cap[t.key]; });
  const w = (CHOICE_TRAITS[st.sceneId] || [])[index];
  if (w) for (const k in w) st.traitRaw[k] += w[k];

  const stats = mbtiNodeStats(st.sceneId, avail);
  DIM_KEYS.forEach(k => {
    const s = stats[k];
    st.mbtiBase[k] += s.mean;
    st.mbtiHi[k] += s.max;
    st.mbtiLo[k] += s.min;
    if (s.max - s.min > 1e-9) st.mbtiItems[k] += 1;
  });
  const mw = (MBTI_CHOICE[st.sceneId] || [])[index];
  if (mw) for (const k in mw) st.mbtiRaw[k] += mw[k];

  const ch = sc.choices[index];
  if (ch.flag) st.flags.add(ch.flag);
  if (ch.clue && !st.clues.includes(ch.clue)) st.clues.push(ch.clue);
  if (ch.trust) {
    for (const id in ch.trust) st.trust[id] = (st.trust[id] ?? 0) + ch.trust[id];
  }

  // ===== 推理突破检查（对应 main.js 的 checkNewUnlocks）=====
  // 线索集齐阈值后，管线 reward flag 会在运行时点亮 —— 不建模这步，
  // 依赖 puzzle_* flag 的选项（如 h_hai 的推理突破线）就永远不可用。
  const newUnlocks = checkNewUnlocks(st.clues, st.flags);
  for (const p of newUnlocks) st.flags.add(p.reward.flag);

  st.sceneId = resolveTo(st, ch.to);
}

function play(pick, maxSteps = 120) {
  const st = newState();
  let guard = 0;
  while (scenes[st.sceneId] && !scenes[st.sceneId].ending && guard++ < maxSteps) {
    if (isPassage(scenes[st.sceneId])) { passageStep(st); continue; }
    const avail = availableIdx(scenes[st.sceneId], st);
    if (!avail.length) break;
    step(st, pick(st, avail, scenes[st.sceneId]));
  }
  return st;
}

function mbtiOf(st) {
  const stat = {};
  DIM_KEYS.forEach(k => {
    stat[k] = {
      mean: st.mbtiBase[k], max: st.mbtiHi[k],
      min: st.mbtiLo[k], n: st.mbtiItems[k],
    };
  });
  return computeMBTI(st.mbtiRaw, stat);
}

// ===== 策略 =====
// 通用策略：先补目标 flag，再在结局节点选目标选项，最后按信任度增益排序
function byFlagThenTrust(wantFlag, wantFlags, dir) {
  return (st, avail, sc) => {
    const hitFlag = avail.find(i => sc.choices[i].flag === wantFlag);
    if (hitFlag !== undefined && wantFlag) return hitFlag;
    if (wantFlags) {
      const hit = avail.find(i => wantFlags.includes(sc.choices[i].flag));
      if (hit !== undefined) return hit;
    }
    let best = avail[0], bestScore = -Infinity;
    for (const i of avail) {
      const t = sc.choices[i].trust || {};
      const s = Object.entries(t)
        .reduce((a, [id, v]) => a + (id === PROTAGONIST ? 0 : v), 0) * dir;
      if (s > bestScore) { bestScore = s; best = i; }
    }
    return best;
  };
}

const strategies = {
  '随机乱选': (st, avail) => avail[Math.floor(Math.random() * avail.length)],
  '总选第一项': (st, avail) => avail[0],
  '总选最后项': (st, avail) => avail[avail.length - 1],
  '总选第二项': (st, avail) => avail[Math.min(1, avail.length - 1)],
  '广结人脉': byFlagThenTrust('final_people', null, +1),
  '独行到底': byFlagThenTrust('final_fight', null, -1),
  '追查朝堂': byFlagThenTrust('final_persuade', ['chase_court'], +1),
};

// ===== 随机 3000 局：结局分布 + MBTI 分布 =====
const N = 3000;
const endCount = {};
const letterCount = {};
const tieCount = {};
DIM_KEYS.forEach(k => {
  letterCount[k] = {};
  tieCount[k] = 0;
});
const allyHist = {};
let tieDimRuns = 0;
let typeSet = new Set();

for (let n = 0; n < N; n++) {
  const st = play(strategies['随机乱选']);
  endCount[st.sceneId] = (endCount[st.sceneId] || 0) + 1;

  const a = countAllies(st);
  allyHist[a] = (allyHist[a] || 0) + 1;

  const r = mbtiOf(st);
  typeSet.add(r.type);
  r.dims.forEach(d => {
    letterCount[d.key][d.letter] = (letterCount[d.key][d.letter] || 0) + 1;
    if (d.resolved !== 'ok') tieCount[d.key]++;
  });
  if (r.ties.length) tieDimRuns++;
}

console.log(`===== 随机 ${N} 局 =====\n`);

console.log('【结局分布】');
Object.keys(scenes)
  .filter(id => scenes[id].ending)
  .forEach(id => {
    const c = endCount[id] || 0;
    const pct = ((c / N) * 100).toFixed(1);
    const bar = '#'.repeat(Math.round((c / N) * 40));
    console.log(`  ${scenes[id].endTag.padEnd(18)} ${String(c).padStart(5)}  ${pct.padStart(5)}%  ${bar}`);
  });

console.log('\n【MBTI 字母分布】（理想情况应接近各半）');
DIM_KEYS.forEach(k => {
  const d = MBTI_DIMS.find(x => x.key === k);
  const L = letterCount[k][d.left] || 0;
  const R = letterCount[k][d.right] || 0;
  const lp = ((L / N) * 100).toFixed(1);
  const rp = ((R / N) * 100).toFixed(1);
  const tied = ((tieCount[k] / N) * 100).toFixed(1);
  console.log(`  ${d.left}/${d.right}: ${d.left}=${String(L).padStart(5)} (${lp}%)  ` +
    `${d.right}=${String(R).padStart(5)} (${rp}%)   其中判为"无偏好" ${tied}%`);
});

console.log(`\n【同路人数分布】门槛 = 信任 >= ${ALLY_TRUST}`);
Object.keys(allyHist).sort((a, b) => a - b).forEach(a => {
  console.log(`  ${a} 人: ${allyHist[a]} 局 (${((allyHist[a] / N) * 100).toFixed(1)}%)`);
});

const anyTie = ((tieDimRuns / N) * 100).toFixed(1);
console.log(`\n【无偏好维度】${anyTie}% 的局里至少有一个维度落在 50/50`);
console.log(`【出现过的类型】${typeSet.size} / 16`);

// ===== 各确定性策略 =====
console.log('\n===== 策略对照（各跑 1 局）=====');
const reachable = new Set();
Object.entries(strategies).forEach(([name, pick]) => {
  const st = play(pick);
  const r = mbtiOf(st);
  reachable.add(st.sceneId);
  const endTag = scenes[st.sceneId] ? scenes[st.sceneId].endTag : st.sceneId;
  console.log(`  ${name.padEnd(6)} → ${endTag.padEnd(18)} | 类型 ${r.type} | ` +
    `同路人 ${countAllies(st)} | 抉择 ${st.choicesMade}`);
});
Object.keys(endCount).forEach(id => reachable.add(id));

// ===== 插段叠加审计 =====
// 同一节点里的多条插段是**同时生效**的（不是多选一），数组顺序就是读者看到的顺序。
// 所以最典型的文案事故是「两条互相打架的插段一起插入」——
// 例如「十七桶」和「你只砸开了八只，剩九只」并存。
// 静态检查抓不到这种语义矛盾，只能把"哪些条会一起出现"枚举出来人工过一眼。
//
// 做法：随机跑 N 局，每走到一个节点就记下当前生效的插段组合。
// 随机走能自然遵守可达性（不会把走不到的组合算进来），代价是极稀有组合可能漏掉。
function activeInserts(sc, st) {
  if (!Array.isArray(sc.inserts)) return [];
  const on = [];
  sc.inserts.forEach((it, i) => {
    if (!it.when || evalCond(st, it.when)) on.push(i);
  });
  return on;
}

const stackSeen = new Map(); // nodeId -> Map("0,3" -> {cnt, whens})
function stackSweep(runs) {
  const pick = strategies['随机乱选'];
  for (let n = 0; n < runs; n++) {
    const st = newState();
    let guard = 0;
    // ⚠️ 不要写成 `!scenes[st.sceneId].ending` 就跳出：
    //    结局节点同样有插段（e_final_people 有 5 条，按信任度点名），
    //    而且在结局处叠加最密。这里要「先审计当前节点，再看它是不是结局」，
    //    否则结局永远进不了叠加审计，等于漏掉风险最高的地方。
    while (scenes[st.sceneId] && guard++ < 120) {
      const sc = scenes[st.sceneId];
      const on = activeInserts(sc, st);
      if (on.length > 1) {
        if (!stackSeen.has(sc.id)) stackSeen.set(sc.id, new Map());
        const m = stackSeen.get(sc.id);
        const key = on.join(',');
        const rec = m.get(key) || { cnt: 0, whens: on.map(i => sc.inserts[i].when) };
        rec.cnt++;
        m.set(key, rec);
      }
      if (sc.ending) break;               // 结局节点审计完就停，不再往下走
      if (isPassage(sc)) { passageStep(st); continue; }   // 过场没有插段，直接过
      const avail = availableIdx(sc, st);
      if (!avail.length) break;
      step(st, pick(st, avail, sc));
    }
  }
}
stackSweep(N);

// 把条件压成一句人能读的话
function whenText(w) {
  if (!w) return '【无条件】';
  const bits = [];
  if (w.flagsAll) bits.push(w.flagsAll.join('+'));
  if (w.flagsAny) bits.push(w.flagsAny.join('|'));
  if (w.flagsNone) bits.push('非(' + w.flagsNone.join('|') + ')');
  if (w.trust) bits.push(Object.keys(w.trust).join('/') + '信任');
  if (w.allies !== undefined) bits.push(`同路人>=${w.allies}`);
  return bits.join(' ');
}

console.log('\n===== 插段叠加审计（随机 ' + N + ' 局）=====');
const stacked = [...stackSeen.entries()]
  .map(([id, m]) => {
    const combos = [...m.values()].sort((a, b) => b.cnt - a.cnt);
    return { id, combos, max: Math.max(...combos.map(c => c.whens.length)) };
  })
  .sort((a, b) => b.max - a.max || b.combos.length - a.combos.length);

if (!stacked.length) {
  console.log('  没有任何节点出现插段叠加 —— 每个节点的插段最多只有一条生效');
} else {
  const worst = stacked[0].max;
  console.log(`  最多同时生效 ${worst} 条；有 ${stacked.length} 个节点出现过叠加：\n`);
  stacked.forEach(({ id, combos, max }) => {
    const top = combos[0];
    const node = scenes[id];
    console.log(`  [${id}] 最多 ${max} 条，共 ${combos.length} 种组合，最常见 ${top.cnt} 局`);
    top.whens.forEach(w => console.log(`      · ${whenText(w)}`));
    // 无条件插段和条件插段同时出现，是文案矛盾的高危信号
    // （典型事故：「十七桶」与「你只砸开了八只」并存）。
    // 如果这个叠加是故意设计的，就在节点上写 stackAck 说明理由，把噪音关掉——
    // 不写理由直接忽略，等于把这个警告变成永远亮着的红灯。
    if (top.whens.some(w => !w) && top.whens.some(w => w)) {
      if (node && node.stackAck) {
        console.log(`      ✔ 已知叠加（节点已声明）：${node.stackAck}`);
      } else {
        console.log('      ⚠️ 无条件插段与条件插段同时生效 —— 请确认两者不矛盾');
      }
    }
  });
}

// ===== 断言：每个结局都必须可达 =====
const allEndings = Object.keys(scenes).filter(id => scenes[id].ending);
const unreachable = allEndings.filter(id => !reachable.has(id));

console.log('\n===== 结局可达性 =====');
allEndings.forEach(id => {
  const ok = reachable.has(id);
  console.log(`  ${ok ? '✅' : '❌'} ${scenes[id].endTag} (${id})`);
});

if (unreachable.length) {
  console.log(`\n❌ 有 ${unreachable.length} 个结局不可达 —— 剧情分支形同虚设：`);
  unreachable.forEach(id => console.log(`   ${id}`));
  process.exit(1);
}
console.log('\n✅ 全部结局均可达');

// 心理测量学审查（psychometric audit）
//
// 回答一个问题：这个「MBTI 测验」到底测到了什么、稳不稳、能不能跟别人比。
// 方法论上只看四件事，都是标准心理测量学的硬指标：
//
//   ① 内容覆盖  —— 每个维度到底有多少道题在起作用？（信度下限）
//   ② 基线一致性 —— 不同路径的「机会基线」是不是同一个？（跨人可比性）
//   ③ 分布形状  —— 结果百分比是「多数人靠近中间」的钟形，还是别的形状？
//   ④ 稳定性    —— 只改一个回答，类型会不会变？（重测信度的下界估计）
//
// 运行：node tools/psy_audit.mjs
// 它不依赖浏览器，与 src/main.js 共用同一套数据模块。

import { scenes, START_SCENE, PROTAGONIST, ALLY_TRUST, isPassage } from '../../src/data/scenes.js';
import { characters } from '../../src/data/characters.js';
import { TRAITS, nodeMax } from '../../src/data/traits.js';
import { MBTI_DIMS, MBTI_CHOICE, mbtiNodeStats, computeMBTI } from '../../src/data/mbti.js';

const DIM_KEYS = MBTI_DIMS.map(d => d.key);
const DIM_OF = Object.fromEntries(MBTI_DIMS.map(d => [d.key, d]));

// ===== 与 main.js 一致的走树逻辑（复制自 simulate.mjs，保持语义相同）=====
function newState() {
  const st = {
    sceneId: START_SCENE, flags: new Set(), clues: [], choicesMade: 0,
    trust: {}, hoursPassed: [], traitRaw: {}, traitMax: {},
    mbtiRaw: {}, mbtiBase: {}, mbtiHi: {}, mbtiLo: {}, mbtiItems: {},
  };
  for (const id in characters) st.trust[id] = characters[id].trust ?? 0;
  TRAITS.forEach(t => { st.traitRaw[t.key] = 0; st.traitMax[t.key] = 0; });
  DIM_KEYS.forEach(k => { st.mbtiRaw[k] = 0; st.mbtiBase[k] = 0; st.mbtiHi[k] = 0; st.mbtiLo[k] = 0; st.mbtiItems[k] = 0; });
  return st;
}
function countAllies(st) {
  let n = 0;
  for (const id in st.trust) if (id !== PROTAGONIST && st.trust[id] >= ALLY_TRUST) n++;
  return n;
}
function evalCond(st, cond) {
  if (!cond) return true;
  if (cond.flagsAll && !cond.flagsAll.every(f => st.flags.has(f))) return false;
  if (cond.flagsAny && !cond.flagsAny.some(f => st.flags.has(f))) return false;
  if (cond.flagsNone && cond.flagsNone.some(f => st.flags.has(f))) return false;
  if (cond.trust) for (const id in cond.trust) if ((st.trust[id] ?? 0) < cond.trust[id]) return false;
  if (typeof cond.allies === 'number' && countAllies(st) < cond.allies) return false;
  if (typeof cond.clues === 'number' && st.clues.length < cond.clues) return false;
  return true;
}
function resolveTo(st, to) {
  if (typeof to === 'string') return to;
  if (Array.isArray(to)) for (const r of to) if (!r.when || evalCond(st, r.when)) return r.then;
  return null;
}
function availableIdx(sc, st) {
  return (sc.choices || []).map((_, i) => i).filter(i => evalCond(st, sc.choices[i].require));
}
function step(st, index) {
  const sc = scenes[st.sceneId];
  if (sc.hour && !st.hoursPassed.includes(sc.hour)) st.hoursPassed.push(sc.hour);
  st.choicesMade++;
  const avail = availableIdx(sc, st);
  const cap = nodeMax(st.sceneId, avail);
  TRAITS.forEach(t => { st.traitMax[t.key] += cap[t.key]; });
  const stats = mbtiNodeStats(st.sceneId, avail);
  DIM_KEYS.forEach(k => {
    const s = stats[k];
    st.mbtiBase[k] += s.mean; st.mbtiHi[k] += s.max; st.mbtiLo[k] += s.min;
    if (s.max - s.min > 1e-9) st.mbtiItems[k] += 1;
  });
  const mw = (MBTI_CHOICE[st.sceneId] || [])[index];
  if (mw) for (const k in mw) st.mbtiRaw[k] += mw[k];
  const ch = sc.choices[index];
  if (ch.flag) st.flags.add(ch.flag);
  if (ch.clue && !st.clues.includes(ch.clue)) st.clues.push(ch.clue);
  if (ch.trust) for (const id in ch.trust) st.trust[id] = (st.trust[id] ?? 0) + ch.trust[id];
  st.sceneId = resolveTo(st, ch.to);
}

// 过场场景（只有 next、没有 choices）：不是抉择，不计分、不计题、不占 stepNo。
// ⚠️ 不处理它的话，availableIdx 会返回空数组、循环立刻 break ——
//    于是所有路径都在第一个过场处断掉，一局的 choicesMade 停在 1，
//    整个心理测量学审计会输出一堆看似正常、其实毫无意义的数字。
function passageStep(st) {
  const sc = scenes[st.sceneId];
  if (sc.hour && !st.hoursPassed.includes(sc.hour)) st.hoursPassed.push(sc.hour);
  st.sceneId = sc.next;
}

// 走完一局。pick(st, avail, sc, stepNo) 返回选项下标；
// deviateAt/deviateTo 用于「只改一个回答」的扰动实验（§④）。
// stepNo 只数**抉择点**（与 dump_play.py 的 seq 序号同一口径），
// 所以中途插入过场场景不会让扰动实验整体错位。
function play(pick, deviateAt = -1, deviateTo = -1, maxSteps = 120) {
  const st = newState();
  let guard = 0, stepNo = 0;
  while (scenes[st.sceneId] && !scenes[st.sceneId].ending && guard++ < maxSteps) {
    if (isPassage(scenes[st.sceneId])) { passageStep(st); continue; }
    const avail = availableIdx(scenes[st.sceneId], st);
    if (!avail.length) break;
    let idx;
    if (stepNo === deviateAt) {
      // 强制走另一条：在「除原答案之外」的选项里挑一个
      const others = avail.filter(i => i !== deviateTo);
      idx = others.length ? others[Math.floor(Math.random() * others.length)] : avail[0];
    } else {
      idx = pick(st, avail, scenes[st.sceneId], stepNo);
    }
    step(st, idx);
    stepNo++;
  }
  return st;
}
function mbtiOf(st) {
  const stat = {};
  DIM_KEYS.forEach(k => { stat[k] = { mean: st.mbtiBase[k], max: st.mbtiHi[k], min: st.mbtiLo[k], n: st.mbtiItems[k] }; });
  return computeMBTI(st.mbtiRaw, stat);
}

const line = (s = '') => console.log(s);
const N = 2000;

// ============================================================
// ① 内容覆盖：每个维度有多少道「有区分度」的题
// ============================================================
const itemRuns = {};
const pathLens = [];
DIM_KEYS.forEach(k => { itemRuns[k] = []; });
for (let n = 0; n < N; n++) {
  const st = play((s, a) => a[Math.floor(Math.random() * a.length)]);
  DIM_KEYS.forEach(k => itemRuns[k].push(st.mbtiItems[k]));
  pathLens.push(st.choicesMade);
}
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
// 一次通关要做多少个抉择 —— 当"满分题量"的分母。不要写死：剧情一改这个数就变了。
const ROUND = Math.max(...pathLens);

line('='.repeat(64));
line(`① 内容覆盖：每个维度的有效题量（满分 ${ROUND} 道抉择）`);
line('='.repeat(64));

DIM_KEYS.forEach(k => {
  const d = DIM_OF[k];
  const arr = itemRuns[k];
  const lo = Math.min(...arr), hi = Math.max(...arr);
  line(`  ${d.left}/${d.right}  有效题量 均值 ${mean(arr).toFixed(1)}  范围 ${lo}~${hi}  / ${ROUND}`);
});

// 全剧抉择总数 —— 同样不写死
let totalItems = 0;
for (const sid in MBTI_CHOICE) totalItems += MBTI_CHOICE[sid].length;

// 每个维度的总权重幅度（题目的「力度」总和）
line('\n  题目力度（该维度所有权重绝对值的总和，越大 = 区分能力越强）：');
DIM_KEYS.forEach(k => {
  let absSum = 0, nonzero = 0;
  for (const sid in MBTI_CHOICE) {
    for (const w of MBTI_CHOICE[sid]) {
      const v = w && w[k];
      if (typeof v === 'number' && v !== 0) { absSum += Math.abs(v); nonzero++; }
    }
  }
  line(`  ${k}  |w|总和 ${String(absSum).padStart(4)}   有信号选项数 ${String(nonzero).padStart(3)} / ${totalItems}`);
});

// ============================================================
// ② 基线一致性：不同路径的「机会零点」是不是同一个
// ============================================================
line('\n' + '='.repeat(64));
line('② 基线一致性：跨路径的「机会基线」波动（越稳 = 跨人越可比）');
line('='.repeat(64));

const baseSamples = {};
DIM_KEYS.forEach(k => { baseSamples[k] = []; });
for (let n = 0; n < N; n++) {
  const st = play((s, a) => a[Math.floor(Math.random() * a.length)]);
  DIM_KEYS.forEach(k => {
    baseSamples[k].push({ mean: st.mbtiBase[k], hi: st.mbtiHi[k], lo: st.mbtiLo[k] });
  });
}
const cv = (arr, f) => {
  const v = arr.map(f);
  const m = mean(v);
  const sd = Math.sqrt(mean(v.map(x => (x - m) ** 2)));
  return { m, sd, cv: m !== 0 ? Math.abs(sd / m) : Infinity, lo: Math.min(...v), hi: Math.max(...v) };
};
DIM_KEYS.forEach(k => {
  const d = DIM_OF[k];
  const s0 = cv(baseSamples[k], x => x.mean);
  const s1 = cv(baseSamples[k], x => x.hi - x.lo);
  line(`  ${d.left}/${d.right}  零点(mean) ${s0.m.toFixed(2)} ± ${s0.sd.toFixed(2)}  变异系数 ${(s0.cv * 100).toFixed(1)}%`);
  line(`        区分幅度(max-min) 均值 ${s1.m.toFixed(2)}  范围 ${s1.lo}~${s1.hi}`);
});

// 关键换算：基线的跨路径波动，等价于多少「百分点」的测量噪声？
//   leftPct = 50 + 50 × dev / upRoom，而 dev = raw − mean
//   基线自己漂 Δ，就等于 raw 反向漂 Δ → 百分点漂移 ≈ 50 × Δ / upRoom
//   而 upRoom ≈ (max−min)/2，所以 ≈ 100 × SD(mean) / 区分幅度
line('\n  换算：基线漂移 = 多少「百分点」的测量噪声（可直接与量表 SD 比较）');
const noisePct = {};
DIM_KEYS.forEach(k => {
  const d = DIM_OF[k];
  const s0 = cv(baseSamples[k], x => x.mean);
  const spread = cv(baseSamples[k], x => x.hi - x.lo).m;
  const nz = (100 * s0.sd) / spread;
  noisePct[k] = nz;
  line(`    ${d.left}/${d.right}  ≈ ${nz.toFixed(2)} 个百分点`);
});
line('  （理想量表中，这条噪声应为 0 —— 每个人的题目集必须相同）');

// ============================================================
// ③ 分布形状：真实人格维度应是「多数人靠近中间」的单峰钟形
// ============================================================
line('\n' + '='.repeat(64));
line('③ 结果分布形状（真实特质应中间高、两侧低）');
line('='.repeat(64));

const pctSamples = {};
DIM_KEYS.forEach(k => { pctSamples[k] = []; });
let satur = 0, totalDims = 0, nearMid = 0;
for (let n = 0; n < N; n++) {
  const st = play((s, a) => a[Math.floor(Math.random() * a.length)]);
  const r = mbtiOf(st);
  r.dims.forEach(d => {
    pctSamples[d.key].push(d.leftPct);
    totalDims++;
    if (d.leftPct === 0 || d.leftPct === 100) satur++;
    if (Math.abs(d.leftPct - 50) <= 10) nearMid++;  // 40~60 的「脆弱区」
  });
}
const BINS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
DIM_KEYS.forEach(k => {
  const d = DIM_OF[k];
  const arr = pctSamples[k];
  const counts = new Array(10).fill(0);
  arr.forEach(p => { counts[Math.min(9, Math.floor(p / 10))]++; });
  line(`\n  ${d.left}/${d.right}  左侧占比分布（x 轴 ${d.left}% ← → ${d.right}%）：`);
  for (let i = 0; i < 10; i++) {
    const pct = (counts[i] / arr.length) * 100;
    line(`    ${String(BINS[i]).padStart(3)}-${String(BINS[i + 1]).padStart(3)}%  ${pct.toFixed(1).padStart(5)}%  ${'#'.repeat(Math.round(pct))}`);
  }
  const m = mean(arr);
  const sd = Math.sqrt(mean(arr.map(x => (x - m) ** 2)));
  line(`    均值 ${m.toFixed(1)}  标准差 ${sd.toFixed(1)}（真实量表常见 SD≈15~20，且中间高）`);
});

line(`\n  恰好落在极端 0% / 100% 的维度比例：${((satur / totalDims) * 100).toFixed(1)}%`);
line(`  落在 40%~60% 「脆弱区」（差一两个回答就会翻面）的维度比例：${((nearMid / totalDims) * 100).toFixed(1)}%`);

// ============================================================
// ④ 稳定性：只改「一个」回答，类型会不会翻
// ============================================================
line('\n' + '='.repeat(64));
line('④ 稳定性（重测信度下界）：只改 1 个回答 → 类型是否翻面');
line('='.repeat(64));

// 造一个「有稳定偏好的人」：θ 是该人在 4 个维度上的潜在倾向（左右方向 + 强度）
// 他的答题规则是确定的：选最符合自己倾向的选项。因此两次作答的差异
// 完全来自「某一个回答被改写」，而不是随机噪声。
function makePerson() {
  const theta = {};
  DIM_KEYS.forEach(k => {
    // 正态化的潜在倾向，sd=0.6 —— 大多数人偏温和，少数人很极端
    let g = 0;
    for (let i = 0; i < 6; i++) g += Math.random();
    theta[k] = (g - 3) / Math.sqrt(0.5) * 0.6;
  });
  return theta;
}
function pickByTheta(theta) {
  return (st, avail, sc) => {
    let best = avail[0], bestV = -Infinity;
    for (const i of avail) {
      const w = (MBTI_CHOICE[sc.id] || [])[i] || {};
      let v = 0;
      for (const k of DIM_KEYS) v += (theta[k] || 0) * (w[k] || 0);
      if (v > bestV) { bestV = v; best = i; }
    }
    return best;
  };
}

const M = 1500;
let typeFlip = 0, dimFlipTotal = 0, dimCount = 0, pctShift = [];
const perDimFlip = {};
DIM_KEYS.forEach(k => { perDimFlip[k] = 0; });

for (let m = 0; m < M; m++) {
  const theta = makePerson();
  const pick = pickByTheta(theta);

  // 第一次作答
  const stA = play(pick);
  const rA = mbtiOf(stA);

  // 随机挑一步，强制换一个答案，其余照旧
  const k = Math.floor(Math.random() * Math.max(1, stA.choicesMade - 1));
  const stB = play(pick, k, -1);           // deviateTo=-1 → 一定选「别的」选项
  const rB = mbtiOf(stB);

  if (rA.type !== rB.type) typeFlip++;

  rA.dims.forEach((d, i) => {
    dimCount++;
    if (d.letter !== rB.dims[i].letter) { dimFlipTotal++; perDimFlip[d.key]++; }
    pctShift.push(Math.abs(d.leftPct - rB.dims[i].leftPct));
  });
}

line(`\n  样本：${M} 位「虚拟被试」，每人作答 2 次，两次之间只改 1 个回答`);
line(`  ➤ 整体类型（4 字母）一致率：${(((M - typeFlip) / M) * 100).toFixed(1)}%   （即 ${((typeFlip / M) * 100).toFixed(1)}% 的人换了类型）`);
line(`  ➤ 单个维度一致率：${(((dimCount - dimFlipTotal) / dimCount) * 100).toFixed(1)}%`);
line('');
line('  各维度翻面率：');
DIM_KEYS.forEach(k => {
  const d = DIM_OF[k];
  line(`    ${d.left}/${d.right}  ${((perDimFlip[k] / M) * 100).toFixed(1)}%`);
});
pctShift.sort((a, b) => a - b);
line('');
line(`  百分比变动：中位数 ${pctShift[Math.floor(pctShift.length / 2)].toFixed(1)} 点，` +
  `均值 ${mean(pctShift).toFixed(1)} 点，最大 ${pctShift[pctShift.length - 1]}`);

// 上面是「题目全同、只换一个答案」——这是重测信度的**乐观上界**。
// 真实的重复测量里，人自身也会漂：心情、语境、对题目的理解都会变。
// 所以再补一个「同一个人隔一阵子再测」的模型：潜在倾向 θ 本身加一点扰动。
line('\n  ── 补充：同一个人「隔一阵子再测」（潜在倾向自身也会漂）──');
line('  σ 表示该人各维度倾向的漂移幅度（相对 θ 自身标准差的倍数）');
line('  σ=0 即上一节的「只改一个回答」；σ 越大 = 两次作答之间人变得越多\n');
line('    σ       类型一致率    单维一致率');
for (const sigma of [0.1, 0.2, 0.3, 0.5]) {
  let flip = 0, dFlip = 0, dAll = 0;
  const TRIALS = 1200;
  for (let m = 0; m < TRIALS; m++) {
    const theta0 = makePerson();
    const sdTheta = Math.sqrt(mean(DIM_KEYS.map(k => theta0[k] ** 2)));
    const drift = {};
    DIM_KEYS.forEach(k => {
      let g = 0;
      for (let i = 0; i < 6; i++) g += Math.random();
      drift[k] = ((g - 3) / Math.sqrt(0.5)) * sdTheta * sigma;
    });
    const theta1 = {};
    DIM_KEYS.forEach(k => { theta1[k] = theta0[k] + drift[k]; });

    const rA = mbtiOf(play(pickByTheta(theta0)));
    const rB = mbtiOf(play(pickByTheta(theta1)));
    if (rA.type !== rB.type) flip++;
    rA.dims.forEach((d, i) => { dAll++; if (d.letter !== rB.dims[i].letter) dFlip++; });
  }
  line(`    ${sigma.toFixed(2)}      ${(((TRIALS - flip) / TRIALS) * 100).toFixed(1)}%        ${(((dAll - dFlip) / dAll) * 100).toFixed(1)}%`);
}

// ============================================================
// ⑤ 结构效度：这 4 个维度真的彼此可分吗？
// ============================================================
// 一个正规模表必须先做因子分析，确认「题目真的聚成 4 个维度」。
// 我们没有做。但至少能验一件事：4 个维度的权重向量是否高度共线 ——
// 若两个维度在题目上几乎同涨同落，那它们根本不是两个维度。
line('\n' + '='.repeat(64));
line('⑤ 结构效度：4 个维度的权重是否彼此独立（判别效度）');
line('='.repeat(64));

// 把 64 道题的权重排成矩阵：行 = 题目，列 = 4 个维度
const rows = [];
for (const sid in MBTI_CHOICE) {
  for (const w of MBTI_CHOICE[sid]) {
    rows.push(DIM_KEYS.map(k => (w && typeof w[k] === 'number') ? w[k] : 0));
  }
}
const cols = DIM_KEYS.map((_, j) => rows.map(r => r[j]));
function pearson(a, b) {
  const ma = mean(a), mb = mean(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2;
  }
  return (da > 0 && db > 0) ? num / Math.sqrt(da * db) : 0;
}
line(`\n  题目数 ${rows.length}，维度相关矩阵（Pearson r）：\n`);
line('        ' + DIM_KEYS.map(k => k.padStart(7)).join(''));
DIM_KEYS.forEach((ki, i) => {
  const cells = DIM_KEYS.map((kj, j) => pearson(cols[i], cols[j]).toFixed(2).padStart(7));
  line(`  ${ki.padEnd(6)}` + cells.join(''));
});
let maxOff = 0, maxPair = '';
DIM_KEYS.forEach((ki, i) => DIM_KEYS.forEach((kj, j) => {
  if (i < j) { const r = Math.abs(pearson(cols[i], cols[j])); if (r > maxOff) { maxOff = r; maxPair = ki + '~' + kj; } }
}));
line(`\n  最大跨维度相关：${maxPair}  r = ${maxOff.toFixed(2)}`);
line('  判据：|r| 越小越好。<0.3 基本独立；>0.5 说明两维在测同一件事。');

// 多维度同时加分的题（double-barreled item）—— 一道题同时改 4 个维度，
// 无法归因到底是哪一维在起作用，是测量上的杂质来源。
let multi = 0, singleMax = 0;
for (const r of rows) {
  const nz = r.filter(v => v !== 0).length;
  if (nz >= 2) multi++;
  singleMax = Math.max(singleMax, nz);
}
line(`\n  「一题同时改 ≥2 个维度」的题目：${multi} / ${rows.length}（${((multi / rows.length) * 100).toFixed(0)}%）`);
line(`  单题最多同时改动的维度数：${singleMax}`);
line('  （量表设计上这叫 double-barreled item，会让维度归属变得难以解释）');

// ============================================================
// 参考基准
// ============================================================
line('\n' + '='.repeat(64));
line('参考基准（文献报道的 MBTI 实测值）');
line('='.repeat(64));
line('  · MBTI 4~5 周重测：约 50% 的人拿到不同类型的 4 字母结果');
line('    （Pittenger 1993；多项后续研究复现）');
line('  · 单个维度重测一致率约 65%~85%（各研究不一）');
line('  · 大五人格（NEO-PI-R / BFI-2）重测 r ≈ 0.70~0.85');
line('  · MBTI 各维度在人群中近似「单峰」而非「双峰」——');
line('    即大多数人的真实特质在中间，所谓"类型"是中位数切分的产物');
line('');

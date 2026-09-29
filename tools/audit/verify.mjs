// 剧情树 / 数据契约 校验
// 覆盖：节点连通性、时辰合法性、条件表达式、条件路由、人格权重、MBTI 权重、
//      16 型定义、角色向量，以及"不留死路"（每个节点至少一个无条件选项）。
import { scenes, START_SCENE, PROTAGONIST, ALLY_TRUST, isPassage, nextTargets } from '../../src/data/scenes.js';
import { characters, hours } from '../../src/data/characters.js';
import { TRAITS, CHOICE_TRAITS, CHARACTER_TRAITS } from '../../src/data/traits.js';
import { MBTI_DIMS, MBTI_TYPES, MBTI_CHOICE, CHARACTER_MBTI } from '../../src/data/mbti.js';
import { PUZZLE_PIPELINES } from '../../src/data/puzzles.js';

let errors = [];
let warnings = [];

const ids = Object.keys(scenes);
const hourKeys = new Set(hours.map(h => h.key));
const charIds = new Set(Object.keys(characters));

// 条件表达式允许的键（与 scenes.js 顶部注释保持一致）
const COND_KEYS = new Set(['flagsAll', 'flagsAny', 'flagsNone', 'trust', 'allies', 'clues']);
const FLAG_KEYS = ['flagsAll', 'flagsAny', 'flagsNone'];

// 取一个选项的全部跳转目标：字符串 = 固定节点；数组 = 条件路由
function targetsOf(ch) {
  if (typeof ch.to === 'string') return [ch.to];
  if (Array.isArray(ch.to)) return ch.to.map(r => r && r.then).filter(Boolean);
  return [];
}

const isFree = (ch) => !ch.require;

// 全剧所有可设置的 flag（用于查"幽灵条件"）
const allFlags = new Set();
ids.forEach(id => (scenes[id].choices || []).forEach(ch => { if (ch.flag) allFlags.add(ch.flag); }));
// 推理解谜管线的 reward flag：运行时由 checkNewUnlocks 动态设置（不是静态 choice.flag），
// 同样是"可设置"的，不能当成幽灵条件。
PUZZLE_PIPELINES.forEach(p => allFlags.add(p.reward.flag));

// 条件里被引用到的 flag
const usedFlags = new Set();

function collectFlags(cond) {
  if (!cond) return;
  FLAG_KEYS.forEach(key => (cond[key] || []).forEach(f => usedFlags.add(f)));
}

function checkCond(cond, where) {
  if (!cond) return;
  for (const k of Object.keys(cond)) {
    if (!COND_KEYS.has(k)) errors.push(`${where} 条件键未知: ${k}`);
  }
  FLAG_KEYS.forEach(key => {
    if (cond[key] !== undefined && !Array.isArray(cond[key])) {
      errors.push(`${where} ${key} 必须是数组`);
    }
  });
  if (cond.trust) {
    for (const cid in cond.trust) {
      if (!charIds.has(cid)) errors.push(`${where} trust 条件引用未知角色: ${cid}`);
      if (typeof cond.trust[cid] !== 'number') errors.push(`${where} trust.${cid} 必须是数字`);
    }
  }
  ['allies', 'clues'].forEach(key => {
    if (cond[key] !== undefined && typeof cond[key] !== 'number') {
      errors.push(`${where} ${key} 必须是数字`);
    } else if (key === 'allies' && cond[key] !== undefined && cond[key] < 1) {
      warnings.push(`${where} allies 条件值为 ${cond[key]}，起不到门控作用`);
    }
  });
}

// ===== 1. 节点结构 / 跳转目标 / 条件表达式 =====
let conditionalCount = 0;
let routerCount = 0;
const passageIds = [];

for (const id of ids) {
  const sc = scenes[id];
  if (sc.ending) {
    if (!sc.endTag) errors.push(`[${id}] 结局节点缺少 endTag`);
    if (!sc.endingText) warnings.push(`[${id}] 结局节点缺少 endingText`);
    continue;
  }
  if (isPassage(sc)) {
    // 过场场景：没有 choices，只有一个 next。它不是一个抉择点。
    passageIds.push(id);
    if (!scenes[sc.next]) errors.push(`[${id}] next 指向不存在的节点: ${sc.next}`);
    if (sc.choices) {
      errors.push(`[${id}] 同时写了 next 和 choices —— 过场场景只能有一个出口，请二选一`);
    }
    if (sc.next === id) errors.push(`[${id}] next 指向自己（会原地卡死）`);
    if (!sc.nextLabel) warnings.push(`[${id}] 过场场景没写 nextLabel —— 按钮会显示默认的「继续」`);
    continue;
  }
  if (!sc.choices || !sc.choices.length) {
    errors.push(`[${id}] 非结局节点既没有 choices 也没有 next（会卡死）`);
    continue;
  }

  // 硬规则：至少留一个无条件选项，否则所有条件都不成立时玩家会卡死
  if (!sc.choices.some(isFree)) {
    errors.push(`[${id}] 所有选项都带 require —— 条件全不成立时玩家会卡死，必须留一个无条件选项`);
  }

  sc.choices.forEach((ch, i) => {
    const at = `[${id}] 第${i + 1}个选项`;
    if (!ch.t) errors.push(`${at} 缺少文本 t`);

    if (!ch.to) {
      errors.push(`${at} 缺少 to`);
    } else {
      targetsOf(ch).forEach(t => {
        if (!scenes[t]) errors.push(`${at} 指向不存在的节点: ${t}`);
      });
      if (Array.isArray(ch.to)) {
        routerCount++;
        const last = ch.to[ch.to.length - 1];
        if (!last || last.when) {
          warnings.push(`${at} 条件路由最后一项带 when —— 建议留一条无条件兜底分支`);
        }
        ch.to.forEach((r, ri) => {
          if (!r || !r.then) errors.push(`${at} 路由第${ri + 1}条缺少 then`);
          checkCond(r && r.when, `${at} 路由第${ri + 1}条`);
          collectFlags(r && r.when);
        });
      }
    }

    if (ch.trust) {
      for (const cid in ch.trust) {
        if (!charIds.has(cid)) errors.push(`${at} trust 引用未知角色: ${cid}`);
      }
    }

    if (ch.require) {
      conditionalCount++;
      checkCond(ch.require, `${at} require`);
      collectFlags(ch.require);
      if (!ch.requireHint) {
        warnings.push(`${at} 带 require 但没有 requireHint —— 玩家看不到解锁线索`);
      }
    }
  });
}

// ===== 0b. 成对符号是否配对 =====
// 「」和“”在中文长正文里最容易漏掉一个（尤其手写对话时），而且**看不到**：
// 少一个「，浏览器照样渲染，玩家只觉得这句读着怪。这类错字只会静默上线。
// 括号与书名号同理（“（）”“《》”混用时会漏）。
const PAIRS = [['「', '」'], ['“', '”'], ['（', '）'], ['《', '》']];
function checkPaired(where, s) {
  if (typeof s !== 'string' || !s) return;
  for (const [open, close] of PAIRS) {
    const a = s.split(open).length - 1;
    const b = s.split(close).length - 1;
    if (a !== b) errors.push(`${where} 的 ${open}${close} 不配对（${open} ${a} 个，${close} ${b} 个）`);
  }
}

// ===== 1b. 条件正文：inserts（段落插入）与 textVariants（整段重写）=====
// inserts:      [{ when, text }]  插到正文里 {{inserts}} 标记的位置；可多条叠加
// textVariants: [{ when, text }]  取第一个 when 成立者，整段替换
//
// ⚠️ 定位方式：节点正文里写 {{inserts}} 作为插入点。
//    不写标记时会退化为「追加到全文末尾」——通常不是你想要的，所以这里给警告。
let variantCount = 0, variantNodes = 0;
let insertCount = 0, insertNodes = 0;
let anchorNodes = 0;
const INSERT_MARK = '{{inserts}}';

for (const id of ids) {
  const sc = scenes[id];

  // 成对符号：正文 / 整段重写 / 插段 / 选项文案，全部过一遍。
  checkPaired(`[${id}] 正文`, sc.text);
  (sc.textVariants || []).forEach((v, vi) => checkPaired(`[${id}] 整段重写第${vi + 1}条`, v && v.text));
  (sc.inserts || []).forEach((it, ii) => checkPaired(`[${id}] 插段第${ii + 1}条`, it && it.text));
  (sc.choices || []).forEach((ch, ci) => checkPaired(`[${id}] 选项${ci + 1}的文案`, ch && ch.t));

  if (sc.inserts !== undefined) {
    insertNodes++;
    const at = `[${id}] inserts`;
    if (!Array.isArray(sc.inserts)) {
      errors.push(`${at} 必须是数组`);
    } else if (!sc.inserts.length) {
      warnings.push(`${at} 是空数组，等价于没写`);
    } else {
      sc.inserts.forEach((it, ii) => {
        const iat = `${at} 第${ii + 1}条`;
        if (!it || typeof it.text !== 'string' || !it.text.trim()) errors.push(`${iat} 缺少 text`);
        if (it && it.pos !== undefined) {
          warnings.push(`${iat} 仍带 pos 字段 —— 定位已改为正文里的 ${INSERT_MARK} 标记，pos 不再生效`);
        }
        if (it && !it.when) {
          warnings.push(
            `${iat} 没有 when —— 它会跟同节点其它插段**同时**插入。` +
            `确认它不跟条件插段打架（例如「只剩九只」与「十七桶」必须互斥），` +
            `需要时用 flagsNone 把它排除掉`
          );
        }
        checkCond(it && it.when, iat);
        collectFlags(it && it.when);
        insertCount++;
      });
    }
    if (!sc.text) errors.push(`${at} 所在节点缺少默认 text`);
    // 标记校验：有插段就该有插入点；标记只能有一个（多余的会被引擎剥掉）
    if (typeof sc.text === 'string') {
      const nMark = sc.text.split(INSERT_MARK).length - 1;
      if (nMark === 0) {
        warnings.push(`${at} 所在节点正文没有 ${INSERT_MARK} 标记 —— 插段会一律追加到全文末尾`);
      } else {
        anchorNodes++;
        if (nMark > 1) {
          warnings.push(`${at} 所在节点正文有 ${nMark} 个 ${INSERT_MARK} 标记 —— 只有第一个会被填入，其余会被剥掉`);
        }
      }
    }
  }

  if (sc.textVariants !== undefined) {
    variantNodes++;
    const at = `[${id}] textVariants`;
    if (!Array.isArray(sc.textVariants)) {
      errors.push(`${at} 必须是数组`);
      continue;
    }
    if (!sc.textVariants.length) {
      warnings.push(`${at} 是空数组，等价于没写`);
      continue;
    }
    sc.textVariants.forEach((v, vi) => {
      const vat = `${at} 第${vi + 1}条`;
      if (!v || typeof v.text !== 'string' || !v.text.trim()) errors.push(`${vat} 缺少 text`);
      checkCond(v && v.when, vat);
      collectFlags(v && v.when);
      variantCount++;
    });
    const last = sc.textVariants[sc.textVariants.length - 1];
    if (last && last.when) {
      warnings.push(`${at} 最后一条带 when —— 所有条件都不成立时会回退到默认 text，确认这是你要的`);
    }
    if (!sc.text) {
      errors.push(`${at} 所在节点缺少默认 text（无匹配变体时会渲染空白）`);
    }
  }
}

// 条件引用的 flag 必须真的有地方设置
const ghostFlags = [...usedFlags].filter(f => !allFlags.has(f));
if (ghostFlags.length) {
  errors.push(`条件引用了不存在（无人设置）的 flag: ${ghostFlags.join(', ')}`);
}

// ===== 2. hour / text / pov =====
// pov 会显示在侧栏「当前视角」里（见 main.js renderSide），所以它必须真的是叙述者。
// 这里用一个可靠的经验判据：本作全部正文都是第二人称「你」= 张小敬，
// 因此如果一个节点自称 pov=X，而正文里出现了 X 的名字（第三人称指代），
// 那叙述者就不可能是 X —— 侧栏会当场说错话。
// 真实事故：s1_meet / s1_task / h_chou / h_chen / h_wu / h_wei 六个节点都标了别人，
// 正文却是张小敬视角，玩家一路上看着侧栏在"张小敬/李必/崔器"之间乱跳。
const NON_PROTAG_POV = ids.filter(id => scenes[id].pov && scenes[id].pov !== PROTAGONIST);
for (const id of ids) {
  const sc = scenes[id];
  if (!sc.pov || sc.pov === PROTAGONIST) continue;
  const nm = characters[sc.pov] && characters[sc.pov].name;
  if (nm && (sc.text || '').includes(nm)) {
    errors.push(
      `[${id}] pov='${sc.pov}'，但正文里出现了「${nm}」—— 叙述者不可能是他，`
      + `侧栏「当前视角」会显示错误的角色。改成真正的叙述者，或重写正文为他的视角`
    );
  }
}
if (NON_PROTAG_POV.length) {
  warnings.push(`非主角视角节点 ${NON_PROTAG_POV.length} 个: ${NON_PROTAG_POV.join(', ')} —— 确认正文真的是他们的视角`);
}

for (const id of ids) {
  const sc = scenes[id];
  if (!sc.hour) warnings.push(`[${id}] 未指定 hour`);
  else if (!hourKeys.has(sc.hour)) errors.push(`[${id}] 非法 hour: ${sc.hour}`);
  if (!sc.text) errors.push(`[${id}] 缺少 text`);
  if (sc.pov && !charIds.has(sc.pov)) errors.push(`[${id}] pov 未知角色: ${sc.pov}`);
  else if (sc.pov && !characters[sc.pov].isPOV) {
    warnings.push(`[${id}] pov=${sc.pov} 未标 isPOV`);
  }
}

// ===== 3. 从 start 出发 BFS（含条件路由的全部分支）=====
const visited = new Set();
const queue = [START_SCENE];
const endings = new Set();
while (queue.length) {
  const cur = queue.shift();
  if (visited.has(cur)) continue;
  visited.add(cur);
  const sc = scenes[cur];
  if (!sc) continue;
  if (sc.ending) { endings.add(cur); continue; }
  nextTargets(sc).forEach(t => { if (t && !visited.has(t)) queue.push(t); });
}

const unreachable = ids.filter(id => !visited.has(id));
if (unreachable.length) warnings.push(`不可达节点: ${unreachable.join(', ')}`);

// ===== 3b. 「谁在场」跨结局一致性 =====
//
// 这个检查来自一次真实事故：
//   h_hai 正文写着「楼下传来脚步声——不止一个人」「他们全都上来了」，
//   但它能走到 e_burn_fire，而 e_burn_fire 开头就是「但你身后没有人。灯楼上只有你一个。」
//   —— 玩家同时读到这两句，剧情直接塌掉。
//
// 根因是结构性的：本作 22 个非结局节点**全部**能到达全部 4 个结局
// （见下面打印的「分流点」数据），也就是说主线节点是共享的，
// 正文里任何一句"谁在场"的断言，都可能被某个结局当面否掉。
//
// 这没法做成语义分析，所以这里用一个**明确的不完全启发式**：
// 用一张人工维护的短语表，找出「断言有人到场」的节点，
// 再看它能到达的结局里有没有「断言无人到场」的。
// 命中不等于有 bug，但每一条都值得人过一眼 —— 表很短，宁缺勿滥。
const PRESENCE_PAT = [
  '不止一个人', '他们全都', '你们都来', '都上来了', '全都上来了',
  '站在你身后', '你身后的人', '他们来了',
];
const ABSENCE_PAT = [
  '身后没有人', '只有你一个', '你一个人拦不住', '没有人来找你',
];
const endsOf = (() => {
  const memo = new Map();
  const walk = (id) => {
    if (memo.has(id)) return memo.get(id);
    const sc = scenes[id];
    let r;
    if (!sc) r = new Set();
    else if (sc.ending) r = new Set([id]);
    else {
      r = new Set();
      nextTargets(sc).forEach(t => {
        if (t) walk(t).forEach(e => r.add(e));
      });
    }
    memo.set(id, r);
    return r;
  };
  return walk;
})();

const absenceEndings = ids.filter(id => {
  const sc = scenes[id];
  return sc.ending && ABSENCE_PAT.some(p => (sc.text || '').includes(p));
});

for (const id of ids) {
  const sc = scenes[id];
  if (sc.ending) continue;
  const hit = PRESENCE_PAT.filter(p => (sc.text || '').includes(p));
  if (!hit.length) continue;
  const reach = [...endsOf(id)].filter(e => absenceEndings.includes(e));
  if (!reach.length) continue;
  warnings.push(
    `[${id}] 正文断言「${hit.join('、')}」，但能走到 ${reach.join(', ')}`
    + ` —— 该结局断言无人到场，两者会当面打架；请把该句移入条件插段，或改成不表态的写法`
  );
}

// ===== 3c. 门控可达性：require / 路由 when 的门槛必须真的能达到 =====
//
// 「选项解锁条件」本身也是一种对玩家的承诺：你照着提示做了，就该能解锁。
// 真实事故：h_hai 第 4 项 require trust.longbo >= 30，但龙波初始信任 0，
// 全剧只有两处给他加信任、且都在同一个节点里互斥：
//   · 「你恨的到底是什么？说清楚。」 +20
//   · 「长安不是欠你的。但你的仇，我记下了。」 +35
// 而 requireHint 写的是「需要先在灯楼听懂他恨的到底是什么」—— 那正是 +20 那条。
// 玩家照做，还是解锁不了。
//
// ⚠️ 关键点：这个 bug **不是"门槛不可达"**（35 >= 30，走另一条能过）。
//    真正的问题是**门槛卡在两个可达值中间**：有的走法够、有的不够，
//    于是"提示描述哪条走法"就变得极易出错。
//    所以这里查的是这件事，只查"可达性"是抓不到的。

// 信任上界：同一节点内的选项互斥 → 取该节点内最大正增益；跨节点累加。
const maxTrust = {};
for (const cid of charIds) maxTrust[cid] = characters[cid].trust ?? 0;
const trustSources = {};        // cid -> [{node, amount, choiceText}]
for (const cid of charIds) trustSources[cid] = [];
for (const id of ids) {
  const best = {};
  (scenes[id].choices || []).forEach(ch => {
    if (!ch.trust) return;
    for (const [cid, v] of Object.entries(ch.trust)) {
      if (v > 0) {
        best[cid] = Math.max(best[cid] ?? 0, v);
        trustSources[cid].push({ node: id, amount: v, t: ch.t });
      }
    }
  });
  for (const [cid, v] of Object.entries(best)) maxTrust[cid] += v;
}
const maxAllies = [...charIds].filter(c => c !== PROTAGONIST && maxTrust[c] >= ALLY_TRUST).length;

// 线索上界：同一条线索只可能被拿一次
const maxClues = new Set(
  ids.flatMap(id => (scenes[id].choices || []).map(ch => ch.clue).filter(Boolean))
).size;

// 哪些节点能设置某个 flag
const settersOf = new Map();
for (const id of ids) {
  (scenes[id].choices || []).forEach(ch => {
    if (!ch.flag) return;
    if (!settersOf.has(ch.flag)) settersOf.set(ch.flag, new Set());
    settersOf.get(ch.flag).add(id);
  });
}

// 每个节点能到达的节点集合（含自身）
const reach = new Map();
for (const id of ids) {
  const seen = new Set([id]);
  const q = [id];
  while (q.length) {
    const cur = q.shift();
    nextTargets(scenes[cur]).forEach(t => {
      if (t && scenes[t] && !seen.has(t)) { seen.add(t); q.push(t); }
    });
  }
  reach.set(id, seen);
}

let gateChecked = 0;
function checkGate(cond, where, atNode) {
  if (!cond) return;
  gateChecked++;

  if (cond.trust) {
    for (const [cid, v] of Object.entries(cond.trust)) {
      const nm = (characters[cid] && characters[cid].name) || cid;
      const init = characters[cid] ? (characters[cid].trust ?? 0) : 0;
      const cap = maxTrust[cid] ?? 0;

      if (cap < v) {
        errors.push(
          `${where}：「${nm}」的信任度全剧最高只能到 ${cap}，门槛却要求 ${v}`
          + ` —— 这个选项/分支永远解锁不了（提示也会变成假话）`
        );
        continue;
      }

      // 单次选择的增益里，有没有"够"的和"不够"的并存？
      const singles = trustSources[cid] || [];
      const enough = singles.filter(s => init + s.amount >= v);
      const short = singles.filter(s => init + s.amount < v);
      if (enough.length && short.length) {
        const fmt = (arr) => arr.map(s => `[${s.node}]「${String(s.t).slice(0, 16)}…」${init}+${s.amount}`).join('；');
        warnings.push(
          `${where}：门槛 ${v} 卡在两个可达值中间 —— 只做 ${fmt(short)} 到不了；`
          + `必须做 ${fmt(enough)}。请确认 requireHint 描述的是"够"的那些走法（否则提示在骗人）`
        );
      }
    }
  }

  if (typeof cond.allies === 'number' && cond.allies > maxAllies) {
    errors.push(
      `${where}：要求 ${cond.allies} 位同路人，但全剧最多只有 ${maxAllies} 个角色能达到 ${ALLY_TRUST}`
    );
  }
  if (typeof cond.clues === 'number' && cond.clues > maxClues) {
    errors.push(`${where}：要求 ${cond.clues} 条线索，但全剧只有 ${maxClues} 条`);
  }

  for (const f of [...(cond.flagsAll || []), ...(cond.flagsAny || [])]) {
    const setters = settersOf.get(f);
    if (!setters) continue;                              // 幽灵 flag 上文已报
    // 必须在「到达本节点之前」就能设上：存在设置它的节点 S，且 S 能走到本节点
    const ok = [...setters].some(S => S !== atNode && reach.get(S) && reach.get(S).has(atNode));
    if (!ok) {
      warnings.push(
        `${where}：flag「${f}」在走到 ${atNode} 之前无法设置`
        + `（设置它的节点：${[...setters].join(', ')}）—— 这个门控在这条路上永远不成立`
      );
    }
  }
}

for (const id of ids) {
  (scenes[id].choices || []).forEach((ch, i) => {
    const label = `[${id}] 选项${i + 1}`;
    checkGate(ch.require, `${label} 的 require`, id);
    (Array.isArray(ch.to) ? ch.to : []).forEach((r, j) => {
      checkGate(r && r.when, `${label} 的第${j + 1}个路由分支`, id);
    });
  });
}

// 分流点：能到达 >=2 个结局的非结局节点。全部节点都在这里 = 主线共享，正文不能断言结局级事实。
const forks = ids
  .filter(id => !scenes[id].ending)
  .map(id => ({ id, n: endsOf(id).size }))
  .filter(r => r.n >= 2)
  .sort((a, b) => b.n - a.n);

// ===== 4. 长安六维权重覆盖 =====
const traitKeys = new Set(TRAITS.map(t => t.key));
let traitCovered = 0, traitTotal = 0;
for (const id of ids) {
  const sc = scenes[id];
  if (!sc.choices) continue;
  const map = CHOICE_TRAITS[id];
  sc.choices.forEach((ch, i) => {
    traitTotal++;
    const w = map ? map[i] : null;
    if (!w) {
      errors.push(`[${id}] 第${i + 1}个选项缺少人格权重（traits.js）`);
      return;
    }
    traitCovered++;
    for (const k in w) {
      if (!traitKeys.has(k)) errors.push(`[${id}] 第${i + 1}选项引用未知维度: ${k}`);
      if (typeof w[k] !== 'number' || w[k] < 0 || w[k] > 3) {
        warnings.push(`[${id}] 第${i + 1}选项 ${k} 分值异常: ${w[k]}（建议 0-3）`);
      }
    }
  });
  if (map && map.length !== sc.choices.length) {
    errors.push(`[${id}] 人格权重条数 ${map.length} 与选项数 ${sc.choices.length} 不一致`);
  }
}

// ===== 5. MBTI 权重覆盖 =====
const mbtiKeys = new Set(MBTI_DIMS.map(d => d.key));
let mbtiCovered = 0, mbtiTotal = 0;
for (const id of ids) {
  const sc = scenes[id];
  if (!sc.choices) continue;
  const map = MBTI_CHOICE[id];
  sc.choices.forEach((ch, i) => {
    mbtiTotal++;
    const w = map ? map[i] : null;
    if (!w) {
      errors.push(`[${id}] 第${i + 1}个选项缺少 MBTI 权重（mbti.js）`);
      return;
    }
    mbtiCovered++;
    if (Object.keys(w).length === 0) {
      warnings.push(`[${id}] 第${i + 1}选项 MBTI 权重为空 {}（该选项不产生区分）`);
    }
    for (const k in w) {
      if (!mbtiKeys.has(k)) errors.push(`[${id}] 第${i + 1}选项引用未知 MBTI 维度: ${k}`);
      if (typeof w[k] !== 'number' || Math.abs(w[k]) > 3) {
        warnings.push(`[${id}] 第${i + 1}选项 ${k} 超出区间(-3~3): ${w[k]}`);
      }
    }
  });
  if (map && map.length !== sc.choices.length) {
    errors.push(`[${id}] MBTI 权重条数 ${map.length} 与选项数 ${sc.choices.length} 不一致`);
  }
}

// ===== 6. 16 型定义完整性 =====
const expectTypes = [];
(function combos(i, prefix) {
  if (i === MBTI_DIMS.length) { expectTypes.push(prefix.join('')); return; }
  combos(i + 1, [...prefix, MBTI_DIMS[i].left]);
  combos(i + 1, [...prefix, MBTI_DIMS[i].right]);
})(0, []);
const missingTypes = expectTypes.filter(t => !(t in MBTI_TYPES));
if (missingTypes.length) errors.push(`MBTI_TYPES 缺少 ${missingTypes.length} 型: ${missingTypes.join(', ')}`);
for (const t in MBTI_TYPES) {
  if (!charIds.has(MBTI_TYPES[t].who)) errors.push(`MBTI_TYPES[${t}].who 未知角色: ${MBTI_TYPES[t].who}`);
}
const usedWho = Object.values(MBTI_TYPES).map(v => v.who);
const dupWho = usedWho.filter((v, i) => usedWho.indexOf(v) !== i);
if (dupWho.length) {
  warnings.push(`MBTI_TYPES 里有角色被多型重复引用（应 16 型 ↔ 16 人一一对应）: ${[...new Set(dupWho)].join(', ')}`);
}

// ===== 7. 角色 MBTI 向量 =====
for (const id in CHARACTER_MBTI) {
  if (!charIds.has(id)) errors.push(`CHARACTER_MBTI 引用未知角色: ${id}`);
  for (const k in CHARACTER_MBTI[id]) {
    if (!mbtiKeys.has(k)) errors.push(`CHARACTER_MBTI[${id}] 未知维度: ${k}`);
  }
}
const missingMbti = [...charIds].filter(id => !(id in CHARACTER_MBTI));
if (missingMbti.length) errors.push(`缺 MBTI 向量的角色: ${missingMbti.join(', ')}`);

// ===== 8. 角色人格向量（长安六维）=====
for (const id in CHARACTER_TRAITS) {
  if (!charIds.has(id)) errors.push(`CHARACTER_TRAITS 引用未知角色: ${id}`);
  for (const k in CHARACTER_TRAITS[id]) {
    if (!traitKeys.has(k)) errors.push(`CHARACTER_TRAITS[${id}] 未知维度: ${k}`);
  }
}
const missingVec = [...charIds].filter(id => !(id in CHARACTER_TRAITS));

// ===== 输出 =====
const totalChoices = ids.reduce((n, i) => n + (scenes[i].choices?.length || 0), 0);
console.log(`节点总数: ${ids.length}`);
console.log(`可达节点: ${visited.size}`);
console.log(`结局数:   ${endings.size} -> ${[...endings].join(', ')}`);
console.log(`覆盖时辰: ${new Set(ids.map(i => scenes[i].hour).filter(Boolean)).size} / 12`);
console.log(`选项总数: ${totalChoices}（其中条件选项 ${conditionalCount}，条件路由 ${routerCount}）`);
console.log(`过场场景: ${passageIds.length} 个（只有 next、没有 choices —— 不算抉择、不计分）`);
console.log(`条件正文: 插段 ${insertCount} 条（${insertNodes} 节点，其中 ${anchorNodes} 个带 {{inserts}} 插入点）· 整段重写 ${variantCount} 条（${variantNodes} 节点）`);
console.log(`可设置 flag: ${allFlags.size}（被条件引用 ${usedFlags.size}）`);
console.log(`同路人门槛: 信任 >= ${ALLY_TRUST}`);
console.log(`人格权重覆盖: ${traitCovered} / ${traitTotal}`);
console.log(`MBTI 权重覆盖: ${mbtiCovered} / ${mbtiTotal}`);
console.log(`MBTI 16 型定义: ${Object.keys(MBTI_TYPES).length} / ${expectTypes.length}`);
console.log(`角色人格向量: ${Object.keys(CHARACTER_TRAITS).length} / ${charIds.size}`);
console.log(`角色 MBTI 向量: ${Object.keys(CHARACTER_MBTI).length} / ${charIds.size}`);
if (missingVec.length) warnings.push(`缺人格向量的角色: ${missingVec.join(', ')}`);
console.log('');
if (errors.length) {
  console.log('❌ 错误:');
  errors.forEach(e => console.log('   ' + e));
} else {
  console.log('✅ 无致命错误');
}
if (warnings.length) {
  console.log('⚠️  警告:');
  warnings.forEach(w => console.log('   ' + w));
}
console.log('\n--- 结局清单 ---');
[...endings].forEach(e => {
  const sc = scenes[e];
  console.log(`  ${sc.endTag}  (${e})`);
});

// 分流点分布：这是判断"正文能写多具体"的依据，所以打出来而不是只说一句结论。
// 若这里几乎所有非结局节点都可达 4 个结局，说明主线是共享的 ——
// 那么任何节点正文都不能断言「结局时才成立」的事实（谁在场、谁死了）。
const nonEnding = ids.filter(id => !scenes[id].ending).length;
const allFour = forks.filter(f => f.n === endings.size).length;
console.log(`\n--- 分流点（可达 >=2 个结局的非结局节点）---`);
console.log(`  ${forks.length} / ${nonEnding} 个非结局节点可达 ${endings.size} 个结局中的多个`);
if (allFour === forks.length && forks.length === nonEnding) {
  console.log(`  ⚠️ 全部 ${nonEnding} 个非结局节点都能到达全部 ${endings.size} 个结局`);
  console.log(`     → 主线节点是共享的：正文里不要写「谁在场 / 谁还活着」这类结局级事实，`);
  console.log(`       要么交给结局去说，要么放进条件插段。`);
} else {
  const byN = new Map();
  forks.forEach(f => byN.set(f.n, (byN.get(f.n) || 0) + 1));
  [...byN.entries()].sort((a, b) => b[0] - a[0])
    .forEach(([n, c]) => console.log(`  可达 ${n} 个结局: ${c} 个节点`));
}
if (absenceEndings.length) {
  console.log(`  断言"无人到场"的结局: ${absenceEndings.join(', ')}`);
}

// ===== 支路饱满度：每个选项是不是真的先走了一段只属于自己的路 =====
//
// 这是「选择连不连贯」的**结构**指标（读起来的连贯性还得靠 trace_choices + 人眼）。
// 分两问答，因为这是两件事：
//   ① 每个选项的去处是不是互不相同？（不同 = 你的选择真的把你带到了别处）
//   ② 这些去处里有多少是「过场场景」？（过场 = 一段专属戏，然后汇合回主干）
// h_mao 是 ① 成立、② 不成立的例子：它的三个选项通向三个**真正的支路场景**
// （各有自己的选项与后续），比过场更重，不该因为"不是过场"就被判成不饱满。
const choicePoints = ids.filter(id => !scenes[id].ending && !isPassage(scenes[id]));
const richOnly = [], withPassage = [], thin = [];
for (const id of choicePoints) {
  const sc = scenes[id];
  const chs = sc.choices || [];
  // 每个选项的"当场去处"：条件路由取第一分支代表（它的分支都是同一节点的不同出口）
  const tg = chs.map(ch => {
    const to = ch && ch.to;
    if (typeof to === 'string') return to;
    if (Array.isArray(to)) return to.map(r => r && r.then).filter(Boolean)[0] || null;
    return null;
  });
  const distinct = new Set(tg.filter(Boolean));
  if (distinct.size === chs.length) {
    richOnly.push(id);
    if (tg.every(t => t && isPassage(scenes[t]))) withPassage.push(id);
  } else {
    thin.push({ id, n: chs.length, distinct: distinct.size });
  }
}
console.log(`\n--- 支路饱满度（每个选项是不是真的把你带到别处，再汇合）---`);
console.log(`  ${richOnly.length} / ${choicePoints.length} 个抉择点：每个选项的去处互不相同`);
console.log(`  其中 ${withPassage.length} 个是"先走一段专属过场，再汇合回主干"`);
if (thin.length) {
  console.log(`  仍有多个选项通向同一处的 ${thin.length} 个：`);
  thin.forEach(t => console.log(`    ${t.id.padEnd(16)} ${t.n} 选项 → ${t.distinct} 个去处`));
  console.log(`  （通向同一处不等于"没接住"——也可能是靠互斥开场插段把两条来路分开的，`);
  console.log(`    例如 e_final_persuade 用 flagsAll/flagsNone 分成两版开场。请用 trace_choices 确认。）`);
}

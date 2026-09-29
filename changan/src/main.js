// 长安十二时辰 · 剧情引擎
import { scenes, START_SCENE, PROTAGONIST, ALLY_TRUST, isPassage } from './data/scenes.js';
import { characters, hours } from './data/characters.js';
import {
  TRAITS, CHOICE_TRAITS,
  makeTitle, normalize, matchCharacter, nodeMax,
} from './data/traits.js';
import {
  MBTI_DIMS, MBTI_TYPES, MBTI_CHOICE,
  computeMBTI, mbtiNodeStats, matchMBTICharacter,
} from './data/mbti.js';
import { resolveText } from './text.js';
import {
  computePipelineProgress, checkNewUnlocks, renderPuzzlePanel,
  PUZZLE_PIPELINES,
} from './data/puzzles.js';
import {
  getCardsForNode, renderCardContent, renderSideCardItem,
  KNOWLEDGE_CARDS,
} from './data/knowledge.js';

// ===== 游戏状态 =====
const state = {
  sceneId: START_SCENE,
  flags: new Set(),
  clues: [],
  choicesMade: 0,
  trust: {},        // { charId: 数值 }
  hoursPassed: [],
  traitRaw: {},     // 长安六维原始累计分
  traitMax: {},     // 长安六维可获得上限
  mbtiRaw: {},      // MBTI 实际累计分
  mbtiBase: {},     // MBTI 随机基线（机会期望，作为计分零点）
  mbtiHi: {},       // 全部选最左（E/S/T/J）时的上限
  mbtiLo: {},       // 全部选最右（I/N/F/P）时的下限
  mbtiItems: {},    // 该维度上有区分度的题数
  ended: false,
  unlockedCards: [], // 已解锁的知识卡片 id 数组
};

// 初始化全部数值型状态
function initState() {
  for (const id in characters) state.trust[id] = characters[id].trust ?? 0;
  state.traitRaw = {};
  state.traitMax = {};
  TRAITS.forEach(t => { state.traitRaw[t.key] = 0; state.traitMax[t.key] = 0; });
  state.mbtiRaw = {};
  state.mbtiBase = {};
  state.mbtiHi = {};
  state.mbtiLo = {};
  state.mbtiItems = {};
  MBTI_DIMS.forEach(d => {
    state.mbtiRaw[d.key] = 0;
    state.mbtiBase[d.key] = 0;
    state.mbtiHi[d.key] = 0;
    state.mbtiLo[d.key] = 0;
    state.mbtiItems[d.key] = 0;
  });
  state.unlockedCards = [];
}

// ===== 存档 =====
const SAVE_KEY = 'changan-save-v1';

function saveState() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      sceneId: state.sceneId,
      flags: [...state.flags],
      clues: state.clues,
      choicesMade: state.choicesMade,
      trust: state.trust,
      hoursPassed: state.hoursPassed,
      traitRaw: state.traitRaw,
      traitMax: state.traitMax,
      mbtiRaw: state.mbtiRaw,
      mbtiBase: state.mbtiBase,
      mbtiHi: state.mbtiHi,
      mbtiLo: state.mbtiLo,
      mbtiItems: state.mbtiItems,
      unlockedCards: state.unlockedCards,
    }));
  } catch (e) {
    // 无痕模式 / 存储被禁用时静默降级，不影响游戏
  }
}

function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 同上 */ }
}

// 恢复存档；返回是否成功恢复
function loadState() {
  let s = null;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    s = JSON.parse(raw);
  } catch (e) {
    return false;
  }
  if (!s || !s.sceneId || !scenes[s.sceneId]) return false;

  state.sceneId = s.sceneId;
  state.flags = new Set(Array.isArray(s.flags) ? s.flags : []);
  state.clues = Array.isArray(s.clues) ? s.clues : [];
  state.choicesMade = s.choicesMade || 0;
  state.hoursPassed = Array.isArray(s.hoursPassed) ? s.hoursPassed : [];
  state.trust = Object.assign({}, state.trust, s.trust || {});
  state.traitRaw = Object.assign({}, state.traitRaw, s.traitRaw || {});
  state.traitMax = Object.assign({}, state.traitMax, s.traitMax || {});
  state.mbtiRaw = Object.assign({}, state.mbtiRaw, s.mbtiRaw || {});
  state.mbtiBase = Object.assign({}, state.mbtiBase, s.mbtiBase || {});
  state.mbtiHi = Object.assign({}, state.mbtiHi, s.mbtiHi || {});
  state.mbtiLo = Object.assign({}, state.mbtiLo, s.mbtiLo || {});
  state.mbtiItems = Object.assign({}, state.mbtiItems, s.mbtiItems || {});
  state.unlockedCards = Array.isArray(s.unlockedCards) ? s.unlockedCards : [];
  return true;
}

// ===== DOM 引用 =====
const $ = (s) => document.querySelector(s);
const elScene = $('#scene');
const elClock = $('#clockStrip');
const elView = $('#view');
const elMoment = $('#momentLabel');
const elHourCount = $('#hourCount');
const elChoiceCount = $('#choiceCount');
const elClueList = $('#clueList');
const elPuzzleList = $('#puzzleList');
const elPartyList = $('#partyList');
const elChronicle = $('#chronicleList');
const elOverlay = $('#overlay');
const elOverlayTitle = $('#overlayTitle');
const elOverlayBody = $('#overlayBody');
const elOverlayAction = $('#overlayAction');
const elRestart = $('#restartBtn');

// 知识卡片
const elKnowledgeSideList = $('#knowledgeSideList');
const elKnowledgeModal = $('#knowledgeModal');
const elKnowledgeModalBody = $('#knowledgeModalBody');
const elKnowledgeModalClose = $('#knowledgeModalClose');

const HOUR_ORDER = hours.map(h => h.key);

// ===== 条件判断（选项 require 与跳转路由 when 共用同一套语义）=====
// 支持的键见 scenes.js 顶部注释；判断只读 state，不产生副作用。
function evalCond(cond) {
  if (!cond) return true;
  if (cond.flagsAll && !cond.flagsAll.every(f => state.flags.has(f))) return false;
  if (cond.flagsAny && !cond.flagsAny.some(f => state.flags.has(f))) return false;
  if (cond.flagsNone && cond.flagsNone.some(f => state.flags.has(f))) return false;
  if (cond.trust) {
    for (const id in cond.trust) {
      if ((state.trust[id] ?? 0) < cond.trust[id]) return false;
    }
  }
  if (typeof cond.allies === 'number' && countAllies() < cond.allies) return false;
  if (typeof cond.clues === 'number' && state.clues.length < cond.clues) return false;
  return true;
}

// 除主角外，信任度达到 ALLY_TRUST 的角色数 —— 结局门控数的就是这些人
function countAllies() {
  let n = 0;
  for (const id in state.trust) {
    if (id === PROTAGONIST) continue;
    if (state.trust[id] >= ALLY_TRUST) n++;
  }
  return n;
}

// 解析跳转目标：字符串 = 固定节点；数组 = 条件路由，取第一个 when 成立的 then
function resolveTo(to) {
  if (typeof to === 'string') return to;
  if (Array.isArray(to)) {
    for (const rule of to) {
      if (!rule.when || evalCond(rule.when)) return rule.then;
    }
  }
  return null;
}

// 解析正文：支持两种"按 flag 变化"的机制，可叠加使用。
//
//   ① inserts：[{ when, text }] —— 【首选】条件插段。所有 when 成立的插段按声明顺序
//      合并，插入到默认正文里的 `{{inserts}}` 标记处；**没有标记则追加到末尾**。
//      优点：不复制原文，所以后续修改默认正文时插段不会失同步。
//
//      ⚠️ 为什么要有标记：节点正文往往以「转场句」开头（例如
//      「你出了靖安司，没有直接去查案。」）。如果插段一律塞在第一个字之前，
//      就会出现"先提到葛老、再说你走进葛老的暗市"这种预告式倒叙。
//      标记让插入点由**正文结构**决定，而不是由作者猜。
//
//   ② textVariants：[{ when, text }] —— 整段重写，取第一个匹配者。
//      只用在"整场戏基调都变了"的场合，因为要复制全文，容易与默认正文失同步。
//
// ⚠️ 顺序敏感：越具体的条件要写得越靠前，兜底那条（通常不带 when）放最后。
//
// 具体解析实现在 src/text.js（引擎与 results.html 共用同一份，别在这里再抄一遍）。
// 这里把当前 state 的条件判定注进去，成为引擎侧的唯一入口。
function resolveSceneText(sc) {
  return resolveText(sc, evalCond);
}

// 某节点当前可选的选项下标（条件不满足的选项不参与计分上限，也不显示）
function availableIdx(sc) {
  return (sc.choices || []).map((_, i) => i).filter(i => evalCond(sc.choices[i].require));
}

// 「风险」角标：只要该选项会让任何一位角色的信任度下降，就算风险
// （旧实现只看 trust 的第一个值，多角色时会误判）
function isRisk(ch) {
  if (ch.tag) return ch.tag === 'risk';
  if (!ch.trust) return false;
  return Object.values(ch.trust).some(v => v < 0);
}

// ===== 渲染：顶栏时辰 =====
function renderClock() {
  const cur = scenes[state.sceneId]?.hour;
  elClock.innerHTML = '';
  hours.forEach(h => {
    const cell = document.createElement('div');
    cell.className = 'clock-cell';
    const idx = HOUR_ORDER.indexOf(h.key);
    const curIdx = HOUR_ORDER.indexOf(cur);
    if (idx < curIdx) cell.classList.add('done');
    if (h.key === cur) cell.classList.add('now');
    cell.textContent = h.name;
    elClock.appendChild(cell);
  });
}

// ===== 渲染：侧栏 =====
function renderSide() {
  const sc = scenes[state.sceneId];
  const hour = hours.find(h => h.key === sc.hour);
  elMoment.textContent = hour ? `${hour.name} · ${hour.label}` : '—';
  elHourCount.textContent = `${state.hoursPassed.length} / 12`;
  elChoiceCount.textContent = state.choicesMade;

  // 当前视角
  const pov = characters[sc.pov];
  if (pov) {
    elView.innerHTML = `
      <div class="view-who">${pov.name}</div>
      <div class="view-desc">${pov.alias}<br>${pov.bio}</div>
    `;
  }

  // 线索
  if (state.clues.length === 0) {
    elClueList.innerHTML = '<div class="empty-hint">尚无线索。</div>';
  } else {
    elClueList.innerHTML = state.clues
      .map(c => `<div class="list-item">${escapeHtml(c)}</div>`).join('');
  }

  // 同路人：按信任度排序取前 6；达到门槛的标出「同路人」——结局门控看的就是这个数
  const party = Object.keys(state.trust)
    .filter(id => characters[id] && id !== PROTAGONIST)
    .sort((a, b) => state.trust[b] - state.trust[a])
    .slice(0, 6);
  const allyN = countAllies();
  elPartyList.innerHTML =
    `<div class="ally-count">同路人 <strong>${allyN}</strong> 人 · 门槛信任 ${ALLY_TRUST}</div>` +
    party.map(id => {
      const c = characters[id];
      const t = state.trust[id];
      const ally = t >= ALLY_TRUST;
      return `<div class="list-item relation${ally ? ' ally' : ''}">
        <strong>${c.name}</strong> <span style="color:var(--muted)">${c.alias}</span>
        ${ally ? '<span class="ally-badge">同路人</span>' : ''}<br>
        <span style="font-size:11px;color:var(--muted)">信任 ${t}</span>
      </div>`;
    }).join('');

  // 大事记（已过时辰）
  if (state.hoursPassed.length === 0) {
    elChronicle.innerHTML = '<div class="empty-hint">尚未开始。</div>';
  } else {
    elChronicle.innerHTML = state.hoursPassed
      .map(h => {
        const hour = hours.find(x => x.key === h);
        return `<div class="list-item">${hour ? hour.name : h}</div>`;
      }).join('');
  }

  // 侦探笔记
  if (elPuzzleList) {
    const puzzleHTML = renderPuzzlePanel(state.clues, state.flags);
    elPuzzleList.innerHTML = puzzleHTML;
  }

  // 长安小识（知识卡片侧栏）
  renderKnowledgeSide();
}

// ===== 渲染：场景 =====
function renderScene() {
  const sc = scenes[state.sceneId];
  if (!sc) {
    elScene.innerHTML = `<div class="scene-inner"><p>剧情节点缺失：${state.sceneId}</p></div>`;
    return;
  }

  renderClock();

  const hour = hours.find(h => h.key === sc.hour);

  let html = `<div class="scene-inner">`;
  html += `<div class="act-head">
    <div class="act-hour">${hour ? hour.name + ' · ' + hour.label : ''}</div>
    <div class="act-title">${escapeHtml(sc.place || '')}</div>
  </div>`;

  // 正文：按空行分段；「」内容为对话，标金
  // 用 resolveSceneText 而非 sc.text —— 让正文能按 flag 变化（见 src/text.js 注释）
  const paras = resolveSceneText(sc).split('\n\n').filter(p => p.trim());
  html += `<div class="narration">`;
  paras.forEach(p => {
    const marked = escapeHtml(p)
      .replace(/「([^」]*)」/g, '<span class="say">「$1」</span>');
    html += `<p>${marked.replace(/\n/g, '<br>')}</p>`;
  });
  // 知识卡片触发按钮
  const sceneCards = getCardsForNode(state.sceneId);
  if (sceneCards.length > 0) {
    const card = sceneCards[0]; // 每个节点最多关联一张卡片
    // 首次到访自动解锁
    if (!state.unlockedCards.includes(card.id)) {
      state.unlockedCards.push(card.id);
      saveState();
    }
    const alreadyUnlocked = true; // 刚加过了
    html += `<button class="knowledge-trigger" data-card-id="${card.id}"
      type="button" onclick="window.__openKnowledgeCard('${card.id}')">
      📖 长安小识 · ${card.title}
    </button>`;
  }
  html += `</div>`;

  if (sc.ending) {
    html += `<div class="end-tag">${escapeHtml(sc.endTag)}</div>`;
  }

  elScene.innerHTML = html;

  // 抉择 / 继续按钮
  if (sc.ending) {
    showEnding(sc);
  } else if (isPassage(sc)) {
    // 过场场景：只有一个「继续」，不是一个抉择点。
    // 它不推进 choicesMade、不参与六维/MBTI 计分 —— 那些只属于真正的抉择。
    const box = document.createElement('div');
    box.className = 'choices passage';
    const btn = document.createElement('button');
    btn.className = 'choice-btn continue-btn';
    btn.type = 'button';
    btn.innerHTML = `<span class="arrow">→</span>
      <span>${escapeHtml(sc.nextLabel || '继续')}</span>`;
    btn.onclick = () => advance(sc.next);
    box.appendChild(btn);
    elScene.querySelector('.scene-inner').appendChild(box);
  } else if (sc.choices && sc.choices.length) {
    const box = document.createElement('div');
    box.className = 'choices';
    const locked = [];
    let shown = 0;

    sc.choices.forEach((ch, i) => {
      if (!evalCond(ch.require)) {
        locked.push(ch);
        return;
      }
      shown++;
      const btn = document.createElement('button');
      btn.className = 'choice-btn';
      btn.type = 'button';
      btn.innerHTML = `<span class="num">${shown}.</span>
        <span>${escapeHtml(ch.t)}</span>
        ${isRisk(ch) ? '<span class="tag risk">风险</span>' : ''}`;
      // 这里传的是数组原始下标 i —— 权重表按原始顺序对齐，不能传显示序号
      btn.onclick = () => choose(ch, i);
      box.appendChild(btn);
    });

    // 条件未满足的选项 → 灰色提示，让玩家看见"还有哪条路没走到"
    locked.forEach(ch => {
      if (!ch.requireHint) return;
      const hint = document.createElement('div');
      hint.className = 'choice-locked';
      hint.innerHTML = `<span class="lock-mark">未解锁</span><span>${escapeHtml(ch.requireHint)}</span>`;
      box.appendChild(hint);
    });

    elScene.querySelector('.scene-inner').appendChild(box);
  }

  elScene.scrollTop = 0;
  renderSide();
}

// ===== 时辰记录 =====
// 抉择点和过场场景都要记 —— 否则时钟会漏掉在过场里跨过的时辰。
function noteHour(sc) {
  if (sc.hour && !state.hoursPassed.includes(sc.hour)) {
    state.hoursPassed.push(sc.hour);
  }
}

// ===== 过场场景：只有一条路，不是抉择 =====
// 刻意不碰 choicesMade / traitRaw / mbtiRaw：过场不是一次抉择，
// 把它算进去会让「本局 N 次抉择」虚高、也会污染六维与 MBTI 的可得分上限。
function advance(target) {
  noteHour(scenes[state.sceneId] || {});
  const next = resolveTo(target);
  if (next && scenes[next]) {
    state.sceneId = next;
    saveState();
    renderScene();
  } else {
    console.warn('无效跳转:', target);
  }
}

// ===== 选择 =====
function choose(choice, index) {
  const sc = scenes[state.sceneId];

  // 记录时辰
  noteHour(sc);
  state.choicesMade++;

  // 只有"当前真正可选"的选项才计入可获得上限，否则锁住的选项会污染归一化分母
  const avail = availableIdx(sc);

  // 长安六维累计
  const nodeWeights = CHOICE_TRAITS[state.sceneId] || [];
  const cap = nodeMax(state.sceneId, avail);
  TRAITS.forEach(t => { state.traitMax[t.key] += cap[t.key]; });
  const weights = nodeWeights[index];
  if (weights) {
    for (const k in weights) {
      state.traitRaw[k] = (state.traitRaw[k] ?? 0) + weights[k];
    }
  }

  // MBTI 累计：玩家得分 + 该节点的机会统计（基线 / 左极 / 右极 / 有效题数）
  const st = mbtiNodeStats(state.sceneId, avail);
  MBTI_DIMS.forEach(d => {
    const s = st[d.key];
    state.mbtiBase[d.key] += s.mean;
    state.mbtiHi[d.key] += s.max;
    state.mbtiLo[d.key] += s.min;
    if (s.max - s.min > 1e-9) state.mbtiItems[d.key] += 1;
  });
  const mw = (MBTI_CHOICE[state.sceneId] || [])[index];
  if (mw) {
    for (const k in mw) {
      state.mbtiRaw[k] = (state.mbtiRaw[k] ?? 0) + mw[k];
    }
  }

  // 剧情副作用
  if (choice.flag) state.flags.add(choice.flag);
  if (choice.clue && !state.clues.includes(choice.clue)) state.clues.push(choice.clue);
  if (choice.trust) {
    for (const id in choice.trust) {
      state.trust[id] = (state.trust[id] ?? 0) + choice.trust[id];
    }
  }

  // ===== 推理突破检查 =====
  const newUnlocks = checkNewUnlocks(state.clues, state.flags);
  for (const p of newUnlocks) {
    state.flags.add(p.reward.flag);
    // 延迟显示 toast，等下一场景渲染完成后弹出
    setTimeout(() => showPuzzleToast(p), 400);
  }

  const next = resolveTo(choice.to);
  if (next && scenes[next]) {
    state.sceneId = next;
    saveState();
    renderScene();
  } else {
    console.warn('无效跳转:', choice.to);
  }
}

// ===== MBTI 结果 HTML =====
function mbtiStatFromState() {
  const stat = {};
  MBTI_DIMS.forEach(d => {
    stat[d.key] = {
      mean: state.mbtiBase[d.key] || 0,
      max: state.mbtiHi[d.key] || 0,
      min: state.mbtiLo[d.key] || 0,
      n: state.mbtiItems[d.key] || 0,
    };
  });
  return stat;
}

function buildMBTIHTML() {
  const { type, dims, ties } = computeMBTI(state.mbtiRaw, mbtiStatFromState());
  const info = MBTI_TYPES[type] || { name: '未知', title: '', desc: '', who: null };
  const m = matchMBTICharacter(dims, type);
  const who = characters[m.id];
  const who2 = characters[m.second];

  let html = `<div class="mbti-wrap">`;
  html += `<div class="mbti-head">
    <div class="mbti-label">你的长安人格类型</div>
    <div class="mbti-type">${type}</div>
    <div class="mbti-name">${escapeHtml(info.name)} · <span>${escapeHtml(info.title)}</span></div>
  </div>`;

  // 四维条
  html += `<div class="mbti-dims">`;
  dims.forEach(d => {
    const tie = d.resolved !== 'ok';
    html += `<div class="mbti-dim${tie ? ' tie' : ''}">
      <div class="mbti-q">
        <span>${escapeHtml(d.question)}</span>
        ${tie
          ? '<span class="mbti-tie-tag">无偏好</span>'
          : `<span class="mbti-items">${d.items} 题</span>`}
      </div>
      <div class="mbti-bar">
        <div class="mbti-side left">
          <iconify-icon icon="${d.iconL}" aria-hidden="true"></iconify-icon>
          <span class="mbti-letter ${d.letter === d.left ? 'on' : 'off'}">${d.left}</span>
          <span class="mbti-lname">${d.leftName}</span>
          <span class="mbti-pct">${d.leftPct}%</span>
        </div>
        <div class="mbti-track">
          <div class="mbti-fill" style="width:${d.leftPct}%"></div>
        </div>
        <div class="mbti-side right">
          <span class="mbti-pct">${d.rightPct}%</span>
          <span class="mbti-lname">${d.rightName}</span>
          <span class="mbti-letter ${d.letter === d.right ? 'on' : 'off'}">${d.right}</span>
          <iconify-icon icon="${d.iconR}" aria-hidden="true"></iconify-icon>
        </div>
      </div>
      <div class="mbti-desc">${escapeHtml(d.desc)}</div>
    </div>`;
  });
  html += `</div>`;

  // 无偏好维度如实交代，而不是默认倒向某一侧
  if (ties.length) {
    html += `<div class="mbti-tie-note">
      本局有 <strong>${ties.length}</strong> 个维度没分出偏好（${ties.join('、')}）——
      你在正反两侧势均力敌，条形图因此停在 50/50，类型码按惯例取了左侧字母（E/S/T/J）。
    </div>`;
  }

  // 类型解读
  html += `<div class="mbti-note">
    <strong>${type} · ${escapeHtml(info.name)}</strong><br>
    ${escapeHtml(info.desc)}
  </div>`;

  // 最相似的书中人物（动态匹配）
  if (who) {
    html += `<div class="mbti-match">
      <div class="mbti-match-label">与你最相似的书中人物</div>
      <div class="mbti-match-name">${escapeHtml(who.name)}</div>
      <div class="mbti-match-alias">${escapeHtml(who.alias)}</div>
      <div class="mbti-sim">
        <span class="mbti-sim-tag">契合度 ${m.similarity}%</span>
      </div>
      <div class="mbti-match-bio">${escapeHtml(who.bio)}</div>
      <div class="mbti-match-words">「${escapeHtml(who.words)}」</div>`;
    if (who2 && m.secondSimilarity > 0) {
      html += `<div class="mbti-second">
        次席：${escapeHtml(who2.name)}（${escapeHtml(who2.alias)}）· 契合度 ${m.secondSimilarity}%
      </div>`;
    }
    html += `</div>`;
  }

  html += `<div class="mbti-foot">MBTI 为倾向性描述，非能力判定。本测评基于你在本次剧情中的 ${state.choicesMade} 次抉择，仅供娱乐与自我觉察。</div>`;
  html += `</div>`;
  return html;
}

// ===== 长安六维画像 HTML =====
function buildPersonalityHTML() {
  const scores = normalize(state.traitRaw, state.traitMax);
  const title = makeTitle(scores);
  const sorted = TRAITS.slice().sort((a, b) => (scores[b.key] || 0) - (scores[a.key] || 0));
  const top = sorted[0];
  const { id: matchId } = matchCharacter(scores);
  const who = characters[matchId];

  let html = `<div class="psy-wrap">`;
  html += `<div class="psy-head">
    <div class="psy-label">你的长安人格</div>
    <div class="psy-title">${escapeHtml(title)}</div>
    <div class="psy-sub">${escapeHtml(top.highDesc)}</div>
  </div>`;

  html += `<div class="psy-bars">`;
  sorted.forEach(t => {
    const v = scores[t.key] || 0;
    html += `<div class="psy-row">
      <div class="psy-name"><iconify-icon icon="${t.icon}" aria-hidden="true"></iconify-icon> ${t.name}</div>
      <div class="psy-track"><div class="psy-fill" style="width:${v}%"></div></div>
      <div class="psy-val">${v}</div>
    </div>`;
  });
  html += `</div>`;

  html += `<div class="psy-note">
    <strong>主导特质 · ${escapeHtml(top.name)}</strong>（${escapeHtml(top.desc)}）<br>
    ${escapeHtml(top.highDesc)}
  </div>`;

  if (who) {
    html += `<div class="psy-match">
      <div class="psy-match-label">与你最相似的长安人物</div>
      <div class="psy-match-name">${escapeHtml(who.name)}</div>
      <div class="psy-match-alias">${escapeHtml(who.alias)}</div>
      <div class="psy-match-bio">${escapeHtml(who.bio)}</div>
      <div class="psy-match-words">「${escapeHtml(who.words)}」</div>
    </div>`;
  }

  html += `<div class="psy-foot">
    本测评基于你在本局的 ${state.choicesMade} 次抉择。<br>
    分数含义：本局你在每个路口「能拿到的该特质满分之和」中，实际拿到的比例（达成率）。<br>
    各抉择的特质权重为 1~3，权重越大的选择计入越多，并非单纯「选了几次」。<br>
    仅供娱乐与自我觉察，不构成心理诊断。
  </div>`;
  html += `</div>`;
  return html;
}

// ===== 结局 =====
function showEnding(sc) {
  state.ended = true;
  elOverlay.classList.remove('hidden');
  elOverlay.setAttribute('aria-hidden', 'false');
  elOverlayTitle.textContent = '长 安 十 二 时 辰';
  // ⚠️ 必须走 resolveSceneText：结局节点同样带条件插段
  // （例如 e_final_people 会在「你转过身」之后，按你真正拉到的人逐个点名）。
  // 早先这里直接读 sc.text，导致插段不渲染、还会把 {{inserts}} 标记原样显示给玩家。
  elOverlayBody.innerHTML =
    `<div style="text-align:center;margin-bottom:14px">
      <span class="end-tag">${escapeHtml(sc.endTag)}</span>
    </div>
    ${escapeHtml(resolveSceneText(sc))}
    <div style="margin-top:16px;text-align:center;color:var(--gold);font-style:italic">
      ${escapeHtml(sc.endingText || '')}
    </div>
    ${buildMBTIHTML()}
    <div class="psy-sec-title">长安六维 · 补充画像</div>
    ${buildPersonalityHTML()}`;
  elOverlayAction.textContent = '重新开局';
  elOverlayAction.onclick = restart;
  elOverlayAction.focus();
}

// ===== 重开 =====
function restart() {
  state.sceneId = START_SCENE;
  state.flags.clear();
  state.clues = [];
  state.choicesMade = 0;
  state.hoursPassed = [];
  state.ended = false;
  initState();
  clearSave();
  elOverlay.classList.add('hidden');
  elOverlay.setAttribute('aria-hidden', 'true');
  renderScene();
}

// ===== 工具 =====
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ===== 推理突破 Toast 通知 =====
const elPuzzleToast = document.getElementById('puzzleToast');
let toastTimer = null;

function showPuzzleToast(pipeline) {
  if (!elPuzzleToast) return;
  if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }

  elPuzzleToast.className = 'puzzle-toast hidden';
  // 触发重排以重启动画
  void elPuzzleToast.offsetWidth;

  elPuzzleToast.innerHTML = `
    <div class="toast-title">🔍 推理突破 · ${escapeHtml(pipeline.name)}</div>
    <div>${escapeHtml(pipeline.reward.text)}</div>
  `;
  elPuzzleToast.className = 'puzzle-toast visible';

    toastTimer = setTimeout(() => {
    elPuzzleToast.classList.remove('visible');
    elPuzzleToast.classList.add('hidden');
    toastTimer = null;
  }, 6000);
}

// ===== 长安小识 · 历史知识卡片 =====
// 渲染侧栏知识卡片列表
function renderKnowledgeSide() {
  if (!elKnowledgeSideList) return;
  const unlocked = state.unlockedCards || [];
  if (unlocked.length === 0) {
    elKnowledgeSideList.innerHTML = '<div class="empty-hint">游历长安，解锁知识。</div>';
    return;
  }
  elKnowledgeSideList.innerHTML = unlocked
    .map(id => KNOWLEDGE_CARDS.find(c => c.id === id))
    .filter(Boolean)
    .map(c => renderSideCardItem(c))
    .join('');
}

// 打开知识卡片弹窗
function openKnowledgeCard(cardId) {
  const card = KNOWLEDGE_CARDS.find(c => c.id === cardId);
  if (!card || !elKnowledgeModal || !elKnowledgeModalBody) return;
  elKnowledgeModalBody.innerHTML = renderCardContent(card);
  elKnowledgeModal.classList.remove('hidden');
  elKnowledgeModal.setAttribute('aria-hidden', 'false');
  // 给侧栏也标记已读
  renderKnowledgeSide();
}

// 关闭知识卡片弹窗
function closeKnowledgeModal() {
  if (!elKnowledgeModal) return;
  elKnowledgeModal.classList.add('hidden');
  elKnowledgeModal.setAttribute('aria-hidden', 'true');
}

// 暴露到 window，供剧情正文中的 onclick 调用
window.__openKnowledgeCard = openKnowledgeCard;

// ===== 键盘操作：数字键选选项，结局页回车重开 =====
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (!elOverlay.classList.contains('hidden')) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      elOverlayAction.click();
    }
    return;
  }
  const n = Number(e.key);
  if (!Number.isInteger(n) || n < 1) return;
  const btns = document.querySelectorAll('#scene .choice-btn');
  if (btns[n - 1]) {
    e.preventDefault();
    btns[n - 1].click();
  }
});

if (elRestart) {
  elRestart.addEventListener('click', () => {
    if (state.choicesMade > 0 && !window.confirm('重新开局？当前进度会清空。')) return;
    restart();
  });
}

// ===== 移动端侧栏开关 =====
// 窄屏下侧栏改为抽屉式，默认收起；这里只负责切换状态与 aria。
const elPanelToggle = $('#panelToggle');
const elSidePanel = $('#sidePanel');
if (elPanelToggle && elSidePanel) {
  elPanelToggle.addEventListener('click', () => {
    const open = elSidePanel.classList.toggle('open');
    elPanelToggle.setAttribute('aria-expanded', String(open));
  });
}

// ===== 知识卡片弹窗控制 =====
if (elKnowledgeModalClose) {
  elKnowledgeModalClose.addEventListener('click', closeKnowledgeModal);
}
// 点击背景关闭
if (elKnowledgeModal) {
  elKnowledgeModal.addEventListener('click', (e) => {
    if (e.target === elKnowledgeModal || e.target.classList.contains('knowledge-overlay-bg')) {
      closeKnowledgeModal();
    }
  });
}
// ESC 键关闭
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && elKnowledgeModal && !elKnowledgeModal.classList.contains('hidden')) {
    closeKnowledgeModal();
  }
});
// 点击侧栏卡片项打开弹窗（委托事件）
if (elKnowledgeSideList) {
  elKnowledgeSideList.addEventListener('click', (e) => {
    const item = e.target.closest('.side-card-item');
    if (item) openKnowledgeCard(item.dataset.cardId);
  });
  elKnowledgeSideList.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const item = e.target.closest('.side-card-item');
      if (item) { e.preventDefault(); openKnowledgeCard(item.dataset.cardId); }
    }
  });
}

// ===== 启动 =====
initState();
const resumed = loadState();
renderScene();

// 让玩家知道"这局是从存档接上的"，而不是以为自己刚点错了什么
const elResumeNote = $('#resumeNote');
if (elResumeNote) {
  if (resumed && !scenes[state.sceneId].ending) {
    elResumeNote.textContent = '已恢复上次进度 · 点顶栏「重新开局」可重来';
    elResumeNote.classList.remove('hidden');
  } else if (resumed && scenes[state.sceneId].ending) {
    elResumeNote.textContent = '这是上次的结局 · 点「重新开局」再玩一遍';
    elResumeNote.classList.remove('hidden');
  }
}

// ===== 推理突破：旧存档兼容 =====
// 如果存档是旧版本的（不含 puzzle flags），检查并补上
(function() {
  const unlocks = checkNewUnlocks(state.clues, state.flags);
  for (const p of unlocks) {
    state.flags.add(p.reward.flag);
  }
  if (unlocks.length > 0) saveState();
})();

// ===== 图标兜底 =====
// 图标来自外部 CDN。离线或被网络策略拦掉时，可能出现两种情形：
//   a) 脚本明确报错 → index.html 上的 onerror 已经挂上 no-icons
//   b) 请求一直挂着不返回、也不报错 → onerror 不会触发
// 所以这里再加一道：页面 load 之后等一会儿，iconify-icon 仍未注册就收掉图标。
// 图标全部是装饰性的，缺了不影响任何功能。
window.addEventListener('load', () => {
  setTimeout(() => {
    const registered = window.customElements && customElements.get('iconify-icon');
    if (!registered) document.documentElement.classList.add('no-icons');
  }, 1200);
});

// ===== 测试钩子 =====
// 只在 URL 带 ?debug=1 时暴露内部状态，供 tools/smoke_gate.py 按"结论"驱动剧情
// （例如"每步都选信任增益最大的选项"），而不是靠猜选项文案。
// 正常打开页面不会往 window 上挂任何东西。
if (new URLSearchParams(location.search).has('debug')) {
  window.__changan = {
    state, countAllies, evalCond, resolveTo, scenes, characters, ALLY_TRUST,
    // 供 tools/dump_play.py endings 用：直接跳到某个节点/结局渲染。
    // 用途是审「结局正文」——它是整局的落点，也是条件插段最密的地方
    // （e_final_people 有 5 条），而结局只有走到才能看见，手工复现成本太高。
    goto: (id) => { state.sceneId = id; renderScene(); },
    // 直接设定信任度，用来构造"把人全争取到了"与"谁也没争取到"两种极端局面。
    setTrust: (obj) => { Object.assign(state.trust, obj); },
  };
}

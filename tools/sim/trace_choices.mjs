// 一个选择的后果到底落在哪里？—— 审查「选择连贯性」的对照表工具。
//
// 它回答两个问题：
//   ① 这个选项设的 flag 被谁读到了？（被读到 ≠ 接得住，所以还要看读到的正文是什么）
//   ② **选了它之后，玩家紧接着读到什么？** ← 这才是"选择连贯"的核心
//
// 为什么需要它：branch_audit 只回答"flag 有没有被读到"。但被读到 ≠ 接得住：
//   · 一个 flag 可能只被一条很虚的插段读到；
//   · 也可能只被别的条件"排除"掉（那它根本没有正面后果）；
//   · 更常见的是 —— flag 确实被读到了，但你选「现在不是说这个的时候」，
//     下一段正文第一句却是「你翻开文书」。（真实存在，就是靠这张表翻出来的）
//
// 用法：node tools/trace_choices.mjs            # 全部
//       node tools/trace_choices.mjs h_si       # 只看某个节点的选项
//       node tools/trace_choices.mjs --brief    # 只打"紧接着读到什么"，不打引用清单
import { scenes, isPassage } from '../../src/data/scenes.js';
import { resolveText } from '../../src/text.js';

const argv = process.argv.slice(2);
const brief = argv.includes('--brief');
const only = argv.find(a => !a.startsWith('--')) || null;
const ids = Object.keys(scenes);

// 只看"无条件插段"时的正文 —— 也就是不依赖任何 flag 的基座正文，
// 用它来判断"这个节点在最朴素的情况下第一句是什么"。
const NEUTRAL = () => false;
const opening = (id, n = 110) => {
  const sc = scenes[id];
  if (!sc) return `（无此节点 ${id}）`;
  const s = resolveText(sc, NEUTRAL).replace(/\s+/g, ' ');
  return s.slice(0, n) + (s.length > n ? '…' : '');
};

const parts = (cond) => ({
  all: (cond && cond.flagsAll) || [],
  any: (cond && cond.flagsAny) || [],
  none: (cond && cond.flagsNone) || [],
});

// 插段落在正文的哪里？没写标记的节点会退化成"追加到末尾"（verify 会报警告）。
// 这里只是为了让"紧接着读到什么"的**阅读顺序**不被误读。
function markPos(sc) {
  const t = (sc && sc.text) || '';
  if (!t.includes('{{inserts}}')) return '末尾追加';
  const before = t.slice(0, t.indexOf('{{inserts}}')).trim();
  const after = t.slice(t.indexOf('{{inserts}}') + '{{inserts}}'.length).trim();
  if (!before) return '开头';
  if (!after) return '末尾';
  return '中段';
}

// 判断"选了本选项之后，目标节点里的这条条件正文会不会生效"。
//
// 用三值逻辑，因为工具没法知道玩家前面怎么走的：
//   true  → 一定生效（本选项的 flag 直接满足条件，或条件只涉及本节点的互斥兄弟）
//   false → 一定不生效
//   null  → 取决于前面的选择（条件里出现了其它节点的 flag）
// 同节点其它选项的 flag 可以确定为"没设"（一次只能选一个），
// 这一条正好覆盖 e_final_persuade 那种 flagsNone 兜底写法。
function previewEval(cond, myFlag, siblingFlags) {
  if (!cond) return true;
  const c = parts(cond);
  const st = (f) => (f === myFlag ? true : (siblingFlags.has(f) ? false : null));
  const tri = (vals, mode) => {
    const vs = vals.map(st);
    if (mode === 'all') {
      if (vs.some(v => v === false)) return false;
      return vs.some(v => v === null) ? null : true;
    }
    if (mode === 'any') {
      if (vs.some(v => v === true)) return true;
      return vs.some(v => v === null) ? null : false;
    }
    // none
    if (vs.some(v => v === true)) return false;
    return vs.some(v => v === null) ? null : true;
  };
  const r = [
    c.all.length ? tri(c.all, 'all') : true,
    c.any.length ? tri(c.any, 'any') : true,
    c.none.length ? tri(c.none, 'none') : true,
  ];
  if (r.includes(false)) return false;
  if (r.includes(null)) return null;
  return true;
}

// flag -> [{node, kind, detail, text}]
const refs = new Map();
const add = (f, rec) => {
  if (!refs.has(f)) refs.set(f, []);
  refs.get(f).push(rec);
};

for (const id of ids) {
  const sc = scenes[id];

  (sc.inserts || []).forEach((it, i) => {
    const c = parts(it.when);
    c.all.forEach(f => add(f, { node: id, kind: '插段', detail: `ins#${i} flagsAll`, text: it.text }));
    c.any.forEach(f => add(f, { node: id, kind: '插段', detail: `ins#${i} flagsAny`, text: it.text }));
    c.none.forEach(f => add(f, { node: id, kind: '插段排除', detail: `ins#${i} flagsNone`, text: it.text }));
  });

  (sc.textVariants || []).forEach((v, i) => {
    const c = parts(v.when);
    c.all.forEach(f => add(f, { node: id, kind: '整段重写', detail: `var#${i}`, text: v.text }));
    c.any.forEach(f => add(f, { node: id, kind: '整段重写', detail: `var#${i}`, text: v.text }));
    c.none.forEach(f => add(f, { node: id, kind: '整段重写排除', detail: `var#${i}`, text: v.text }));
  });

  (sc.choices || []).forEach((ch, i) => {
    const rc = parts(ch.require);
    const note = `选项${i + 1}「${String(ch.t).slice(0, 18)}…」`;
    rc.all.forEach(f => add(f, { node: id, kind: '选项解锁', detail: `${note} require`, text: '' }));
    rc.any.forEach(f => add(f, { node: id, kind: '选项解锁', detail: `${note} require`, text: '' }));
    rc.none.forEach(f => add(f, { node: id, kind: '选项锁定', detail: `${note} require`, text: '' }));
    (Array.isArray(ch.to) ? ch.to : []).forEach((r, j) => {
      const tc = parts(r && r.when);
      const d = `${note} 分支${j + 1} → ${r && r.then}`;
      tc.all.forEach(f => add(f, { node: id, kind: '路由', detail: d, text: '' }));
      tc.any.forEach(f => add(f, { node: id, kind: '路由', detail: d, text: '' }));
      tc.none.forEach(f => add(f, { node: id, kind: '路由', detail: d, text: '' }));
    });
  });
}

// 引用点的"正面/反面"判定：插段排除 与 选项锁定 是反面用法，不算"接住"
const POSITIVE = new Set(['插段', '整段重写', '选项解锁', '路由']);

const oneLine = (s, n = 60) => String(s || '').replace(/\s+/g, ' ').slice(0, n)
  + (String(s || '').replace(/\s+/g, ' ').length > n ? '…' : '');

let shown = 0, deadInNode = 0, weakInNode = 0;

for (const id of ids) {
  if (only && id !== only) continue;
  const sc = scenes[id];
  if (!sc.choices || !sc.choices.length) continue;
  shown++;

  console.log('='.repeat(78));
  console.log(`【${id}】${sc.place || ''}  ${sc.hour || ''}`);
  console.log('='.repeat(78));

  sc.choices.forEach((ch, i) => {
    const tags = [];
    if (ch.flag) tags.push(`flag=${ch.flag}`);
    if (ch.clue) tags.push(`线索「${ch.clue}」`);
    if (ch.trust) tags.push(`信任 ${Object.entries(ch.trust).map(([k, v]) => `${k}${v > 0 ? '+' : ''}${v}`).join(' ')}`);
    if (ch.require) tags.push(`需解锁 ${JSON.stringify(ch.require)}`);
    if (Array.isArray(ch.to)) tags.push(`条件路由(${ch.to.length} 分支)`);

    console.log(`\n  ${i + 1}. ${oneLine(ch.t, 46)}`);
    if (!brief) {
      console.log(`     ${tags.length ? tags.join('  ·  ') : '（无 flag、无线索、无信任变化）'}`);
    } else if (tags.length) {
      console.log(`     ${tags.join('  ·  ')}`);
    }

    // ★ 最重要的一列：选了它之后，玩家紧接着读到什么。
    //   这一列直接暴露「选了拒绝却还是做了那件事」。
    //
    //   分两段打印，因为这两段承担不同的判断：
    //     · 基座（不挂任何插段）—— 若与选择冲突，说明这里**必须**靠插段来修
    //     · 本选项命中的插段/变体 —— 实际玩家会先读到这些，看它修好了没有
    const targets = Array.isArray(ch.to)
      ? ch.to.map(r => ({ id: r && r.then, cond: r && r.when }))
      : [{ id: ch.to, cond: null }];
    targets.forEach(({ id: tid, cond }) => {
      const label = Array.isArray(ch.to) ? (cond ? '（条件命中时）' : '（都不命中时）') : '';
      let tsc = scenes[tid];
      if (!tsc) { console.log(`     ↓ 目标节点不存在 [${tid}]`); return; }

      // 若目标是"过场场景"（只有 next、没有 choices），先把它打出来 ——
      // 那一段就是"你这个选项换来的专属戏"，是判断连贯性最该看的东西。
      // 然后顺着 next 走到真正的汇合点，再继续后面的分析。
      // （若不打这一层，过场场景会被当成"目标节点"，而它的 choices 是空的，
      //   于是所有选项看起来都"没有专属正文"—— 又是一次工具在骗人。）
      let mergeId = tid;
      const seenP = new Set();
      while (isPassage(scenes[mergeId]) && !seenP.has(mergeId)) {
        seenP.add(mergeId);
        const p = scenes[mergeId];
        console.log(`     ↓ 你的专属过场 [${mergeId}]`);
        console.log(`         「${oneLine(resolveText(p, () => true), 220)}」`);
        console.log(`         → ${p.nextLabel || '继续'}`);
        mergeId = p.next;
      }
      tsc = scenes[mergeId];
      if (!tsc) { console.log(`     ↓ 汇合点不存在 [${mergeId}]`); return; }
      const mergeNote = mergeId !== tid ? `（汇合于 [${mergeId}]）` : '';

      console.log(`     ↓ 紧接着读到 ${label}[${mergeId}]${mergeNote}`);
      // ⚠️ 必须标出插段落在正文的哪个位置：`e_final_persuade` 的 {{inserts}} 就在最前面，
      //    若只写「基座：…」再写「↳ 你的插段：…」，读者会以为先读基座、后读插段，
      //    实际顺序正好相反 —— 而"先读到哪句"恰恰是判断连贯性的关键。
      console.log(`         基座（插段在${markPos(tsc)}）：「${opening(mergeId)}」`);

      // 本选项的 flag 在目标节点里触发了哪些条件正文？
      const siblingFlags = new Set(
        (sc.choices || []).filter((_, j) => j !== i).map(c => c.flag).filter(Boolean)
      );
      const mine = [];
      (tsc.inserts || []).forEach((it, i2) => {
        const r = previewEval(it.when, ch.flag, siblingFlags);
        if (r !== false) mine.push({ k: `插段 ins#${i2}`, t: it.text, sure: r === true });
      });
      (tsc.textVariants || []).forEach((v, i2) => {
        const r = previewEval(v.when, ch.flag, siblingFlags);
        if (r !== false) mine.push({ k: `整段重写 var#${i2}`, t: v.text, sure: r === true });
      });
      if (mine.length) {
        mine.forEach(m => console.log(
          `         ↳ ${m.sure ? '' : '（取决于前面，可能）'}你的${m.k}：「${oneLine(m.t, 96)}」`
        ));
      } else {
        console.log('         ↳ 本选项在此节点没有专属正文 —— 你看到的就是基座那句');
      }
    });

    if (brief) return;
    if (!ch.flag) return;

    const list = refs.get(ch.flag) || [];
    const pos = list.filter(r => POSITIVE.has(r.kind));
    const neg = list.filter(r => !POSITIVE.has(r.kind));

    if (!pos.length) {
      console.log(`     ❌ flag「${ch.flag}」没有任何正面引用 —— 它是个死标记`);
      deadInNode++;
      return;
    }

    console.log(`     ✅ 被读到 ${pos.length} 处${neg.length ? `（另有 ${neg.length} 处仅用于排除/锁定）` : ''}：`);
    pos.forEach(r => {
      console.log(`        · [${r.node}] ${r.kind} (${r.detail})`);
      if (r.text) console.log(`            「${oneLine(r.text, 58)}」`);
    });

    if (pos.length === 1 && pos[0].kind === '插段' && (pos[0].text || '').length < 40) {
      console.log('        ⚠️  只有一处、且插段很短 —— 可能接得比较虚，建议人眼确认');
      weakInNode++;
    }
  });
  console.log('');
}

console.log('='.repeat(78));
console.log(`共检查 ${shown} 个有选项的节点`);
if (deadInNode) console.log(`❌ 死标记选项：${deadInNode} 个`);
if (weakInNode) console.log(`⚠️  可能接得比较虚的选项：${weakInNode} 个`);
console.log('提示：本表只能指出"落在哪"，接得实不实必须人眼读。配合 dump_play.py seq 实读。');

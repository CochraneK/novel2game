// 长安十二时辰 · 正文解析（引擎与静态页共用）
//
// 抽出来的原因：这套"条件正文"逻辑原先只在 main.js 里，
// 而 showEnding() 和 results.html 都是直接读 sc.text —— 于是结局节点一旦
// 加了插段，静态页会原样吐出 `{{inserts}}` 这个标记。同一份规则必须只有一个实现。
//
// 解析顺序（两步，可同时生效）：
//   ① textVariants 整段替换 —— 取第一个 when 匹配者
//   ② inserts 段落插入    —— 所有 when 匹配者按数组顺序拼起来，填进 {{inserts}} 标记处
//
// evalCond 由调用方注入：游戏里有完整的 state 可以做条件判断；
// 静态页没有 state，就传一个「全部不匹配」的判定，只保留无条件插段。

export const INSERT_MARK = '{{inserts}}';

/** 去掉标记本身与由此产生的多余空行（不处理任何插段）。 */
export function stripMark(s) {
  return String(s || '')
    .split(INSERT_MARK).join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 解析一个节点的最终正文。
 * @param {object} sc       场景节点
 * @param {function} evalCond 条件判定函数；省略时视为「只有无条件插段生效」
 */
export function resolveText(sc, evalCond) {
  const ok = typeof evalCond === 'function' ? evalCond : (c => !c);
  let base = sc.text || '';

  // ① 整段替换：第一个匹配者胜出，后面的不再看
  if (Array.isArray(sc.textVariants)) {
    for (const v of sc.textVariants) {
      if (!v.when || ok(v.when)) { base = v.text; break; }
    }
  }

  // ② 段落插入：多条可同时生效，数组顺序 = 阅读顺序
  if (Array.isArray(sc.inserts)) {
    const on = [];
    for (const it of sc.inserts) {
      // 不带 when 视为无条件；注意用真值判断，避免把"没写 when"当成不匹配
      if (it.when && !ok(it.when)) continue;
      if (it.text) on.push(it.text);
    }
    if (on.length) {
      const block = on.join('\n\n');
      base = base.includes(INSERT_MARK)
        ? base.replace(INSERT_MARK, block)
        : base.trimEnd() + '\n\n' + block;
    }
  }

  // 清理标记残留（所有插段都不匹配时），并压掉多余空行
  return stripMark(base);
}

/** 该节点有几条"要看选择才出现"的插段（用于静态页给个提示）。 */
export function conditionalInsertCount(sc) {
  if (!Array.isArray(sc.inserts)) return 0;
  return sc.inserts.filter(it => it.when && it.text).length;
}

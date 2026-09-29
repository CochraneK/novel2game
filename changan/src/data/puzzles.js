// 长安十二时辰 · 推理解谜管线
//
// 每条管线将若干条线索归为一条"侦查路径"，
// 当玩家收集到足够多的管线内线索时，触发一次"推理突破"——
// 可能解锁隐藏选项、揭示真相片段、或影响结局走向。
//
// 线索匹配方式：子串匹配（不区分大小写）。所以管线定义
// 只需要写线索中包含的关键词即可，不需要抄全文。

export const PUZZLE_PIPELINES = [
  {
    id: 'wolf_pack',
    name: '狼卫踪迹',
    icon: '🐺',
    desc: '追查入城狼卫的行踪与据点网络',
    keywords: ['狼卫', '西域', '胡人', '夹道', '西市', '货栈', '阙勒霍多', '跟踪', '脚印'],
    threshold: 5,
    reward: {
      flag: 'puzzle_wolves_mapped',
      text: '🔍 推理突破：狼卫踪迹已基本摸清——从三不管夹道的脚印到西市货栈的十七只陶罐，再到地下暗市的传闻，入城狼卫的路线网络已在你脑中成形。你知道他们从哪来、怎么藏、打算从哪个方向动手。',
    },
    hints: [
      '狼卫的每一步都会留下痕迹。你在找的是路径，不是人。',
      '长安的暗处比明处更密——夹道、暗市、货栈后门。',
    ],
  },
  {
    id: 'kelehuoduo',
    name: '阙勒霍多',
    icon: '🔥',
    desc: '查明火油的来源、分布与引爆计划',
    keywords: ['阙勒霍多', '油罐', '西市', '胡人', '西域', '货栈', '兴庆宫', '灯楼'],
    threshold: 4,
    reward: {
      flag: 'puzzle_kelehuoduo_clear',
      text: '🔍 推理突破：阙勒霍多的流向已查明——油从西域经货栈分批入城，至少十七罐。目标不是随意点火，而是要集中引爆灯楼：上元节全城注目之处，一旦得手，长安的脊梁就断了。',
    },
    hints: [
      '阙勒霍多遇水更烈。油比火可怕。',
      '龙波选灯楼，不是因为高，是因为所有人都看着它。',
    ],
  },
  {
    id: 'longbo_truth',
    name: '龙波真相',
    icon: '🎭',
    desc: '揭开蚍蜉之主的面具与真实动机',
    keywords: ['龙波', '萧规', '第八团', '烽燧堡', '动机', '鱼肠', '理解', '对峙'],
    threshold: 4,
    reward: {
      flag: 'puzzle_longbo_understood',
      text: '🔍 推理突破：你开始理解龙波了——他不是疯子，他是被长安的背叛一寸一寸逼出来的。烽燧堡的幸存者、被凌辱致死的姐姐、无处申冤的案子……他恨的不是某个人，是这座允许这一切发生的城。',
    },
    hints: [
      '龙波不是突然变成这样的。去找那个转折点。',
      '他说"欠我的"，不是指钱。',
    ],
  },
  {
    id: 'jingsi_intrigue',
    name: '靖安司疑云',
    icon: '🏛️',
    desc: '揭开靖安司内部的权斗与暗流',
    keywords: ['靖安司', '李必', '徐宾', '军械', '元载', '朝堂', '文书', '围', '调兵'],
    threshold: 4,
    reward: {
      flag: 'puzzle_jingsi_exposed',
      text: '🔍 推理突破：靖安司不是铁板一块。军械旧案的账目"对得太整齐"，案牍库里藏着不想让别人看到的东西。有人借着狼卫的事在铲除异己，而更多人在这场浑水里看不清自己的位置。',
    },
    hints: [
      '数据不说谎——说数据不说谎的人才是最大的漏洞。',
      '元载那样的聪明人，不会浪费时间在一场必输的局里。',
    ],
  },
  {
    id: 'chang_underworld',
    name: '长安暗面',
    icon: '🌃',
    desc: '连通地下情报网，让暗处的人为你说话',
    keywords: ['葛老', '暗市', '暗语', '平康坊', '坊间', '老胡人', '眼线', '布眼'],
    threshold: 3,
    reward: {
      flag: 'puzzle_underworld_connected',
      text: '🔍 推理突破：长安的暗面开始为你说话了。葛老的人、西市的老胡人、坊间的眼线——你不靠靖安司的腰牌，靠的是自己在长安混了九年的脸。暗市的路你走通了，现在消息会比你跑得快。',
    },
    hints: [
      '长安的地下，比地上大。',
      '葛老不做善事——他在每条路上都埋了线。',
    ],
  },
  {
    id: 'wenran_past',
    name: '闻染旧案',
    icon: '🌸',
    desc: '了解闻染的伤痛与熊火帮背后的势力',
    keywords: ['闻染', '闻无忌', '熊火帮', '旧案', '文书', '许诺', '忽略', '第八团'],
    threshold: 3,
    reward: {
      flag: 'puzzle_wenran_known',
      text: '🔍 推理突破：你终于面对了闻染的事。闻无忌的死不是一场简单的斗殴——熊火帮背后有封大伦，而封大伦背后是永王。一张盘根错节的保护网。你当年杀三十四人、斩县尉、劫持永王，只打断了网的一根线。',
    },
    hints: [
      '闻染恨长安，不是没有理由的。',
      '那张保护网，你当年只撕开了一个口子。',
    ],
  },
];

// 将已收集的线索按管线分类，返回每条管线的进度信息
export function computePipelineProgress(clues) {
  if (!clues || clues.length === 0) {
    return PUZZLE_PIPELINES.map(p => ({
      ...p,
      matched: 0,
      total: p.keywords.length,
      progress: 0,
      unlocked: false,
      matchedKeywords: [],
    }));
  }

  return PUZZLE_PIPELINES.map(p => {
    const matched = p.keywords.filter(kw =>
      clues.some(c => c.toLowerCase().includes(kw.toLowerCase()))
    );
    const progress = Math.min(100, Math.round((matched.length / p.threshold) * 100));
    return {
      ...p,
      matched: matched.length,
      total: p.threshold,
      progress,
      unlocked: matched.length >= p.threshold,
      matchedKeywords: matched,
    };
  });
}

// 检查哪些管线刚达到阈值（需要触发 reward）
export function checkNewUnlocks(clues, existingFlags) {
  if (!clues || clues.length === 0) return [];
  const results = [];
  for (const p of PUZZLE_PIPELINES) {
    const matched = p.keywords.filter(kw =>
      clues.some(c => c.toLowerCase().includes(kw.toLowerCase()))
    );
    if (matched.length >= p.threshold && !existingFlags.has(p.reward.flag)) {
      results.push(p);
    }
  }
  return results;
}

// ===== 侦查面板 HTML =====
export function renderPuzzlePanel(clues, allFlags) {
  const pipelines = computePipelineProgress(clues);

  let html = `<div class="puzzle-panel">`;
  html += `<div class="puzzle-title">🔍 侦探笔记</div>`;
  html += `<div class="puzzle-sub">收集线索 · 串联真相</div>`;

  if (!clues || clues.length === 0) {
    html += `<div class="empty-hint">尚未收集任何线索。</div>`;
    html += `</div>`;
    return html;
  }

  html += `<div class="puzzle-clues-bar">
    已收集 <strong>${clues.length}</strong> 条线索
  </div>`;

  html += `<div class="pipeline-list">`;
  for (const p of pipelines) {
    const isUnlocked = p.unlocked || allFlags.has(p.reward.flag);
    html += `<div class="pipeline-item ${isUnlocked ? 'unlocked' : ''}">
      <div class="pipeline-header">
        <span class="pipeline-icon">${p.icon}</span>
        <span class="pipeline-name">${p.name}</span>
        <span class="pipeline-progress-text">${p.matched}/${p.threshold}</span>
      </div>
      <div class="pipeline-track">
        <div class="pipeline-fill" style="width:${p.progress}%"></div>
      </div>
      <div class="pipeline-desc">${p.desc}</div>
      ${isUnlocked ? '<div class="pipeline-badge">✅ 已突破</div>' : (p.hints.length > 0 ? `<div class="pipeline-hint">💡 ${p.hints[0]}</div>` : '')}
    </div>`;
  }
  html += `</div>`;

  html += `</div>`;
  return html;
}

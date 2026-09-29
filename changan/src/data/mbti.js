// MBTI 人格测评体系 —— v3
// 4 个维度，每个抉择在 4 个维度上各有倾向分（-3 ~ +3，0 为中性）
//   正值偏向左侧字母（E / S / T / J）
//   负值偏向右侧字母（I / N / F / P）
// 结局时算出每个维度的偏好强度与最终 4 字母类型

// ===== 4 个维度 =====
export const MBTI_DIMS = [
  {
    key: 'EI', left: 'E', right: 'I',
    leftName: '外向', rightName: '内向',
    iconL: 'game-icons:crowd', iconR: 'game-icons:hooded-figure',
    question: '你的精力从哪来',
    leftDesc: '你从行动、人群、碰撞中获得力量。破局靠调动人手，也靠当机立断。',
    rightDesc: '你从独处、思考、内省中获得力量。一个人时，你反而看得最清楚。',
  },
  {
    key: 'SN', left: 'S', right: 'N',
    leftName: '实感', rightName: '直觉',
    iconL: 'game-icons:magnifying-glass', iconR: 'game-icons:crystal-ball',
    question: '你如何获取信息',
    leftDesc: '你信眼睛看到的：脚印、卷宗、户籍、物证。真相藏在一笔笔具体的账里。',
    rightDesc: '你信脑子里推的：动机、人心、局面。真相藏在那些没被说出口的东西里。',
  },
  {
    key: 'TF', left: 'T', right: 'F',
    leftName: '思考', rightName: '情感',
    iconL: 'game-icons:scales', iconR: 'game-icons:two-hearts',
    question: '你如何做决定',
    leftDesc: '你按原则和结果下判断。必要的时候，你可以很冷。有些代价，必须有人付。',
    rightDesc: '你按人情和价值下判断。你做不到看着一个人去死，哪怕「道理」上该如此。',
  },
  {
    key: 'JP', left: 'J', right: 'P',
    leftName: '判断', rightName: '知觉',
    iconL: 'game-icons:anvil', iconR: 'game-icons:wind-slap',
    question: '你如何安排行动',
    leftDesc: '你要计划、要闭环、要一个交代。认准的路，撞了南墙也要把墙撞穿。',
    rightDesc: '你留余地、看情况、随机应变。路走不通就换一条，活人不能被规矩困死。',
  },
];

// ===== 16 型定义：中文名 + 长安化称号 + 描述 + 对应长安人物 =====
export const MBTI_TYPES = {
  INTJ: {
    name: '建筑师', title: '执棋者',
    desc: '你习惯在别人还在慌乱时，就已经推演完了三步。孤独、清醒、不近人情——但长安需要这样的人。',
    who: 'libi',
  },
  INTP: {
    name: '逻辑学家', title: '案牍中的推演者',
    desc: '你相信这天下没有算不出来的事。别人看到的是人，你看到的是数据、模型和概率。',
    who: 'xuhezi',
  },
  ENTJ: {
    name: '指挥官', title: '权柄执掌者',
    desc: '你天生要掌控局面。效率、结果、胜负——你不在乎过程好不好看，只在乎赢没赢。',
    who: 'linjiulang',
  },
  ENTP: {
    name: '辩论家', title: '冷眼旁观者',
    desc: '你享受拆解和质疑。你不太急着站队，因为你想先看清楚——谁才是那个赢家。',
    who: 'yaoruneng',
  },
  INFJ: {
    name: '提倡者', title: '心怀天下者',
    desc: '你心里有一幅理想的长安图景，并愿意为此耗尽一生。你温和，但极难被说服。',
    who: 'heyizheng',
  },
  INFP: {
    name: '调停者', title: '守灯人',
    desc: '你柔软，却有不肯弯的骨头。你不求改变天下，只想护住心里那一点点不肯妥协的东西。',
    who: 'dingtonger',
  },
  ENFJ: {
    name: '主人公', title: '聚火者',
    desc: '你能看见别人身上的光，并让他们也相信。人们愿意跟着你，不是因为你强，是因为你敢站在人前。',
    who: 'wangyunxiu',
  },
  ENFP: {
    name: '竞选者', title: '暗处的刃',
    desc: '你活得热烈，也活得难测。别人猜不透你，因为你连自己都不打算解释。',
    who: 'yuzhen',
  },
  ISTJ: {
    name: '物流师', title: '守序的军人',
    desc: '你信职责、信规矩、信一纸调令。别人谈大义，你只管把手上的事做到底。',
    who: 'cuiqi',
  },
  ISFJ: {
    name: '守卫者', title: '默默护持者',
    desc: '你几乎不说自己的苦。你只是在别人需要的时候，恰好就在那里。',
    who: 'tanqi',
  },
  ESTJ: {
    name: '总经理', title: '实务钻营者',
    desc: '你要的是秩序、效率和可预期的结果。你务实到近乎冷酷，但也因此很少犯错。',
    who: 'yuanzai',
  },
  ESFJ: {
    name: '执政官', title: '邻里长者',
    desc: '你在意身边每个人的感受，也愿意为这份和气操心到底。坊里的事，就是你的事。',
    who: 'baixing',
  },
  ISTP: {
    name: '鉴赏家', title: '刀锋上的实干者',
    desc: '你话不多，手很稳。道理讲不清楚的事，你用刀解决——你不爱争，但你从不退。',
    who: 'zhangxiaojing',
  },
  ISFP: {
    name: '探险家', title: '随性而行者',
    desc: '你不爱被安排。你跟着感觉走，爱你所爱，恨你所恨，活得坦荡。',
    who: 'wenran',
  },
  ESTP: {
    name: '企业家', title: '孤注一掷者',
    desc: '你在风险里反而最清醒。别人还在算，你已经冲出去了——赢了通吃，输了认命。',
    who: 'longbo',
  },
  ESFP: {
    name: '表演者', title: '坊间活字典',
    desc: '你活在当下，也活在人群里。规矩对你来说是拿来用的，不是拿来守的——没人比你更懂人心。',
    who: 'gela',
  },
};

// ===== 抉择权重表 =====
// 键：'场景id' -> 数组，按 scenes.js 里 choices 的顺序一一对应
// 值：{ EI: n, SN: n, TF: n, JP: n }，n 为 -3 ~ +3
//   正 → E/S/T/J    负 → I/N/F/P
// ⚠️ 改动 scenes.js 选项顺序必须同步改这里；tools/verify.mjs 会强制校验
export const MBTI_CHOICE = {
  // ==================== 序 · 死牢 ====================
  start: [
    { EI: +2 },                        // 「带路。」——跟他走（纯 E：主动行动）
    { EI: -2 },                        // 「我凭什么听你的？」（纯 I：先摸清底）
  ],
  s1_meet: [
    { EI: +2 },                        // 「说吧，要我做什么。」（纯 E：直接接任务）
    { TF: +2, EI: +1 },                // 「我要自由身。」——谈条件（主 T：谈判思维）
    { EI: -2, SN: -1 },                // 「我为什么要信你？」（主 I：保留判断）
    { SN: +2, TF: +1 },                // 「我不是唯一的人选。」——追问实据（S+T：先算清自己的分量）
  ],
  s1_task: [
    { EI: +3, JP: +1 },                // 「给我人，给我权。」（主 E：要资源）
    { EI: -3 },                        // 「我一个人就够了。」（纯 I：独行）
    { TF: -2, EI: -1 },                // 「先放我回坊里。」（主 F：想见人）
  ],
  // ==================== 子时 · 葛老 · 地下城 ====================
  h_zi2_gela: [
    { EI: +3 },                        // 亮靖安司腰牌（纯 E：以势压人）
    { EI: -3 },                        // 坐下喝茶，不急（纯 I：先观察）
    { SN: +3 },                        // 先看那个叛徒（纯 S：现场细节）
  ],
  // ==================== 丑时 · 大案牍术 ====================
  h_chou: [
    { SN: +3 },                        // 「那就先算。」（纯 S：信数据/实感）
    { EI: +2 },                        // 「跟我上街。」（纯 E：行动/外向）
    { JP: +2, SN: -1 },                // 「两条路都走。」（主 J：计划双线）
  ],
  // ==================== 寅时 · 宵禁 ====================
  h_yin: [
    { EI: -2, JP: -1 },                // 「跟上去，别惊动。」（主 I：独自尾随）
    { EI: +2 },                        // 「崔器，回去调人。」（纯 E：协作）
    { SN: +2, JP: +2 },                // 「记下巷子。」（主 S：实感记录）
  ],
  // ==================== 卯时 · 西市 ====================
  h_mao: [
    { JP: -2, EI: +1 },                // 直接追上去（主 P：临场反应）
    { EI: -3 },                        // 远远吊着（纯 I：独自跟踪）
    { EI: +2, SN: +1 },                // 找老熟人打听（主 E：用人脉）
  ],
  h_mao_chase: [
    { SN: +3 },                        // 搜他的身（纯 S：现场取证）
    { EI: +2, JP: +2 },                // 回报靖安司（E+J：协作+闭环）
  ],
  h_mao_tail: [
    { JP: -2, EI: +1 },                // 摸进去毁油罐（主 P：即兴冒险）
    { EI: +2, JP: +2 },                // 回去搬援兵（E+J：协作+计划）
    { EI: -3 },                        // 守在这里等（纯 I：独自蹲守）
  ],
  h_mao_ask: [
    { EI: +1, JP: +2 },                // 重谢，赶往修政坊（E+J：行动闭环）
    { EI: +2 },                        // 让他继续盯着（纯 E：用眼线）
  ],
  // ==================== 卯时 · 胡饼摊 ====================
  h_mao_snack: [
    { SN: +3 },                        // 慢慢嚼——面香菜香（纯 S：感官体验）
    { SN: -3 },                        // 边吃边想龙波动机（纯 N：抽象联想）
    { TF: -3 },                        // 掰饼给瞎眼老者（纯 F：人情温暖）
  ],
  // ==================== 辰时 · 线索汇聚 ====================
  h_chen: [
    { SN: +3 },                        // 查户籍，筛一遍（纯 S：数据驱动）
    { JP: -2, EI: +1 },                // 来不及了，直接去（主 P：随机应变）
    { TF: -2, EI: -1 },                // 我要见闻染（主 F：重人情）
  ],
  // ==================== 巳时 · 闻染 ====================
  h_si: [
    { SN: +2, TF: +1 },                // 接过文书当场翻（S+T：理性查证）
    { TF: -3 },                        // 「对不起，我给你交代。」（纯 F：情感承诺）
    { TF: +3 },                        // 「现在不是说这个的时候。」（纯 T：任务优先）
  ],
  h_si_doc: [
    { SN: -2, JP: +1 },                // 绕过去，不打草惊蛇（N+J：直觉策略）
    { TF: +2, EI: +1 },                // 绕过来，现在就去问（T+E：正面解决）
    { EI: +2, JP: +2 },                // 带回靖安司（E+J：协作闭环）
  ],
  // ==================== 午时 · 崔器 ====================
  h_wu: [
    { TF: -3, EI: +2 },                // 「我信你。跟我干。」（主 F：信任/情感）
    { TF: +3 },                        // 「你签字时没想过查？」（纯 T：追问原则）
    { TF: -2, EI: +2 },                // 「把知道的都说出来。」（主 F：保护+协作）
    { SN: +2, EI: +1 },                // 把文书摊开（条件选项：S 实感取证 + E 正面沟通）
  ],
  // ==================== 未时 · 靖安司之围 ====================
  h_wei: [
    { EI: +2, JP: +1 },                // 护着司丞杀出去（E+J：行动+计划）
    { TF: -3 },                        // 我去引开他们（纯 F：自我牺牲）
    { EI: -2, SN: -2, TF: +2 },        // 先看是谁下的令（I+N+T：冷静分析）
  ],
  // ==================== 未时 · 望楼独白 ====================
  h_wei_roof: [
    { JP: -3 },                        // 闭眼感受风（纯 P：随性/开放体验）
    { JP: +3 },                        // 心里排接下来的步骤（纯 J：计划/闭环）
    { TF: -3 },                        // 想起兄弟们喝酒的日子（纯 F：情感回忆）
  ],
  // ==================== 申时 · 真相一层 ====================
  h_shen: [
    { SN: -3 },                        // 「查朝堂。」（纯 N：直觉洞察）
    { SN: +2, JP: +1 },                // 「先保灯会。」（S+J：务实+闭环）
    { EI: +2, SN: -1 },                // 「两面都要。我要人手。」（E+N：双线布局）
  ],
  // ==================== 酉时 · 鱼肠 ====================
  h_you: [
    { TF: +2, JP: +1 },                // 「少卖关子。」（T+J：直接问结果）
    { TF: -2, JP: -2 },                // 坐下喝茶听她说（F+P：先听/开放）
    { EI: +1, TF: +2, JP: -2 },        // 直接动手（E+T+P：行动型决断）
  ],
  // ==================== 酉时 · 徐宾邀约 ====================
  h_you_xubin: [
    { TF: +3 },                        // 「不改。改了就不是我了。」（纯 T：原则/理性）
    { TF: -3 },                        // 「改的事太多了。」（纯 F：遗憾/情感）
    { JP: -3 },                        // 「你喝多了。」——沉默陪坐（纯 P：随性不急着答）
  ],
  // ==================== 戌时 · 龙波 ====================
  h_xu: [
    { TF: +1, JP: +2 },                // 「放下火折子。」——准备动手（T+J：决断）
    { SN: -2, TF: -2, JP: -1 },        // 「你恨什么？」（N+F+P：共情+倾听）
    { TF: -3 },                        // 「长安不欠你。仇我记下了。」（纯 F：理解与担当）
  ],
  // ==================== 亥时 · 最终抉择 ====================
  h_hai: [
    { JP: +3, TF: -2 },                // 「我愿意。」——拔刀一战（主 J：献身/决断）
    { EI: +2, TF: -3 },                // 「为这些人活。」（E+F：为他人/情感）
    { SN: -2, TF: -2, JP: -2 },        // 「收手吧，我替你报仇。」（N+F+P：共谋未来）
    { TF: -3, EI: +1 },                // 「我懂你。」——共情劝降（F：以情感动，不靠算计）
    { TF: +3, SN: -2, JP: +2 },        // 「我都查清楚了。」——推理突破（T+N+J：逻辑摊牌、串起全局、有备而来）
  ],
};

// ===== 角色 MBTI 向量（用于动态匹配"最相似的书中人物"）=====
// 取值为 -3 ~ +3：正 → E/S/T/J，负 → I/N/F/P
export const CHARACTER_MBTI = {
  // 刀锋上的实干者：独行、重现场、冷决、临场变通
  zhangxiaojing: { EI: -2, SN: +2, TF: +2, JP: -2 },
  // 执棋者：深谋、看大局、理性近乎冷、计划到底
  libi:          { EI: -2, SN: -2, TF: +3, JP: +3 },
  // 守序军人：闷头实干、重军务、按规矩、尽责
  cuiqi:         { EI: -1, SN: +3, TF: +2, JP: +3 },
  // 默默护持者：安静、细致、重情、忠诚
  tanqi:         { EI: -1, SN: +2, TF: -3, JP: +2 },
  // 随性而行者：跟着感觉走、敢爱敢恨、不喜束缚
  wenran:        { EI: 0,  SN: +1, TF: -2, JP: -2 },
  // 案牍中的推演者（INTP）：沉迷数据与模型、纯逻辑、开放推演不急于定论
  xuhezi:        { EI: -2, SN: 0,  TF: +3, JP: -1 },
  // 孤注一掷者：果决行动、冷酷执行、冒险豪赌
  longbo:        { EI: +1, SN: +1, TF: +2, JP: -2 },
  // 暗处的刃：神秘难测、看可能性、不受拘束
  yuzhen:        { EI: +1, SN: -2, TF: -1, JP: -3 },
  // 冷眼旁观者：八面玲珑、思辨、利己、不急着站队
  yaoruneng:     { EI: +2, SN: -1, TF: +2, JP: -1 },
  // 实务钻营者：交际、务实、利益优先、讲流程
  yuanzai:       { EI: +3, SN: +2, TF: +3, JP: +3 },
  // 权柄执掌者：战略、掌控、冷酷、求胜
  linjiulang:    { EI: +2, SN: -2, TF: +3, JP: +3 },
  // 心怀天下者：洞察本质、仁厚、理想坚定
  heyizheng:     { EI: -1, SN: -3, TF: -2, JP: +1 },
  // 市井烟火（ESFJ）：重人情、过眼前日子、守习俗
  baixing:       { EI: +2, SN: +2, TF: -2, JP: +1 },
  // 守灯人（INFP）：深情、内省、为心中那点不肯妥协的东西活着
  dingtonger:    { EI: -1, SN: -1, TF: -3, JP: -1 },
  // 聚火者（ENFJ）：敢担当、能凝聚人心、站在人前
  wangyunxiu:    { EI: +2, SN: -1, TF: -2, JP: +2 },
  // 平康坊之主（ESFP）：八面玲珑、活在当下、最懂人情世故
  gela:          { EI: +3, SN: +2, TF: -1, JP: -2 },
};

function zscore(vec, keys) {
  const vals = keys.map(k => vec[k] || 0);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
  const out = {};
  keys.forEach((k, i) => { out[k] = sd > 1e-6 ? (vals[i] - mean) / sd : 0; });
  return out;
}

// ===== 匹配最相似的书中人物 =====
// 策略：
//   1) 主匹配 = 与你 MBTI 型相同的那位人物（16 型 ↔ 16 人物，一一对应）
//   2) 契合度 = 你的四维强度与该人物向量的平均偏差（100 分制）
//   3) 次席   = 用 z-score 比较"特质形状"找第二接近的人物，提供补充视角
//      z 距离按理论最大值归一（4 维时每维最多差 2，故最大 d = 4），再线性映射到
//      0-100，避免出现没有依据的经验系数。
export function matchMBTICharacter(dims, type) {
  const keys = dims.map(d => d.key);
  const player = {};
  dims.forEach(d => { player[d.key] = d.leftPct - 50; });

  const main = (MBTI_TYPES[type] && MBTI_TYPES[type].who) || null;
  const cv = (v) => keys.map(k => ((v[k] || 0) / 3) * 50);

  // 统一算法：对每一位书中人物，都用"你的四维强度与其向量的平均绝对偏差"算契合度。
  // 主匹配固定取你类型对应的那位；次席取**排除主匹配后、同一把尺下**契合度最高的一位。
  // 这样主/次席是同一个度量，可以同榜排名，不再出现"主 81%、次 84%"这种不可比较的百分比。
  let best = null, bestSim = -1, second = null, secondSim = -1;
  for (const id in CHARACTER_MBTI) {
    if (!CHARACTER_MBTI[id]) continue;
    const c = cv(CHARACTER_MBTI[id]);
    const dev = keys.reduce((s, k, i) => s + Math.abs(player[k] - c[i]), 0) / keys.length;
    const sim = Math.max(0, Math.min(100, Math.round(100 - dev)));
    if (id === main) { best = id; bestSim = sim; continue; }
    if (sim > secondSim) { secondSim = sim; second = id; }
  }

  return {
    id: best, similarity: bestSim < 0 ? 0 : bestSim,
    second, secondSimilarity: secondSim < 0 ? 0 : secondSim,
  };
}

// ===== 每个节点的「机会统计」=====
// 归一化需要三个参照：
//   mean = 该节点所有选项在该维度的平均分 → 随机乱选的期望（零点 / 基线）
//   max  = 最高分 → 全选最左（E/S/T/J）能达到的上限
//   min  = 最低分 → 全选最右（I/N/F/P）能达到的下限
// ⚠️ 只取 max|w| 是不够的：单侧权重的节点里，"没选到"会被静默算成 0 分——
//    那不是"中性"，而是"无信号"，会让随机基线整体倒向某一侧。
// allowIdx 可选：只统计这些下标对应的选项（用于排除被 require 锁住的选项，
// 玩家选不到的选项不该进入基线，也不该抬高上限）。
export function mbtiNodeStats(sceneId, allowIdx) {
  const full = MBTI_CHOICE[sceneId] || [];
  const list = allowIdx ? full.filter((_, i) => allowIdx.includes(i)) : full;
  const out = {};
  MBTI_DIMS.forEach(d => {
    const vals = list.map(w => (w && typeof w[d.key] === 'number') ? w[d.key] : 0);
    const n = vals.length;
    const sum = vals.reduce((a, b) => a + b, 0);
    out[d.key] = n
      ? { n, mean: sum / n, max: Math.max(...vals), min: Math.min(...vals) }
      : { n: 0, mean: 0, max: 0, min: 0 };
  });
  return out;
}

// ===== 计算 MBTI 结果（机会基线归一化）=====
// raw  : { EI: n, ... } 玩家沿实际路径累计的分数
// stat : { EI: { mean, max, min, n }, ... } 沿同一条路径累计的机会统计
//
//   dev      = raw - mean        相对"随机答题"的偏移 —— 这才是真正的信号
//   向左余量 = max - mean        还能往 E/S/T/J 偏多少
//   向右余量 = mean - min        还能往 I/N/F/P 偏多少
//   区分幅度 = max - min         本局该维度的总区分能力；为 0 表示根本没考到
//
// 随机乱选会收敛到 50/50（因为它以自身期望为零点），而任何"稳定偏向一侧"
// 的选择都会被放大成明确倾向 —— 这正是"人的偏好"应该被测量的东西。
//
// 无偏好处理：dev 恰为 0 或该维度本局无区分度时，不再硬编码归右，
// 而是标记 resolved='tie' / 'none'，UI 如实显示"无偏好"，
// 类型码按惯例取左侧字母并在结果页注明。
export function computeMBTI(raw, stat) {
  const dims = MBTI_DIMS.map(d => {
    const k = d.key;
    const s = stat[k] || { mean: 0, max: 0, min: 0, n: 0 };
    const r = raw[k] || 0;

    const dev = r - s.mean;
    const upRoom = s.max - s.mean;
    const downRoom = s.mean - s.min;
    const spread = s.max - s.min;

    let leftPct, resolved;
    if (spread <= 1e-9) {
      leftPct = 50; resolved = 'none';
    } else if (dev > 1e-9 && upRoom > 1e-9) {
      leftPct = 50 + 50 * Math.min(1, dev / upRoom); resolved = 'ok';
    } else if (dev < -1e-9 && downRoom > 1e-9) {
      leftPct = 50 - 50 * Math.min(1, -dev / downRoom); resolved = 'ok';
    } else {
      leftPct = 50; resolved = 'tie';
    }
    leftPct = Math.round(Math.max(0, Math.min(100, leftPct)));
    // 展示精度下的平局：取整后仍落在 50/50（例如基线偏移极小被舍入吞掉），
    // 按"无偏好"处理，避免条形图停在 50/50 却仍被标成确定的 E/I/S/N/T/F/J 倾向。
    if (leftPct === 50) resolved = spread <= 1e-9 ? 'none' : 'tie';

    const letter = dev > 1e-9 ? d.left : dev < -1e-9 ? d.right : d.left;

    return {
      key: k, letter, resolved,
      left: d.left, right: d.right,
      leftName: d.leftName, rightName: d.rightName,
      leftPct, rightPct: 100 - leftPct,
      strength: Math.max(leftPct, 100 - leftPct),
      desc: letter === d.left ? d.leftDesc : d.rightDesc,
      question: d.question,
      iconL: d.iconL, iconR: d.iconR,
      raw: r, base: s.mean, dev,
      items: s.n,
      spread,
    };
  });
  const type = dims.map(d => d.letter).join('');
  const ties = dims.filter(d => d.resolved !== 'ok').map(d => d.left + '/' + d.right);
  return { type, dims, ties };
}

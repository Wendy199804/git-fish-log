import { WeeklyStats, MonthlyStats } from './analyzer.js';
/**
 * 文案原则
 *
 * 1. 调侃行为，不调侃努力。
 * 2. 可以玩梗，不攻击用户。
 * 3. 可以心疼爆肝，不讽刺加班。
 * 4. 可以笑摸鱼，不否定认真工作。
 * 5. 所有锐评最终应该让用户会心一笑，而不是看完觉得自己被冒犯。
 */

const SLACK_HIGH_CRITIQUES = [
  "本周摸鱼指数拉满！看来是在深度贯彻‘劳逸结合’的最高生产力原则，连下周中午吃什么都规划得井井有条。",
  "你的 Commit 列表干净得像刚洗过的脸。蓄势待发也是一种节奏，期待你下周积攒的大招！",
  "看来本周的项目进入了‘养精蓄锐’阶段——手机太好玩，或者床太暖和。摸鱼技巧已达炉火纯青之境。",
  "你的提交频率像极了退潮后的沙滩，毫无波澜。建议下周稍微动动手指，让 Git 图标重新亮起来。",
  "这提交次数，两只手都数得过来。看来是在践行‘不写代码就没有 bug’的至高防线，主打一个稳字当头。"
];

const SLACK_LOW_CRITIQUES = [
  "本周爆肝指数爆表！看到你这密密麻麻的提交记录，隔壁测试小姐姐的眼圈红了，连你的键盘都在为你长鸣。",
  "你这么拼命工作，代码库的半壁江山都是你打下来的。下周必须安排一杯奶茶，好好犒劳一下自己！",
  "兄弟，你这周的工时直接拉满了。建议给自己放个假，代码可以明天写，身体可没有撤销键，好好休息一下。",
  "疯狂搬砖，肝天肝地。不仅在跟时间赛跑，更是在用一己之力帮团队填平前期的各种技术坑，辛苦了！",
  "提交次数多到让人心疼。项目是长期的，身体是自己的。留点力气，下周我们继续细水长流。"
];

const GHOST_CRITIQUES = [
  "【幽灵提交预警】深夜的 Commit 闪烁着绿光。不过修仙归修仙，睡觉也是程序员的重要技能，快去休息吧。",
  "半夜三更还在提交代码，你是在和地球另一端的程序员打时差战，还是在享受深夜无打扰的灵感爆发？",
  "深夜 12 点后的提交被检测到！你这拼命的架势，是在用深夜的灵感为项目保驾护航，但也别忘了给身体充充电。",
  "别肝了别肝了，深夜还在提交，连 CI 机器人都想劝你早点睡，快存盘下班，梦里没有 bug。"
];

const CATEGORY_FIX_CRITIQUES = [
  "你已经成为团队的‘职业救火队长’，天天在代码库里考古和救火，团队的稳定防线全靠你死守。",
  "本月主要工作是修 Bug，占比高达 %PERCENT%%。是在一点点偿还技术债，也是在给后来的人铺平道路。",
  "天天都在 fix，看来这个月的系统稳定性全靠你在线守护了，妥妥的幕后英雄。",
  "代码库的清道夫，Bug 终结者。每修掉一个问题，系统就少一分隐患，安全感直接拉满。"
];

const CATEGORY_FEAT_CRITIQUES = [
  "本月 Feat 占比高达 %PERCENT%%。新功能一项接一项，开发火力全开，业务线因你而飞速前进！",
  "新功能狂魔！不停地推进需求和新业务。输出拉满的同时，也别忘了偶尔回头打磨一下细节。Btw：你辛苦啦！",
  "疯狂输出 feature！代码库的边界又被你向外拓展了一圈，妥妥的开拓先锋。"
];

const CATEGORY_CHORE_CRITIQUES = [
  "Chore/Docs 占了 %PERCENT%%。好的项目不仅需要代码，更需要有人把文档沉淀下来，前人栽树后人乘凉。",
  "天天都在改配置、修文档、格式化代码。你简直是代码库的优秀园丁，这些工作虽然低调，却让项目变得更健康、更易读。",
  "Chore/Docs 占比惊人，项目的长期稳定运行，离不开这些看似不起眼但极为关键的维护工作。"
];

const GENERAL_CRITIQUES = [
  "你的提交曲线像心电图一样平缓，基本上只在开会前和下班前有波动。完美地掌握了工作与休息的律动。",
  "本周的提交集中在特定时间段。上午静如处子，下午动如脱兔。完美找到了属于自己的高效率节奏。",
  "看着你的 Git Log，我仿佛看到了一位节奏大师。不紧不慢，偶尔落笔，却总是恰到好处地把工作完成得无可挑剔。",
  "你这星期的提交数据非常均衡——每天都保持着平稳的输出节奏。稳扎稳打，你就是团队里的定海神针。"
];

// ── 标签锐评池 ──
const TAG_FISH_MASTER_CRITIQUES = [
  "摸鱼宗师称号已解锁！把劳逸结合发挥到了极致，表面稳如泰山，实际上脑海里已经把假期规划做好了。",
  "摸鱼宗师，法力无边！能把生产力精确控制在刚刚好的舒适圈，也是一种让人羡慕的职场超能力。",
  "恭喜获得『摸鱼宗师』成就！Git 的留白是你的通行证，完美的节奏大师就是你。",
];

const TAG_VOLUME_KING_CRITIQUES = [
  "爆肝战神，恐怖如斯！你的 Git 时间线已经满得像春运火车站，建议给键盘买个意外险，辛苦了！",
  "爆肝战神就位！一个人顶起一个团队的产出，这个提交量，感觉你的手指已经敲出了残影。",
  "别人在休息，你在 commit；别人在睡觉，你还在 push。爆肝战神就是你！不过别忘了，程序要跑，人也要好好休息。",
];

const TAG_NIGHT_OWL_CRITIQUES = [
  "深夜修仙者，法力无边！凌晨的代码闪烁着独特的光芒，连 CI 跑通过去的速度都变快了。",
  "成为深夜修仙者意味着你的最佳工作时段是 00:00 ~ 05:00。白天在工位积攒灵感，晚上在键盘上疯狂输出，双重频率无缝切换。",
  "修仙大能！凌晨的 Git 记录见证了你的坚持与执着。不过修仙归修仙，记得给自己留足睡眠时间。",
];

const TAG_BUILDER_CRITIQUES = [
  "勤恳搬砖人，踏实如老黄牛！每一行代码都是你用手敲出来的，稳扎稳打，是整个项目最坚实的底座。",
  "搬砖人搬砖魂，代码基建全靠勤。你这个月的代码量，已经默默为项目砌起了一座高墙。",
  "勤恳搬砖，稳如泰山。不是最爱秀技巧的那个，但绝对是团队里最让人放心的那颗螺丝钉。继续加油！",
];

const TAG_BURST_CODER_CRITIQUES = [
  "一把梭哈型程序员！要么不写，一写就是几千行。你的大招式 Git Diff 让 reviewer 默默泡了一杯咖啡准备细细品味。",
  "一把梭哈玩家！全部需求一个 commit 搞定，代码在你的脑海里早已成型，直接来了一波完美的 Rush-B 落地。",
  "一把梭哈艺术家！你的每次提交都是一篇内容丰富的中篇小说，不鸣则已，一鸣惊人。",
];

const TAG_PPT_ARCHITECT_CRITIQUES = [
  "架构师风范隐藏成就解锁！提交多、改动少，你的 Git 历史就像一部充满仪式感的艺术品，重在梳理逻辑与结构。",
  "恭喜获得『优雅架构师』称号！每个 commit 都带着清晰的思路，重构于无形之中，diff 轻盈却至关重要。",
];

const TAG_FORMAT_MASTER_CRITIQUES = [
  "格式化大师隐藏成就解锁！提交了 10 次，改了不到 30 行——你对代码洁癖的坚持，让整个项目焕然一新。",
  "格式化大师！几十次提交全是改空格、加注释、调缩进。代码库的颜值被你拉到了巅峰，可读性大大提升！",
];

const TAG_GIT_CHATTER_CRITIQUES = [
  "Git 记录达人隐藏成就！15 次提交，平均每次不到 2 行——你是在用 Git 记录自己的心路历程吗？细颗粒度的提交让版本回滚毫无压力！",
  "Git 记录达人！把 commit 分拆得极其细腻，就像在写实时日志。这种高频微调的习惯，让代码追踪变得简单明了。",
];

const TAG_NIGHT_ASSASSIN_CRITIQUES = [
  "深夜刺客隐藏成就！修仙指数爆表但提交极其精炼——你是半夜顶着夜色偷偷上线搞定核心 bug，深藏功与名。",
  "深夜刺客！寥寥几次提交全在凌晨，白天闭目养神，半夜一击必杀，双面极客人生属实精彩。",
];

const TAG_DONKEY_CRITIQUES = [
  "全能战神隐藏成就解锁！周末爆肝 + 深夜修仙。Git 已经记住了你的每一分努力与付出，但也希望你别忘了好好照顾自己。",
  "周末和深夜都留下了你的足迹，这份责任感与坚持已经拉满。辛苦付出的同时，也请一定要留出时间好好生活。",
];

const TAG_FISH_IMMORTAL_CRITIQUES = [
  "摸鱼仙人隐藏成就！摸鱼指数突破 95%，一天只提交 0 或 1 次——你已经超越了普通的摸鱼，达到了无招胜有招的无为境界。",
  "摸鱼仙人，境界已超凡人！寥寥一次提交，高达 95%+ 的淡定率。用最少的动作维持系统的运转，不愧是世外高人。",
];

function getRandomItem(arr: string[]): string {
  const idx = Math.floor(Math.random() * arr.length);
  return arr[idx];
}

export function getAICritic(weeklyStats: WeeklyStats): string {
  const parts: string[] = [];

  // Check ghost commits first
  if (weeklyStats.ghostCommitsCount > 0) {
    parts.push(getRandomItem(GHOST_CRITIQUES));
  }

  // Check slack level
  if (weeklyStats.totalCommits === 0) {
    parts.push("本周提交次数为 0。完美的空气级贡献！老板可能还没发现你的工位是空的。建议下周偷偷提交一次，刷一下存在感。");
  } else if (weeklyStats.averageFish >= 75) {
    parts.push(getRandomItem(SLACK_HIGH_CRITIQUES));
  } else if (weeklyStats.averageFish <= 40) {
    parts.push(getRandomItem(SLACK_LOW_CRITIQUES));
  }

  // ── 标签锐评：收集本周所有标签，每个标签最多一条 ──
  const tagCritics = getTagCriticsFromDays(weeklyStats.days);
  if (tagCritics.length > 0) {
    // 用分隔线与上方总评隔开
    parts.push('─'.repeat(50));
    parts.push(...tagCritics.slice(0, 2)); // 最多展示 2 条标签锐评
  }

  // Fallback if empty
  if (parts.length === 0) {
    parts.push(getRandomItem(GENERAL_CRITIQUES));
  }

  return parts.join("\n\n");
}

export function getAICriticForMonth(monthlyStats: MonthlyStats): string {
  const parts: string[] = [];

  // Check ghost commits
  if (monthlyStats.ghostCommitsCount > 3) {
    parts.push(getRandomItem(GHOST_CRITIQUES));
  }

  // Find dominant category
  const { fix, feat, chore, other } = monthlyStats.categories;
  const total = fix + feat + chore + other;
  
  if (total > 0) {
    const fixPct = Math.round((fix / total) * 100);
    const featPct = Math.round((feat / total) * 100);
    const chorePct = Math.round((chore / total) * 100);

    if (fixPct >= 50) {
      parts.push(getRandomItem(CATEGORY_FIX_CRITIQUES).replace("%PERCENT%%", `${fixPct}%`));
    } else if (featPct >= 50) {
      parts.push(getRandomItem(CATEGORY_FEAT_CRITIQUES).replace("%PERCENT%%", `${featPct}%`));
    } else if (chorePct >= 40) {
      parts.push(getRandomItem(CATEGORY_CHORE_CRITIQUES).replace("%PERCENT%%", `${chorePct}%`));
    }
  }

  // Slack level evaluation
  if (monthlyStats.totalCommits === 0) {
    parts.push("本月提交次数为 0！你成功地在公司蒸发了一个月，拿到了全额工资。建议你下个月继续保持低调，不要让 HR 注意到你。");
  } else if (monthlyStats.averageFish >= 70) {
    parts.push(getRandomItem(SLACK_HIGH_CRITIQUES));
  } else if (monthlyStats.averageFish <= 35) {
    parts.push(getRandomItem(SLACK_LOW_CRITIQUES));
  }

  // Fallback
  if (parts.length === 0) {
    parts.push(getRandomItem(GENERAL_CRITIQUES));
  }

  return parts.join("\n\n");
}

// ── 标签 → 锐评映射 ──
const TAG_CRITIQUE_MAP: Record<string, string[]> = {
  '🐟 摸鱼宗师': TAG_FISH_MASTER_CRITIQUES,
  '🔥 爆肝战神': TAG_VOLUME_KING_CRITIQUES,
  '🌙 深夜修仙者': TAG_NIGHT_OWL_CRITIQUES,
  '🧱 勤恳搬砖人': TAG_BUILDER_CRITIQUES,
  '💥 一把梭哈型程序员': TAG_BURST_CODER_CRITIQUES,
  '🏷️ PPT 架构师': TAG_PPT_ARCHITECT_CRITIQUES,
  '🏷️ 格式化大师': TAG_FORMAT_MASTER_CRITIQUES,
  '💬 Git 聊天达人': TAG_GIT_CHATTER_CRITIQUES,
  '🌙 深夜刺客': TAG_NIGHT_ASSASSIN_CRITIQUES,
  '🐴 生产队的驴': TAG_DONKEY_CRITIQUES,
  '🐟️ 摸鱼仙人': TAG_FISH_IMMORTAL_CRITIQUES,
};

interface DayLike {
  tags?: string[];
  fish?: number;
  hardworking?: number;
}

/**
 * 根据标签文本查找对应的吐槽池（支持动态后缀如 "(均500行/次)"）
 */
function findTagPool(tag: string): string[] | undefined {
  // 精确匹配
  if (TAG_CRITIQUE_MAP[tag]) return TAG_CRITIQUE_MAP[tag];
  // 前缀匹配（处理带动态后缀的标签）
  for (const [key, pool] of Object.entries(TAG_CRITIQUE_MAP)) {
    if (tag.startsWith(key)) return pool;
  }
  return undefined;
}

/**
 * 从多天数据中收集标签并生成锐评
 */
function getTagCriticsFromDays(days: DayLike[]): string[] {
  const seenPrefixes = new Set<string>();
  const critics: string[] = [];

  for (const day of days) {
    if (!day.tags) continue;
    for (const tag of day.tags) {
      // 提取标签前缀用于去重（去掉如 "(均500行/次)" 后缀）
      const prefix = tag.replace(/\s*\(.*\)$/, '');
      if (seenPrefixes.has(prefix)) continue;
      seenPrefixes.add(prefix);

      const pool = findTagPool(tag);
      if (pool && pool.length > 0) {
        critics.push(getRandomItem(pool));
      }
    }
  }

  return critics;
}

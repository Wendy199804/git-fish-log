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
  "本周摸鱼指数拉满，松弛感直接溢出屏幕。劳逸结合这块，你算是玩明白了。",
  "Commit 列表清爽得像刚格式化过的硬盘。",
  "本周项目进入了'养精蓄锐'缓冲阶段，摸鱼技巧已臻化境。",
  "提交频率平缓如心电图，稳定，就是有点太平了。",
  "提交次数两只手数得过来。'不写代码就没有bug'！逻辑自洽，无法反驳。",
  "少量提交搞定全部任务，高效收工后安心放空。懂休息的人，才懂长久。",
  "Git页面一片清净，没有迭代痕迹，不用追赶进度的一周，舒服得让人嫉妒。"
];

const SLACK_LOW_CRITIQUES = [
  "这周代码库的半壁江山是你打下来的。忙完记得给自己点杯冰奶茶，你值得。",
  "有效工时拉满，从早迭代到晚。代码能回滚，身体不能——抽空歇歇。",
  "高强度搬砖不停歇，不止在赶 deadline，还在默默填团队的历史坑。辛苦了。",
  "提交数量多到心疼。项目是持久战，身体才是本金，留点余量。",
  "全天在线持续输出，大小需求一手包揽，团队进度有你兜底。记得多喝水，多走动。",
  "整周高负荷输出！工作再重要，也别把身体当一次性耗材。"
];

const GHOST_CRITIQUES = [
  "【幽灵提交预警】凌晨的 Commit 泛着清冷的光。适度熬夜可以，但睡觉也是核心技能。",
  "半夜还在 push，是跟同事对线，还是单纯享受凌晨无人打扰的灵感爆发？",
  "零点过后大量提交被捕获！熬夜稳住进度的样子很拼，但身体也需要充电。",
  "还在通宵硬肝？CI 机器人都想下班了，写完赶紧存盘休息。",
  "凌晨专属开发者，白天被琐事缠身，只能深夜啃硬骨头。长期熬夜伤的是你自己。",
  "深夜独守工位，每条凌晨提交都是卡点的代价。专注值得肯定，但别天天修仙。",
  "别人已入梦乡，你的 Git 还在更新。深夜适合攻坚，记得设个闹钟，到点下线。"
];

const CATEGORY_FIX_CRITIQUES = [
  "团队专属救火队长，泡在代码库里考古溯源、线上救火。系统的稳定防线，是你守住的。",
  "本月核心就是修 Bug，修复类提交占比 %PERCENT%%。一点点清技术债、扫隐患，给后人铺路。",
  "每日 fix 模式循环，系统稳定度靠你兜底。默默处理异常，是代码背后的无名英雄。",
  "代码库清道夫、Bug 终结者。每修一处漏洞，系统就少一分隐患，安全感拉满。",
  "大半精力投入故障修复，主动接棘手问题，帮团队规避线上风险。枯燥的修复，耐心做完。",
  "整月专注兜底维稳，细碎 bug 逐一清零。有你在，大家迭代新需求都安心。",
  "深耕修复赛道，追溯每处报错根源，不敷衍。用一次次 fix 筑牢底层稳定性，低调但关键。"
];

const CATEGORY_FEAT_CRITIQUES = [
  "本月 Feat 提交占比 %PERCENT%%，新需求一项接一项落地。业务线因你飞速推进。",
  "新功能开发主力！不停接需求、落模块，输出量拉满。忙完记得回头打磨细节，辛苦啦。",
  "持续高频输出 feature，业务边界被你一次次拓宽。团队里的功能开拓先锋，认证。",
  "整月主攻新模块、新流程，源源不断交付能力。业务拓展靠你支撑，忙完记得缓一缓。",
  "大半提交用于搭建新功能，主动啃复杂需求，丰富产品能力。版图扩张，离不开你。",
  "以新功能为主线，从 0 到 1 搭建模块，落地效率出色。开拓型选手，认证。",
  "专注创新迭代，新需求快速上线，持续叠加特性。推进增长功不可没，记得劳逸结合。"
];

const CATEGORY_CHORE_CRITIQUES = [
  "Chore、Docs 提交占比 %PERCENT%%。成熟项目不止靠业务代码，也靠文档规范沉淀。前人栽树，后人乘凉。",
  "每日埋头改配置、补注释、统一格式，你是代码库的园丁。不起眼，但维护着健康度。",
  "Chore 与文档占比亮眼，项目长期稳定迭代，离不开这些低调琐碎的支撑工作。",
  "主动包揽杂项维护：更新配置、补文档、统一格式。默默优化协作环境，降低沟通成本。",
  "不追亮眼新功能，深耕基础维护。规整目录、补充说明，一点点降维护成本，是隐性基石。",
  "把优化环境、完善文档当日常，持续规整代码库。琐碎维护耐心做完，提升团队效率。",
  "专注基建维护，配置、文档、格式一手包办。平淡的提交，长期造福全体开发。"
];

const GENERAL_CRITIQUES = [
  "整周提交曲线平缓规律，波动集中在晨会前、下班前。拿捏了自己的节奏，松弛又高效。",
  "提交时间特征鲜明：上午静如处子沉淀思路，下午动如脱兔集中输出。精准锁定高效时段。",
  "Git Log 像顶级调度大师的作品，不疾不徐、张弛有度。偶尔落子，却恰到好处完成全部。",
  "提交数据均衡稳定，每日均匀输出，不爆肝不空白。稳扎稳打，是团队最安心的定海神针。",
  "节奏张弛有度，不猛冲不拖延。每日稳定产出少量有效提交，细水长流完成规划。",
  "开发时间规律，懂得拆分工作量均匀分摊。拒绝突击，平缓输出，有效降低自身压力。",
  "Git 历史节奏舒服，无极端波动。长期均衡开发，保证推进，也不陷入持续内耗。"
];

// ── 标签锐评池 ──

const TAG_FISH_MASTER_CRITIQUES = [
  "摸鱼宗师称号已解锁！把劳逸结合发挥到了极致，高效完成本职工作之余，周末出行、下午茶清单早已规划完毕，松弛感直接拉满。",
  "摸鱼宗师，法力无边！能把每日生产力精确控制在刚刚好的平衡点，不多不少刚好达标，这份收放自如的职场平衡术，是让人羡慕的顶级职场超能力。",
  "恭喜获得『摸鱼宗师』成就！Git 的留白是你的专属通行证，工作节奏拿捏得恰到好处，该产出时不掉链子，该放松时绝不内耗，完美节奏掌控者非你莫属。",
  "顶级摸鱼宗师登场！上班状态松弛有度，任务按时落地绝不拖沓，其余时间安心放空充电，懂得适时放松才能长久保持高效，智慧打工人模板有了。",
  "别人匆忙埋头猛敲，你从容稳步完成本职，摸鱼宗师的精髓不是摆烂，而是高效完工后安心享受闲暇，平衡工作与生活这块被你玩明白了。"
];

const TAG_VOLUME_KING_CRITIQUES = [
  "爆肝战神，恐怖如斯！你的 Git 时间线密密麻麻，提交密度惊人，全天不间断持续输出，建议给键盘放个假，长期高强度输出真的辛苦了！",
  "爆肝战神就位！单人产出直接顶起半支小队的工作量，密密麻麻的提交记录肉眼可见，飞速敲击的键盘都快敲出残影，敬业程度直接拉满。",
  "别人下班休息追剧，你在持续 commit；别人深夜安稳睡觉，你还在远程 push 迭代。爆肝战神当之无愧！但程序稳定运行的同时，你也要好好吃饭休息。",
  "全时段在线爆肝选手上线，从早到晚持续更新迭代，每一条提交记录都是默默付出的证明，团队离不开你的强力输出，记得抽空站起来活动身体、多喝温水。",
  "提交量断层领先全场的爆肝大佬，大小需求统统包揽落地，为项目推进立下汗马功劳，高强度输出固然值得称赞，千万不要长期透支自己的身体哦。"
];

const TAG_NIGHT_OWL_CRITIQUES = [
  "深夜修仙者，法力无边！凌晨安静时段敲出的代码自带专注加成，无人打扰的深夜灵感爆发，连思路运转的速度都仿佛变快了不少。",
  "深夜修仙者的专属黄金工作时段锁定 00:00 ~ 05:00。白天工位沉淀梳理需求积攒灵感，深夜独处时集中输出落地，昼夜双时段模式无缝自由切换。",
  "修仙大能认证！一条条凌晨Git记录默默见证你的坚持与专注，深夜安静环境更容易理清复杂逻辑。不过适度修仙即可，记得预留充足睡眠时间恢复精力。",
  "偏爱深夜独处编码的修仙选手，万籁俱寂的时候思路格外清晰，很多棘手难题都在凌晨被你逐个攻克，高效夜间选手认证，别长期熬到天光才休息。",
  "白日处理沟通琐事，深夜沉浸式专注编码，深夜修仙模式适配度满分，靠着深夜安静环境攻克大量难点，记得定时放下电脑，保证充足睡眠养护身体。"
];

const TAG_BUILDER_CRITIQUES = [
  "勤恳搬砖人，踏实如老黄牛！项目里每一行落地可用的代码都是你亲手逐行敲写，做事稳扎稳打不投机取巧，是支撑整个项目稳定运行最坚实的底层底座。",
  "搬砖人搬砖魂，项目代码基建全靠勤恳搭建。本月稳定持续输出大量业务代码，一步一个脚印默默为项目筑起稳固功能高墙，靠谱程度拉满。",
  "勤恳搬砖，稳如泰山。不追逐花哨炫技的写法，专注完成落地可用的业务逻辑，是团队里所有人都放心托付需求的定心螺丝钉，脚踏实地继续闪闪发光！",
  "低调务实的资深搬砖选手，不抢风头不搞花活，专注夯实基础业务能力，所有繁杂基础需求都能稳妥交付，项目稳定运行离不开你的默默耕耘。",
  "日复一日稳定输出的基建选手，大小琐碎业务需求全部妥善承接，做事细致靠谱不出纰漏，团队基石般的存在，你的踏实付出所有人都看在眼里。"
];

const TAG_BURST_CODER_CRITIQUES = [
  "一把梭哈型程序员登场！单次超大篇幅Git Diff直接拉满，负责review的同事可以泡上一杯热茶，准备静心研读你一次性落地的完整逻辑。",
  "一把梭哈硬核玩家！整套需求逻辑全部整合进单次commit一次性交付，完整方案早在脑海中构思成型，直接一波丝滑推进完整落地，效率惊人。",
  "一把梭哈代码艺术家！你的每一次提交都像一篇内容完整逻辑闭环的中篇技术文稿，平时少有零散小改动，一旦出手便是完整功能大更新，不鸣则已一鸣惊人。",
  "习惯整体构思完整再统一提交的梭哈大佬，省去频繁碎片化提交，整套功能一次性落地，逻辑连贯完整，评审阶段需要多花一点时间研读，但逻辑连贯完整值得投入。",
  "一次性搞定整套业务模块的梭哈大神，擅长全盘梳理需求后集中输出，省去反复拆分提交的繁琐，大局观拉满，堪称完整需求一次性交付标杆。"
];

const TAG_PPT_ARCHITECT_CRITIQUES = [
  "架构师风范隐藏成就解锁！提交次数频繁但单轮改动精简克制，你的Git历史记录像精心编排的技术艺术品，重心放在梳理项目逻辑、优化整体架构。",
  "恭喜获得『优雅架构师』称号！每一条commit都带着清晰规整的重构思路，在无形之中梳理优化项目结构，diff改动轻盈精简，却对整体架构起到至关重要的优化作用。",
  "专注架构优化的优雅大佬，不堆砌冗余业务代码，专注调整项目分层、规范调用逻辑，每次小提交都在潜移默化优化项目底层结构，眼光长远。",
  "代码世界的规划设计师，频繁微调项目结构与分层逻辑，比起增量功能更看重项目长期可维护性，细碎提交背后都是对架构长远发展的深度考量。",
  "以重构优化为核心工作的架构能手，轻量高频提交持续打磨项目骨架，默默规避后续迭代隐患，眼光放得长远，是团队技术规划的重要推手。"
];

const TAG_FORMAT_MASTER_CRITIQUES = [
  "格式化大师隐藏成就解锁！累计提交多次，代码改动行数寥寥——你对代码规范与整洁度有着极致追求，细微调整直接让整个项目代码库焕然一新。",
  "格式化大师实锤！多次提交全部聚焦调整空格、补充注释、统一缩进规范，不求新增大量功能代码，一心拉高代码库整体颜值，大幅提升后续阅读可读性！",
  "执着于代码整洁度的规范守护者，不放过任何一处缩进、空格、注释瑕疵，反复提交微调统一项目编码风格，让同事接手代码时都能看得清晰顺畅。",
  "代码颜值管理员上线，比起新增业务功能，更在意整体代码风格统一规整，细碎的规范化调整日积月累，大幅降低团队后续协作阅读成本。",
  "极致细节控格式化大佬，每一处排版、注释、符号都严格遵循统一标准，一次次细微提交打磨项目代码风貌，完美治愈所有人的代码强迫症。"
];

const TAG_GIT_CHATTER_CRITIQUES = [
  "Git 记录达人隐藏成就！多次拆分提交，平均单次改动精简至极——你像是在用Git版本库实时记录编码思路，极致细颗粒度拆分，后续版本回滚调试毫无压力！",
  "Git 记录达人认证！把每一小步改动都拆分为独立commit，细粒度拆分如同实时编写开发日志，调试、回滚、定位问题时一目了然，代码追踪难度大幅降低。",
  "极致细分提交习惯的细致选手，任何微小改动单独记录，不怕提交数量多，只求每一步改动清晰可追溯，排查线上bug时这份细致能省下大量排查时间。",
  "开发过程可视化大师，将新增、修改、修复全部拆分为独立记录，Git历史清晰记录每一步开发思路，协作调试时能快速看懂代码迭代全过程，协作体验拉满。",
  "偏爱小步快跑式编码的细心开发者，一点改动一次提交，拒绝大段混合修改，版本历史干净通透，是团队里方便协同排错的优质开发模板。"
];

const TAG_NIGHT_ASSASSIN_CRITIQUES = [
  "深夜刺客隐藏成就！修仙熬夜指数直接爆表，但每次提交内容精炼高效——专挑夜深人静的深夜上线，悄无声息搞定核心阻塞bug，事成之后深藏功与名。",
  "深夜刺客登场！少量高质量提交全部诞生于凌晨时段，白天低调沉淀不张扬，深夜出手精准解决关键难题，昼夜反差拉满，双面极客人生相当精彩。",
  "专属深夜上线的bug杀手，避开白天嘈杂沟通时段，凌晨安静环境精准定位核心故障，少量精炼改动直接根治疑难问题，低调解决团队棘手卡点。",
  "白天低调处理日常琐事，深夜化身代码刺客精准攻坚阻塞项目的核心难题，没有无效提交，一招一式直击问题根源，高效又低调。",
  "擅长利用凌晨安静窗口解决顽固线上问题，没有无效提交，每一次深夜更新都直击核心痛点，默默扫清项目迭代路上的各类障碍。"
];

const TAG_DONKEY_CRITIQUES = [
  "全能战神隐藏成就解锁！周末持续爆肝迭代 + 日常深夜修仙攻坚双模式叠加。Git记录了你每一份辛苦付出，但也记得别长期透支，留出时间好好照顾自己。",
  "周末休息时段、万籁俱寂的深夜都留下了你的代码提交足迹，责任心与吃苦耐劳属性直接拉满。全力为项目冲锋的同时，务必留出空闲时间好好生活放松。",
  "全年无休式全能选手，工作日熬夜攻坚、周末主动补全迭代，项目任何时段缺人兜底总有你，付出值得所有人认可，切记劳逸结合不要过度劳累。",
  "兼顾深夜攻坚与周末补迭代的全能兜底选手，项目有紧急需求时总能上线处理，承担大量额外工作量，在拼命推进进度的同时记得多休息调养身心。",
  "全天候待命的项目守护者，不分工作日休息日、不分白昼深夜，随时上线解决迭代卡点，高强度付出值得点赞，一定要给自己留出放松休息的专属时间。"
];

const TAG_FISH_IMMORTAL_CRITIQUES = [
  "摸鱼仙人隐藏成就！摸鱼松弛指数拉满，单日提交0-1次即可完成全部本职工作——早已超越普通浅层摸鱼，抵达以简驭繁、无招胜有招的职场至高境界。",
  "摸鱼仙人，境界已然不同凡响！每日仅需寥寥一次轻量提交，淡定松弛率极高，用最少的提交稳稳维持业务正常运转，妥妥世外职场高人。",
  "参透职场平衡之道的摸鱼仙人，超高效率快速完成当日全部任务，剩余时间安心放空充电，不用内卷消耗自己，高效完成本职就是最高级的摸鱼智慧。",
  "极简工作流仙人，少量操作就能稳妥交付全部工作内容，从不盲目消耗时间内卷，懂得高效完工、适度放松，把工作生活平衡拿捏到极致。",
  "别人花费一整天忙碌在工位，你短时高效完成全部需求，其余时间从容自在休整，摸鱼仙人的核心从来不是摆烂，是超高工作效率带来的松弛自由。"
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

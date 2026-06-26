import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import {
  getProjects,
  addProject,
  removeProject,
  scanDirectory,
  writeConfig,
  readConfig,
  setGitLabConfig,
  clearGitLabConfig,
} from './config.js';
import {
  analyzeWeekly,
  analyzeMonthly,
  analyzeHourDistribution,
  getGhostCommits,
  getThisWeekRange,
  getThisMonthRange,
  WeekDayStats,
} from './analyzer.js';
import { getAICritic, getAICriticForMonth } from './critic.js';
import { isHoliday, isCompensatoryWorkday } from './holiday.js';

const program = new Command();

function getCliVersion(): string {
  try {
    const packageJson = JSON.parse(
      fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    ) as { version?: string };
    return packageJson.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

// ── 可爱的 Loading 动画 ──
const SPINNER_FRAMES = ['🐟  ', ' 🐠 ', '  🐡 ', ' 🦈 ', '  🐙 ', ' 🦑  '];
function showLoading(message: string): { update: (msg: string) => void; stop: () => void } {
  let frameIdx = 0;
  process.stdout.write('\x1B[?25l'); // 隐藏光标
  const timer = setInterval(() => {
    process.stdout.write(`\r${chalk.cyan(SPINNER_FRAMES[frameIdx])} ${chalk.yellow(message)} `);
    frameIdx = (frameIdx + 1) % SPINNER_FRAMES.length;
  }, 150);
  return {
    update: (msg: string) => { message = msg; },
    stop: () => {
      clearInterval(timer);
      process.stdout.write('\r' + ' '.repeat(60) + '\r');
      process.stdout.write('\x1B[?25h'); // 显示光标
    },
  };
}

function printBanner(title: string) {
  console.log(chalk.cyan.bold('\n' + '='.repeat(50)));
  console.log(chalk.blue.bold(` 🐟 FISH - ${title}`));
  console.log(chalk.cyan.bold('='.repeat(50) + '\n'));
}

function formatSlackIndex(fish: number): string {
  if (fish >= 90) {
    return chalk.green(`${fish}% (终极摸鱼 🎣)`);
  } else if (fish >= 70) {
    return chalk.green(`${fish}% (合理划水 ☕)`);
  } else if (fish >= 40) {
    return chalk.yellow(`${fish}% (正常营业 💻)`);
  } else {
    return chalk.red(`${fish}% (火力全开 🔥)`);
  }
}

function formatNightOwlIndex(nightOwl: number): string {
  if (nightOwl >= 60) {
    return chalk.red.bold(`${nightOwl}% (修仙大佬 🧙)`);
  } else if (nightOwl >= 30) {
    return chalk.red(`${nightOwl}% (夜猫出没 🦉)`);
  } else if (nightOwl >= 10) {
    return chalk.yellow(`${nightOwl}% (偶尔熬夜 🌙)`);
  } else {
    return '';
  }
}

function formatOvertimeIndex(fish: number): string {
  if (fish >= 80) {
    return chalk.green(`${fish}% (周末摸鱼 🎣)`);
  } else if (fish >= 50) {
    return chalk.yellow(`${fish}% (轻微加班 🌙)`);
  } else if (fish >= 20) {
    return chalk.red(`${fish}% (周末爆肝 🔥)`);
  } else {
    return chalk.red.bold(`${fish}% (终极爆肝 ☠️)`);
  }
}

function formatCodeVolume(totalLines: number): string {
  if (totalLines <= 0) return '';
  if (totalLines >= 1000) {
    return chalk.red.bold(`${totalLines}行 (代码核爆 ☢️)`);
  } else if (totalLines >= 500) {
    return chalk.magenta(`${totalLines}行 (搬砖狂魔 🚚)`);
  } else if (totalLines >= 200) {
    return chalk.yellow(`${totalLines}行 (大型改动 🧱)`);
  } else if (totalLines >= 80) {
    return chalk.cyan(`${totalLines}行 (正常营业 📦)`);
  } else if (totalLines >= 20) {
    return chalk.green(`${totalLines}行 (缝缝补补 🔧)`);
  } else {
    return chalk.gray(`${totalLines}行 (小修小补 ✏️)`);
  }
}

function getPersonalityTag(day: WeekDayStats): string | null {
  return day.tags.length > 0 ? day.tags.join(' ') : null;
}

function colorizeTags(tagStr: string): string {
  const colorMap: Record<string, (s: string) => string> = {
    '🐟 摸鱼宗师': chalk.green,
    '🔥 爆肝战神': chalk.red.bold,
    '🌙 深夜修仙者': chalk.red,
    '🧱 勤恳搬砖人': chalk.yellow,
    '💥 一把梭哈型程序员': chalk.magenta,
    '🏷️ PPT 架构师': chalk.blue,
    '🏷️ 格式化大师': chalk.cyan,
    '💬 Git 聊天达人': chalk.greenBright,
    '🌙 深夜刺客': chalk.redBright,
    '🐴 生产队的驴': chalk.yellowBright,
    '🐟 摸鱼仙人': chalk.green.bold,
    '🐟 今日暂无代码活动': chalk.green,
  };
  // 按 key 长度降序，确保 "💥 一把梭哈型程序员" 优先于短 key 匹配
  const sortedKeys = Object.keys(colorMap).sort((a, b) => b.length - a.length);
  let result = tagStr;
  for (const key of sortedKeys) {
    const colorFn = colorMap[key];
    // 替换完整 tag（支持如 "💥 一把梭哈型程序员 (均500行/次)" 的动态后缀）
    const regex = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s*\\([^)]*\\))?', 'g');
    result = result.replace(regex, (match) => {
      // 基础标签着色，括号内详情不着色
      const suffixMatch = match.match(/^(.+?)(\s*\(.*\))?$/);
      if (suffixMatch) {
        return colorFn(suffixMatch[1]) + (suffixMatch[2] || '');
      }
      return colorFn(match);
    });
  }
  return result;
}

// ── 视觉宽度辅助（中文等宽字符占 2 列）──
function visualWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    // CJK、全角符号、emoji 等占 2 列
    w += /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef\u{1f000}-\u{1ffff}]/u.test(ch) ? 2 : 1;
  }
  return w;
}

function visualPad(s: string, width: number): string {
  const vw = visualWidth(s);
  if (vw >= width) return s;
  return s + ' '.repeat(width - vw);
}

/** 对已经 pad 好的鱼值行逐列着色，避免转义码破坏对齐 */
function colorizeFishRow(row: string): string {
  const COL_WIDTH = 8;
  let result = '';
  for (let i = 0; i < row.length; i += COL_WIDTH) {
    const chunk = row.slice(i, i + COL_WIDTH);
    const val = parseInt(chunk.trim(), 10);
    if (isNaN(val)) {
      result += chunk;
    } else if (val >= 80) {
      result += chalk.green(chunk);
    } else if (val >= 40) {
      result += chalk.yellow(chunk);
    } else {
      result += chalk.red(chunk);
    }
  }
  return result;
}

function getTargetDate(weeksAgo: number, isMonth: boolean): Date {
  const now = new Date();
  if (weeksAgo <= 0) {
    return now;
  }
  if (isMonth) {
    now.setMonth(now.getMonth() - weeksAgo);
  } else {
    now.setDate(now.getDate() - weeksAgo * 7);
  }
  return now;
}

// ──────────────────────── 随机吐槽池 ────────────────────────
function randomPick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

const COMMENT_POOLS: Record<string, { color: (s: string) => string; tags: string[] }> = {
  '0-2': { color: chalk.red, tags: [
    '服务器和你，总得有一个睡觉 😵‍💫',
    '夜猫修仙 🧙',
    '这提交不像工作，像报复代码 😈',
    '深夜修仙型程序员 🌙',
  ]},
  '3-5': { color: chalk.redBright, tags: [
    '阎王：怎么又是你？👻',
    '生物钟已阵亡 ☠️',
    '哥，你是住公司了吗 🏢',
    '鸡鸣即起型牛马 🐔',
  ]},
  '6-8': { color: chalk.gray, tags: [
    '鸡都没起，你先上班了 🐔',
    '天选牛马已上线 🐂',
    '爆肝启动成功 🚀',
    '早起的 commit 有 bug 吃 🐛',
  ]},
  '9-11': { color: chalk.yellow, tags: [
    '假装很忙，其实在等午饭 🍱',
    '晨间coding ☕',
    '正常人类工作时间 ✅',
    '上午表演型选手 🚀',
  ]},
  '12-13': { color: chalk.green, tags: [
    '工位吃饭，灵魂续命 🔋',
    '干饭是第一生产力 🍚',
    '一边吃饭一边 commit 🍜',
    '干饭续命型工程师 🍱',
  ]},
  '14-15': { color: chalk.cyan, tags: [
    '午睡未醒，人已开工 😪',
    'CPU 重启中 🔄',
    // '午觉没睡成，拿代码出气 💢',
    '午后灵魂出窍者 👻',
  ]},
  '16-17': { color: chalk.cyanBright, tags: [
    '开始思考今晚吃什么 🍳',
    '灵魂已下班 👻',
    '临近下班突然勤奋 🤔',
    '等下班观察员 🍵',
  ]},
  '18-20': { color: chalk.magenta, tags: [
    '加班是不可能主动加班的 💼',
    '工位封印解除 🔓',
    '白天在开会，晚上真干活 💻',
    '自愿（被迫）加班人 💪',
  ]},
  '21-22': { color: chalk.magentaBright, tags: [
    '老板下班了，你还没下线 😭',
    '加班仙人渡劫中 ⚡',
    '今日最后一个 commit（骗自己）🤡',
    '大福报时间 🔥',
  ]},
  '23': { color: chalk.red, tags: [
    '代码和头发一起掉光中 🧑‍🦲',
    '今日 KPI：活着就行 😌',
    '睡吧，Git 不会跑 🛌',
    '夜深了，合上电脑吧 📴',
  ]},
};

function getHourTag(hour: number): string {
  let pool;
  if (hour >= 0 && hour <= 2)       pool = COMMENT_POOLS['0-2'];
  else if (hour >= 3 && hour <= 5)  pool = COMMENT_POOLS['3-5'];
  else if (hour >= 6 && hour <= 8)  pool = COMMENT_POOLS['6-8'];
  else if (hour >= 9 && hour <= 11) pool = COMMENT_POOLS['9-11'];
  else if (hour >= 12 && hour <= 13) pool = COMMENT_POOLS['12-13'];
  else if (hour >= 14 && hour <= 15) pool = COMMENT_POOLS['14-15'];
  else if (hour >= 16 && hour <= 17) pool = COMMENT_POOLS['16-17'];
  else if (hour >= 18 && hour <= 20) pool = COMMENT_POOLS['18-20'];
  else if (hour >= 21 && hour <= 22) pool = COMMENT_POOLS['21-22'];
  else                               pool = COMMENT_POOLS['23'];

  return pool.color(` (${randomPick(pool.tags)})`);
}
// ─────────────────────────────────────────────────────────────

async function runWeeklyReport(weeksAgo: number, source?: string, showProjects: boolean = false) {
  const projects = getProjects();
  
  let timeTag = '';
  if (weeksAgo === 1) timeTag = ' 上周';
  else if (weeksAgo === 2) timeTag = ' 上上周';
  else if (weeksAgo > 2) timeTag = ` ${weeksAgo}周前`;

  if(timeTag){
    printBanner(`${timeTag} Git 摸鱼周报`);
  }else{
    printBanner(`本周 Git 摸鱼周报`);
  }

  if (projects.length === 1 && projects[0] === process.cwd()) {
    const hasGit = fs.existsSync(path.join(process.cwd(), '.git'));
    const config = readConfig();
    const hasGitLab = config.gitlabToken || (config.gitlabs && config.gitlabs.length > 0);
    if (!hasGit && config.projects.length === 0 && !hasGitLab) {
      console.log(chalk.yellow(`⚠ 提示: 当前工作目录不是一个 Git 仓库。`));
      console.log(chalk.gray(`你可以通过以下命令配置项目或 GitLab：`));
      console.log(`  ${chalk.cyan('fish config add <path>')}        - 手动添加本地仓库`);
      console.log(`  ${chalk.cyan('fish config scan <dir>')}         - 自动扫描目录下所有仓库`);
      console.log(`  ${chalk.cyan('fish config gitlab <token> [host] [name]')} - 配置 GitLab 令牌以远程同步所有项目\n`);
    }
  }

  const targetDate = getTargetDate(weeksAgo, false);

  const realNow = new Date();
  const { since: realSince } = getThisWeekRange(realNow);
  const { since: targetSince } = getThisWeekRange(targetDate);
  const isPastWeek = targetSince.getTime() < realSince.getTime();
  const currentDayOfWeek = isPastWeek ? 6 : (targetDate.getDay() + 6) % 7; // 0 = Mon, 6 = Sun

  const loading = showLoading('正在摸遍所有仓库...');
  const stats = await analyzeWeekly(projects, targetDate, source);
  loading.stop();

  console.log(chalk.cyan.bold('📅 本周提交详情：'));

  stats.days.forEach((day, idx) => {
    const isWeekend = idx >= 5; // 周六(5) 周日(6)
    const isFuture = idx > currentDayOfWeek;

    // 周末 0 次提交：不显示
    if (isWeekend && day.commitsCount === 0) {
      return;
    }

    if (isFuture && day.commitsCount === 0) {
      console.log(`  ${day.dayName}：${chalk.gray('未到')}`);
    } else {
      const projStr =
        day.projects.length > 0
          ? ` | ${day.projects.length}个项目${showProjects ? ` (${day.projects.join(', ')})` : ''}`
          : '';
      const commitStr = day.commitsCount > 0 ? chalk.white.bold(`${day.commitsCount} 次`) : '0 次';

      // 指数行
      const indices: string[] = [];
      if (isWeekend) {
        indices.push(`💼 加班指数: ${formatOvertimeIndex(day.fish)}`);
      } else {
        indices.push(`🐟 摸鱼指数: ${formatSlackIndex(day.fish)}`);
      }
      if (day.totalLines > 0) {
        indices.push(`🧱 代码量: ${formatCodeVolume(day.totalLines)}`);
      }
      if (day.nightOwl >= 10) {
        const nightStr = formatNightOwlIndex(day.nightOwl);
        if (nightStr) indices.push(`🌙 修仙指数: ${nightStr}`);
      }

      const extraIndices = indices.length > 0 ? ` | ${indices.join(' | ')}` : '';

      // 分支数
      const branchStr = day.branchCount > 0 ? ` | 🌿 ${day.branchCount}个分支` : '';

      // 人格标签行
      const tag = getPersonalityTag(day);
      const tagStr = tag ? `  🏷 ${colorizeTags(tag)}` : '';

      console.log(`  ${day.dayName}：${commitStr}${extraIndices}${projStr}${branchStr}${tagStr}`);
    }
  });

  console.log('\n' + chalk.gray('-'.repeat(50)));

  if (stats.totalCommits > 0) {
    // ── 最努力 & 最快乐：只统计已到的天（排除"未到"的未来天） ──
    const activeDays = stats.days.filter((_, idx) => idx <= currentDayOfWeek);
    const workingDays = activeDays.filter(d => d.commitsCount > 0);

    // 最努力：从有提交的天中取摸鱼指数最低，整周都闲则不必展示
    if (workingDays.length > 0) {
      const minFish = Math.min(...workingDays.map(d => d.fish));
      const mostProductiveDays = workingDays.filter(d => d.fish === minFish);

      // minFish ≤ 40 才算真努力（hardworking ≥ 60），整周都摸鱼就不展示了
      if (minFish <= 40 && mostProductiveDays.length > 0) {
        const names = mostProductiveDays.map(d => d.dayName).join('、');
        const sample = mostProductiveDays[0];
        const isWeekend = sample.dayName === '周六' || sample.dayName === '周日';
        const label = isWeekend ? '💼 加班指数' : '🐟 摸鱼指数';
        console.log(`🏆 ${chalk.red.bold('最努力的日子')}：${names} | ${label}：${sample.fish}%`);
      }
    }

    // 最快乐：从工作日（不含周末）取摸鱼指数最高，整周都肝就不必展示
    const weekdayDays = activeDays.filter(d => d.dayName !== '周六' && d.dayName !== '周日');
    if (weekdayDays.length > 0) {
      const maxFish = Math.max(...weekdayDays.map(d => d.fish));
      const minFish = workingDays.length > 0 ? Math.min(...workingDays.map(d => d.fish)) : 100;
      const happyDays = weekdayDays.filter(d => d.fish === maxFish);
      const filteredHappyDays = happyDays.filter(
        d => d.fish !== minFish || workingDays.length === 0
      );

      // maxFish ≥ 70 才算真快乐，整周都在肝就不展示了
      if (maxFish >= 70 && filteredHappyDays.length > 0) {
        const names = filteredHappyDays.map(d => d.dayName).join('、');
        const sample = filteredHappyDays[0];
        console.log(`☕ ${chalk.green.bold('最快乐的日子')}：${names} | 🐟 摸鱼指数：${sample.fish}%`);
      }
    }

    // 最痛苦：周末有提交才算，取加班指数最高（摸鱼指数最低）
    const weekendDays = activeDays.filter(d => d.commitsCount > 0 && (d.dayName === '周六' || d.dayName === '周日'));
    if (weekendDays.length > 0) {
      const minFish = Math.min(...weekendDays.map(d => d.fish));
      const painfulDays = weekendDays.filter(d => d.fish === minFish);
      const names = painfulDays.map(d => d.dayName).join('、');
      const sample = painfulDays[0];
      console.log(`😭 ${chalk.magenta.bold('最痛苦的日子')}：${names} | 💼 加班指数：${sample.fish}%`);
    }
    console.log(chalk.gray('-'.repeat(50)));
    const avgNightStr = stats.averageNightOwl > 0
      ? ` | 🌙 修仙: ${stats.averageNightOwl}%`
      : '';
    console.log(chalk.cyan.bold(`📊 本周均值：🐟 摸鱼指数 ${stats.averageFish}%${avgNightStr}`));
    console.log(chalk.gray('-'.repeat(50)));
    console.log(`🤖 ${chalk.magenta.bold('锐评')}：`);
    console.log(chalk.white(getAICritic(stats)));
  } else {
    console.log(chalk.yellow('💡 本时间段内你还没提交过任何代码！完美的薪水小偷。或者检查你的配置吧！'));
  }
  console.log('');
}

async function runMonthlyReport(monthsAgo: number, source?: string) {
  const projects = getProjects();
  
  let timeTag = '';
  if (monthsAgo === 1) timeTag = ' 上月';
  else if (monthsAgo === 2) timeTag = ' 上上月';
  else if (monthsAgo > 2) timeTag = ` ${monthsAgo}月前`;

  if(timeTag){
    printBanner(`${timeTag} Git 摸鱼月报`);
  }else{
    printBanner(`本月 Git 摸鱼月报`);
  }
  
  const targetDate = getTargetDate(monthsAgo, true);
  const loading = showLoading('正在翻箱倒柜查 Commit...');
  const stats = await analyzeMonthly(projects, targetDate, source);
  loading.stop();

  if (stats.totalCommits === 0) {
    console.log(chalk.yellow('💡 本月在此仓库暂未发现任何 Git 提交数据。\n'));
    return;
  }

  const { fix, feat, chore, other } = stats.categories;
  const total = fix + feat + chore + other;

  console.log(chalk.cyan.bold('📅 本月主要贡献占比 (基于 Commit Message 正则归类)：'));

  function drawRow(label: string, count: number, colorFn: (s: string) => string) {
    const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
    const barWidth = 15;
    const filled = Math.round((percentage / 100) * barWidth);
    const empty = barWidth - filled;
    const barStr = colorFn('■'.repeat(filled)) + chalk.gray('□'.repeat(empty));
    console.log(`  - ${label}：[${barStr}] ${chalk.bold(percentage + '%')} (${count} 次)`);
  }

  drawRow('修 bug (fix)        ', fix, chalk.red);
  drawRow('新功能 (feat)       ', feat, chalk.green);
  drawRow('杂务与文档 (chore)  ', chore, chalk.yellow);
  drawRow('其他提交 (other)    ', other, chalk.gray);

  // ── 每日摸鱼指数概览 ──
  if (stats.dailyIndices && stats.dailyIndices.length > 0) {
    console.log('\n' + chalk.cyan.bold('📅 每日摸鱼指数概览：'));
    const monthLabel = `${targetDate.getMonth() + 1}月`;
    const COL_WIDTH = 8; // 每列固定宽度
    const weekHeaders = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    const firstDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
    const firstDayOffset = (firstDay.getDay() + 6) % 7; // 周一=0，周日=6

    const lines: string[] = [];
    let dateRow = '';
    let fishRow = '';

    lines.push(chalk.gray(weekHeaders.map((d) => visualPad(d, COL_WIDTH)).join('').trimEnd()));

    // 月初不是周一时补空列，保证日期落在正确星期下
    for (let i = 0; i < firstDayOffset; i++) {
      dateRow += visualPad('', COL_WIDTH);
      fishRow += visualPad('', COL_WIDTH);
    }

    for (const d of stats.dailyIndices) {
      const dateRaw = `${monthLabel}${d.day}日`;
      const fishRaw = `${d.fish}%`;
      const columnIndex = (firstDayOffset + d.day - 1) % 7;

      // 节假日加绿色圆点，调休班加红色感叹号
      const dateObj = new Date(targetDate.getFullYear(), targetDate.getMonth(), d.day);
      let suffix = '';
      let suffixPlain = '';
      if (isHoliday(dateObj)) {
        suffix = chalk.green('•');
        suffixPlain = '•';
      } else if (isCompensatoryWorkday(dateObj)) {
        suffix = chalk.red('!');
        suffixPlain = '!';
      }
      // 基于纯文本计算 padding，避免 ANSI 转义码影响对齐
      const plainText = dateRaw + suffixPlain;
      const vw = visualWidth(plainText);
      const padding = vw < COL_WIDTH ? ' '.repeat(COL_WIDTH - vw) : '';
      dateRow += dateRaw + suffix + padding;
      fishRow += visualPad(fishRaw, COL_WIDTH);

      // 周日换行；最后一天即使不满一周也输出
      if (columnIndex === 6 || d === stats.dailyIndices[stats.dailyIndices.length - 1]) {
        lines.push(chalk.gray(dateRow.trimEnd()));
        // 着色在 pad 之后进行，避免转义码破坏对齐
        fishRow = colorizeFishRow(fishRow);
        lines.push(fishRow);
        lines.push('');
        dateRow = '';
        fishRow = '';
      }
    }

    // 去掉末尾空行
    if (lines[lines.length - 1] === '') lines.pop();
    for (const l of lines) {
      console.log(`  ${l}`);
    }


  }

  console.log('\n' + chalk.gray('-'.repeat(50)));
  console.log(`🤖 ${chalk.magenta.bold('锐评')}：`);
  console.log(chalk.white(getAICriticForMonth(stats)));
  console.log('');
}

async function runProjectReport(weeksAgo: number, source?: string, isMonth: boolean = false) {
  const projects = getProjects();
  
  let timeTag = '';
  if (isMonth) {
    if (weeksAgo === 1) timeTag = ' (上月)';
    else if (weeksAgo === 2) timeTag = ' (上上月)';
    else if (weeksAgo > 2) timeTag = ` (${weeksAgo}月前)`;
  } else {
    if (weeksAgo === 1) timeTag = ' (上周)';
    else if (weeksAgo === 2) timeTag = ' (上上周)';
    else if (weeksAgo > 2) timeTag = ` (${weeksAgo}周前)`;
  }

  printBanner(`项目爆肝排行${timeTag}`);

  const targetDate = getTargetDate(weeksAgo, isMonth);
  const { since, until } = isMonth ? getThisMonthRange(targetDate) : getThisWeekRange(targetDate);
  const loading = showLoading('正在统计项目爆肝程度...');
  const stats = isMonth ? await analyzeMonthly(projects, targetDate, source) : await analyzeWeekly(projects, targetDate, source);
  loading.stop();

  console.log(chalk.cyan.bold(`📊 对应时段项目爆肝排行 (${since.toLocaleDateString()} ~ ${until.toLocaleDateString()})`));

  const ranked = stats.projectsRanked;
  if (ranked.length === 0) {
    console.log(chalk.gray('  本时段暂无项目提交数据。'));
  } else {
    const totalCommits = ranked.reduce((sum, p) => sum + p.count, 0);
    let hasPrimaryProject = false; // 第一个 L1 用主力标签，后续 L1 换标签

    ranked.forEach((proj, idx) => {
      const N = proj.count;
      const ratio = N / Math.max(1, totalCommits);
      let suffix: string;

      // 动态双因子判定：工作量绝对值 + 精力占比
      if (ratio >= 0.50 || N >= 30) {
        // L1：第一个项目为主力搬砖，后续同级别项目换标签
        if (!hasPrimaryProject) {
          suffix = chalk.red(' (主力搬砖地 🧱)');
          hasPrimaryProject = true;
        } else {
          suffix = chalk.red(' (魂归之处，代码在这家就在 🏠)');
        }
      } else if (ratio >= 0.20 || N >= 14) {
        suffix = chalk.magenta(' (多线程分出来的打工魂 🧵)');
      } else if (ratio >= 0.15 || N >= 5) {
        suffix = chalk.yellow(' (偶尔上去点一下 🐟)');
      } else if (N === 1) {
        suffix = chalk.cyan(' (测完就跑，纯粹路过 🚬)');
      } else {
        suffix = chalk.gray(' (边缘挂机项目 💤)');
      }

      console.log(`  ${idx + 1}. ${chalk.bold.white(proj.name)}: ${chalk.cyan(N + ' 次提交')}${suffix}`);
    });
  }
  console.log('');
}

async function runTimeReport(offset: number, source?: string, isMonth?: boolean) {
  const projects = getProjects();
  
  let timeTag = '';
  if (isMonth) {
    if (offset === 1) timeTag = ' (上月)';
    else if (offset === 2) timeTag = ' (上上月)';
    else if (offset > 2) timeTag = ` (${offset}月前)`;
  } else {
    if (offset === 1) timeTag = ' (上周)';
    else if (offset === 2) timeTag = ' (上上周)';
    else if (offset > 2) timeTag = ` (${offset}周前)`;
  }

  printBanner(`黄金工作时间段分析 (24小时分布)${timeTag}`);

  const targetDate = getTargetDate(offset, !!isMonth);
  const { since, until } = isMonth ? getThisMonthRange(targetDate) : getThisWeekRange(targetDate);
  const loading = showLoading('正在分析黄金时间段...');
  const hours = await analyzeHourDistribution(projects, since, until, source);
  loading.stop();

  const maxCount = Math.max(...hours.map((h) => h.count));
  const barScale = maxCount > 0 ? 30 / maxCount : 1;

  console.log(chalk.cyan.bold(`🕒 对应时段 24 小时 commit 频次分布图：`));

  hours.forEach(({ hour, count }) => {
    const barLength = Math.round(count * barScale);
    const barStr = '█'.repeat(barLength);
    const hourStr = String(hour).padStart(2, '0') + ':00';

    let tag = count > 0 ? getHourTag(hour) : '';

    const barColorStr = count > 0 ? chalk.blue(barStr.padEnd(30, ' ')) : chalk.gray(''.padEnd(30, ' '));
    console.log(`  ${chalk.bold.cyan(hourStr)} | [${barColorStr}] ${chalk.white(count + ' 次')}${tag}`);
  });

  console.log('');
}

async function runGhostReport(weeksAgo: number, source?: string) {
  const projects = getProjects();
  
  let timeTag = '';
  if (weeksAgo === 1) timeTag = ' (上周)';
  else if (weeksAgo === 2) timeTag = ' (上上周)';
  else if (weeksAgo > 2) timeTag = ` (${weeksAgo}周前)`;

  printBanner(`幽灵提交检测 (深夜 00:00 ~ 05:00)${timeTag}`);

  const targetDate = getTargetDate(weeksAgo, false);
  const { since, until } = getThisWeekRange(targetDate);
  const loading = showLoading('正在搜寻深夜幽灵...');
  const ghosts = await getGhostCommits(projects, since, until, source);
  loading.stop();

  if (ghosts.length === 0) {
    console.log(chalk.green.bold('🎉 恭喜！本时间段内未检测到任何深夜幽灵提交。'));
    console.log(chalk.white('你的发际线十分安全，大福报已被无情拒收，睡眠健康得分：100 分！\n'));
  } else {
    console.log(chalk.red.bold(`⚠️ 警告：本时间段内共检测到 ${ghosts.length} 次深夜幽灵提交！`));
    console.log(chalk.gray('深夜的 Commit 闪烁着绿光，每一行都是给老板库里南加油的汗水。'));
    console.log(chalk.gray('-'.repeat(50)));

    ghosts.forEach((c) => {
      console.log(`  - [${chalk.yellow(c.project)}] ${chalk.cyan(c.date.slice(0, 19).replace('T', ' '))} (${chalk.gray(c.hash)})`);
      console.log(`    💬 ${chalk.italic.white(c.message)}`);
    });

    console.log(chalk.gray('-'.repeat(50)));
    console.log(`🤖 ${chalk.magenta.bold('锐评')}：`);
    console.log(chalk.red('命是自己的，大福报留给老板吧！赶紧睡觉，保命要紧！\n'));
  }
}

program
  .name('fish')
  .description('🐟 Git 摸鱼 & 爆肝分析器 CLI')
  .version(getCliVersion())
  .option('-m, --month [monthsAgo]', '查看摸鱼/爆肝月报 (默认 0 为本月，1 为上月，2 为上上月...)')
  .option('-p, --project', '查看项目爆肝排行')
  .option('-t, --time', '查看黄金摸鱼时间段 analysis (24小时分布)')
  .option('-g, --ghost', '检测深夜幽灵提交')
  .option('-w, --weeks-ago <number>', '查询几周前/月前的报告 (默认 0，即本周/本月)', '0')
  .option('-P, --show-projects', '显示具体项目名称（默认隐藏）')
  .option('-s, --source <source>', '选择要查询的 GitLab 数据源 (序号或别名/host)')
  .action(async (options) => {
    const weeksAgo = parseInt(options.weeksAgo || '0', 10);
    const source = options.source;

    if (options.month !== undefined && options.project) {
      // 月报 + 项目排行：按月统计项目爆肝排行
      const monthsAgo = options.month === true
        ? parseInt(options.weeksAgo || '0', 10)
        : parseInt(options.month || '0', 10);
      await runProjectReport(monthsAgo, source, true);
    } else if (options.month !== undefined && options.time) {
      // 月报 + 时段分析：按月统计时段分布
      const monthsAgo = options.month === true
        ? parseInt(options.weeksAgo || '0', 10)
        : parseInt(options.month || '0', 10);
      await runTimeReport(monthsAgo, source, true);
    } else if (options.month !== undefined) {
      const monthsAgo = options.month === true
        ? parseInt(options.weeksAgo || '0', 10)
        : parseInt(options.month || '0', 10);
      await runMonthlyReport(monthsAgo, source);
    } else if (options.project) {
      await runProjectReport(weeksAgo, source);
    } else if (options.time) {
      await runTimeReport(weeksAgo, source);
    } else if (options.ghost) {
      await runGhostReport(weeksAgo, source);
    } else {
      await runWeeklyReport(weeksAgo, source, options.showProjects);
    }
  });

const configCmd = program.command('config').description('管理监控的项目路径与 GitLab 凭证');

configCmd
  .command('add <path>')
  .description('手动添加一个本地 Git 仓库路径')
  .action((projPath) => {
    const res = addProject(projPath);
    if (res.success) {
      console.log(chalk.green(`✔ ${res.message}`));
    } else {
      console.log(chalk.red(`✘ ${res.message}`));
    }
  });

configCmd
  .command('remove <path>')
  .description('从配置中移除一个项目路径')
  .action((projPath) => {
    const res = removeProject(projPath);
    if (res.success) {
      console.log(chalk.green(`✔ ${res.message}`));
    } else {
      console.log(chalk.red(`✘ ${res.message}`));
    }
  });

configCmd
  .command('list')
  .description('列出当前所有监控的项目与 GitLab 配置')
  .action(() => {
    const config = readConfig();
    console.log(chalk.cyan.bold('\n📁 当前监控的本地项目列表:'));
    if (config.projects.length === 0) {
      console.log(chalk.gray(`  (目前未配置本地项目，若无 GitLab 远程则默认扫描当前目录: ${process.cwd()})`));
    } else {
      config.projects.forEach((p, idx) => {
        console.log(`  ${idx + 1}. ${chalk.white(p)}`);
      });
    }

    console.log(chalk.cyan.bold('\n🦊 当前配置的 GitLab 远程源:'));
    const gitlabs = config.gitlabs || [];
    if (gitlabs.length === 0) {
      console.log(chalk.gray('  (尚未配置任何 GitLab 远程源)'));
    } else {
      gitlabs.forEach((g, idx) => {
        console.log(`  ${idx + 1}. ${chalk.bold.white(g.name)} | Host: ${chalk.gray(g.host)}`);
      });
    }
    console.log('');
  });

configCmd
  .command('scan <dir>')
  .description('自动扫描指定目录下的所有 Git 仓库并批量添加')
  .action((dir) => {
    console.log(chalk.cyan(`🔍 正在扫描目录 ${dir} 下 of Git 仓库...`));
    const repos = scanDirectory(dir);
    if (repos.length === 0) {
      console.log(chalk.yellow(`⚠ 未在 ${dir} 下发现任何 Git 仓库。`));
      return;
    }

    const config = readConfig();
    let addedCount = 0;
    for (const repo of repos) {
      if (!config.projects.includes(repo)) {
        config.projects.push(repo);
        addedCount++;
      }
    }

    if (addedCount > 0) {
      writeConfig(config);
      console.log(chalk.green(`✔ 成功发现并添加了 ${addedCount} 个新 Git 仓库：`));
      repos.forEach((r) => console.log(`  - ${chalk.gray(r)}`));
    } else {
      console.log(chalk.yellow(`⚠ 扫描到了 ${repos.length} 个仓库，但都已在监控配置中。`));
    }
  });

configCmd
  .command('gitlab <token> [host] [name]')
  .description('配置 GitLab 个人访问令牌(PAT)、Host 与别名，开启 GitLab 远程扫描')
  .action((token, host, name) => {
    setGitLabConfig(token, host, name);
    console.log(chalk.green(`✔ 已成功配置并保存 GitLab 访问源。`));
    const targetHost = host || 'https://gitlab.com';
    const targetName = name || targetHost.replace(/^https?:\/\//, '').replace(/\/$/, '');
    console.log(chalk.gray(`别名 (Name): ${targetName}`));
    console.log(chalk.gray(`地址 (Host): ${targetHost}`));
  });

configCmd
  .command('gitlab-clear [name_or_index]')
  .description('清除指定或所有的 GitLab 远程扫描配置')
  .action((nameOrIndex) => {
    clearGitLabConfig(nameOrIndex);
    if (nameOrIndex) {
      console.log(chalk.green(`✔ 已清除指定的 GitLab 访问配置 [${nameOrIndex}]。`));
    } else {
      console.log(chalk.green(`✔ 已清除所有 GitLab 访问配置。已关闭 GitLab 远程扫描。`));
    }
  });

program.parse(process.argv);

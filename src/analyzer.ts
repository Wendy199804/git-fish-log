import { CommitInfo, getCommitsForProject } from './git.js';
import { fetchGitLabCommits } from './gitlab.js';
import path from 'path';

export interface WeekDayStats {
  dayName: string; // "周一", "周二", etc.
  commitsCount: number;
  projects: string[];
  fish: number;
  hardworking: number;
  nightOwl: number;
  builder: number;
  burst: number;
  density: number;
  codeVolume: number;
  totalLines: number;
  branchCount: number;
  tags: string[];
}

export interface WeeklyStats {
  days: WeekDayStats[];
  totalCommits: number;
  projectsRanked: { name: string; count: number }[];
  mostProductiveDay: WeekDayStats | null;
  leastProductiveDay: WeekDayStats | null;
  averageFish: number;
  averageHardworking: number;
  averageNightOwl: number;
  averageBuilder: number;
  averageBurst: number;
  averageCodeVolume: number;
  ghostCommitsCount: number;
}

export interface DailyMonthStat {
  day: number;     // 1~31
  commitsCount: number;
  fish: number;
  hardworking: number;
  nightOwl: number;
  burst: number;
  codeVolume: number;
  totalLines: number;
  tags: string[];
}

export interface MonthlyStats {
  totalCommits: number;
  categories: {
    fix: number;
    feat: number;
    chore: number;
    other: number;
  };
  projectsRanked: { name: string; count: number }[];
  ghostCommitsCount: number;
  averageFish: number;
  averageHardworking: number;
  averageNightOwl: number;
  averageBuilder: number;
  averageBurst: number;
  averageCodeVolume: number;
  dailyIndices: DailyMonthStat[];
}

export interface HourDistribution {
  hour: number;
  count: number;
}

const DAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

// Helper: Parse literal time from Git ISO string
export function parseGitISODate(dateStr: string) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    // Fallback to regex parsing for malformed dates
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
    if (match) {
      return {
        year: parseInt(match[1], 10),
        month: parseInt(match[2], 10) - 1,
        day: parseInt(match[3], 10),
        hour: parseInt(match[4], 10),
        minute: parseInt(match[5], 10),
        second: parseInt(match[6], 10),
      };
    }
  }
  return {
    year: d.getFullYear(),
    month: d.getMonth(),
    day: d.getDate(),
    hour: d.getHours(),
    minute: d.getMinutes(),
    second: d.getSeconds(),
  };
}

export function getThisWeekRange(now: Date = new Date()): { since: Date; until: Date } {
  const start = new Date(now);
  const day = start.getDay(); // 0 (Sunday) to 6 (Saturday)
  const diff = start.getDate() - (day === 0 ? 6 : day - 1); // Adjust for Monday start
  start.setDate(diff);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { since: start, until: end };
}

export function getThisMonthRange(now: Date = new Date()): { since: Date; until: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { since: start, until: end };
}

export function categorizeCommit(message: string): 'fix' | 'feat' | 'chore' | 'other' {
  const msg = message.toLowerCase().trim();
  if (/^(fix|bug|hotfix|resolve)/.test(msg) || msg.includes('fix') || msg.includes('bug')) {
    return 'fix';
  }
  if (/^(feat|feature|add|create)/.test(msg) || msg.includes('feat') || msg.includes('feature') || msg.includes('add ')) {
    return 'feat';
  }
  if (
    /^(chore|docs|doc|config|refactor|style|test|ci)/.test(msg) ||
    msg.includes('chore') ||
    msg.includes('doc') ||
    msg.includes('refactor') ||
    msg.includes('style') ||
    msg.includes('test') ||
    msg.includes('ci')
  ) {
    return 'chore';
  }
  return 'other';
}

// ──────────────────────── 新算法 v2：摸鱼指数重设计 ────────────────────────
//
// 设计目标（按直觉感受对齐）：
//   fish 95~100  = 几乎没干活
//   fish 70~85   = 小需求、小修复，整体悠闲
//   fish 40~60   = 正常搬砖
//   fish 20~40   = 爆肝工作
//   fish 0~20    = 通宵上线、人形 CI/CD
//
// 核心原则：
//   1. "有效 Commit"（增删 ≥ 20 行）才算实质提交，过滤格式化/小修复
//   2. 行数用 log₁₀ 压缩 + 降权至 10%，避免 200 行被误判为大量工作
//   3. 工作时长(30%) + 小时分布(20%) = 50% 权重，体现持续投入
//   4. 工作日自然存在摸鱼基线，0 commit → fish=95

export interface DayIndices {
  fish: number;
  hardworking: number;
  nightOwl: number;
  builder: number;
  burst: number;
  density: number;
  codeVolume: number;
  totalLines: number;
  tags: string[];
}

/**
 * 计算单日多维度指数（v2 重设计版）
 */
export function calculateDayIndices(
  commits: CommitInfo[],
  isWeekend: boolean = false,
): DayIndices {
  const N = commits.length;

  // ── 0 commit：摸鱼基线 95 ──
  if (N === 0) {
    return {
      fish: 95,
      hardworking: 5,
      nightOwl: 0,
      builder: 0,
      burst: 0,
      density: 0,
      codeVolume: 0,
      totalLines: 0,
      tags: ['🐟 今日暂无代码活动'],
    };
  }

  // ── 提取原始数据 ──
  let earliest = 24;
  let latest = 0;
  let totalAdditions = 0;
  let totalDeletions = 0;
  let nightCount = 0;
  const hourSet = new Set<number>();

  for (const commit of commits) {
    const parsed = parseGitISODate(commit.date);
    const fh = parsed.hour + parsed.minute / 60 + parsed.second / 3600;
    if (fh < earliest) earliest = fh;
    if (fh > latest) latest = fh;
    if (parsed.hour >= 0 && parsed.hour <= 5) nightCount++;
    totalAdditions += commit.additions;
    totalDeletions += commit.deletions;
    hourSet.add(parsed.hour);
  }

  const S = Math.max(0.1, latest - earliest);  // 时间跨度（小时）
  const L = totalAdditions + totalDeletions;    // 总修改行数
  const activeHours = hourSet.size;             // 有 commit 的小时数

  // ── 有效 Commit 统计（单次增删 ≥ 20 行）──
  let Neff = 0;
  for (const commit of commits) {
    const cl = commit.additions + commit.deletions;
    if (cl >= 20) {
      Neff++;
    }
  }

  // ═══════════════════════════════════════════
  // 子分数计算（各项 0~100）
  // ═══════════════════════════════════════════

  // I₁ 有效提交分：基于有效 Commit 数量，对数防刷
  const commitScore = Math.min(100, Math.log2(Neff + 1) * 20);

  // I₂ 工时跨度分：平方根防作弊
  const spanScore = Math.min(100, Math.sqrt(S) * 22);

  // I₃ 时间分布分：有 commit 的小时数越多，说明持续投入
  const spreadScore = Math.min(100, activeHours * 12);

  // I₄ 代码行数加分：log₁₀ 重度压缩，权重仅 10%
  const lineBonus = Math.min(100, Math.log10(L + 1) * 25);

  // I₅ 深夜加成：有深夜提交直接 +5 分
  const nightBonus = nightCount > 0 ? 5 : 0;

  // ═══════════════════════════════════════════
  // 工作分 = 加权求和
  // ═══════════════════════════════════════════
  let workScore =
    commitScore * 0.35 +
    spanScore * 0.30 +
    spreadScore * 0.20 +
    lineBonus * 0.10 +
    nightBonus;

  // 周末额外加成
  if (isWeekend && N > 0) {
    workScore += 5;
  }

  const hardworking = Math.min(100, Math.round(workScore));
  const fish = Math.max(1, 100 - hardworking);

  // ═══════════════════════════════════════════
  // 其他维度指数
  // ═══════════════════════════════════════════

  // 🌙 修仙指数
  const nightScore = Math.min(100, nightCount * 30);
  const nightOwl = nightCount === 0
    ? 0
    : Math.min(100, Math.round(nightScore * 0.7 + spanScore * 0.3));

  // 🧱 搬砖指数：行数 60% + 有效提交 40%
  const builder = Math.min(100, Math.round(lineBonus * 0.6 + commitScore * 0.4));

  // 🧱 代码量指数：纯修改规模，log₁₀ 对数压缩，与摸鱼指数完全解耦
  // 公式: 51.3 * log10(L + 50) - 79.5, clamped to [0, 100]
  const codeVolume = Math.min(100, Math.max(0, Math.round(51.3 * Math.log10(L + 50) - 79.5)));

  // 💥 爆发指数：总平均行数衡量单次提交量
  const displayAvgLines = Math.round(L / Math.max(N, 1));
  const burst = Math.min(100, Math.round(Math.log2(displayAvgLines + 1) * 12));

  // ═══════════════════════════════════════════
  // 人格标签系统
  // ═══════════════════════════════════════════
  const tags: string[] = [];

  // 主要人格标签
  if (fish >= 80)           tags.push('🐟 摸鱼宗师');
  if (hardworking >= 80)    tags.push('🔥 爆肝战神');
  if (nightOwl >= 80)       tags.push('🌙 深夜修仙者');
  if (builder >= 80)        tags.push('🧱 勤恳搬砖人');
  if (burst >= 80 && N <= 2) tags.push(`💥 一把梭哈型程序员 (均${displayAvgLines}行/次)`);

  // 隐藏成就（适配有效 Commit 概念）
  if (N >= 8 && Neff <= 1 && L <= 50)               tags.push('🏷️ PPT 架构师');
  if (N >= 10 && L <= 30)                             tags.push('🏷️ 格式化大师');
  if (N >= 15 && (L / N) <= 2)                        tags.push('🏷️ Git 聊天达人');
  if (nightOwl >= 80 && N <= 3)                       tags.push('🏷️ 深夜刺客');
  if (hardworking >= 90 && nightOwl >= 70 && isWeekend) tags.push('🏷️ 生产队的驴');
  if (fish >= 95 && N <= 1)                           tags.push('🏷️ 摸鱼仙人');

  return {
    fish,
    hardworking,
    nightOwl,
    builder,
    burst,
    density: Math.round(spreadScore),
    codeVolume,
    totalLines: L,
    tags,
  };
}

export async function getAllCommits(projectPaths: string[], since: Date, until: Date, source?: string): Promise<CommitInfo[]> {
  let all: CommitInfo[] = [];
  for (const p of projectPaths) {
    const commits = getCommitsForProject(p, since, until);
    all = all.concat(commits);
  }

  try {
    const gitlabCommits = await fetchGitLabCommits(since, until, source);
    all = all.concat(gitlabCommits);
  } catch {
    // Ignore and fallback
  }

  // Deduplicate commits but keep every branch where the commit was observed.
  const seen = new Map<string, CommitInfo>();
  const unique: CommitInfo[] = [];
  for (const c of all) {
    const key = `${c.project}:${c.hash}`;
    const branches = c.branches && c.branches.length > 0
      ? c.branches
      : (c.branch && c.branch !== 'unknown' ? [c.branch] : []);
    const existing = seen.get(key);
    if (existing) {
      const mergedBranches = new Set([
        ...(existing.branches || (existing.branch && existing.branch !== 'unknown' ? [existing.branch] : [])),
        ...branches,
      ]);
      existing.branches = Array.from(mergedBranches);
      existing.branch = existing.branches[0] || existing.branch;
    } else {
      c.branches = Array.from(new Set(branches));
      c.branch = c.branches[0] || c.branch;
      seen.set(key, c);
      unique.push(c);
    }
  }

  // Sort all commits by date ascending
  return unique.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export async function analyzeWeekly(projectPaths: string[], now: Date = new Date(), source?: string): Promise<WeeklyStats> {
  const { since, until } = getThisWeekRange(now);
  const commits = await getAllCommits(projectPaths, since, until, source);

  // Group commits by day of the week (0 = Monday, 6 = Sunday)
  const commitsByDay: CommitInfo[][] = Array.from({ length: 7 }, () => []);

  for (const commit of commits) {
    const parsed = parseGitISODate(commit.date);
    const localDate = new Date(parsed.year, parsed.month, parsed.day);
    const dayOfWeek = (localDate.getDay() + 6) % 7; // Monday = 0, Sunday = 6
    commitsByDay[dayOfWeek].push(commit);
  }

  const days: WeekDayStats[] = DAY_NAMES.map((name, idx) => {
    const dayCommits = commitsByDay[idx];
    const projects = Array.from(new Set(dayCommits.map(c => c.project)));
    const indices = calculateDayIndices(dayCommits, idx >= 5);
    const branches = new Set(
      dayCommits.flatMap(c => {
        const commitBranches = c.branches && c.branches.length > 0
          ? c.branches
          : (c.branch && c.branch !== 'unknown' ? [c.branch] : []);
        return commitBranches.map(branch => `${c.project}:${branch}`);
      })
    );

    return {
      dayName: name,
      commitsCount: dayCommits.length,
      projects,
      fish: indices.fish,
      hardworking: indices.hardworking,
      nightOwl: indices.nightOwl,
      builder: indices.builder,
      burst: indices.burst,
      density: indices.density,
      codeVolume: indices.codeVolume,
      totalLines: indices.totalLines,
      branchCount: branches.size,
      tags: indices.tags,
    };
  });

  // Rank projects by commit volume
  const projMap: Record<string, number> = {};
  let ghostCount = 0;

  for (const commit of commits) {
    projMap[commit.project] = (projMap[commit.project] || 0) + 1;
    const parsed = parseGitISODate(commit.date);
    if (parsed.hour >= 0 && parsed.hour <= 5) {
      ghostCount++;
    }
  }

  const projectsRanked = Object.entries(projMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  // Determine most and least productive days (filtering out future days if running mid-week)
  // If the week analyzed starts before the current real week, all 7 days are active (completed)
  const realNow = new Date();
  const { since: realSince } = getThisWeekRange(realNow);
  const isPastWeek = since.getTime() < realSince.getTime();
  const currentDayOfWeek = isPastWeek ? 6 : (now.getDay() + 6) % 7; // Monday = 0, Sunday = 6

  let mostProductiveDay: WeekDayStats | null = null;
  let leastProductiveDay: WeekDayStats | null = null;

  // We look at days up to the current day of the week (inclusive)
  const activeDays = days.slice(0, currentDayOfWeek + 1);
  const workingDays = activeDays.filter(d => d.commitsCount > 0);

  if (workingDays.length > 0) {
    // Most productive = lowest fish index (highest hardworking)
    mostProductiveDay = [...workingDays].sort((a, b) => {
      if (a.fish !== b.fish) return a.fish - b.fish;
      return b.commitsCount - a.commitsCount;
    })[0];
  }

  // Least productive = highest fish index (包括 0 commit 天，fish=90 才是真摸鱼)
  {
    const sortedLeast = [...activeDays].sort((a, b) => {
      if (a.fish !== b.fish) return b.fish - a.fish;
      return a.commitsCount - b.commitsCount;
    });

    if (sortedLeast[0] && (mostProductiveDay === null || sortedLeast[0].dayName !== mostProductiveDay.dayName)) {
      leastProductiveDay = sortedLeast[0];
    }
  }

  const sumFish = activeDays.reduce((acc, d) => acc + d.fish, 0);
  const sumHardworking = activeDays.reduce((acc, d) => acc + d.hardworking, 0);
  const sumNightOwl = activeDays.reduce((acc, d) => acc + d.nightOwl, 0);
  const sumBuilder = activeDays.reduce((acc, d) => acc + d.builder, 0);
  const sumBurst = activeDays.reduce((acc, d) => acc + d.burst, 0);
  const sumCodeVolume = activeDays.reduce((acc, d) => acc + d.codeVolume, 0);
  const activeCount = activeDays.length || 1;
  const averageFish = Math.round(sumFish / activeCount);
  const averageHardworking = Math.round(sumHardworking / activeCount);
  const averageNightOwl = Math.round(sumNightOwl / activeCount);
  const averageBuilder = Math.round(sumBuilder / activeCount);
  const averageBurst = Math.round(sumBurst / activeCount);
  const averageCodeVolume = Math.round(sumCodeVolume / activeCount);

  return {
    days,
    totalCommits: commits.length,
    projectsRanked,
    mostProductiveDay,
    leastProductiveDay,
    averageFish,
    averageHardworking,
    averageNightOwl,
    averageBuilder,
    averageBurst,
    averageCodeVolume,
    ghostCommitsCount: ghostCount,
  };
}

export async function analyzeMonthly(projectPaths: string[], now: Date = new Date(), source?: string): Promise<MonthlyStats> {
  const { since, until } = getThisMonthRange(now);
  const commits = await getAllCommits(projectPaths, since, until, source);

  const categories = { fix: 0, feat: 0, chore: 0, other: 0 };
  const projMap: Record<string, number> = {};
  let ghostCount = 0;

  // Group by day to compute average slack index for the month
  const commitsByDateStr: Record<string, CommitInfo[]> = {};

  for (const commit of commits) {
    // Project ranking
    projMap[commit.project] = (projMap[commit.project] || 0) + 1;

    // Category
    const cat = categorizeCommit(commit.message);
    categories[cat]++;

    // Ghost
    const parsed = parseGitISODate(commit.date);
    if (parsed.hour >= 0 && parsed.hour <= 5) {
      ghostCount++;
    }

    // Daily grouping
    const dateStr = `${parsed.year}-${parsed.month + 1}-${parsed.day}`;
    if (!commitsByDateStr[dateStr]) {
      commitsByDateStr[dateStr] = [];
    }
    commitsByDateStr[dateStr].push(commit);
  }

  const projectsRanked = Object.entries(projMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  // Compute average indices over all days of the month (up to today, or all days in month if past)
  const realNow = new Date();
  const isCurrentMonth = realNow.getFullYear() === since.getFullYear() && realNow.getMonth() === since.getMonth();
  const maxDay = isCurrentMonth ? realNow.getDate() : until.getDate();

  let totalFish = 0;
  let totalHardworking = 0;
  let totalNightOwl = 0;
  let totalBuilder = 0;
  let totalBurst = 0;
  let totalCodeVolume = 0;
  const dailyIndices: DailyMonthStat[] = [];

  for (let d = 1; d <= maxDay; d++) {
    const dateStr = `${since.getFullYear()}-${since.getMonth() + 1}-${d}`;
    const dayCommits = commitsByDateStr[dateStr] || [];
    const indices = calculateDayIndices(dayCommits, false);
    totalFish += indices.fish;
    totalHardworking += indices.hardworking;
    totalNightOwl += indices.nightOwl;
    totalBuilder += indices.builder;
    totalBurst += indices.burst;
    totalCodeVolume += indices.codeVolume;
    dailyIndices.push({
      day: d,
      commitsCount: dayCommits.length,
      fish: indices.fish,
      hardworking: indices.hardworking,
      nightOwl: indices.nightOwl,
      burst: indices.burst,
      codeVolume: indices.codeVolume,
      totalLines: indices.totalLines,
      tags: indices.tags,
    });
  }

  const averageFish = Math.round(totalFish / maxDay);
  const averageHardworking = Math.round(totalHardworking / maxDay);
  const averageNightOwl = Math.round(totalNightOwl / maxDay);
  const averageBuilder = Math.round(totalBuilder / maxDay);
  const averageBurst = Math.round(totalBurst / maxDay);
  const averageCodeVolume = Math.round(totalCodeVolume / maxDay);

  return {
    totalCommits: commits.length,
    categories,
    projectsRanked,
    ghostCommitsCount: ghostCount,
    averageFish,
    averageHardworking,
    averageNightOwl,
    averageBuilder,
    averageBurst,
    averageCodeVolume,
    dailyIndices,
  };
}

export async function analyzeHourDistribution(projectPaths: string[], since: Date, until: Date, source?: string): Promise<HourDistribution[]> {
  const commits = await getAllCommits(projectPaths, since, until, source);
  const hours = Array(24).fill(0);
 
  for (const commit of commits) {
    const parsed = parseGitISODate(commit.date);
    hours[parsed.hour]++;
  }
 
  return hours.map((count, hour) => ({ hour, count }));
}
 
export async function getGhostCommits(projectPaths: string[], since: Date, until: Date, source?: string): Promise<CommitInfo[]> {
  const commits = await getAllCommits(projectPaths, since, until, source);
  return commits.filter(commit => {
    const parsed = parseGitISODate(commit.date);
    return parsed.hour >= 0 && parsed.hour <= 5;
  });
}

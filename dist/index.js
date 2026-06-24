#!/usr/bin/env node

// src/index.ts
import { Command } from "commander";
import chalk from "chalk";
import fs2 from "fs";
import path3 from "path";

// src/config.ts
import fs from "fs";
import path from "path";
import os from "os";
var CONFIG_PATH = path.join(os.homedir(), ".fish-git-config.json");
function setGitLabConfig(token, host, name) {
  const config = readConfig();
  if (!config.gitlabs) {
    config.gitlabs = [];
  }
  const targetHost = host || "https://gitlab.com";
  const targetName = name || targetHost.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const index = config.gitlabs.findIndex((g) => g.name.toLowerCase() === targetName.toLowerCase());
  if (index !== -1) {
    config.gitlabs[index] = { token, host: targetHost, name: targetName };
  } else {
    config.gitlabs.push({ token, host: targetHost, name: targetName });
  }
  config.gitlabToken = token;
  config.gitlabHost = targetHost;
  writeConfig(config);
}
function clearGitLabConfig(nameOrIndex) {
  const config = readConfig();
  if (!config.gitlabs || config.gitlabs.length === 0) {
    delete config.gitlabToken;
    delete config.gitlabHost;
    writeConfig(config);
    return;
  }
  if (!nameOrIndex) {
    config.gitlabs = [];
    delete config.gitlabToken;
    delete config.gitlabHost;
  } else {
    const index = config.gitlabs.findIndex(
      (g, idx) => g.name.toLowerCase() === nameOrIndex.toLowerCase() || String(idx + 1) === nameOrIndex
    );
    if (index !== -1) {
      config.gitlabs.splice(index, 1);
    }
    if (config.gitlabs.length > 0) {
      config.gitlabToken = config.gitlabs[0].token;
      config.gitlabHost = config.gitlabs[0].host;
    } else {
      delete config.gitlabToken;
      delete config.gitlabHost;
    }
  }
  writeConfig(config);
}
function readConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, "utf-8");
      const parsed = JSON.parse(data);
      if (parsed && Array.isArray(parsed.projects)) {
        if (!parsed.gitlabs) {
          parsed.gitlabs = [];
        }
        if (parsed.gitlabToken) {
          const host = parsed.gitlabHost || "https://gitlab.com";
          const name = host.replace(/^https?:\/\//, "").replace(/\/$/, "");
          const exists = parsed.gitlabs.some((g) => g.token === parsed.gitlabToken && g.host === host);
          if (!exists) {
            parsed.gitlabs.push({
              token: parsed.gitlabToken,
              host,
              name
            });
          }
        }
        return parsed;
      }
    }
  } catch (e) {
  }
  return { projects: [], gitlabs: [] };
}
function writeConfig(config) {
  try {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
  } catch (e) {
    console.error(`\x1B[31m[Error] Failed to write config to ${CONFIG_PATH}: ${e.message}\x1B[0m`);
  }
}
function getProjects() {
  const config = readConfig();
  if (config.projects.length === 0) {
    if (!config.gitlabToken && (!config.gitlabs || config.gitlabs.length === 0)) {
      return [process.cwd()];
    }
    return [];
  }
  return config.projects.filter((p) => {
    try {
      return fs.existsSync(p) && fs.statSync(p).isDirectory();
    } catch {
      return false;
    }
  });
}
function addProject(projectPath) {
  const absolutePath = path.resolve(projectPath);
  if (!fs.existsSync(absolutePath)) {
    return { success: false, message: `Path does not exist: ${projectPath}` };
  }
  if (!fs.statSync(absolutePath).isDirectory()) {
    return { success: false, message: `Path is not a directory: ${projectPath}` };
  }
  if (!fs.existsSync(path.join(absolutePath, ".git"))) {
    return { success: false, message: `Path is not a Git repository (no .git directory found): ${projectPath}` };
  }
  const config = readConfig();
  if (config.projects.includes(absolutePath)) {
    return { success: false, message: `Project is already in the list: ${absolutePath}` };
  }
  config.projects.push(absolutePath);
  writeConfig(config);
  return { success: true, message: `Added project: ${absolutePath}` };
}
function removeProject(projectPath) {
  const absolutePath = path.resolve(projectPath);
  const config = readConfig();
  const index = config.projects.indexOf(absolutePath);
  if (index === -1) {
    const indexStr = config.projects.indexOf(projectPath);
    if (indexStr === -1) {
      return { success: false, message: `Project not found in config: ${projectPath}` };
    }
    config.projects.splice(indexStr, 1);
  } else {
    config.projects.splice(index, 1);
  }
  writeConfig(config);
  return { success: true, message: `Removed project: ${absolutePath}` };
}
function scanDirectory(rootPath) {
  const absoluteRoot = path.resolve(rootPath);
  if (!fs.existsSync(absoluteRoot) || !fs.statSync(absoluteRoot).isDirectory()) {
    return [];
  }
  const foundRepos = [];
  if (fs.existsSync(path.join(absoluteRoot, ".git"))) {
    foundRepos.push(absoluteRoot);
    return foundRepos;
  }
  try {
    const items = fs.readdirSync(absoluteRoot);
    for (const item of items) {
      const itemPath = path.join(absoluteRoot, item);
      try {
        if (fs.existsSync(itemPath) && fs.statSync(itemPath).isDirectory()) {
          if (fs.existsSync(path.join(itemPath, ".git"))) {
            foundRepos.push(itemPath);
          }
        }
      } catch {
      }
    }
  } catch (e) {
    console.error(`\x1B[31m[Error] Failed to scan path ${absoluteRoot}: ${e.message}\x1B[0m`);
  }
  return foundRepos;
}

// src/git.ts
import { execSync } from "child_process";
import path2 from "path";
function getUserEmail(cwd) {
  try {
    const email = execSync("git config user.email", { cwd, encoding: "utf8" }).trim();
    if (email) return email;
  } catch {
  }
  try {
    const emailGlobal = execSync("git config --global user.email", { cwd, encoding: "utf8" }).trim();
    if (emailGlobal) return emailGlobal;
  } catch {
  }
  return null;
}
function formatLocalDate(date) {
  const Y = date.getFullYear();
  const M = String(date.getMonth() + 1).padStart(2, "0");
  const D = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${Y}-${M}-${D} ${h}:${m}:${s}`;
}
function getCommitsForProject(projectPath, since, until) {
  const projectName = path2.basename(projectPath);
  const email = getUserEmail(projectPath);
  const sinceStr = formatLocalDate(since);
  const untilStr = formatLocalDate(until);
  let authorArg = "";
  if (email) {
    authorArg = `--author="${email.replace(/"/g, '\\"')}"`;
  }
  const delimiter = "|||";
  const formatStr = `%aI${delimiter}%an${delimiter}%ae${delimiter}%h${delimiter}%s`;
  const cmd = `git log --all --since="${sinceStr}" --until="${untilStr}" ${authorArg} --pretty=format:"${formatStr}" --shortstat --date=iso-strict`;
  try {
    const stdout = execSync(cmd, {
      cwd: projectPath,
      maxBuffer: 20 * 1024 * 1024,
      // 20MB buffer for large repos
      encoding: "utf8"
    });
    if (!stdout.trim()) {
      return [];
    }
    const lines = stdout.split("\n").map((l) => l.trim());
    const results = [];
    let currentCommit = null;
    for (const line of lines) {
      if (line.length === 0) continue;
      if (line.includes(delimiter)) {
        if (currentCommit) {
          results.push(currentCommit);
        }
        const parts = line.split(delimiter);
        const [date, name, authorEmail, hash, message] = parts;
        currentCommit = {
          project: projectName,
          hash: hash || "",
          date: date || "",
          message: message || "",
          authorName: name || "",
          authorEmail: authorEmail || "",
          additions: 0,
          deletions: 0
        };
      } else if (currentCommit) {
        const insMatch = line.match(/(\d+)\s+insertions?\(\+\)/);
        const delMatch = line.match(/(\d+)\s+deletions?\(-\)/);
        currentCommit.additions = insMatch ? parseInt(insMatch[1], 10) : 0;
        currentCommit.deletions = delMatch ? parseInt(delMatch[1], 10) : 0;
      }
    }
    if (currentCommit) {
      results.push(currentCommit);
    }
    return results;
  } catch (e) {
    return [];
  }
}
function getLocalGitIdentity() {
  const emails = [];
  const names = [];
  try {
    const email = execSync("git config user.email", { encoding: "utf8" }).trim();
    if (email) emails.push(email.toLowerCase());
  } catch {
  }
  try {
    const emailGlobal = execSync("git config --global user.email", { encoding: "utf8" }).trim();
    if (emailGlobal) emails.push(emailGlobal.toLowerCase());
  } catch {
  }
  try {
    const name = execSync("git config user.name", { encoding: "utf8" }).trim();
    if (name) names.push(name.toLowerCase());
  } catch {
  }
  try {
    const nameGlobal = execSync("git config --global user.name", { encoding: "utf8" }).trim();
    if (nameGlobal) names.push(nameGlobal.toLowerCase());
  } catch {
  }
  return {
    emails: Array.from(new Set(emails)),
    names: Array.from(new Set(names))
  };
}

// src/gitlab.ts
async function fetchGitLabCommits(since, until, source) {
  const config = readConfig();
  const gitlabs = config.gitlabs || [];
  if (gitlabs.length === 0) {
    if (config.gitlabToken) {
      gitlabs.push({
        token: config.gitlabToken,
        host: config.gitlabHost || "https://gitlab.com",
        name: (config.gitlabHost || "https://gitlab.com").replace(/^https?:\/\//, "").replace(/\/$/, "")
      });
    } else {
      return [];
    }
  }
  let selectedGitLab = gitlabs[0];
  if (source) {
    const index = parseInt(source, 10) - 1;
    if (!isNaN(index) && index >= 0 && index < gitlabs.length) {
      selectedGitLab = gitlabs[index];
    } else {
      const found = gitlabs.find(
        (g) => g.name.toLowerCase() === source.toLowerCase() || g.host.toLowerCase().includes(source.toLowerCase())
      );
      if (found) {
        selectedGitLab = found;
      } else {
        console.warn(`\x1B[33m[Warning] GitLab source "${source}" not found. Using default: ${selectedGitLab.name}\x1B[0m`);
      }
    }
  }
  const token = selectedGitLab.token;
  const host = selectedGitLab.host;
  const cleanHost = host.replace(/\/$/, "");
  try {
    const userUrl = `${cleanHost}/api/v4/user`;
    const userRes = await fetch(userUrl, {
      headers: { "PRIVATE-TOKEN": token }
    });
    if (!userRes.ok) {
      console.warn(`\x1B[33m[Warning] Failed to fetch GitLab user info: ${userRes.statusText}\x1B[0m`);
      return [];
    }
    const user = await userRes.json();
    const lowerEmail = user.email.toLowerCase();
    const lowerName = user.name.toLowerCase();
    const lowerUsername = user.username.toLowerCase();
    const activeAfter = since.toISOString();
    const projectsUrl = `${cleanHost}/api/v4/projects?membership=true&last_activity_after=${activeAfter}&per_page=100`;
    const projectsRes = await fetch(projectsUrl, {
      headers: { "PRIVATE-TOKEN": token }
    });
    if (!projectsRes.ok) {
      console.warn(`\x1B[33m[Warning] Failed to fetch GitLab projects: ${projectsRes.statusText}\x1B[0m`);
      return [];
    }
    const projects = await projectsRes.json();
    if (projects.length === 0) {
      return [];
    }
    const sinceStr = since.toISOString();
    const untilStr = until.toISOString();
    const commitPromises = projects.map(async (project) => {
      try {
        const commitsUrl = `${cleanHost}/api/v4/projects/${project.id}/repository/commits?since=${sinceStr}&until=${untilStr}&per_page=100`;
        const commitsRes = await fetch(commitsUrl, {
          headers: { "PRIVATE-TOKEN": token }
        });
        if (!commitsRes.ok) {
          return [];
        }
        const commits = await commitsRes.json();
        const localIdentity = getLocalGitIdentity();
        const userCommits = commits.filter((c) => {
          const authorEmail = c.author_email.toLowerCase();
          const authorName = c.author_name.toLowerCase();
          const matchesGitLab = authorEmail === lowerEmail || authorName === lowerName || authorName === lowerUsername;
          const matchesLocal = localIdentity.emails.includes(authorEmail) || localIdentity.names.includes(authorName);
          return matchesGitLab || matchesLocal;
        });
        if (userCommits.length === 0) return [];
        const statsResults = [];
        const batchSize = 8;
        for (let i = 0; i < userCommits.length; i += batchSize) {
          const batch = userCommits.slice(i, i + batchSize);
          const batchResults = await Promise.all(
            batch.map(async (c) => {
              let adds = 0;
              let dels = 0;
              try {
                const detailUrl = `${cleanHost}/api/v4/projects/${project.id}/repository/commits/${encodeURIComponent(c.id)}`;
                const detailRes = await fetch(detailUrl, {
                  headers: { "PRIVATE-TOKEN": token }
                });
                if (detailRes.ok) {
                  const detail = await detailRes.json();
                  if (detail.stats) {
                    adds = detail.stats.additions;
                    dels = detail.stats.deletions;
                  }
                }
              } catch {
              }
              return {
                project: project.name,
                hash: c.short_id,
                date: c.created_at,
                message: c.title,
                authorName: c.author_name,
                authorEmail: c.author_email,
                additions: adds,
                deletions: dels
              };
            })
          );
          statsResults.push(...batchResults);
        }
        return statsResults;
      } catch {
        return [];
      }
    });
    const results = await Promise.all(commitPromises);
    return results.flat();
  } catch (e) {
    console.warn(`\x1B[33m[Warning] GitLab connection failed: ${e.message}\x1B[0m`);
    return [];
  }
}

// src/analyzer.ts
var DAY_NAMES = ["\u5468\u4E00", "\u5468\u4E8C", "\u5468\u4E09", "\u5468\u56DB", "\u5468\u4E94", "\u5468\u516D", "\u5468\u65E5"];
function parseGitISODate(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
    if (match) {
      return {
        year: parseInt(match[1], 10),
        month: parseInt(match[2], 10) - 1,
        day: parseInt(match[3], 10),
        hour: parseInt(match[4], 10),
        minute: parseInt(match[5], 10),
        second: parseInt(match[6], 10)
      };
    }
  }
  return {
    year: d.getFullYear(),
    month: d.getMonth(),
    day: d.getDate(),
    hour: d.getHours(),
    minute: d.getMinutes(),
    second: d.getSeconds()
  };
}
function getThisWeekRange(now = /* @__PURE__ */ new Date()) {
  const start = new Date(now);
  const day = start.getDay();
  const diff = start.getDate() - (day === 0 ? 6 : day - 1);
  start.setDate(diff);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { since: start, until: end };
}
function getThisMonthRange(now = /* @__PURE__ */ new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { since: start, until: end };
}
function categorizeCommit(message) {
  const msg = message.toLowerCase().trim();
  if (/^(fix|bug|hotfix|resolve)/.test(msg) || msg.includes("fix") || msg.includes("bug")) {
    return "fix";
  }
  if (/^(feat|feature|add|create)/.test(msg) || msg.includes("feat") || msg.includes("feature") || msg.includes("add ")) {
    return "feat";
  }
  if (/^(chore|docs|doc|config|refactor|style|test|ci)/.test(msg) || msg.includes("chore") || msg.includes("doc") || msg.includes("refactor") || msg.includes("style") || msg.includes("test") || msg.includes("ci")) {
    return "chore";
  }
  return "other";
}
function calculateDayIndices(commits, isWeekend = false) {
  const N = commits.length;
  if (N === 0) {
    return {
      fish: 90,
      hardworking: 10,
      nightOwl: 0,
      builder: 0,
      burst: 0,
      density: 0,
      tags: ["\u{1F41F} \u4ECA\u65E5\u6682\u65E0\u4EE3\u7801\u6D3B\u52A8"]
    };
  }
  let earliest = 24;
  let latest = 0;
  let totalAdditions = 0;
  let totalDeletions = 0;
  let nightCount = 0;
  for (const commit of commits) {
    const parsed = parseGitISODate(commit.date);
    const fh = parsed.hour + parsed.minute / 60 + parsed.second / 3600;
    if (fh < earliest) earliest = fh;
    if (fh > latest) latest = fh;
    if (parsed.hour >= 0 && parsed.hour <= 5) nightCount++;
    totalAdditions += commit.additions;
    totalDeletions += commit.deletions;
  }
  const S = Math.max(0.1, latest - earliest);
  const L = totalAdditions + totalDeletions;
  const avgLines = L / Math.max(N, 1);
  const D = N / (S + 1);
  const commitScore = Math.min(100, Math.log2(N + 1) * 25);
  const spanScore = Math.min(100, Math.sqrt(S) * 25);
  const lineScore = Math.min(100, Math.log2(L + 1) * 12);
  const densityScore = N <= 1 ? 0 : Math.min(100, D * 50);
  const nightScore = Math.min(100, nightCount * 30);
  let hardworking = commitScore * 0.3 + lineScore * 0.3 + densityScore * 0.2 + spanScore * 0.2;
  if (isWeekend && N > 0) {
    hardworking += 8;
  }
  hardworking = Math.min(100, Math.round(hardworking));
  const fish = Math.max(1, 100 - hardworking);
  const nightOwl = nightCount === 0 ? 0 : Math.min(100, Math.round(
    nightScore * 0.7 + spanScore * 0.3
  ));
  const builder = Math.min(100, Math.round(
    lineScore * 0.7 + commitScore * 0.3
  ));
  const burst = Math.min(100, Math.round(
    Math.log2(avgLines + 1) * 12
  ));
  const tags = [];
  if (fish >= 80) tags.push("\u{1F41F} \u6478\u9C7C\u5B97\u5E08");
  if (hardworking >= 80) tags.push("\u{1F525} \u7206\u809D\u6218\u795E");
  if (nightOwl >= 80) tags.push("\u{1F319} \u6DF1\u591C\u4FEE\u4ED9\u8005");
  if (builder >= 80) tags.push("\u{1F9F1} \u52E4\u6073\u642C\u7816\u4EBA");
  if (burst >= 80 && N <= 2) tags.push(`\u{1F4A5} \u4E00\u628A\u68AD\u54C8\u578B\u7A0B\u5E8F\u5458 (\u5747${Math.round(avgLines)}\u884C/\u6B21)`);
  if (commitScore >= 70 && lineScore <= 15) tags.push("\u{1F3F7}\uFE0F PPT \u67B6\u6784\u5E08");
  if (N >= 10 && L <= 30) tags.push("\u{1F3F7}\uFE0F \u683C\u5F0F\u5316\u5927\u5E08");
  if (N >= 15 && avgLines <= 2) tags.push("\u{1F3F7}\uFE0F Git \u804A\u5929\u8FBE\u4EBA");
  if (nightOwl >= 80 && N <= 3) tags.push("\u{1F3F7}\uFE0F \u6DF1\u591C\u523A\u5BA2");
  if (hardworking >= 90 && nightOwl >= 70 && isWeekend) tags.push("\u{1F3F7}\uFE0F \u751F\u4EA7\u961F\u7684\u9A74");
  if (fish >= 95 && N <= 1) tags.push("\u{1F3F7}\uFE0F \u6478\u9C7C\u4ED9\u4EBA");
  return {
    fish,
    hardworking,
    nightOwl,
    builder,
    burst,
    density: Math.round(Math.min(100, densityScore)),
    tags
  };
}
async function getAllCommits(projectPaths, since, until, source) {
  let all = [];
  for (const p of projectPaths) {
    const commits = getCommitsForProject(p, since, until);
    all = all.concat(commits);
  }
  try {
    const gitlabCommits = await fetchGitLabCommits(since, until, source);
    all = all.concat(gitlabCommits);
  } catch {
  }
  const seen = /* @__PURE__ */ new Set();
  const unique = [];
  for (const c of all) {
    if (!seen.has(c.hash)) {
      seen.add(c.hash);
      unique.push(c);
    }
  }
  return unique.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}
async function analyzeWeekly(projectPaths, now = /* @__PURE__ */ new Date(), source) {
  const { since, until } = getThisWeekRange(now);
  const commits = await getAllCommits(projectPaths, since, until, source);
  const commitsByDay = Array.from({ length: 7 }, () => []);
  for (const commit of commits) {
    const parsed = parseGitISODate(commit.date);
    const localDate = new Date(parsed.year, parsed.month, parsed.day);
    const dayOfWeek = (localDate.getDay() + 6) % 7;
    commitsByDay[dayOfWeek].push(commit);
  }
  const days = DAY_NAMES.map((name, idx) => {
    const dayCommits = commitsByDay[idx];
    const projects = Array.from(new Set(dayCommits.map((c) => c.project)));
    const indices = calculateDayIndices(dayCommits, idx >= 5);
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
      tags: indices.tags
    };
  });
  const projMap = {};
  let ghostCount = 0;
  for (const commit of commits) {
    projMap[commit.project] = (projMap[commit.project] || 0) + 1;
    const parsed = parseGitISODate(commit.date);
    if (parsed.hour >= 0 && parsed.hour <= 5) {
      ghostCount++;
    }
  }
  const projectsRanked = Object.entries(projMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  const realNow = /* @__PURE__ */ new Date();
  const { since: realSince } = getThisWeekRange(realNow);
  const isPastWeek = since.getTime() < realSince.getTime();
  const currentDayOfWeek = isPastWeek ? 6 : (now.getDay() + 6) % 7;
  let mostProductiveDay = null;
  let leastProductiveDay = null;
  const activeDays = days.slice(0, currentDayOfWeek + 1);
  const workingDays = activeDays.filter((d) => d.commitsCount > 0);
  if (workingDays.length > 0) {
    mostProductiveDay = [...workingDays].sort((a, b) => {
      if (a.fish !== b.fish) return a.fish - b.fish;
      return b.commitsCount - a.commitsCount;
    })[0];
  }
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
  const activeCount = activeDays.length || 1;
  const averageFish = Math.round(sumFish / activeCount);
  const averageHardworking = Math.round(sumHardworking / activeCount);
  const averageNightOwl = Math.round(sumNightOwl / activeCount);
  const averageBuilder = Math.round(sumBuilder / activeCount);
  const averageBurst = Math.round(sumBurst / activeCount);
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
    ghostCommitsCount: ghostCount
  };
}
async function analyzeMonthly(projectPaths, now = /* @__PURE__ */ new Date(), source) {
  const { since, until } = getThisMonthRange(now);
  const commits = await getAllCommits(projectPaths, since, until, source);
  const categories = { fix: 0, feat: 0, chore: 0, other: 0 };
  const projMap = {};
  let ghostCount = 0;
  const commitsByDateStr = {};
  for (const commit of commits) {
    projMap[commit.project] = (projMap[commit.project] || 0) + 1;
    const cat = categorizeCommit(commit.message);
    categories[cat]++;
    const parsed = parseGitISODate(commit.date);
    if (parsed.hour >= 0 && parsed.hour <= 5) {
      ghostCount++;
    }
    const dateStr = `${parsed.year}-${parsed.month + 1}-${parsed.day}`;
    if (!commitsByDateStr[dateStr]) {
      commitsByDateStr[dateStr] = [];
    }
    commitsByDateStr[dateStr].push(commit);
  }
  const projectsRanked = Object.entries(projMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  const realNow = /* @__PURE__ */ new Date();
  const isCurrentMonth = realNow.getFullYear() === since.getFullYear() && realNow.getMonth() === since.getMonth();
  const maxDay = isCurrentMonth ? realNow.getDate() : until.getDate();
  let totalFish = 0;
  let totalHardworking = 0;
  let totalNightOwl = 0;
  let totalBuilder = 0;
  let totalBurst = 0;
  const dailyIndices = [];
  for (let d = 1; d <= maxDay; d++) {
    const dateStr = `${since.getFullYear()}-${since.getMonth() + 1}-${d}`;
    const dayCommits = commitsByDateStr[dateStr] || [];
    const indices = calculateDayIndices(dayCommits, false);
    totalFish += indices.fish;
    totalHardworking += indices.hardworking;
    totalNightOwl += indices.nightOwl;
    totalBuilder += indices.builder;
    totalBurst += indices.burst;
    dailyIndices.push({
      day: d,
      commitsCount: dayCommits.length,
      fish: indices.fish,
      hardworking: indices.hardworking,
      nightOwl: indices.nightOwl,
      burst: indices.burst,
      tags: indices.tags
    });
  }
  const averageFish = Math.round(totalFish / maxDay);
  const averageHardworking = Math.round(totalHardworking / maxDay);
  const averageNightOwl = Math.round(totalNightOwl / maxDay);
  const averageBuilder = Math.round(totalBuilder / maxDay);
  const averageBurst = Math.round(totalBurst / maxDay);
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
    dailyIndices
  };
}
async function analyzeHourDistribution(projectPaths, since, until, source) {
  const commits = await getAllCommits(projectPaths, since, until, source);
  const hours = Array(24).fill(0);
  for (const commit of commits) {
    const parsed = parseGitISODate(commit.date);
    hours[parsed.hour]++;
  }
  return hours.map((count, hour) => ({ hour, count }));
}
async function getGhostCommits(projectPaths, since, until, source) {
  const commits = await getAllCommits(projectPaths, since, until, source);
  return commits.filter((commit) => {
    const parsed = parseGitISODate(commit.date);
    return parsed.hour >= 0 && parsed.hour <= 5;
  });
}

// src/critic.ts
var SLACK_HIGH_CRITIQUES = [
  "\u672C\u5468\u6478\u9C7C\u6307\u6570\u62C9\u6EE1\uFF01\u770B\u6765\u662F\u5728\u6DF1\u5EA6\u8D2F\u5F7B\u2018\u52B3\u9038\u7ED3\u5408\u2019\u7684\u6700\u9AD8\u751F\u4EA7\u529B\u539F\u5219\uFF0C\u8FDE\u4E0B\u5468\u4E2D\u5348\u5403\u4EC0\u4E48\u90FD\u89C4\u5212\u5F97\u4E95\u4E95\u6709\u6761\u3002",
  "\u4F60\u7684 Commit \u5217\u8868\u5E72\u51C0\u5F97\u50CF\u521A\u6D17\u8FC7\u7684\u8138\u3002\u84C4\u52BF\u5F85\u53D1\u4E5F\u662F\u4E00\u79CD\u8282\u594F\uFF0C\u671F\u5F85\u4F60\u4E0B\u5468\u79EF\u6512\u7684\u5927\u62DB\uFF01",
  "\u770B\u6765\u672C\u5468\u7684\u9879\u76EE\u8FDB\u5165\u4E86\u2018\u517B\u7CBE\u84C4\u9510\u2019\u9636\u6BB5\u2014\u2014\u624B\u673A\u592A\u597D\u73A9\uFF0C\u6216\u8005\u5E8A\u592A\u6696\u548C\u3002\u6478\u9C7C\u6280\u5DE7\u5DF2\u8FBE\u7089\u706B\u7EAF\u9752\u4E4B\u5883\u3002",
  "\u4F60\u7684\u63D0\u4EA4\u9891\u7387\u50CF\u6781\u4E86\u9000\u6F6E\u540E\u7684\u6C99\u6EE9\uFF0C\u6BEB\u65E0\u6CE2\u6F9C\u3002\u5EFA\u8BAE\u4E0B\u5468\u7A0D\u5FAE\u52A8\u52A8\u624B\u6307\uFF0C\u8BA9 Git \u56FE\u6807\u91CD\u65B0\u4EAE\u8D77\u6765\u3002",
  "\u8FD9\u63D0\u4EA4\u6B21\u6570\uFF0C\u4E24\u53EA\u624B\u90FD\u6570\u5F97\u8FC7\u6765\u3002\u770B\u6765\u662F\u5728\u8DF5\u884C\u2018\u4E0D\u5199\u4EE3\u7801\u5C31\u6CA1\u6709 bug\u2019\u7684\u81F3\u9AD8\u9632\u7EBF\uFF0C\u4E3B\u6253\u4E00\u4E2A\u7A33\u5B57\u5F53\u5934\u3002"
];
var SLACK_LOW_CRITIQUES = [
  "\u672C\u5468\u7206\u809D\u6307\u6570\u7206\u8868\uFF01\u770B\u5230\u4F60\u8FD9\u5BC6\u5BC6\u9EBB\u9EBB\u7684\u63D0\u4EA4\u8BB0\u5F55\uFF0C\u9694\u58C1\u6D4B\u8BD5\u5C0F\u59D0\u59D0\u7684\u773C\u5708\u7EA2\u4E86\uFF0C\u8FDE\u4F60\u7684\u952E\u76D8\u90FD\u5728\u4E3A\u4F60\u957F\u9E23\u3002",
  "\u4F60\u8FD9\u4E48\u62FC\u547D\u5DE5\u4F5C\uFF0C\u4EE3\u7801\u5E93\u7684\u534A\u58C1\u6C5F\u5C71\u90FD\u662F\u4F60\u6253\u4E0B\u6765\u7684\u3002\u4E0B\u5468\u5FC5\u987B\u5B89\u6392\u4E00\u676F\u5976\u8336\uFF0C\u597D\u597D\u7292\u52B3\u4E00\u4E0B\u81EA\u5DF1\uFF01",
  "\u5144\u5F1F\uFF0C\u4F60\u8FD9\u5468\u7684\u5DE5\u65F6\u76F4\u63A5\u62C9\u6EE1\u4E86\u3002\u5EFA\u8BAE\u7ED9\u81EA\u5DF1\u653E\u4E2A\u5047\uFF0C\u4EE3\u7801\u53EF\u4EE5\u660E\u5929\u5199\uFF0C\u8EAB\u4F53\u53EF\u6CA1\u6709\u64A4\u9500\u952E\uFF0C\u597D\u597D\u4F11\u606F\u4E00\u4E0B\u3002",
  "\u75AF\u72C2\u642C\u7816\uFF0C\u809D\u5929\u809D\u5730\u3002\u4E0D\u4EC5\u5728\u8DDF\u65F6\u95F4\u8D5B\u8DD1\uFF0C\u66F4\u662F\u5728\u7528\u4E00\u5DF1\u4E4B\u529B\u5E2E\u56E2\u961F\u586B\u5E73\u524D\u671F\u7684\u5404\u79CD\u6280\u672F\u5751\uFF0C\u8F9B\u82E6\u4E86\uFF01",
  "\u63D0\u4EA4\u6B21\u6570\u591A\u5230\u8BA9\u4EBA\u5FC3\u75BC\u3002\u9879\u76EE\u662F\u957F\u671F\u7684\uFF0C\u8EAB\u4F53\u662F\u81EA\u5DF1\u7684\u3002\u7559\u70B9\u529B\u6C14\uFF0C\u4E0B\u5468\u6211\u4EEC\u7EE7\u7EED\u7EC6\u6C34\u957F\u6D41\u3002"
];
var GHOST_CRITIQUES = [
  "\u3010\u5E7D\u7075\u63D0\u4EA4\u9884\u8B66\u3011\u6DF1\u591C\u7684 Commit \u95EA\u70C1\u7740\u7EFF\u5149\u3002\u4E0D\u8FC7\u4FEE\u4ED9\u5F52\u4FEE\u4ED9\uFF0C\u7761\u89C9\u4E5F\u662F\u7A0B\u5E8F\u5458\u7684\u91CD\u8981\u6280\u80FD\uFF0C\u5FEB\u53BB\u4F11\u606F\u5427\u3002",
  "\u534A\u591C\u4E09\u66F4\u8FD8\u5728\u63D0\u4EA4\u4EE3\u7801\uFF0C\u4F60\u662F\u5728\u548C\u5730\u7403\u53E6\u4E00\u7AEF\u7684\u7A0B\u5E8F\u5458\u6253\u65F6\u5DEE\u6218\uFF0C\u8FD8\u662F\u5728\u4EAB\u53D7\u6DF1\u591C\u65E0\u6253\u6270\u7684\u7075\u611F\u7206\u53D1\uFF1F",
  "\u6DF1\u591C 12 \u70B9\u540E\u7684\u63D0\u4EA4\u88AB\u68C0\u6D4B\u5230\uFF01\u4F60\u8FD9\u62FC\u547D\u7684\u67B6\u52BF\uFF0C\u662F\u5728\u7528\u6DF1\u591C\u7684\u7075\u611F\u4E3A\u9879\u76EE\u4FDD\u9A7E\u62A4\u822A\uFF0C\u4F46\u4E5F\u522B\u5FD8\u4E86\u7ED9\u8EAB\u4F53\u5145\u5145\u7535\u3002",
  "\u522B\u809D\u4E86\u522B\u809D\u4E86\uFF0C\u6DF1\u591C\u8FD8\u5728\u63D0\u4EA4\uFF0C\u8FDE CI \u673A\u5668\u4EBA\u90FD\u60F3\u529D\u4F60\u65E9\u70B9\u7761\uFF0C\u5FEB\u5B58\u76D8\u4E0B\u73ED\uFF0C\u68A6\u91CC\u6CA1\u6709 bug\u3002"
];
var CATEGORY_FIX_CRITIQUES = [
  "\u4F60\u5DF2\u7ECF\u6210\u4E3A\u56E2\u961F\u7684\u2018\u804C\u4E1A\u6551\u706B\u961F\u957F\u2019\uFF0C\u5929\u5929\u5728\u4EE3\u7801\u5E93\u91CC\u8003\u53E4\u548C\u6551\u706B\uFF0C\u56E2\u961F\u7684\u7A33\u5B9A\u9632\u7EBF\u5168\u9760\u4F60\u6B7B\u5B88\u3002",
  "\u672C\u6708\u4E3B\u8981\u5DE5\u4F5C\u662F\u4FEE Bug\uFF0C\u5360\u6BD4\u9AD8\u8FBE %PERCENT%%\u3002\u662F\u5728\u4E00\u70B9\u70B9\u507F\u8FD8\u6280\u672F\u503A\uFF0C\u4E5F\u662F\u5728\u7ED9\u540E\u6765\u7684\u4EBA\u94FA\u5E73\u9053\u8DEF\u3002",
  "\u5929\u5929\u90FD\u5728 fix\uFF0C\u770B\u6765\u8FD9\u4E2A\u6708\u7684\u7CFB\u7EDF\u7A33\u5B9A\u6027\u5168\u9760\u4F60\u5728\u7EBF\u5B88\u62A4\u4E86\uFF0C\u59A5\u59A5\u7684\u5E55\u540E\u82F1\u96C4\u3002",
  "\u4EE3\u7801\u5E93\u7684\u6E05\u9053\u592B\uFF0CBug \u7EC8\u7ED3\u8005\u3002\u6BCF\u4FEE\u6389\u4E00\u4E2A\u95EE\u9898\uFF0C\u7CFB\u7EDF\u5C31\u5C11\u4E00\u5206\u9690\u60A3\uFF0C\u5B89\u5168\u611F\u76F4\u63A5\u62C9\u6EE1\u3002"
];
var CATEGORY_FEAT_CRITIQUES = [
  "\u672C\u6708 Feat \u5360\u6BD4\u9AD8\u8FBE %PERCENT%%\u3002\u65B0\u529F\u80FD\u4E00\u9879\u63A5\u4E00\u9879\uFF0C\u5F00\u53D1\u706B\u529B\u5168\u5F00\uFF0C\u4E1A\u52A1\u7EBF\u56E0\u4F60\u800C\u98DE\u901F\u524D\u8FDB\uFF01",
  "\u65B0\u529F\u80FD\u72C2\u9B54\uFF01\u4E0D\u505C\u5730\u63A8\u8FDB\u9700\u6C42\u548C\u65B0\u4E1A\u52A1\u3002\u8F93\u51FA\u62C9\u6EE1\u7684\u540C\u65F6\uFF0C\u4E5F\u522B\u5FD8\u4E86\u5076\u5C14\u56DE\u5934\u6253\u78E8\u4E00\u4E0B\u7EC6\u8282\u3002Btw\uFF1A\u4F60\u8F9B\u82E6\u5566\uFF01",
  "\u75AF\u72C2\u8F93\u51FA feature\uFF01\u4EE3\u7801\u5E93\u7684\u8FB9\u754C\u53C8\u88AB\u4F60\u5411\u5916\u62D3\u5C55\u4E86\u4E00\u5708\uFF0C\u59A5\u59A5\u7684\u5F00\u62D3\u5148\u950B\u3002"
];
var CATEGORY_CHORE_CRITIQUES = [
  "Chore/Docs \u5360\u4E86 %PERCENT%%\u3002\u597D\u7684\u9879\u76EE\u4E0D\u4EC5\u9700\u8981\u4EE3\u7801\uFF0C\u66F4\u9700\u8981\u6709\u4EBA\u628A\u6587\u6863\u6C89\u6DC0\u4E0B\u6765\uFF0C\u524D\u4EBA\u683D\u6811\u540E\u4EBA\u4E58\u51C9\u3002",
  "\u5929\u5929\u90FD\u5728\u6539\u914D\u7F6E\u3001\u4FEE\u6587\u6863\u3001\u683C\u5F0F\u5316\u4EE3\u7801\u3002\u4F60\u7B80\u76F4\u662F\u4EE3\u7801\u5E93\u7684\u4F18\u79C0\u56ED\u4E01\uFF0C\u8FD9\u4E9B\u5DE5\u4F5C\u867D\u7136\u4F4E\u8C03\uFF0C\u5374\u8BA9\u9879\u76EE\u53D8\u5F97\u66F4\u5065\u5EB7\u3001\u66F4\u6613\u8BFB\u3002",
  "Chore/Docs \u5360\u6BD4\u60CA\u4EBA\uFF0C\u9879\u76EE\u7684\u957F\u671F\u7A33\u5B9A\u8FD0\u884C\uFF0C\u79BB\u4E0D\u5F00\u8FD9\u4E9B\u770B\u4F3C\u4E0D\u8D77\u773C\u4F46\u6781\u4E3A\u5173\u952E\u7684\u7EF4\u62A4\u5DE5\u4F5C\u3002"
];
var GENERAL_CRITIQUES = [
  "\u4F60\u7684\u63D0\u4EA4\u66F2\u7EBF\u50CF\u5FC3\u7535\u56FE\u4E00\u6837\u5E73\u7F13\uFF0C\u57FA\u672C\u4E0A\u53EA\u5728\u5F00\u4F1A\u524D\u548C\u4E0B\u73ED\u524D\u6709\u6CE2\u52A8\u3002\u5B8C\u7F8E\u5730\u638C\u63E1\u4E86\u5DE5\u4F5C\u4E0E\u4F11\u606F\u7684\u5F8B\u52A8\u3002",
  "\u672C\u5468\u7684\u63D0\u4EA4\u96C6\u4E2D\u5728\u7279\u5B9A\u65F6\u95F4\u6BB5\u3002\u4E0A\u5348\u9759\u5982\u5904\u5B50\uFF0C\u4E0B\u5348\u52A8\u5982\u8131\u5154\u3002\u5B8C\u7F8E\u627E\u5230\u4E86\u5C5E\u4E8E\u81EA\u5DF1\u7684\u9AD8\u6548\u7387\u8282\u594F\u3002",
  "\u770B\u7740\u4F60\u7684 Git Log\uFF0C\u6211\u4EFF\u4F5B\u770B\u5230\u4E86\u4E00\u4F4D\u8282\u594F\u5927\u5E08\u3002\u4E0D\u7D27\u4E0D\u6162\uFF0C\u5076\u5C14\u843D\u7B14\uFF0C\u5374\u603B\u662F\u6070\u5230\u597D\u5904\u5730\u628A\u5DE5\u4F5C\u5B8C\u6210\u5F97\u65E0\u53EF\u6311\u5254\u3002",
  "\u4F60\u8FD9\u661F\u671F\u7684\u63D0\u4EA4\u6570\u636E\u975E\u5E38\u5747\u8861\u2014\u2014\u6BCF\u5929\u90FD\u4FDD\u6301\u7740\u5E73\u7A33\u7684\u8F93\u51FA\u8282\u594F\u3002\u7A33\u624E\u7A33\u6253\uFF0C\u4F60\u5C31\u662F\u56E2\u961F\u91CC\u7684\u5B9A\u6D77\u795E\u9488\u3002"
];
var TAG_FISH_MASTER_CRITIQUES = [
  "\u6478\u9C7C\u5B97\u5E08\u79F0\u53F7\u5DF2\u89E3\u9501\uFF01\u628A\u52B3\u9038\u7ED3\u5408\u53D1\u6325\u5230\u4E86\u6781\u81F4\uFF0C\u8868\u9762\u7A33\u5982\u6CF0\u5C71\uFF0C\u5B9E\u9645\u4E0A\u8111\u6D77\u91CC\u5DF2\u7ECF\u628A\u5047\u671F\u89C4\u5212\u505A\u597D\u4E86\u3002",
  "\u6478\u9C7C\u5B97\u5E08\uFF0C\u6CD5\u529B\u65E0\u8FB9\uFF01\u80FD\u628A\u751F\u4EA7\u529B\u7CBE\u786E\u63A7\u5236\u5728\u521A\u521A\u597D\u7684\u8212\u9002\u5708\uFF0C\u4E5F\u662F\u4E00\u79CD\u8BA9\u4EBA\u7FA1\u6155\u7684\u804C\u573A\u8D85\u80FD\u529B\u3002",
  "\u606D\u559C\u83B7\u5F97\u300E\u6478\u9C7C\u5B97\u5E08\u300F\u6210\u5C31\uFF01Git \u7684\u7559\u767D\u662F\u4F60\u7684\u901A\u884C\u8BC1\uFF0C\u5B8C\u7F8E\u7684\u8282\u594F\u5927\u5E08\u5C31\u662F\u4F60\u3002"
];
var TAG_VOLUME_KING_CRITIQUES = [
  "\u7206\u809D\u6218\u795E\uFF0C\u6050\u6016\u5982\u65AF\uFF01\u4F60\u7684 Git \u65F6\u95F4\u7EBF\u5DF2\u7ECF\u6EE1\u5F97\u50CF\u6625\u8FD0\u706B\u8F66\u7AD9\uFF0C\u5EFA\u8BAE\u7ED9\u952E\u76D8\u4E70\u4E2A\u610F\u5916\u9669\uFF0C\u8F9B\u82E6\u4E86\uFF01",
  "\u7206\u809D\u6218\u795E\u5C31\u4F4D\uFF01\u4E00\u4E2A\u4EBA\u9876\u8D77\u4E00\u4E2A\u56E2\u961F\u7684\u4EA7\u51FA\uFF0C\u8FD9\u4E2A\u63D0\u4EA4\u91CF\uFF0C\u611F\u89C9\u4F60\u7684\u624B\u6307\u5DF2\u7ECF\u6572\u51FA\u4E86\u6B8B\u5F71\u3002",
  "\u522B\u4EBA\u5728\u4F11\u606F\uFF0C\u4F60\u5728 commit\uFF1B\u522B\u4EBA\u5728\u7761\u89C9\uFF0C\u4F60\u8FD8\u5728 push\u3002\u7206\u809D\u6218\u795E\u5C31\u662F\u4F60\uFF01\u4E0D\u8FC7\u522B\u5FD8\u4E86\uFF0C\u7A0B\u5E8F\u8981\u8DD1\uFF0C\u4EBA\u4E5F\u8981\u597D\u597D\u4F11\u606F\u3002"
];
var TAG_NIGHT_OWL_CRITIQUES = [
  "\u6DF1\u591C\u4FEE\u4ED9\u8005\uFF0C\u6CD5\u529B\u65E0\u8FB9\uFF01\u51CC\u6668\u7684\u4EE3\u7801\u95EA\u70C1\u7740\u72EC\u7279\u7684\u5149\u8292\uFF0C\u8FDE CI \u8DD1\u901A\u8FC7\u53BB\u7684\u901F\u5EA6\u90FD\u53D8\u5FEB\u4E86\u3002",
  "\u6210\u4E3A\u6DF1\u591C\u4FEE\u4ED9\u8005\u610F\u5473\u7740\u4F60\u7684\u6700\u4F73\u5DE5\u4F5C\u65F6\u6BB5\u662F 00:00 ~ 05:00\u3002\u767D\u5929\u5728\u5DE5\u4F4D\u79EF\u6512\u7075\u611F\uFF0C\u665A\u4E0A\u5728\u952E\u76D8\u4E0A\u75AF\u72C2\u8F93\u51FA\uFF0C\u53CC\u91CD\u9891\u7387\u65E0\u7F1D\u5207\u6362\u3002",
  "\u4FEE\u4ED9\u5927\u80FD\uFF01\u51CC\u6668\u7684 Git \u8BB0\u5F55\u89C1\u8BC1\u4E86\u4F60\u7684\u575A\u6301\u4E0E\u6267\u7740\u3002\u4E0D\u8FC7\u4FEE\u4ED9\u5F52\u4FEE\u4ED9\uFF0C\u8BB0\u5F97\u7ED9\u81EA\u5DF1\u7559\u8DB3\u7761\u7720\u65F6\u95F4\u3002"
];
var TAG_BUILDER_CRITIQUES = [
  "\u52E4\u6073\u642C\u7816\u4EBA\uFF0C\u8E0F\u5B9E\u5982\u8001\u9EC4\u725B\uFF01\u6BCF\u4E00\u884C\u4EE3\u7801\u90FD\u662F\u4F60\u7528\u624B\u6572\u51FA\u6765\u7684\uFF0C\u7A33\u624E\u7A33\u6253\uFF0C\u662F\u6574\u4E2A\u9879\u76EE\u6700\u575A\u5B9E\u7684\u5E95\u5EA7\u3002",
  "\u642C\u7816\u4EBA\u642C\u7816\u9B42\uFF0C\u4EE3\u7801\u57FA\u5EFA\u5168\u9760\u52E4\u3002\u4F60\u8FD9\u4E2A\u6708\u7684\u4EE3\u7801\u91CF\uFF0C\u5DF2\u7ECF\u9ED8\u9ED8\u4E3A\u9879\u76EE\u780C\u8D77\u4E86\u4E00\u5EA7\u9AD8\u5899\u3002",
  "\u52E4\u6073\u642C\u7816\uFF0C\u7A33\u5982\u6CF0\u5C71\u3002\u4E0D\u662F\u6700\u7231\u79C0\u6280\u5DE7\u7684\u90A3\u4E2A\uFF0C\u4F46\u7EDD\u5BF9\u662F\u56E2\u961F\u91CC\u6700\u8BA9\u4EBA\u653E\u5FC3\u7684\u90A3\u9897\u87BA\u4E1D\u9489\u3002\u7EE7\u7EED\u52A0\u6CB9\uFF01"
];
var TAG_BURST_CODER_CRITIQUES = [
  "\u4E00\u628A\u68AD\u54C8\u578B\u7A0B\u5E8F\u5458\uFF01\u8981\u4E48\u4E0D\u5199\uFF0C\u4E00\u5199\u5C31\u662F\u51E0\u5343\u884C\u3002\u4F60\u7684\u5927\u62DB\u5F0F Git Diff \u8BA9 reviewer \u9ED8\u9ED8\u6CE1\u4E86\u4E00\u676F\u5496\u5561\u51C6\u5907\u7EC6\u7EC6\u54C1\u5473\u3002",
  "\u4E00\u628A\u68AD\u54C8\u73A9\u5BB6\uFF01\u5168\u90E8\u9700\u6C42\u4E00\u4E2A commit \u641E\u5B9A\uFF0C\u4EE3\u7801\u5728\u4F60\u7684\u8111\u6D77\u91CC\u65E9\u5DF2\u6210\u578B\uFF0C\u76F4\u63A5\u6765\u4E86\u4E00\u6CE2\u5B8C\u7F8E\u7684 Rush-B \u843D\u5730\u3002",
  "\u4E00\u628A\u68AD\u54C8\u827A\u672F\u5BB6\uFF01\u4F60\u7684\u6BCF\u6B21\u63D0\u4EA4\u90FD\u662F\u4E00\u7BC7\u5185\u5BB9\u4E30\u5BCC\u7684\u4E2D\u7BC7\u5C0F\u8BF4\uFF0C\u4E0D\u9E23\u5219\u5DF2\uFF0C\u4E00\u9E23\u60CA\u4EBA\u3002"
];
var TAG_PPT_ARCHITECT_CRITIQUES = [
  "\u67B6\u6784\u5E08\u98CE\u8303\u9690\u85CF\u6210\u5C31\u89E3\u9501\uFF01\u63D0\u4EA4\u591A\u3001\u6539\u52A8\u5C11\uFF0C\u4F60\u7684 Git \u5386\u53F2\u5C31\u50CF\u4E00\u90E8\u5145\u6EE1\u4EEA\u5F0F\u611F\u7684\u827A\u672F\u54C1\uFF0C\u91CD\u5728\u68B3\u7406\u903B\u8F91\u4E0E\u7ED3\u6784\u3002",
  "\u606D\u559C\u83B7\u5F97\u300E\u4F18\u96C5\u67B6\u6784\u5E08\u300F\u79F0\u53F7\uFF01\u6BCF\u4E2A commit \u90FD\u5E26\u7740\u6E05\u6670\u7684\u601D\u8DEF\uFF0C\u91CD\u6784\u4E8E\u65E0\u5F62\u4E4B\u4E2D\uFF0Cdiff \u8F7B\u76C8\u5374\u81F3\u5173\u91CD\u8981\u3002"
];
var TAG_FORMAT_MASTER_CRITIQUES = [
  "\u683C\u5F0F\u5316\u5927\u5E08\u9690\u85CF\u6210\u5C31\u89E3\u9501\uFF01\u63D0\u4EA4\u4E86 10 \u6B21\uFF0C\u6539\u4E86\u4E0D\u5230 30 \u884C\u2014\u2014\u4F60\u5BF9\u4EE3\u7801\u6D01\u7656\u7684\u575A\u6301\uFF0C\u8BA9\u6574\u4E2A\u9879\u76EE\u7115\u7136\u4E00\u65B0\u3002",
  "\u683C\u5F0F\u5316\u5927\u5E08\uFF01\u51E0\u5341\u6B21\u63D0\u4EA4\u5168\u662F\u6539\u7A7A\u683C\u3001\u52A0\u6CE8\u91CA\u3001\u8C03\u7F29\u8FDB\u3002\u4EE3\u7801\u5E93\u7684\u989C\u503C\u88AB\u4F60\u62C9\u5230\u4E86\u5DC5\u5CF0\uFF0C\u53EF\u8BFB\u6027\u5927\u5927\u63D0\u5347\uFF01"
];
var TAG_GIT_CHATTER_CRITIQUES = [
  "Git \u8BB0\u5F55\u8FBE\u4EBA\u9690\u85CF\u6210\u5C31\uFF0115 \u6B21\u63D0\u4EA4\uFF0C\u5E73\u5747\u6BCF\u6B21\u4E0D\u5230 2 \u884C\u2014\u2014\u4F60\u662F\u5728\u7528 Git \u8BB0\u5F55\u81EA\u5DF1\u7684\u5FC3\u8DEF\u5386\u7A0B\u5417\uFF1F\u7EC6\u9897\u7C92\u5EA6\u7684\u63D0\u4EA4\u8BA9\u7248\u672C\u56DE\u6EDA\u6BEB\u65E0\u538B\u529B\uFF01",
  "Git \u8BB0\u5F55\u8FBE\u4EBA\uFF01\u628A commit \u5206\u62C6\u5F97\u6781\u5176\u7EC6\u817B\uFF0C\u5C31\u50CF\u5728\u5199\u5B9E\u65F6\u65E5\u5FD7\u3002\u8FD9\u79CD\u9AD8\u9891\u5FAE\u8C03\u7684\u4E60\u60EF\uFF0C\u8BA9\u4EE3\u7801\u8FFD\u8E2A\u53D8\u5F97\u7B80\u5355\u660E\u4E86\u3002"
];
var TAG_NIGHT_ASSASSIN_CRITIQUES = [
  "\u6DF1\u591C\u523A\u5BA2\u9690\u85CF\u6210\u5C31\uFF01\u4FEE\u4ED9\u6307\u6570\u7206\u8868\u4F46\u63D0\u4EA4\u6781\u5176\u7CBE\u70BC\u2014\u2014\u4F60\u662F\u534A\u591C\u9876\u7740\u591C\u8272\u5077\u5077\u4E0A\u7EBF\u641E\u5B9A\u6838\u5FC3 bug\uFF0C\u6DF1\u85CF\u529F\u4E0E\u540D\u3002",
  "\u6DF1\u591C\u523A\u5BA2\uFF01\u5BE5\u5BE5\u51E0\u6B21\u63D0\u4EA4\u5168\u5728\u51CC\u6668\uFF0C\u767D\u5929\u95ED\u76EE\u517B\u795E\uFF0C\u534A\u591C\u4E00\u51FB\u5FC5\u6740\uFF0C\u53CC\u9762\u6781\u5BA2\u4EBA\u751F\u5C5E\u5B9E\u7CBE\u5F69\u3002"
];
var TAG_DONKEY_CRITIQUES = [
  "\u5168\u80FD\u6218\u795E\u9690\u85CF\u6210\u5C31\u89E3\u9501\uFF01\u5468\u672B\u7206\u809D + \u6DF1\u591C\u4FEE\u4ED9\u3002Git \u5DF2\u7ECF\u8BB0\u4F4F\u4E86\u4F60\u7684\u6BCF\u4E00\u5206\u52AA\u529B\u4E0E\u4ED8\u51FA\uFF0C\u4F46\u4E5F\u5E0C\u671B\u4F60\u522B\u5FD8\u4E86\u597D\u597D\u7167\u987E\u81EA\u5DF1\u3002",
  "\u5468\u672B\u548C\u6DF1\u591C\u90FD\u7559\u4E0B\u4E86\u4F60\u7684\u8DB3\u8FF9\uFF0C\u8FD9\u4EFD\u8D23\u4EFB\u611F\u4E0E\u575A\u6301\u5DF2\u7ECF\u62C9\u6EE1\u3002\u8F9B\u82E6\u4ED8\u51FA\u7684\u540C\u65F6\uFF0C\u4E5F\u8BF7\u4E00\u5B9A\u8981\u7559\u51FA\u65F6\u95F4\u597D\u597D\u751F\u6D3B\u3002"
];
var TAG_FISH_IMMORTAL_CRITIQUES = [
  "\u6478\u9C7C\u4ED9\u4EBA\u9690\u85CF\u6210\u5C31\uFF01\u6478\u9C7C\u6307\u6570\u7A81\u7834 95%\uFF0C\u4E00\u5929\u53EA\u63D0\u4EA4 0 \u6216 1 \u6B21\u2014\u2014\u4F60\u5DF2\u7ECF\u8D85\u8D8A\u4E86\u666E\u901A\u7684\u6478\u9C7C\uFF0C\u8FBE\u5230\u4E86\u65E0\u62DB\u80DC\u6709\u62DB\u7684\u65E0\u4E3A\u5883\u754C\u3002",
  "\u6478\u9C7C\u4ED9\u4EBA\uFF0C\u5883\u754C\u5DF2\u8D85\u51E1\u4EBA\uFF01\u5BE5\u5BE5\u4E00\u6B21\u63D0\u4EA4\uFF0C\u9AD8\u8FBE 95%+ \u7684\u6DE1\u5B9A\u7387\u3002\u7528\u6700\u5C11\u7684\u52A8\u4F5C\u7EF4\u6301\u7CFB\u7EDF\u7684\u8FD0\u8F6C\uFF0C\u4E0D\u6127\u662F\u4E16\u5916\u9AD8\u4EBA\u3002"
];
function getRandomItem(arr) {
  const idx = Math.floor(Math.random() * arr.length);
  return arr[idx];
}
function getAICritic(weeklyStats) {
  const parts = [];
  if (weeklyStats.ghostCommitsCount > 0) {
    parts.push(getRandomItem(GHOST_CRITIQUES));
  }
  if (weeklyStats.totalCommits === 0) {
    parts.push("\u672C\u5468\u63D0\u4EA4\u6B21\u6570\u4E3A 0\u3002\u5B8C\u7F8E\u7684\u7A7A\u6C14\u7EA7\u8D21\u732E\uFF01\u8001\u677F\u53EF\u80FD\u8FD8\u6CA1\u53D1\u73B0\u4F60\u7684\u5DE5\u4F4D\u662F\u7A7A\u7684\u3002\u5EFA\u8BAE\u4E0B\u5468\u5077\u5077\u63D0\u4EA4\u4E00\u6B21\uFF0C\u5237\u4E00\u4E0B\u5B58\u5728\u611F\u3002");
  } else if (weeklyStats.averageFish >= 75) {
    parts.push(getRandomItem(SLACK_HIGH_CRITIQUES));
  } else if (weeklyStats.averageFish <= 40) {
    parts.push(getRandomItem(SLACK_LOW_CRITIQUES));
  }
  const tagCritics = getTagCriticsFromDays(weeklyStats.days);
  if (tagCritics.length > 0) {
    parts.push(...tagCritics.slice(0, 2));
  }
  if (parts.length === 0) {
    parts.push(getRandomItem(GENERAL_CRITIQUES));
  }
  return parts.join("\n\n");
}
function getAICriticForMonth(monthlyStats) {
  const parts = [];
  if (monthlyStats.ghostCommitsCount > 3) {
    parts.push(getRandomItem(GHOST_CRITIQUES));
  }
  const { fix, feat, chore, other } = monthlyStats.categories;
  const total = fix + feat + chore + other;
  if (total > 0) {
    const fixPct = Math.round(fix / total * 100);
    const featPct = Math.round(feat / total * 100);
    const chorePct = Math.round(chore / total * 100);
    if (fixPct >= 50) {
      parts.push(getRandomItem(CATEGORY_FIX_CRITIQUES).replace("%PERCENT%%", `${fixPct}%`));
    } else if (featPct >= 50) {
      parts.push(getRandomItem(CATEGORY_FEAT_CRITIQUES).replace("%PERCENT%%", `${featPct}%`));
    } else if (chorePct >= 40) {
      parts.push(getRandomItem(CATEGORY_CHORE_CRITIQUES).replace("%PERCENT%%", `${chorePct}%`));
    }
  }
  if (monthlyStats.totalCommits === 0) {
    parts.push("\u672C\u6708\u63D0\u4EA4\u6B21\u6570\u4E3A 0\uFF01\u4F60\u6210\u529F\u5730\u5728\u516C\u53F8\u84B8\u53D1\u4E86\u4E00\u4E2A\u6708\uFF0C\u62FF\u5230\u4E86\u5168\u989D\u5DE5\u8D44\u3002\u5EFA\u8BAE\u4F60\u4E0B\u4E2A\u6708\u7EE7\u7EED\u4FDD\u6301\u4F4E\u8C03\uFF0C\u4E0D\u8981\u8BA9 HR \u6CE8\u610F\u5230\u4F60\u3002");
  } else if (monthlyStats.averageFish >= 70) {
    parts.push(getRandomItem(SLACK_HIGH_CRITIQUES));
  } else if (monthlyStats.averageFish <= 35) {
    parts.push(getRandomItem(SLACK_LOW_CRITIQUES));
  }
  if (parts.length === 0) {
    parts.push(getRandomItem(GENERAL_CRITIQUES));
  }
  return parts.join("\n\n");
}
var TAG_CRITIQUE_MAP = {
  "\u{1F41F} \u6478\u9C7C\u5B97\u5E08": TAG_FISH_MASTER_CRITIQUES,
  "\u{1F525} \u7206\u809D\u6218\u795E": TAG_VOLUME_KING_CRITIQUES,
  "\u{1F319} \u6DF1\u591C\u4FEE\u4ED9\u8005": TAG_NIGHT_OWL_CRITIQUES,
  "\u{1F9F1} \u52E4\u6073\u642C\u7816\u4EBA": TAG_BUILDER_CRITIQUES,
  "\u{1F4A5} \u4E00\u628A\u68AD\u54C8\u578B\u7A0B\u5E8F\u5458": TAG_BURST_CODER_CRITIQUES,
  "\u{1F3F7}\uFE0F PPT \u67B6\u6784\u5E08": TAG_PPT_ARCHITECT_CRITIQUES,
  "\u{1F3F7}\uFE0F \u683C\u5F0F\u5316\u5927\u5E08": TAG_FORMAT_MASTER_CRITIQUES,
  "\u{1F4AC} Git \u804A\u5929\u8FBE\u4EBA": TAG_GIT_CHATTER_CRITIQUES,
  "\u{1F319} \u6DF1\u591C\u523A\u5BA2": TAG_NIGHT_ASSASSIN_CRITIQUES,
  "\u{1F434} \u751F\u4EA7\u961F\u7684\u9A74": TAG_DONKEY_CRITIQUES,
  "\u{1F41F}\uFE0F \u6478\u9C7C\u4ED9\u4EBA": TAG_FISH_IMMORTAL_CRITIQUES
};
function findTagPool(tag) {
  if (TAG_CRITIQUE_MAP[tag]) return TAG_CRITIQUE_MAP[tag];
  for (const [key, pool] of Object.entries(TAG_CRITIQUE_MAP)) {
    if (tag.startsWith(key)) return pool;
  }
  return void 0;
}
function getTagCriticsFromDays(days) {
  const seenPrefixes = /* @__PURE__ */ new Set();
  const critics = [];
  for (const day of days) {
    if (!day.tags) continue;
    for (const tag of day.tags) {
      const prefix = tag.replace(/\s*\(.*\)$/, "");
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

// src/index.ts
var program = new Command();
var SPINNER_FRAMES = ["\u{1F41F}  ", " \u{1F420} ", "  \u{1F421} ", " \u{1F988} ", "  \u{1F419} ", " \u{1F991}  "];
function showLoading(message) {
  let frameIdx = 0;
  process.stdout.write("\x1B[?25l");
  const timer = setInterval(() => {
    process.stdout.write(`\r${chalk.cyan(SPINNER_FRAMES[frameIdx])} ${chalk.yellow(message)} `);
    frameIdx = (frameIdx + 1) % SPINNER_FRAMES.length;
  }, 150);
  return {
    update: (msg) => {
      message = msg;
    },
    stop: () => {
      clearInterval(timer);
      process.stdout.write("\r" + " ".repeat(60) + "\r");
      process.stdout.write("\x1B[?25h");
    }
  };
}
function printBanner(title) {
  console.log(chalk.cyan.bold("\n" + "=".repeat(50)));
  console.log(chalk.blue.bold(` \u{1F41F} FISH - ${title}`));
  console.log(chalk.cyan.bold("=".repeat(50) + "\n"));
}
function formatSlackIndex(fish) {
  if (fish >= 90) {
    return chalk.green(`${fish}% (\u7EC8\u6781\u6478\u9C7C \u{1F3A3})`);
  } else if (fish >= 70) {
    return chalk.green(`${fish}% (\u5408\u7406\u5212\u6C34 \u2615)`);
  } else if (fish >= 40) {
    return chalk.yellow(`${fish}% (\u6B63\u5E38\u8425\u4E1A \u{1F4BB})`);
  } else {
    return chalk.red(`${fish}% (\u706B\u529B\u5168\u5F00 \u{1F525})`);
  }
}
function formatNightOwlIndex(nightOwl) {
  if (nightOwl >= 60) {
    return chalk.red.bold(`${nightOwl}% (\u4FEE\u4ED9\u5927\u4F6C \u{1F9D9})`);
  } else if (nightOwl >= 30) {
    return chalk.red(`${nightOwl}% (\u591C\u732B\u51FA\u6CA1 \u{1F989})`);
  } else if (nightOwl >= 10) {
    return chalk.yellow(`${nightOwl}% (\u5076\u5C14\u71AC\u591C \u{1F319})`);
  } else {
    return "";
  }
}
function formatOvertimeIndex(fish) {
  if (fish >= 80) {
    return chalk.green(`${fish}% (\u5468\u672B\u6478\u9C7C \u{1F3A3})`);
  } else if (fish >= 50) {
    return chalk.yellow(`${fish}% (\u8F7B\u5FAE\u52A0\u73ED \u{1F319})`);
  } else if (fish >= 20) {
    return chalk.red(`${fish}% (\u5468\u672B\u7206\u809D \u{1F525})`);
  } else {
    return chalk.red.bold(`${fish}% (\u7EC8\u6781\u7206\u809D \u2620\uFE0F)`);
  }
}
function getPersonalityTag(day) {
  return day.tags.length > 0 ? day.tags.join(" ") : null;
}
function colorizeTags(tagStr) {
  const colorMap = {
    "\u{1F41F} \u6478\u9C7C\u5B97\u5E08": chalk.green,
    "\u{1F525} \u7206\u809D\u6218\u795E": chalk.red.bold,
    "\u{1F319} \u6DF1\u591C\u4FEE\u4ED9\u8005": chalk.red,
    "\u{1F9F1} \u52E4\u6073\u642C\u7816\u4EBA": chalk.yellow,
    "\u{1F4A5} \u4E00\u628A\u68AD\u54C8\u578B\u7A0B\u5E8F\u5458": chalk.magenta,
    "\u{1F3F7}\uFE0F PPT \u67B6\u6784\u5E08": chalk.blue,
    "\u{1F3F7}\uFE0F \u683C\u5F0F\u5316\u5927\u5E08": chalk.cyan,
    "\u{1F3F7}\uFE0F Git \u804A\u5929\u8FBE\u4EBA": chalk.greenBright,
    "\u{1F3F7}\uFE0F \u6DF1\u591C\u523A\u5BA2": chalk.redBright,
    "\u{1F3F7}\uFE0F \u751F\u4EA7\u961F\u7684\u9A74": chalk.yellowBright,
    "\u{1F3F7}\uFE0F \u6478\u9C7C\u4ED9\u4EBA": chalk.green.bold,
    "\u{1F41F} \u4ECA\u65E5\u6682\u65E0\u4EE3\u7801\u6D3B\u52A8": chalk.green
  };
  const sortedKeys = Object.keys(colorMap).sort((a, b) => b.length - a.length);
  let result = tagStr;
  for (const key of sortedKeys) {
    const colorFn = colorMap[key];
    const regex = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\s*\\([^)]*\\))?", "g");
    result = result.replace(regex, (match) => {
      const suffixMatch = match.match(/^(.+?)(\s*\(.*\))?$/);
      if (suffixMatch) {
        return colorFn(suffixMatch[1]) + (suffixMatch[2] || "");
      }
      return colorFn(match);
    });
  }
  return result;
}
function visualWidth(s) {
  let w = 0;
  for (const ch of s) {
    w += /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef\u{1f000}-\u{1ffff}]/u.test(ch) ? 2 : 1;
  }
  return w;
}
function visualPad(s, width) {
  const vw = visualWidth(s);
  if (vw >= width) return s;
  return s + " ".repeat(width - vw);
}
function colorizeFishRow(row) {
  const COL_WIDTH = 8;
  let result = "";
  for (let i = 0; i < row.length; i += COL_WIDTH) {
    const chunk = row.slice(i, i + COL_WIDTH);
    const val = parseInt(chunk.trim(), 10);
    if (isNaN(val)) {
      result += chunk;
    } else if (val >= 80) {
      result += chalk.green(chunk);
    } else if (val >= 50) {
      result += chalk.yellow(chunk);
    } else {
      result += chalk.red(chunk);
    }
  }
  return result;
}
function getTargetDate(weeksAgo, isMonth) {
  const now = /* @__PURE__ */ new Date();
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
function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
var COMMENT_POOLS = {
  "0-2": { color: chalk.red, tags: [
    "\u670D\u52A1\u5668\u548C\u4F60\uFF0C\u603B\u5F97\u6709\u4E00\u4E2A\u7761\u89C9 \u{1F635}\u200D\u{1F4AB}",
    "\u591C\u732B\u4FEE\u4ED9 \u{1F9D9}",
    "\u8FD9\u63D0\u4EA4\u4E0D\u50CF\u5DE5\u4F5C\uFF0C\u50CF\u62A5\u590D\u4EE3\u7801 \u{1F608}",
    "\u6DF1\u591C\u4FEE\u4ED9\u578B\u7A0B\u5E8F\u5458 \u{1F319}"
  ] },
  "3-5": { color: chalk.redBright, tags: [
    "\u960E\u738B\uFF1A\u600E\u4E48\u53C8\u662F\u4F60\uFF1F\u{1F47B}",
    "\u751F\u7269\u949F\u5DF2\u9635\u4EA1 \u2620\uFE0F",
    "\u54E5\uFF0C\u4F60\u662F\u4F4F\u516C\u53F8\u4E86\u5417 \u{1F3E2}",
    "\u9E21\u9E23\u5373\u8D77\u578B\u725B\u9A6C \u{1F414}"
  ] },
  "6-8": { color: chalk.gray, tags: [
    "\u9E21\u90FD\u6CA1\u8D77\uFF0C\u4F60\u5148\u4E0A\u73ED\u4E86 \u{1F414}",
    "\u5929\u9009\u725B\u9A6C\u5DF2\u4E0A\u7EBF \u{1F402}",
    "\u7206\u809D\u542F\u52A8\u6210\u529F \u{1F680}",
    "\u65E9\u8D77\u7684 commit \u6709 bug \u5403 \u{1F41B}"
  ] },
  "9-11": { color: chalk.yellow, tags: [
    "\u5047\u88C5\u5F88\u5FD9\uFF0C\u5176\u5B9E\u5728\u7B49\u5348\u996D \u{1F371}",
    "\u6668\u95F4coding \u2615",
    "\u6B63\u5E38\u4EBA\u7C7B\u5DE5\u4F5C\u65F6\u95F4 \u2705",
    "\u4E0A\u5348\u8868\u6F14\u578B\u9009\u624B \u{1F680}"
  ] },
  "12-13": { color: chalk.green, tags: [
    "\u5DE5\u4F4D\u5403\u996D\uFF0C\u7075\u9B42\u7EED\u547D \u{1F50B}",
    "\u5E72\u996D\u662F\u7B2C\u4E00\u751F\u4EA7\u529B \u{1F35A}",
    "\u4E00\u8FB9\u5403\u996D\u4E00\u8FB9 commit \u{1F35C}",
    "\u5E72\u996D\u7EED\u547D\u578B\u5DE5\u7A0B\u5E08 \u{1F371}"
  ] },
  "14-15": { color: chalk.cyan, tags: [
    "\u5348\u7761\u672A\u9192\uFF0C\u4EBA\u5DF2\u5F00\u5DE5 \u{1F62A}",
    "CPU \u91CD\u542F\u4E2D \u{1F504}",
    // '午觉没睡成，拿代码出气 💢',
    "\u5348\u540E\u7075\u9B42\u51FA\u7A8D\u8005 \u{1F47B}"
  ] },
  "16-17": { color: chalk.cyanBright, tags: [
    "\u5F00\u59CB\u601D\u8003\u4ECA\u665A\u5403\u4EC0\u4E48 \u{1F373}",
    "\u7075\u9B42\u5DF2\u4E0B\u73ED \u{1F47B}",
    "\u4E34\u8FD1\u4E0B\u73ED\u7A81\u7136\u52E4\u594B \u{1F914}",
    "\u7B49\u4E0B\u73ED\u89C2\u5BDF\u5458 \u{1F375}"
  ] },
  "18-20": { color: chalk.magenta, tags: [
    "\u52A0\u73ED\u662F\u4E0D\u53EF\u80FD\u4E3B\u52A8\u52A0\u73ED\u7684 \u{1F4BC}",
    "\u5DE5\u4F4D\u5C01\u5370\u89E3\u9664 \u{1F513}",
    "\u767D\u5929\u5728\u5F00\u4F1A\uFF0C\u665A\u4E0A\u771F\u5E72\u6D3B \u{1F4BB}",
    "\u81EA\u613F\uFF08\u88AB\u8FEB\uFF09\u52A0\u73ED\u4EBA \u{1F4AA}"
  ] },
  "21-22": { color: chalk.magentaBright, tags: [
    "\u8001\u677F\u4E0B\u73ED\u4E86\uFF0C\u4F60\u8FD8\u6CA1\u4E0B\u7EBF \u{1F62D}",
    "\u52A0\u73ED\u4ED9\u4EBA\u6E21\u52AB\u4E2D \u26A1",
    "\u4ECA\u65E5\u6700\u540E\u4E00\u4E2A commit\uFF08\u9A97\u81EA\u5DF1\uFF09\u{1F921}",
    "\u5927\u798F\u62A5\u65F6\u95F4 \u{1F525}"
  ] },
  "23": { color: chalk.red, tags: [
    "\u4EE3\u7801\u548C\u5934\u53D1\u4E00\u8D77\u6389\u5149\u4E2D \u{1F9D1}\u200D\u{1F9B2}",
    "\u4ECA\u65E5 KPI\uFF1A\u6D3B\u7740\u5C31\u884C \u{1F60C}",
    "\u7761\u5427\uFF0CGit \u4E0D\u4F1A\u8DD1 \u{1F6CC}",
    "\u591C\u6DF1\u4E86\uFF0C\u5408\u4E0A\u7535\u8111\u5427 \u{1F4F4}"
  ] }
};
function getHourTag(hour) {
  let pool;
  if (hour >= 0 && hour <= 2) pool = COMMENT_POOLS["0-2"];
  else if (hour >= 3 && hour <= 5) pool = COMMENT_POOLS["3-5"];
  else if (hour >= 6 && hour <= 8) pool = COMMENT_POOLS["6-8"];
  else if (hour >= 9 && hour <= 11) pool = COMMENT_POOLS["9-11"];
  else if (hour >= 12 && hour <= 13) pool = COMMENT_POOLS["12-13"];
  else if (hour >= 14 && hour <= 15) pool = COMMENT_POOLS["14-15"];
  else if (hour >= 16 && hour <= 17) pool = COMMENT_POOLS["16-17"];
  else if (hour >= 18 && hour <= 20) pool = COMMENT_POOLS["18-20"];
  else if (hour >= 21 && hour <= 22) pool = COMMENT_POOLS["21-22"];
  else pool = COMMENT_POOLS["23"];
  return pool.color(` (${randomPick(pool.tags)})`);
}
async function runWeeklyReport(weeksAgo, source) {
  const projects = getProjects();
  let timeTag = "";
  if (weeksAgo === 1) timeTag = " \u4E0A\u5468";
  else if (weeksAgo === 2) timeTag = " \u4E0A\u4E0A\u5468";
  else if (weeksAgo > 2) timeTag = ` ${weeksAgo}\u5468\u524D`;
  if (timeTag) {
    printBanner(`${timeTag} Git \u6478\u9C7C\u5468\u62A5`);
  } else {
    printBanner(`\u672C\u5468 Git \u6478\u9C7C\u5468\u62A5`);
  }
  if (projects.length === 1 && projects[0] === process.cwd()) {
    const hasGit = fs2.existsSync(path3.join(process.cwd(), ".git"));
    const config = readConfig();
    const hasGitLab = config.gitlabToken || config.gitlabs && config.gitlabs.length > 0;
    if (!hasGit && config.projects.length === 0 && !hasGitLab) {
      console.log(chalk.yellow(`\u26A0 \u63D0\u793A: \u5F53\u524D\u5DE5\u4F5C\u76EE\u5F55\u4E0D\u662F\u4E00\u4E2A Git \u4ED3\u5E93\u3002`));
      console.log(chalk.gray(`\u4F60\u53EF\u4EE5\u901A\u8FC7\u4EE5\u4E0B\u547D\u4EE4\u914D\u7F6E\u9879\u76EE\u6216 GitLab\uFF1A`));
      console.log(`  ${chalk.cyan("fish config add <path>")}        - \u624B\u52A8\u6DFB\u52A0\u672C\u5730\u4ED3\u5E93`);
      console.log(`  ${chalk.cyan("fish config scan <dir>")}         - \u81EA\u52A8\u626B\u63CF\u76EE\u5F55\u4E0B\u6240\u6709\u4ED3\u5E93`);
      console.log(`  ${chalk.cyan("fish config gitlab <token> [host] [name]")} - \u914D\u7F6E GitLab \u4EE4\u724C\u4EE5\u8FDC\u7A0B\u540C\u6B65\u6240\u6709\u9879\u76EE
`);
    }
  }
  const targetDate = getTargetDate(weeksAgo, false);
  const realNow = /* @__PURE__ */ new Date();
  const { since: realSince } = getThisWeekRange(realNow);
  const { since: targetSince } = getThisWeekRange(targetDate);
  const isPastWeek = targetSince.getTime() < realSince.getTime();
  const currentDayOfWeek = isPastWeek ? 6 : (targetDate.getDay() + 6) % 7;
  const loading = showLoading("\u6B63\u5728\u6478\u904D\u6240\u6709\u4ED3\u5E93...");
  const stats = await analyzeWeekly(projects, targetDate, source);
  loading.stop();
  console.log(chalk.cyan.bold("\u{1F4C5} \u672C\u5468\u63D0\u4EA4\u8BE6\u60C5\uFF1A"));
  stats.days.forEach((day, idx) => {
    const isWeekend = idx >= 5;
    const isFuture = idx > currentDayOfWeek;
    if (isWeekend && day.commitsCount === 0) {
      return;
    }
    if (isFuture && day.commitsCount === 0) {
      console.log(`  ${day.dayName}\uFF1A${chalk.gray("\u672A\u5230")}`);
    } else {
      const projStr = day.projects.length > 0 ? ` | ${day.projects.length}\u4E2A\u9879\u76EE (${day.projects.join(", ")})` : "";
      const commitStr = day.commitsCount > 0 ? chalk.white.bold(`${day.commitsCount} \u6B21`) : "0 \u6B21";
      const indices = [];
      if (isWeekend) {
        indices.push(`\u{1F4BC} \u52A0\u73ED\u6307\u6570: ${formatOvertimeIndex(day.fish)}`);
      } else {
        indices.push(`\u{1F41F} \u6478\u9C7C\u6307\u6570: ${formatSlackIndex(day.fish)}`);
      }
      if (day.nightOwl >= 10) {
        const nightStr = formatNightOwlIndex(day.nightOwl);
        if (nightStr) indices.push(`\u{1F319} \u4FEE\u4ED9\u6307\u6570: ${nightStr}`);
      }
      const extraIndices = indices.length > 0 ? ` | ${indices.join(" | ")}` : "";
      const tag = getPersonalityTag(day);
      const tagStr = tag ? `  \u{1F3F7} ${colorizeTags(tag)}` : "";
      console.log(`  ${day.dayName}\uFF1A${commitStr}${extraIndices}${projStr}${tagStr}`);
    }
  });
  console.log("\n" + chalk.gray("-".repeat(50)));
  if (stats.totalCommits > 0) {
    const activeDays = stats.days.filter((_, idx) => idx <= currentDayOfWeek);
    const workingDays = activeDays.filter((d) => d.commitsCount > 0);
    if (workingDays.length > 0) {
      const minFish = Math.min(...workingDays.map((d) => d.fish));
      const mostProductiveDays = workingDays.filter((d) => d.fish === minFish);
      if (minFish <= 40 && mostProductiveDays.length > 0) {
        const names = mostProductiveDays.map((d) => d.dayName).join("\u3001");
        const sample = mostProductiveDays[0];
        const isWeekend = sample.dayName === "\u5468\u516D" || sample.dayName === "\u5468\u65E5";
        const label = isWeekend ? "\u{1F4BC} \u52A0\u73ED\u6307\u6570" : "\u{1F41F} \u6478\u9C7C\u6307\u6570";
        console.log(`\u{1F3C6} ${chalk.red.bold("\u6700\u52AA\u529B\u7684\u65E5\u5B50")}\uFF1A${names} | ${label}\uFF1A${sample.fish}%`);
      }
    }
    const weekdayDays = activeDays.filter((d) => d.dayName !== "\u5468\u516D" && d.dayName !== "\u5468\u65E5");
    if (weekdayDays.length > 0) {
      const maxFish = Math.max(...weekdayDays.map((d) => d.fish));
      const minFish = workingDays.length > 0 ? Math.min(...workingDays.map((d) => d.fish)) : 100;
      const happyDays = weekdayDays.filter((d) => d.fish === maxFish);
      const filteredHappyDays = happyDays.filter(
        (d) => d.fish !== minFish || workingDays.length === 0
      );
      if (maxFish >= 70 && filteredHappyDays.length > 0) {
        const names = filteredHappyDays.map((d) => d.dayName).join("\u3001");
        const sample = filteredHappyDays[0];
        console.log(`\u2615 ${chalk.green.bold("\u6700\u5FEB\u4E50\u7684\u65E5\u5B50")}\uFF1A${names} | \u{1F41F} \u6478\u9C7C\u6307\u6570\uFF1A${sample.fish}%`);
      }
    }
    const weekendDays = activeDays.filter((d) => d.commitsCount > 0 && (d.dayName === "\u5468\u516D" || d.dayName === "\u5468\u65E5"));
    if (weekendDays.length > 0) {
      const minFish = Math.min(...weekendDays.map((d) => d.fish));
      const painfulDays = weekendDays.filter((d) => d.fish === minFish);
      const names = painfulDays.map((d) => d.dayName).join("\u3001");
      const sample = painfulDays[0];
      console.log(`\u{1F62D} ${chalk.magenta.bold("\u6700\u75DB\u82E6\u7684\u65E5\u5B50")}\uFF1A${names} | \u{1F4BC} \u52A0\u73ED\u6307\u6570\uFF1A${sample.fish}%`);
    }
    console.log(chalk.gray("-".repeat(50)));
    const avgNightStr = stats.averageNightOwl > 0 ? ` | \u{1F319} \u4FEE\u4ED9: ${stats.averageNightOwl}%` : "";
    console.log(chalk.dim(`\u{1F4CA} \u672C\u5468\u5747\u503C\uFF1A\u{1F41F} \u6478\u9C7C ${stats.averageFish}%${avgNightStr}`));
    console.log(chalk.gray("-".repeat(50)));
    console.log(`\u{1F916} ${chalk.magenta.bold("\u9510\u8BC4")}\uFF1A`);
    console.log(chalk.white(getAICritic(stats)));
  } else {
    console.log(chalk.yellow("\u{1F4A1} \u672C\u65F6\u95F4\u6BB5\u5185\u4F60\u8FD8\u6CA1\u63D0\u4EA4\u8FC7\u4EFB\u4F55\u4EE3\u7801\uFF01\u5B8C\u7F8E\u7684\u85AA\u6C34\u5C0F\u5077\u3002\u6216\u8005\u68C0\u67E5\u4F60\u7684\u914D\u7F6E\u5427\uFF01"));
  }
  console.log("");
}
async function runMonthlyReport(monthsAgo, source) {
  const projects = getProjects();
  let timeTag = "";
  if (monthsAgo === 1) timeTag = " \u4E0A\u6708";
  else if (monthsAgo === 2) timeTag = " \u4E0A\u4E0A\u6708";
  else if (monthsAgo > 2) timeTag = ` ${monthsAgo}\u6708\u524D`;
  if (timeTag) {
    printBanner(`${timeTag} Git \u6478\u9C7C\u6708\u62A5`);
  } else {
    printBanner(`\u672C\u6708 Git \u6478\u9C7C\u6708\u62A5`);
  }
  const targetDate = getTargetDate(monthsAgo, true);
  const loading = showLoading("\u6B63\u5728\u7FFB\u7BB1\u5012\u67DC\u67E5 Commit...");
  const stats = await analyzeMonthly(projects, targetDate, source);
  loading.stop();
  if (stats.totalCommits === 0) {
    console.log(chalk.yellow("\u{1F4A1} \u672C\u6708\u5728\u6B64\u4ED3\u5E93\u6682\u672A\u53D1\u73B0\u4EFB\u4F55 Git \u63D0\u4EA4\u6570\u636E\u3002\n"));
    return;
  }
  const { fix, feat, chore, other } = stats.categories;
  const total = fix + feat + chore + other;
  console.log(chalk.cyan.bold("\u{1F4C5} \u672C\u6708\u4E3B\u8981\u8D21\u732E\u5360\u6BD4 (\u57FA\u4E8E Commit Message \u6B63\u5219\u5F52\u7C7B)\uFF1A"));
  function drawRow(label, count, colorFn) {
    const percentage = total > 0 ? Math.round(count / total * 100) : 0;
    const barWidth = 15;
    const filled = Math.round(percentage / 100 * barWidth);
    const empty = barWidth - filled;
    const barStr = colorFn("\u25A0".repeat(filled)) + chalk.gray("\u25A1".repeat(empty));
    console.log(`  - ${label}\uFF1A[${barStr}] ${chalk.bold(percentage + "%")} (${count} \u6B21)`);
  }
  drawRow("\u4FEE bug (fix)        ", fix, chalk.red);
  drawRow("\u65B0\u529F\u80FD (feat)       ", feat, chalk.green);
  drawRow("\u6742\u52A1\u4E0E\u6587\u6863 (chore)  ", chore, chalk.yellow);
  drawRow("\u5176\u4ED6\u63D0\u4EA4 (other)    ", other, chalk.gray);
  if (stats.dailyIndices && stats.dailyIndices.length > 0) {
    console.log("\n" + chalk.cyan.bold("\u{1F4C5} \u6BCF\u65E5\u6478\u9C7C\u6307\u6570\u6982\u89C8\uFF1A"));
    const monthLabel = `${targetDate.getMonth() + 1}\u6708`;
    const COL_WIDTH = 8;
    const lines = [];
    let dateRow = "";
    let fishRow = "";
    for (const d of stats.dailyIndices) {
      const dateRaw = `${monthLabel}${d.day}\u65E5`;
      const fishRaw = `${d.fish}%`;
      dateRow += visualPad(dateRaw, COL_WIDTH);
      fishRow += visualPad(fishRaw, COL_WIDTH);
      if (d.day % 7 === 0 || d === stats.dailyIndices[stats.dailyIndices.length - 1]) {
        lines.push(chalk.gray(dateRow.trimEnd()));
        fishRow = colorizeFishRow(fishRow);
        lines.push(fishRow);
        lines.push("");
        dateRow = "";
        fishRow = "";
      }
    }
    if (lines[lines.length - 1] === "") lines.pop();
    for (const l of lines) {
      console.log(`  ${l}`);
    }
    const dailyWithCommits = stats.dailyIndices.filter((d) => d.commitsCount > 0);
    if (dailyWithCommits.length > 0) {
      const mostFish = [...dailyWithCommits].sort((a, b) => b.fish - a.fish)[0];
      const mostWork = [...dailyWithCommits].sort((a, b) => a.fish - b.fish)[0];
      if (mostFish.fish >= 75) {
        console.log(chalk.green(`
  \u{1F3A3} \u6478\u9C7C\u738B: ${monthLabel}${mostFish.day}\u65E5 \u2192 \u6478\u9C7C\u6307\u6570 ${mostFish.fish}%` + (mostFish.tags.length > 0 ? ` ${mostFish.tags.join(" ")}` : "")));
      }
      if (mostWork.fish <= 40) {
        console.log(chalk.red(`
  \u{1F525} \u7206\u809D\u738B: ${monthLabel}${mostWork.day}\u65E5 \u2192 \u6478\u9C7C\u6307\u6570 ${mostWork.fish}%` + (mostWork.tags.length > 0 ? ` ${mostWork.tags.join(" ")}` : "")));
      }
    }
  }
  console.log("\n" + chalk.gray("-".repeat(50)));
  console.log(`\u{1F916} ${chalk.magenta.bold("\u9510\u8BC4")}\uFF1A`);
  console.log(chalk.white(getAICriticForMonth(stats)));
  console.log("");
}
async function runProjectReport(weeksAgo, source, isMonth = false) {
  const projects = getProjects();
  let timeTag = "";
  if (isMonth) {
    if (weeksAgo === 1) timeTag = " (\u4E0A\u6708)";
    else if (weeksAgo === 2) timeTag = " (\u4E0A\u4E0A\u6708)";
    else if (weeksAgo > 2) timeTag = ` (${weeksAgo}\u6708\u524D)`;
  } else {
    if (weeksAgo === 1) timeTag = " (\u4E0A\u5468)";
    else if (weeksAgo === 2) timeTag = " (\u4E0A\u4E0A\u5468)";
    else if (weeksAgo > 2) timeTag = ` (${weeksAgo}\u5468\u524D)`;
  }
  printBanner(`\u9879\u76EE\u7206\u809D\u6392\u884C${timeTag}`);
  const targetDate = getTargetDate(weeksAgo, isMonth);
  const { since, until } = isMonth ? getThisMonthRange(targetDate) : getThisWeekRange(targetDate);
  const loading = showLoading("\u6B63\u5728\u7EDF\u8BA1\u9879\u76EE\u7206\u809D\u7A0B\u5EA6...");
  const stats = isMonth ? await analyzeMonthly(projects, targetDate, source) : await analyzeWeekly(projects, targetDate, source);
  loading.stop();
  console.log(chalk.cyan.bold(`\u{1F4CA} \u5BF9\u5E94\u65F6\u6BB5\u9879\u76EE\u7206\u809D\u6392\u884C (${since.toLocaleDateString()} ~ ${until.toLocaleDateString()})`));
  const ranked = stats.projectsRanked;
  if (ranked.length === 0) {
    console.log(chalk.gray("  \u672C\u65F6\u6BB5\u6682\u65E0\u9879\u76EE\u63D0\u4EA4\u6570\u636E\u3002"));
  } else {
    const totalCommits = ranked.reduce((sum, p) => sum + p.count, 0);
    let hasPrimaryProject = false;
    ranked.forEach((proj, idx) => {
      const N = proj.count;
      const ratio = N / Math.max(1, totalCommits);
      let suffix;
      if (ratio >= 0.5 || N >= 30) {
        if (!hasPrimaryProject) {
          suffix = chalk.red(" (\u4E3B\u529B\u642C\u7816\u5730 \u{1F9F1})");
          hasPrimaryProject = true;
        } else {
          suffix = chalk.red(" (\u9B42\u5F52\u4E4B\u5904\uFF0C\u4EE3\u7801\u5728\u8FD9\u5BB6\u5C31\u5728 \u{1F3E0})");
        }
      } else if (ratio >= 0.2 || N >= 14) {
        suffix = chalk.magenta(" (\u591A\u7EBF\u7A0B\u5206\u51FA\u6765\u7684\u6253\u5DE5\u9B42 \u{1F9F5})");
      } else if (ratio >= 0.15 || N >= 5) {
        suffix = chalk.yellow(" (\u5076\u5C14\u4E0A\u53BB\u70B9\u4E00\u4E0B \u{1F41F})");
      } else if (N === 1) {
        suffix = chalk.cyan(" (\u6D4B\u5B8C\u5C31\u8DD1\uFF0C\u7EAF\u7CB9\u8DEF\u8FC7 \u{1F6AC})");
      } else {
        suffix = chalk.gray(" (\u8FB9\u7F18\u6302\u673A\u9879\u76EE \u{1F4A4})");
      }
      console.log(`  ${idx + 1}. ${chalk.bold.white(proj.name)}: ${chalk.cyan(N + " \u6B21\u63D0\u4EA4")}${suffix}`);
    });
  }
  console.log("");
}
async function runTimeReport(offset, source, isMonth) {
  const projects = getProjects();
  let timeTag = "";
  if (isMonth) {
    if (offset === 1) timeTag = " (\u4E0A\u6708)";
    else if (offset === 2) timeTag = " (\u4E0A\u4E0A\u6708)";
    else if (offset > 2) timeTag = ` (${offset}\u6708\u524D)`;
  } else {
    if (offset === 1) timeTag = " (\u4E0A\u5468)";
    else if (offset === 2) timeTag = " (\u4E0A\u4E0A\u5468)";
    else if (offset > 2) timeTag = ` (${offset}\u5468\u524D)`;
  }
  printBanner(`\u9EC4\u91D1\u5DE5\u4F5C\u65F6\u95F4\u6BB5\u5206\u6790 (24\u5C0F\u65F6\u5206\u5E03)${timeTag}`);
  const targetDate = getTargetDate(offset, !!isMonth);
  const { since, until } = isMonth ? getThisMonthRange(targetDate) : getThisWeekRange(targetDate);
  const loading = showLoading("\u6B63\u5728\u5206\u6790\u9EC4\u91D1\u65F6\u95F4\u6BB5...");
  const hours = await analyzeHourDistribution(projects, since, until, source);
  loading.stop();
  const maxCount = Math.max(...hours.map((h) => h.count));
  const barScale = maxCount > 0 ? 30 / maxCount : 1;
  console.log(chalk.cyan.bold(`\u{1F552} \u5BF9\u5E94\u65F6\u6BB5 24 \u5C0F\u65F6 commit \u9891\u6B21\u5206\u5E03\u56FE\uFF1A`));
  hours.forEach(({ hour, count }) => {
    const barLength = Math.round(count * barScale);
    const barStr = "\u2588".repeat(barLength);
    const hourStr = String(hour).padStart(2, "0") + ":00";
    let tag = count > 0 ? getHourTag(hour) : "";
    const barColorStr = count > 0 ? chalk.blue(barStr.padEnd(30, " ")) : chalk.gray("".padEnd(30, " "));
    console.log(`  ${chalk.bold.cyan(hourStr)} | [${barColorStr}] ${chalk.white(count + " \u6B21")}${tag}`);
  });
  console.log("");
}
async function runGhostReport(weeksAgo, source) {
  const projects = getProjects();
  let timeTag = "";
  if (weeksAgo === 1) timeTag = " (\u4E0A\u5468)";
  else if (weeksAgo === 2) timeTag = " (\u4E0A\u4E0A\u5468)";
  else if (weeksAgo > 2) timeTag = ` (${weeksAgo}\u5468\u524D)`;
  printBanner(`\u5E7D\u7075\u63D0\u4EA4\u68C0\u6D4B (\u6DF1\u591C 00:00 ~ 05:00)${timeTag}`);
  const targetDate = getTargetDate(weeksAgo, false);
  const { since, until } = getThisWeekRange(targetDate);
  const loading = showLoading("\u6B63\u5728\u641C\u5BFB\u6DF1\u591C\u5E7D\u7075...");
  const ghosts = await getGhostCommits(projects, since, until, source);
  loading.stop();
  if (ghosts.length === 0) {
    console.log(chalk.green.bold("\u{1F389} \u606D\u559C\uFF01\u672C\u65F6\u95F4\u6BB5\u5185\u672A\u68C0\u6D4B\u5230\u4EFB\u4F55\u6DF1\u591C\u5E7D\u7075\u63D0\u4EA4\u3002"));
    console.log(chalk.white("\u4F60\u7684\u53D1\u9645\u7EBF\u5341\u5206\u5B89\u5168\uFF0C\u5927\u798F\u62A5\u5DF2\u88AB\u65E0\u60C5\u62D2\u6536\uFF0C\u7761\u7720\u5065\u5EB7\u5F97\u5206\uFF1A100 \u5206\uFF01\n"));
  } else {
    console.log(chalk.red.bold(`\u26A0\uFE0F \u8B66\u544A\uFF1A\u672C\u65F6\u95F4\u6BB5\u5185\u5171\u68C0\u6D4B\u5230 ${ghosts.length} \u6B21\u6DF1\u591C\u5E7D\u7075\u63D0\u4EA4\uFF01`));
    console.log(chalk.gray("\u6DF1\u591C\u7684 Commit \u95EA\u70C1\u7740\u7EFF\u5149\uFF0C\u6BCF\u4E00\u884C\u90FD\u662F\u7ED9\u8001\u677F\u5E93\u91CC\u5357\u52A0\u6CB9\u7684\u6C57\u6C34\u3002"));
    console.log(chalk.gray("-".repeat(50)));
    ghosts.forEach((c) => {
      console.log(`  - [${chalk.yellow(c.project)}] ${chalk.cyan(c.date.slice(0, 19).replace("T", " "))} (${chalk.gray(c.hash)})`);
      console.log(`    \u{1F4AC} ${chalk.italic.white(c.message)}`);
    });
    console.log(chalk.gray("-".repeat(50)));
    console.log(`\u{1F916} ${chalk.magenta.bold("\u9510\u8BC4")}\uFF1A`);
    console.log(chalk.red("\u547D\u662F\u81EA\u5DF1\u7684\uFF0C\u5927\u798F\u62A5\u7559\u7ED9\u8001\u677F\u5427\uFF01\u8D76\u7D27\u7761\u89C9\uFF0C\u4FDD\u547D\u8981\u7D27\uFF01\n"));
  }
}
program.name("fish").description("\u{1F41F} Git \u6478\u9C7C & \u7206\u809D\u5206\u6790\u5668 CLI").version("1.0.0").option("-m, --month [monthsAgo]", "\u67E5\u770B\u6478\u9C7C/\u7206\u809D\u6708\u62A5 (\u9ED8\u8BA4 0 \u4E3A\u672C\u6708\uFF0C1 \u4E3A\u4E0A\u6708\uFF0C2 \u4E3A\u4E0A\u4E0A\u6708...)").option("-p, --project", "\u67E5\u770B\u9879\u76EE\u7206\u809D\u6392\u884C").option("-t, --time", "\u67E5\u770B\u9EC4\u91D1\u6478\u9C7C\u65F6\u95F4\u6BB5 analysis (24\u5C0F\u65F6\u5206\u5E03)").option("-g, --ghost", "\u68C0\u6D4B\u6DF1\u591C\u5E7D\u7075\u63D0\u4EA4").option("-w, --weeks-ago <number>", "\u67E5\u8BE2\u51E0\u5468\u524D/\u6708\u524D\u7684\u62A5\u544A (\u9ED8\u8BA4 0\uFF0C\u5373\u672C\u5468/\u672C\u6708)", "0").option("-s, --source <source>", "\u9009\u62E9\u8981\u67E5\u8BE2\u7684 GitLab \u6570\u636E\u6E90 (\u5E8F\u53F7\u6216\u522B\u540D/host)").action(async (options) => {
  const weeksAgo = parseInt(options.weeksAgo || "0", 10);
  const source = options.source;
  if (options.month !== void 0 && options.project) {
    const monthsAgo = options.month === true ? parseInt(options.weeksAgo || "0", 10) : parseInt(options.month || "0", 10);
    await runProjectReport(monthsAgo, source, true);
  } else if (options.month !== void 0 && options.time) {
    const monthsAgo = options.month === true ? parseInt(options.weeksAgo || "0", 10) : parseInt(options.month || "0", 10);
    await runTimeReport(monthsAgo, source, true);
  } else if (options.month !== void 0) {
    const monthsAgo = options.month === true ? parseInt(options.weeksAgo || "0", 10) : parseInt(options.month || "0", 10);
    await runMonthlyReport(monthsAgo, source);
  } else if (options.project) {
    await runProjectReport(weeksAgo, source);
  } else if (options.time) {
    await runTimeReport(weeksAgo, source);
  } else if (options.ghost) {
    await runGhostReport(weeksAgo, source);
  } else {
    await runWeeklyReport(weeksAgo, source);
  }
});
var configCmd = program.command("config").description("\u7BA1\u7406\u76D1\u63A7\u7684\u9879\u76EE\u8DEF\u5F84\u4E0E GitLab \u51ED\u8BC1");
configCmd.command("add <path>").description("\u624B\u52A8\u6DFB\u52A0\u4E00\u4E2A\u672C\u5730 Git \u4ED3\u5E93\u8DEF\u5F84").action((projPath) => {
  const res = addProject(projPath);
  if (res.success) {
    console.log(chalk.green(`\u2714 ${res.message}`));
  } else {
    console.log(chalk.red(`\u2718 ${res.message}`));
  }
});
configCmd.command("remove <path>").description("\u4ECE\u914D\u7F6E\u4E2D\u79FB\u9664\u4E00\u4E2A\u9879\u76EE\u8DEF\u5F84").action((projPath) => {
  const res = removeProject(projPath);
  if (res.success) {
    console.log(chalk.green(`\u2714 ${res.message}`));
  } else {
    console.log(chalk.red(`\u2718 ${res.message}`));
  }
});
configCmd.command("list").description("\u5217\u51FA\u5F53\u524D\u6240\u6709\u76D1\u63A7\u7684\u9879\u76EE\u4E0E GitLab \u914D\u7F6E").action(() => {
  const config = readConfig();
  console.log(chalk.cyan.bold("\n\u{1F4C1} \u5F53\u524D\u76D1\u63A7\u7684\u672C\u5730\u9879\u76EE\u5217\u8868:"));
  if (config.projects.length === 0) {
    console.log(chalk.gray(`  (\u76EE\u524D\u672A\u914D\u7F6E\u672C\u5730\u9879\u76EE\uFF0C\u82E5\u65E0 GitLab \u8FDC\u7A0B\u5219\u9ED8\u8BA4\u626B\u63CF\u5F53\u524D\u76EE\u5F55: ${process.cwd()})`));
  } else {
    config.projects.forEach((p, idx) => {
      console.log(`  ${idx + 1}. ${chalk.white(p)}`);
    });
  }
  console.log(chalk.cyan.bold("\n\u{1F98A} \u5F53\u524D\u914D\u7F6E\u7684 GitLab \u8FDC\u7A0B\u6E90:"));
  const gitlabs = config.gitlabs || [];
  if (gitlabs.length === 0) {
    console.log(chalk.gray("  (\u5C1A\u672A\u914D\u7F6E\u4EFB\u4F55 GitLab \u8FDC\u7A0B\u6E90)"));
  } else {
    gitlabs.forEach((g, idx) => {
      console.log(`  ${idx + 1}. ${chalk.bold.white(g.name)} | Host: ${chalk.gray(g.host)}`);
    });
  }
  console.log("");
});
configCmd.command("scan <dir>").description("\u81EA\u52A8\u626B\u63CF\u6307\u5B9A\u76EE\u5F55\u4E0B\u7684\u6240\u6709 Git \u4ED3\u5E93\u5E76\u6279\u91CF\u6DFB\u52A0").action((dir) => {
  console.log(chalk.cyan(`\u{1F50D} \u6B63\u5728\u626B\u63CF\u76EE\u5F55 ${dir} \u4E0B of Git \u4ED3\u5E93...`));
  const repos = scanDirectory(dir);
  if (repos.length === 0) {
    console.log(chalk.yellow(`\u26A0 \u672A\u5728 ${dir} \u4E0B\u53D1\u73B0\u4EFB\u4F55 Git \u4ED3\u5E93\u3002`));
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
    console.log(chalk.green(`\u2714 \u6210\u529F\u53D1\u73B0\u5E76\u6DFB\u52A0\u4E86 ${addedCount} \u4E2A\u65B0 Git \u4ED3\u5E93\uFF1A`));
    repos.forEach((r) => console.log(`  - ${chalk.gray(r)}`));
  } else {
    console.log(chalk.yellow(`\u26A0 \u626B\u63CF\u5230\u4E86 ${repos.length} \u4E2A\u4ED3\u5E93\uFF0C\u4F46\u90FD\u5DF2\u5728\u76D1\u63A7\u914D\u7F6E\u4E2D\u3002`));
  }
});
configCmd.command("gitlab <token> [host] [name]").description("\u914D\u7F6E GitLab \u4E2A\u4EBA\u8BBF\u95EE\u4EE4\u724C(PAT)\u3001Host \u4E0E\u522B\u540D\uFF0C\u5F00\u542F GitLab \u8FDC\u7A0B\u626B\u63CF").action((token, host, name) => {
  setGitLabConfig(token, host, name);
  console.log(chalk.green(`\u2714 \u5DF2\u6210\u529F\u914D\u7F6E\u5E76\u4FDD\u5B58 GitLab \u8BBF\u95EE\u6E90\u3002`));
  const targetHost = host || "https://gitlab.com";
  const targetName = name || targetHost.replace(/^https?:\/\//, "").replace(/\/$/, "");
  console.log(chalk.gray(`\u522B\u540D (Name): ${targetName}`));
  console.log(chalk.gray(`\u5730\u5740 (Host): ${targetHost}`));
});
configCmd.command("gitlab-clear [name_or_index]").description("\u6E05\u9664\u6307\u5B9A\u6216\u6240\u6709\u7684 GitLab \u8FDC\u7A0B\u626B\u63CF\u914D\u7F6E").action((nameOrIndex) => {
  clearGitLabConfig(nameOrIndex);
  if (nameOrIndex) {
    console.log(chalk.green(`\u2714 \u5DF2\u6E05\u9664\u6307\u5B9A\u7684 GitLab \u8BBF\u95EE\u914D\u7F6E [${nameOrIndex}]\u3002`));
  } else {
    console.log(chalk.green(`\u2714 \u5DF2\u6E05\u9664\u6240\u6709 GitLab \u8BBF\u95EE\u914D\u7F6E\u3002\u5DF2\u5173\u95ED GitLab \u8FDC\u7A0B\u626B\u63CF\u3002`));
  }
});
program.parse(process.argv);

import { execSync } from 'child_process';
import path from 'path';

export interface CommitInfo {
  project: string;
  hash: string;
  date: string; // ISO 8601 string (e.g. 2026-06-24T10:18:34+08:00)
  message: string;
  authorName: string;
  authorEmail: string;
  additions: number;
  deletions: number;
  branch: string;
  branches?: string[];
}

function getUserEmail(cwd: string): string | null {
  try {
    const email = execSync('git config user.email', { cwd, encoding: 'utf8' }).trim();
    if (email) return email;
  } catch {
    // ignore
  }

  try {
    const emailGlobal = execSync('git config --global user.email', { cwd, encoding: 'utf8' }).trim();
    if (emailGlobal) return emailGlobal;
  } catch {
    // ignore
  }

  return null;
}

function formatLocalDate(date: Date): string {
  const Y = date.getFullYear();
  const M = String(date.getMonth() + 1).padStart(2, '0');
  const D = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${Y}-${M}-${D} ${h}:${m}:${s}`;
}

function cleanBranchRef(refName: string): string {
  if (!refName) return 'unknown';
  // refs/heads/main 或 refs/remotes/origin/main 格式
  // 去掉 refs/heads/ 或 refs/remotes/origin/ 前缀，只保留分支名
  return refName
    .replace(/^refs\/heads\//, '')
    .replace(/^refs\/remotes\/[^/]+\//, '')
    .replace(/^HEAD -> /, '')
    .replace(/^refs\//, '');
}

function shellQuote(value: string): string {
  return `"${value.replace(/(["\\$`])/g, '\\$1')}"`;
}

function getBranchRefs(projectPath: string): { ref: string; name: string }[] {
  try {
    const stdout = execSync('git for-each-ref --format="%(refname)" refs/heads refs/remotes', {
      cwd: projectPath,
      encoding: 'utf8',
    });

    const seen = new Set<string>();
    return stdout
      .replace(/\r/g, '')
      .split('\n')
      .map(ref => ref.trim())
      .filter(ref => ref && !/\/HEAD$/.test(ref))
      .map(ref => ({ ref, name: cleanBranchRef(ref) }))
      .filter(({ name }) => name && name !== 'unknown')
      .filter(({ name }) => {
        if (seen.has(name)) return false;
        seen.add(name);
        return true;
      });
  } catch {
    return [];
  }
}

export function getCommitsForProject(
  projectPath: string,
  since: Date,
  until: Date
): CommitInfo[] {
  const projectName = path.basename(projectPath);
  const email = getUserEmail(projectPath);

  const sinceStr = formatLocalDate(since);
  const untilStr = formatLocalDate(until);

  const authorArg = email ? ` --author=${shellQuote(email)}` : '';

  // Use a delimiter that is highly unlikely to appear in user names or messages.
  const delimiter = '|||';
  const formatStr = `%aI${delimiter}%an${delimiter}%ae${delimiter}%h${delimiter}%s`;

  const branchRefs = getBranchRefs(projectPath);
  const refsToScan = branchRefs.length > 0
    ? branchRefs
    : [{ ref: '--all', name: 'unknown' }];

  const results: CommitInfo[] = [];

  for (const branch of refsToScan) {
    const refArg = branch.ref === '--all' ? '--all' : shellQuote(branch.ref);
    const cmd = `git log ${refArg} --since=${shellQuote(sinceStr)} --until=${shellQuote(untilStr)}${authorArg} --pretty=format:${shellQuote(formatStr)} --shortstat --date=iso-strict`;

    try {
      const stdout = execSync(cmd, {
        cwd: projectPath,
        maxBuffer: 20 * 1024 * 1024, // 20MB buffer for large repos
        encoding: 'utf8',
      });

      if (!stdout.trim()) {
        continue;
      }

      // 去掉 Windows 回车符 \r
      const lines = stdout.replace(/\r/g, '').split('\n');

      let currentCommit: CommitInfo | null = null;

      for (const line of lines) {
        // 跳过空行和纯空白行
        if (line.trim().length === 0) continue;

        if (line.includes(delimiter)) {
          // New commit line
          if (currentCommit) {
            results.push(currentCommit);
          }

          const parts = line.split(delimiter);
          const [date, name, authorEmail, hash, ...msgParts] = parts;
          const message = msgParts.join(delimiter);
          currentCommit = {
            project: projectName,
            hash: hash || '',
            date: date || '',
            message: message || '',
            authorName: name || '',
            authorEmail: authorEmail || '',
            additions: 0,
            deletions: 0,
            branch: branch.name,
            branches: branch.name !== 'unknown' ? [branch.name] : [],
          };
        } else if (currentCommit) {
          // shortstat line: e.g. "1 file changed, 5 insertions(+), 3 deletions(-)"
          const insMatch = line.match(/(\d+)\s+insertions?\(\+\)/);
          const delMatch = line.match(/(\d+)\s+deletions?\(-\)/);
          currentCommit.additions = insMatch ? parseInt(insMatch[1], 10) : 0;
          currentCommit.deletions = delMatch ? parseInt(delMatch[1], 10) : 0;
        }
      }
      if (currentCommit) {
        results.push(currentCommit);
      }
    } catch {
      // Ignore branches that cannot be read.
    }
  }

  return results;
}

export function getLocalGitIdentity(): { emails: string[]; names: string[] } {
  const emails: string[] = [];
  const names: string[] = [];

  try {
    const email = execSync('git config user.email', { encoding: 'utf8' }).trim();
    if (email) emails.push(email.toLowerCase());
  } catch {}
  try {
    const emailGlobal = execSync('git config --global user.email', { encoding: 'utf8' }).trim();
    if (emailGlobal) emails.push(emailGlobal.toLowerCase());
  } catch {}

  try {
    const name = execSync('git config user.name', { encoding: 'utf8' }).trim();
    if (name) names.push(name.toLowerCase());
  } catch {}
  try {
    const nameGlobal = execSync('git config --global user.name', { encoding: 'utf8' }).trim();
    if (nameGlobal) names.push(nameGlobal.toLowerCase());
  } catch {}

  return {
    emails: Array.from(new Set(emails)),
    names: Array.from(new Set(names)),
  };
}


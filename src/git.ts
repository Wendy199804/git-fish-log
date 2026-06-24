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

export function getCommitsForProject(
  projectPath: string,
  since: Date,
  until: Date
): CommitInfo[] {
  const projectName = path.basename(projectPath);
  const email = getUserEmail(projectPath);

  const sinceStr = formatLocalDate(since);
  const untilStr = formatLocalDate(until);

  let authorArg = '';
  if (email) {
    authorArg = `--author="${email.replace(/"/g, '\\"')}"`;
  }

  // Use a delimiter that is highly unlikely to appear in user names or messages.
  const delimiter = '|||';
  const formatStr = `%aI${delimiter}%an${delimiter}%ae${delimiter}%h${delimiter}%s`;

  // --shortstat appends diff stats after each commit line
  const cmd = `git log --all --since="${sinceStr}" --until="${untilStr}" ${authorArg} --pretty=format:"${formatStr}" --shortstat --date=iso-strict`;

  try {
    const stdout = execSync(cmd, {
      cwd: projectPath,
      maxBuffer: 20 * 1024 * 1024, // 20MB buffer for large repos
      encoding: 'utf8',
    });

    if (!stdout.trim()) {
      return [];
    }

    const lines = stdout.split('\n').map(l => l.trim());

    const results: CommitInfo[] = [];
    let currentCommit: CommitInfo | null = null;

    for (const line of lines) {
      if (line.length === 0) continue;

      if (line.includes(delimiter)) {
        // New commit line
        if (currentCommit) {
          results.push(currentCommit);
        }
        const parts = line.split(delimiter);
        const [date, name, authorEmail, hash, message] = parts;
        currentCommit = {
          project: projectName,
          hash: hash || '',
          date: date || '',
          message: message || '',
          authorName: name || '',
          authorEmail: authorEmail || '',
          additions: 0,
          deletions: 0,
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

    return results;
  } catch (e) {
    // If the repo has no commits, or is not in a valid state, return empty list
    return [];
  }
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


import { readConfig } from './config.js';
import { CommitInfo, getLocalGitIdentity } from './git.js';
import http from 'http';
import https from 'https';

interface GitLabProject {
  id: number;
  name: string;
  path_with_namespace: string;
}

interface GitLabCommit {
  id: string;
  short_id: string;
  title: string;
  author_name: string;
  author_email: string;
  created_at: string; // ISO 8601 UTC string
}

interface GitLabCommitDetail extends GitLabCommit {
  stats?: {
    additions: number;
    deletions: number;
  };
}

interface GitLabUser {
  id: number;
  username: string;
  email: string;
  name: string;
}

interface SimpleResponse<T> {
  ok: boolean;
  statusText: string;
  json: () => Promise<T>;
}

async function gitLabFetch<T>(url: string, headers: Record<string, string>): Promise<SimpleResponse<T>> {
  if (typeof globalThis.fetch === 'function') {
    const res = await globalThis.fetch(url, { headers });
    return {
      ok: res.ok,
      statusText: res.statusText,
      json: () => res.json() as Promise<T>,
    };
  }

  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'http:' ? http : https;
    const req = client.request(parsed, { method: 'GET', headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        resolve({
          ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300,
          statusText: res.statusMessage || `HTTP ${res.statusCode}`,
          json: async () => JSON.parse(body) as T,
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

export async function fetchGitLabCommits(since: Date, until: Date, source?: string): Promise<CommitInfo[]> {
  const config = readConfig();
  const gitlabs = config.gitlabs || [];

  if (gitlabs.length === 0) {
    if (config.gitlabToken) {
      gitlabs.push({
        token: config.gitlabToken,
        host: config.gitlabHost || 'https://gitlab.com',
        name: (config.gitlabHost || 'https://gitlab.com').replace(/^https?:\/\//, '').replace(/\/$/, '')
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
      const found = gitlabs.find(g => 
        g.name.toLowerCase() === source.toLowerCase() || 
        g.host.toLowerCase().includes(source.toLowerCase())
      );
      if (found) {
        selectedGitLab = found;
      } else {
        console.warn(`\x1b[33m[Warning] GitLab source "${source}" not found. Using default: ${selectedGitLab.name}\x1b[0m`);
      }
    }
  }

  const token = selectedGitLab.token;
  const host = selectedGitLab.host;
  const cleanHost = host.replace(/\/$/, '');

  try {
    // 1. Fetch user information to determine usernames/emails
    const userUrl = `${cleanHost}/api/v4/user`;
    const userRes = await gitLabFetch<GitLabUser>(userUrl, { 'PRIVATE-TOKEN': token });
    if (!userRes.ok) {
      console.warn(`\x1b[33m[Warning] Failed to fetch GitLab user info: ${userRes.statusText}\x1b[0m`);
      return [];
    }
    const user = await userRes.json();

    const lowerEmail = user.email.toLowerCase();
    const lowerName = user.name.toLowerCase();
    const lowerUsername = user.username.toLowerCase();

    // 2. Fetch projects that had activity since our date window started
    // Format to ISO 8601 format
    const activeAfter = since.toISOString();
    const projectsUrl = `${cleanHost}/api/v4/projects?membership=true&last_activity_after=${activeAfter}&per_page=100`;
    
    const projectsRes = await gitLabFetch<GitLabProject[]>(projectsUrl, { 'PRIVATE-TOKEN': token });
    if (!projectsRes.ok) {
      console.warn(`\x1b[33m[Warning] Failed to fetch GitLab projects: ${projectsRes.statusText}\x1b[0m`);
      return [];
    }
    const projects = await projectsRes.json();

    if (projects.length === 0) {
      return [];
    }

    // 3. Query commits in parallel for all active projects
    const sinceStr = since.toISOString();
    const untilStr = until.toISOString();

    const commitPromises = projects.map(async (project) => {
      try {
        const commitsUrl = `${cleanHost}/api/v4/projects/${project.id}/repository/commits?since=${sinceStr}&until=${untilStr}&per_page=100&all=true`;
        const commitsRes = await gitLabFetch<GitLabCommit[]>(commitsUrl, { 'PRIVATE-TOKEN': token });
        if (!commitsRes.ok) {
          return [];
        }
        const commits = await commitsRes.json();

        const localIdentity = getLocalGitIdentity();

        // Filter commits written by the user
        const userCommits = commits.filter((c) => {
          const authorEmail = c.author_email.toLowerCase();
          const authorName = c.author_name.toLowerCase();

          const matchesGitLab =
            authorEmail === lowerEmail ||
            authorName === lowerName ||
            authorName === lowerUsername;

          const matchesLocal =
            localIdentity.emails.includes(authorEmail) ||
            localIdentity.names.includes(authorName);

          return matchesGitLab || matchesLocal;
        });

        if (userCommits.length === 0) return [];

        // Fetch stats for each commit in parallel batches (concurrency 8)
        const statsResults: CommitInfo[] = [];
        const batchSize = 8;
        for (let i = 0; i < userCommits.length; i += batchSize) {
          const batch = userCommits.slice(i, i + batchSize);
          const batchResults = await Promise.all(
            batch.map(async (c) => {
              let adds = 0;
              let dels = 0;
              try {
                const detailUrl = `${cleanHost}/api/v4/projects/${project.id}/repository/commits/${encodeURIComponent(c.id)}`;
                const detailRes = await gitLabFetch<GitLabCommitDetail>(detailUrl, { 'PRIVATE-TOKEN': token });
                if (detailRes.ok) {
                  const detail = await detailRes.json();
                  if (detail.stats) {
                    adds = detail.stats.additions;
                    dels = detail.stats.deletions;
                  }
                }
              } catch {
                // ignore stats fetch failure
              }
              return {
                project: project.name,
                hash: c.short_id,
                date: c.created_at,
                message: c.title,
                authorName: c.author_name,
                authorEmail: c.author_email,
                additions: adds,
                deletions: dels,
              } as CommitInfo;
            })
          );
          statsResults.push(...batchResults);
        }

        return statsResults;
      } catch {
        // Skip projects that fail (e.g. repo empty, connection dropped)
        return [];
      }
    });

    const results = await Promise.all(commitPromises);
    return results.flat();
  } catch (e) {
    console.warn(`\x1b[33m[Warning] GitLab connection failed: ${(e as Error).message}\x1b[0m`);
    return [];
  }
}

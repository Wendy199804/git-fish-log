import fs from 'fs';
import path from 'path';
import os from 'os';

export interface GitLabConfig {
  token: string;
  host: string;
  name: string;
}

export interface FishConfig {
  projects: string[];
  gitlabToken?: string;
  gitlabHost?: string;
  gitlabs?: GitLabConfig[];
}

const CONFIG_PATH = path.join(os.homedir(), '.fish-git-config.json');

export function setGitLabConfig(token: string, host?: string, name?: string): void {
  const config = readConfig();
  if (!config.gitlabs) {
    config.gitlabs = [];
  }
  const targetHost = host || 'https://gitlab.com';
  const targetName = name || targetHost.replace(/^https?:\/\//, '').replace(/\/$/, '');

  // Overwrite if name already exists, otherwise push
  const index = config.gitlabs.findIndex(g => g.name.toLowerCase() === targetName.toLowerCase());
  if (index !== -1) {
    config.gitlabs[index] = { token, host: targetHost, name: targetName };
  } else {
    config.gitlabs.push({ token, host: targetHost, name: targetName });
  }

  // Also set the old ones for compatibility
  config.gitlabToken = token;
  config.gitlabHost = targetHost;

  writeConfig(config);
}

export function clearGitLabConfig(nameOrIndex?: string): void {
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
    const index = config.gitlabs.findIndex((g, idx) => 
      g.name.toLowerCase() === nameOrIndex.toLowerCase() || 
      String(idx + 1) === nameOrIndex
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

export function readConfig(): FishConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
      const parsed = JSON.parse(data) as FishConfig;
      if (parsed && Array.isArray(parsed.projects)) {
        if (!parsed.gitlabs) {
          parsed.gitlabs = [];
        }
        // Migrate old config if present
        if (parsed.gitlabToken) {
          const host = parsed.gitlabHost || 'https://gitlab.com';
          const name = host.replace(/^https?:\/\//, '').replace(/\/$/, '');
          const exists = parsed.gitlabs.some(g => g.token === parsed.gitlabToken && g.host === host);
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
    // Ignore and fallback
  }
  return { projects: [], gitlabs: [] };
}

export function writeConfig(config: FishConfig): void {
  try {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  } catch (e) {
    console.error(`\x1b[31m[Error] Failed to write config to ${CONFIG_PATH}: ${(e as Error).message}\x1b[0m`);
  }
}

export function getProjects(): string[] {
  const config = readConfig();
  if (config.projects.length === 0) {
    // Default to the current working directory if none is configured, but only if GitLab is not configured
    if (!config.gitlabToken && (!config.gitlabs || config.gitlabs.length === 0)) {
      return [process.cwd()];
    }
    return [];
  }
  // Filter only directories that still exist
  return config.projects.filter(p => {
    try {
      return fs.existsSync(p) && fs.statSync(p).isDirectory();
    } catch {
      return false;
    }
  });
}

export function addProject(projectPath: string): { success: boolean; message: string } {
  const absolutePath = path.resolve(projectPath);
  if (!fs.existsSync(absolutePath)) {
    return { success: false, message: `Path does not exist: ${projectPath}` };
  }
  if (!fs.statSync(absolutePath).isDirectory()) {
    return { success: false, message: `Path is not a directory: ${projectPath}` };
  }
  if (!fs.existsSync(path.join(absolutePath, '.git'))) {
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

export function removeProject(projectPath: string): { success: boolean; message: string } {
  const absolutePath = path.resolve(projectPath);
  const config = readConfig();
  const index = config.projects.indexOf(absolutePath);

  if (index === -1) {
    // Try matching exactly the input string if not resolved
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

export function scanDirectory(rootPath: string): string[] {
  const absoluteRoot = path.resolve(rootPath);
  if (!fs.existsSync(absoluteRoot) || !fs.statSync(absoluteRoot).isDirectory()) {
    return [];
  }

  const foundRepos: string[] = [];
  
  // 1. Check if the root directory itself is a Git repository
  if (fs.existsSync(path.join(absoluteRoot, '.git'))) {
    foundRepos.push(absoluteRoot);
    return foundRepos;
  }

  // 2. Scan immediate subdirectories
  try {
    const items = fs.readdirSync(absoluteRoot);
    for (const item of items) {
      const itemPath = path.join(absoluteRoot, item);
      try {
        if (fs.existsSync(itemPath) && fs.statSync(itemPath).isDirectory()) {
          if (fs.existsSync(path.join(itemPath, '.git'))) {
            foundRepos.push(itemPath);
          }
        }
      } catch {
        // Skip items that throw errors (permission issue, etc.)
      }
    }
  } catch (e) {
    console.error(`\x1b[31m[Error] Failed to scan path ${absoluteRoot}: ${(e as Error).message}\x1b[0m`);
  }

  return foundRepos;
}

import { Octokit } from '@octokit/rest';
import chokidar from 'chokidar';
import fs from 'fs';
import path from 'path';

let connectionSettings;
const REPO_NAME = 'sell-auth-bot-test';
const WORKSPACE_DIR = process.cwd();
const IGNORED_PATHS = new Set(['.git', 'node_modules', '.cache', 'attached_assets', '.replit']);

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    console.log('[GIT-SYNC] GitHub connection not available');
    return null;
  }

  try {
    connectionSettings = await fetch(
      'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
      {
        headers: {
          'Accept': 'application/json',
          'X_REPLIT_TOKEN': xReplitToken
        }
      }
    ).then(res => res.json()).then(data => data.items?.[0]);

    const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

    if (!connectionSettings || !accessToken) {
      console.log('[GIT-SYNC] GitHub not connected');
      return null;
    }
    return accessToken;
  } catch (e) {
    console.log('[GIT-SYNC] Error getting GitHub token:', e.message);
    return null;
  }
}

function shouldIgnore(filePath) {
  const fileName = path.basename(filePath);
  const fileExt = path.extname(filePath);
  
  if (fileExt === '.lock') return true;
  if (IGNORED_PATHS.has(fileName)) return true;
  
  for (const ignored of IGNORED_PATHS) {
    if (filePath.includes(`/${ignored}/`) || filePath.includes(`\\${ignored}\\`)) {
      return true;
    }
  }
  
  return false;
}

async function syncFileToGitHub(filePath, octokit, userName) {
  try {
    if (shouldIgnore(filePath)) return;

    const relativePath = path.relative(WORKSPACE_DIR, filePath);
    
    if (!fs.existsSync(filePath)) {
      // File deleted - skip for now, will handle later if needed
      return;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const encodedContent = Buffer.from(content).toString('base64');

    await octokit.rest.repos.createOrUpdateFileContents({
      owner: userName,
      repo: REPO_NAME,
      path: relativePath,
      message: `Auto-sync: Update ${path.basename(filePath)}`,
      content: encodedContent
    });

    console.log(`[GIT-SYNC] ✅ Synced: ${relativePath}`);
  } catch (error) {
    console.log(`[GIT-SYNC] ⚠️  Error syncing ${filePath}:`, error.message);
  }
}

export async function startGitAutoSync() {
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      console.log('[GIT-SYNC] Auto-sync disabled (GitHub not connected)');
      return;
    }

    const octokit = new Octokit({ auth: accessToken });
    const { data: user } = await octokit.rest.users.getAuthenticated();

    console.log(`[GIT-SYNC] 🔗 Connected to GitHub as: ${user.login}`);
    console.log(`[GIT-SYNC] 📁 Watching for changes in ${WORKSPACE_DIR}`);

    const watcher = chokidar.watch(WORKSPACE_DIR, {
      ignored: (path) => shouldIgnore(path),
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
      },
      ignoreInitial: true,
      depth: 99
    });

    watcher
      .on('add', (filePath) => {
        console.log(`[GIT-SYNC] ➕ New file: ${path.relative(WORKSPACE_DIR, filePath)}`);
        syncFileToGitHub(filePath, octokit, user.login);
      })
      .on('change', (filePath) => {
        console.log(`[GIT-SYNC] 🔄 Changed: ${path.relative(WORKSPACE_DIR, filePath)}`);
        syncFileToGitHub(filePath, octokit, user.login);
      })
      .on('error', (error) => {
        console.error('[GIT-SYNC] ❌ Watcher error:', error);
      });

    console.log('[GIT-SYNC] ✅ Auto-sync started! Changes will sync to GitHub automatically.');
  } catch (error) {
    console.log('[GIT-SYNC] ⚠️  Auto-sync failed to start:', error.message);
  }
}

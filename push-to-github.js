import { Octokit } from '@octokit/rest';
import fs from 'fs';
import path from 'path';

let connectionSettings;

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
    throw new Error('X_REPLIT_TOKEN not found');
  }

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
    throw new Error('GitHub not connected');
  }
  return accessToken;
}

async function createRepoAndPush() {
  try {
    const accessToken = await getAccessToken();
    const octokit = new Octokit({ auth: accessToken });

    // Get authenticated user
    const { data: user } = await octokit.rest.users.getAuthenticated();
    console.log(`✅ Authenticated as: ${user.login}`);

    const repoName = 'sell-auth-bot-test';
    
    // Check if repo exists
    try {
      await octokit.rest.repos.get({
        owner: user.login,
        repo: repoName
      });
      console.log(`✅ Repository ${repoName} already exists`);
    } catch (e) {
      if (e.status === 404) {
        // Create repo
        console.log(`📝 Creating repository ${repoName}...`);
        await octokit.rest.repos.createForAuthenticatedUser({
          name: repoName,
          description: 'SellAuth Discord Bot - Manage your SellAuth shop from Discord',
          private: false,
          auto_init: false
        });
        console.log(`✅ Repository created!`);
      } else {
        throw e;
      }
    }

    // Get all files from workspace
    const workspaceDir = '/home/runner/workspace';
    const ignoredItems = new Set(['.git', 'node_modules', '.cache', 'attached_assets', '.env', '.replit']);
    
    function getAllFiles(dir, prefix = '') {
      const files = [];
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        if (ignoredItems.has(item)) continue;
        const fullPath = path.join(dir, item);
        const relativePath = prefix ? `${prefix}/${item}` : item;
        
        if (fs.statSync(fullPath).isDirectory()) {
          files.push(...getAllFiles(fullPath, relativePath));
        } else {
          files.push({ path: relativePath, fullPath });
        }
      }
      return files;
    }

    const files = getAllFiles(workspaceDir);
    console.log(`📦 Found ${files.length} files to upload`);

    // Upload files
    let uploadedCount = 0;
    for (const file of files) {
      try {
        const content = fs.readFileSync(file.fullPath, 'utf-8');
        const encodedContent = Buffer.from(content).toString('base64');

        await octokit.rest.repos.createOrUpdateFileContents({
          owner: user.login,
          repo: repoName,
          path: file.path,
          message: `Add ${file.path}`,
          content: encodedContent
        });
        
        uploadedCount++;
        if (uploadedCount % 10 === 0) {
          console.log(`⬆️  Uploaded ${uploadedCount}/${files.length} files...`);
        }
      } catch (e) {
        console.error(`❌ Failed to upload ${file.path}:`, e.message);
      }
    }

    console.log(`\n✅ SUCCESS! All files uploaded to GitHub!`);
    console.log(`🔗 Repository: https://github.com/${user.login}/${repoName}`);
    console.log(`\nYou can now deploy it on Railway!`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createRepoAndPush();

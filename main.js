const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');

// Bundled Aeolus source (read-only in packaged mode)
function getAeolusDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'Aeolus')
    : path.join(__dirname, 'Aeolus');
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const result = {};
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    result[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return result;
}

const CREDENTIALS = {
  figma:      { file: 'figma.env',      fields: ['FIGMA_API_KEY'] },
  jira:       { file: 'jira.env',       fields: ['JIRA_BASE_URL', 'JIRA_USERNAME', 'JIRA_TOKEN'] },
  confluence: { file: 'confluence.env', fields: ['CONF_BASE_URL', 'CONF_TOKEN', 'CONF_SPACE'] },
  bitbucket:  { file: 'bitbucket.env',  fields: ['BITBUCKET_BASE_URL', 'BITBUCKET_TOKEN', 'BITBUCKET_USERNAME'] },
};

// In-memory credential store (bundled resources are read-only)
const savedCredentials = {};

function createWindow() {
  const win = new BrowserWindow({
    width: 600,
    height: 450,
    resizable: false,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

// ── IPC Handlers ──

ipcMain.handle('credentials:read', (_, service) => {
  if (savedCredentials[service]) return savedCredentials[service];
  const cfg = CREDENTIALS[service];
  if (!cfg) return {};
  return parseEnvFile(path.join(getAeolusDir(), 'credentials', cfg.file));
});

ipcMain.handle('credentials:save', (_, service, data) => {
  const cfg = CREDENTIALS[service];
  if (!cfg) return;
  savedCredentials[service] = data;
});

ipcMain.handle('settings:check', () => {
  const src = path.join(getAeolusDir(), 'config', 'settings.json');
  const dst = path.join(process.env.HOME, '.claude', 'settings.json');
  if (!fs.existsSync(src) || !fs.existsSync(dst)) return 'ok';
  const srcContent = fs.readFileSync(src, 'utf8');
  const dstContent = fs.readFileSync(dst, 'utf8');
  return srcContent === dstContent ? 'ok' : 'conflict';
});

ipcMain.handle('settings:resolve', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showMessageBox(win, {
    type: 'warning',
    title: 'settings.json 冲突',
    message: '检测到已有 settings.json 与 Aeolus 版本不同',
    detail: '是否覆盖当前版本？原文件将备份为 settings.json.bak',
    buttons: ['覆盖', '跳过'],
    defaultId: 0,
    cancelId: 1,
  });
  return result.response === 0 ? 'y' : 'n';
});

ipcMain.on('install:start', (event, settingsAnswer, installPath) => {
  const targetDir = path.join(installPath, 'Aeolus');

  // Step 1: Copy bundled Aeolus to target
  event.sender.send('install:output', `正在复制文件到 ${targetDir}...\n`);
  try {
    execSync(`mkdir -p "${targetDir}" && rsync -a --exclude='.git' "${getAeolusDir()}/" "${targetDir}/"`);
    event.sender.send('install:output', `[ok] 文件已复制\n`);
  } catch (e) {
    event.sender.send('install:output', `[error] 复制失败: ${e.message}\n`);
    event.sender.send('install:done', 1);
    return;
  }

  // Step 2: Write credentials to target
  const credDir = path.join(targetDir, 'credentials');
  fs.mkdirSync(credDir, { recursive: true });
  for (const [service, data] of Object.entries(savedCredentials)) {
    const cfg = CREDENTIALS[service];
    if (!cfg) continue;
    const lines = cfg.fields.map(key => `${key}=${data[key] || ''}`).join('\n') + '\n';
    fs.writeFileSync(path.join(credDir, cfg.file), lines, 'utf8');
  }

  // Step 3: Run install.sh from target
  const installScript = path.join(targetDir, 'install.sh');
  const env = {
    ...process.env,
    PATH: `/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:${process.env.PATH || ''}`,
    AEOLUS_SETTINGS_ANSWER: settingsAnswer || '',
  };

  const child = spawn('/bin/bash', [installScript], { env });

  child.stdout.on('data', (data) => {
    event.sender.send('install:output', data.toString());
  });

  child.stderr.on('data', (data) => {
    event.sender.send('install:output', data.toString());
  });

  child.on('close', (code) => {
    event.sender.send('install:done', code);
  });
});

ipcMain.handle('install:getDefaultPath', () => {
  return process.env.HOME;
});

ipcMain.handle('install:selectPath', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    title: '选择安装路径',
    defaultPath: process.env.HOME,
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('install:deleteSelf', async () => {
  if (!app.isPackaged) return false;
  const appPath = path.resolve(process.execPath, '..', '..', '..');
  try {
    await shell.trashItem(appPath);
    return true;
  } catch {
    return false;
  }
});

// ── Upgrade ──

ipcMain.handle('upgrade:detect', () => {
  const markerPath = path.join(process.env.HOME, '.claude', 'aeolus.json');
  if (!fs.existsSync(markerPath)) return null;
  try {
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    const installPath = marker.installPath;
    if (installPath && fs.existsSync(path.join(installPath, 'install.sh'))) {
      return installPath;
    }
  } catch {}
  return null;
});

ipcMain.on('upgrade:start', (event, installedDir, settingsAnswer) => {
  const bundledDir = getAeolusDir();

  // Step 1: 只同步 SKILL.md（保留 data/ 等用户数据）
  event.sender.send('upgrade:output', '同步 Skills...\n');
  try {
    function syncSkillMds(srcDir, dstDir) {
      for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
        if (entry.name === 'data') continue; // 跳过 data/，保留用户数据
        const srcPath = path.join(srcDir, entry.name);
        const dstPath = path.join(dstDir, entry.name);
        if (entry.isDirectory()) {
          fs.mkdirSync(dstPath, { recursive: true });
          syncSkillMds(srcPath, dstPath);
        } else if (entry.name === 'SKILL.md') {
          fs.copyFileSync(srcPath, dstPath);
        }
      }
    }
    syncSkillMds(path.join(bundledDir, 'skills'), path.join(installedDir, 'skills'));
    event.sender.send('upgrade:output', '[ok] SKILL.md 已同步\n');
  } catch (e) {
    event.sender.send('upgrade:output', `[error] 同步失败: ${e.message}\n`);
    event.sender.send('upgrade:done', 1);
    return;
  }

  // Step 2: 同步 config/
  try {
    const configSrc = path.join(bundledDir, 'config');
    const configDst = path.join(installedDir, 'config');
    fs.mkdirSync(configDst, { recursive: true });
    for (const f of ['settings.json', 'ai-capabilities.md']) {
      const src = path.join(configSrc, f);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(configDst, f));
    }
    event.sender.send('upgrade:output', '[ok] 配置文件已同步\n');
  } catch (e) {
    event.sender.send('upgrade:output', `[warn] 配置同步失败: ${e.message}\n`);
  }

  // Step 3: 把最新 upgrade.sh 复制过去并执行
  const upgradeScript = path.join(installedDir, 'upgrade.sh');
  try {
    fs.copyFileSync(path.join(bundledDir, 'upgrade.sh'), upgradeScript);
    fs.chmodSync(upgradeScript, 0o755);
  } catch (e) {
    event.sender.send('upgrade:output', `[warn] upgrade.sh 更新失败: ${e.message}\n`);
  }

  const env = {
    ...process.env,
    PATH: `/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:${process.env.PATH || ''}`,
    AEOLUS_SETTINGS_ANSWER: settingsAnswer || 'n',
  };

  const child = spawn('/bin/bash', [upgradeScript], { env });
  child.stdout.on('data', (data) => event.sender.send('upgrade:output', data.toString()));
  child.stderr.on('data', (data) => event.sender.send('upgrade:output', data.toString()));
  child.on('close', (code) => event.sender.send('upgrade:done', code));
});

ipcMain.handle('skills:list', () => {
  const skillsDir = path.join(getAeolusDir(), 'skills');
  if (!fs.existsSync(skillsDir)) return [];
  const results = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(dir, entry.name));
      else if (entry.name === 'SKILL.md') results.push(path.basename(path.dirname(path.join(dir, entry.name))));
    }
  }
  walk(skillsDir);
  return results;
});

ipcMain.handle('mcp:list', () => {
  const mcpJson = path.join(getAeolusDir(), 'config', 'work.mcp.json');
  if (!fs.existsSync(mcpJson)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(mcpJson, 'utf8'));
    return Object.keys(data.mcpServers || {});
  } catch {
    return [];
  }
});

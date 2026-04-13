// ── Page navigation ──

const pages = ['welcome', 'credentials', 'installing', 'done'];

function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${name}`).classList.add('active');
}

// ── Welcome ──

let detectedInstallPath = null;

async function initWelcome() {
  detectedInstallPath = await window.aeolus.detectUpgrade();
  if (detectedInstallPath) {
    document.getElementById('upgrade-banner').style.display = 'flex';
    document.getElementById('upgrade-banner-text').textContent =
      `检测到已安装 Aeolus，点击升级获取最新 Skills`;
    document.getElementById('btn-upgrade').style.display = '';
  }
}

initWelcome();

document.getElementById('btn-welcome-next').addEventListener('click', async () => {
  await Promise.all([loadCredentials(), loadDefaultInstallPath()]);
  showPage('credentials');
});

document.getElementById('btn-upgrade').addEventListener('click', async () => {
  const settingsStatus = await window.aeolus.checkSettings();
  let settingsAnswer = 'n';
  if (settingsStatus === 'conflict') {
    settingsAnswer = await window.aeolus.resolveSettings();
  }
  showPage('upgrading');
  startUpgrade(detectedInstallPath, settingsAnswer);
});

// ── Install Path ──

let installPath = '';

async function loadDefaultInstallPath() {
  installPath = await window.aeolus.getDefaultInstallPath();
  document.getElementById('install-path-display').textContent = installPath;
}

document.getElementById('btn-select-path').addEventListener('click', async () => {
  const selected = await window.aeolus.selectInstallPath();
  if (selected) {
    installPath = selected;
    document.getElementById('install-path-display').textContent = installPath;
  }
});

// ── Credentials ──

const CREDENTIAL_FIELDS = {
  figma:      ['FIGMA_API_KEY'],
  jira:       ['JIRA_BASE_URL', 'JIRA_USERNAME', 'JIRA_TOKEN'],
  confluence: ['CONF_BASE_URL', 'CONF_TOKEN', 'CONF_SPACE'],
  bitbucket:  ['BITBUCKET_BASE_URL', 'BITBUCKET_TOKEN', 'BITBUCKET_USERNAME'],
};

async function loadCredentials() {
  for (const [service, fields] of Object.entries(CREDENTIAL_FIELDS)) {
    const data = await window.aeolus.readCredentials(service);
    const group = document.querySelector(`.cred-group[data-service="${service}"]`);
    for (const key of fields) {
      const input = group.querySelector(`[data-key="${key}"]`);
      if (input && data[key]) input.value = data[key];
    }
  }
}

// Skip checkbox toggle
document.querySelectorAll('.skip-checkbox').forEach(checkbox => {
  checkbox.addEventListener('change', (e) => {
    const group = e.target.closest('.cred-group');
    group.classList.toggle('skipped', e.target.checked);
  });
});

document.getElementById('btn-cred-back').addEventListener('click', () => {
  showPage('welcome');
});

document.getElementById('btn-cred-next').addEventListener('click', async () => {
  // Save non-skipped credentials
  for (const [service, fields] of Object.entries(CREDENTIAL_FIELDS)) {
    const group = document.querySelector(`.cred-group[data-service="${service}"]`);
    if (group.classList.contains('skipped')) continue;
    const data = {};
    for (const key of fields) {
      const input = group.querySelector(`[data-key="${key}"]`);
      data[key] = input ? input.value : '';
    }
    await window.aeolus.saveCredentials(service, data);
    // Clear sensitive fields from DOM
    for (const key of fields) {
      const input = group.querySelector(`[data-key="${key}"]`);
      if (input && input.type === 'password') input.value = '';
    }
  }

  // Check settings.json conflict
  let settingsAnswer = '';
  const settingsStatus = await window.aeolus.checkSettings();
  if (settingsStatus === 'conflict') {
    settingsAnswer = await window.aeolus.resolveSettings();
  }

  showPage('installing');
  startInstall(settingsAnswer, installPath);
});

// ── Installing ──

const MILESTONES = [
  { keyword: '文件已复制',    progress: 8,  label: '复制文件...' },
  { keyword: '设置环境变量',  progress: 15, label: '配置环境变量...' },
  { keyword: 'Skills 已链接', progress: 30, label: '链接 Skills...' },
  { keyword: 'ai-capabilities', progress: 45, label: '链接资源文件...' },
  { keyword: 'settings.json', progress: 55, label: '安装配置文件...' },
  { keyword: 'work.mcp.json', progress: 70, label: '生成 MCP 配置...' },
  { keyword: 'npm install',    progress: 80, label: '安装 MCP 依赖...' },
  { keyword: 'pip install',    progress: 88, label: '安装 Python 依赖...' },
  { keyword: '安装完成',       progress: 100, label: '完成！' },
];

function startInstall(settingsAnswer, installPath) {
  const terminal = document.getElementById('terminal');
  const progressBar = document.getElementById('progress-bar');
  const progressLabel = document.getElementById('progress-label');
  const btnDone = document.getElementById('btn-install-done');

  setProgress(5, '准备中...');

  const unsub = window.aeolus.onInstallOutput((line) => {
    terminal.textContent += line;
    terminal.scrollTop = terminal.scrollHeight;

    for (const m of MILESTONES) {
      if (line.includes(m.keyword)) {
        setProgress(m.progress, m.label);
        break;
      }
    }
  });

  window.aeolus.onInstallDone((code) => {
    unsub();
    if (code === 0) {
      setProgress(100, '安装完成！');
      setTimeout(() => showDonePage(true), 1000);
    } else {
      setProgress(100, '安装失败');
      progressBar.style.background = '#ff3b30';
      progressLabel.style.color = '#ff3b30';
      btnDone.disabled = false;
      btnDone.textContent = '查看日志';
    }
  });

  window.aeolus.startInstall(settingsAnswer, installPath);

  function setProgress(pct, label) {
    progressBar.style.width = pct + '%';
    progressLabel.textContent = label;
  }
}

// ── Upgrading ──

function startUpgrade(installedDir, settingsAnswer) {
  const terminal = document.getElementById('upgrade-terminal');
  const progressBar = document.getElementById('upgrade-progress-bar');
  const progressLabel = document.getElementById('upgrade-progress-label');
  const btnDone = document.getElementById('btn-upgrade-done');

  const UPGRADE_MILESTONES = [
    { keyword: 'SKILL.md 已同步',   progress: 40, label: '同步 Skills...' },
    { keyword: '配置文件已同步',    progress: 60, label: '同步配置...' },
    { keyword: 'Skills 已链接',     progress: 80, label: '链接 Skills...' },
    { keyword: 'settings.json',     progress: 90, label: '更新配置...' },
    { keyword: '升级完成',          progress: 100, label: '完成！' },
  ];

  setUpgradeProgress(10, '准备中...');

  const unsub = window.aeolus.onUpgradeOutput((line) => {
    terminal.textContent += line;
    terminal.scrollTop = terminal.scrollHeight;
    for (const m of UPGRADE_MILESTONES) {
      if (line.includes(m.keyword)) {
        setUpgradeProgress(m.progress, m.label);
        break;
      }
    }
  });

  window.aeolus.onUpgradeDone((code) => {
    unsub();
    if (code === 0) {
      setUpgradeProgress(100, '升级完成！');
      setTimeout(() => showDonePage(true, true), 1000);
    } else {
      setUpgradeProgress(100, '升级失败');
      progressBar.style.background = '#ff3b30';
      progressLabel.style.color = '#ff3b30';
      btnDone.disabled = false;
      btnDone.textContent = '查看日志';
    }
  });

  window.aeolus.startUpgrade(installedDir, settingsAnswer);

  function setUpgradeProgress(pct, label) {
    progressBar.style.width = pct + '%';
    progressLabel.textContent = label;
  }
}

document.getElementById('btn-upgrade-done').addEventListener('click', () => {
  showDonePage(false);
});

document.getElementById('btn-install-done').addEventListener('click', () => {
  showDonePage(false);
});

// ── Done ──

async function showDonePage(success, isUpgrade = false) {
  showPage('done');

  const icon = document.getElementById('done-icon');
  const title = document.getElementById('done-title');
  const subtitle = document.getElementById('done-subtitle');
  const stats = document.getElementById('done-stats');

  if (!success) {
    icon.textContent = '✕';
    icon.classList.add('error');
    title.textContent = isUpgrade ? '升级失败' : '安装失败';
    subtitle.textContent = `请查看日志排查问题，或手动运行 ${isUpgrade ? 'upgrade.sh' : 'install.sh'}`;
    return;
  }

  title.textContent = isUpgrade ? '升级完成' : '安装完成';

  const [skills, mcps] = await Promise.all([
    window.aeolus.listSkills(),
    window.aeolus.listMCPs(),
  ]);

  subtitle.textContent = isUpgrade
    ? `已更新 ${skills.length} 个 Skills，重启 Claude Code 后生效。`
    : '所有组件已就绪，重启 Claude Code 后生效。';
  document.getElementById('delete-installer-wrap').style.display = '';
  stats.innerHTML = `
    <div class="stat-card">
      <div class="stat-number">${skills.length}</div>
      <div class="stat-label">Skills</div>
    </div>
    <div class="stat-card">
      <div class="stat-number">${mcps.length}</div>
      <div class="stat-label">MCP 服务</div>
    </div>
  `;
}

document.getElementById('btn-close').addEventListener('click', async () => {
  const chk = document.getElementById('chk-delete-installer');
  if (chk && chk.checked) {
    await window.aeolus.deleteSelf();
  }
  window.close();
});

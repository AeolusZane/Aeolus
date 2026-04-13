const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aeolus', {
  readCredentials: (service) => ipcRenderer.invoke('credentials:read', service),
  saveCredentials: (service, data) => ipcRenderer.invoke('credentials:save', service, data),
  checkSettings: () => ipcRenderer.invoke('settings:check'),
  resolveSettings: () => ipcRenderer.invoke('settings:resolve'),
  getDefaultInstallPath: () => ipcRenderer.invoke('install:getDefaultPath'),
  selectInstallPath: () => ipcRenderer.invoke('install:selectPath'),
  startInstall: (settingsAnswer, installPath) => ipcRenderer.send('install:start', settingsAnswer, installPath),
  onInstallOutput: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('install:output', handler);
    return () => ipcRenderer.removeListener('install:output', handler);
  },
  onInstallDone: (cb) => {
    const handler = (_, code) => cb(code);
    ipcRenderer.once('install:done', handler);
  },
  deleteSelf: () => ipcRenderer.invoke('install:deleteSelf'),
  detectUpgrade: () => ipcRenderer.invoke('upgrade:detect'),
  startUpgrade: (installedDir, settingsAnswer) => ipcRenderer.send('upgrade:start', installedDir, settingsAnswer),
  onUpgradeOutput: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('upgrade:output', handler);
    return () => ipcRenderer.removeListener('upgrade:output', handler);
  },
  onUpgradeDone: (cb) => {
    const handler = (_, code) => cb(code);
    ipcRenderer.once('upgrade:done', handler);
  },
  listSkills: () => ipcRenderer.invoke('skills:list'),
  listMCPs: () => ipcRenderer.invoke('mcp:list'),
});

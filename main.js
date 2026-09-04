const { app, BrowserWindow, shell, ipcMain, Tray, Menu, nativeImage } = require('electron');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const HOST = '127.0.0.1';
const BOOT_WAIT_MS = 120000;

const DSH_HOME = path.join(os.homedir(), '.dsh');
const CRED_FILE = path.join(DSH_HOME, '.credentials.yaml');

let serverProc = null;
let spawnedByUs = false;
let mainWindow = null;
let setupWindow = null;
let tray = null;
let quitting = false;
let isQuitting = false;
// Boot state machine: the window opens immediately with a status page and the
// server is pulled up behind it. Errors land on the same page as copyable text.
let booting = false;
let bootFailed = false;
let appUrl = null; // token URL once the server prints it (dsh 0.1.2+)
let serverStdout = '';
let serverStderr = '';
let serverExited = null; // { code, signal } set when our child dies before ready
let bootPhaseText = '正在准备…';
let bootErrorTitle = null;
let bootErrorDetail = null;
let setupDone = false;

function getRuntimeDir() {
  const candidates = [];
  if (process.resourcesPath) candidates.push(path.join(process.resourcesPath, 'runtime'));
  candidates.push(path.join(__dirname, 'runtime'));
  for (const c of candidates) {
    try {
      if (fs.existsSync(path.join(c, 'node', 'node.exe')) &&
          fs.existsSync(path.join(c, 'dsh', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'))) {
        return c;
      }
    } catch (_) {}
  }
  return null;
}

const RUNTIME_DIR = process.env.DSH_DESKTOP_RUNTIME || getRuntimeDir();

function startServer() {
  if (!RUNTIME_DIR) return false;
  const nodeExe = path.join(RUNTIME_DIR, 'node', 'node.exe');
  const cli = path.join(RUNTIME_DIR, 'dsh', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
  const cwd = path.join(RUNTIME_DIR, 'dsh');
  const env = Object.assign({}, process.env, {
    PATH: path.join(RUNTIME_DIR, 'node') + path.delimiter + (process.env.PATH || '')
  });
  // Port 0 asks the OS for a free port; the real URL (with port and, on
  // dsh >= 0.1.2, its one-time token) is parsed from the server's stdout.
  const portArg = String(process.env.DSH_DESKTOP_PORT || 0);
  serverStdout = '';
  serverStderr = '';
  serverExited = null;
  appUrl = null;
  serverProc = spawn(nodeExe, [cli, 'web', '--no-open', '--host', HOST, '--port', portArg], {
    cwd,
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  serverProc.stdout.on('data', (chunk) => {
    serverStdout += chunk;
    if (serverStdout.length > 65536) serverStdout = serverStdout.slice(-65536);
    const m = serverStdout.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+(?:\/\?token=[A-Za-z0-9_-]+)?)/);
    if (m) appUrl = m[1];
  });
  serverProc.stderr.on('data', (chunk) => {
    serverStderr += chunk;
    if (serverStderr.length > 65536) serverStderr = serverStderr.slice(-65536);
  });
  serverProc.on('exit', (code, signal) => {
    serverExited = { code, signal };
    serverProc = null;
  });
  spawnedByUs = true;
  return true;
}

function stopServer() {
  if (serverProc && spawnedByUs) {
    try { exec('taskkill /PID ' + serverProc.pid + ' /T /F', () => {}); } catch (_) {}
  }
  serverProc = null;
}

function getAppUrl() {
  return appUrl;
}

/** Wait for the server to print its real launch URL (free port + token). */
async function waitForLaunchUrl(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (serverExited !== null) return false;
    if (appUrl) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return appUrl !== null;
}

function stderrTail() {
  const lines = serverStderr.trim().split(/\r?\n/).filter(Boolean);
  return lines.slice(-30).join('\n');
}

// ---- DeepSeek API key handling (DSH stores it in ~/.dsh/.credentials.yaml) ----

// dsh >= 0.1.1 writes credentials as "version: 1\nrefs:\n  DEEPSEEK_API_KEY: sk-..."
// (nested under refs). Older versions wrote a flat "DEEPSEEK_API_KEY: sk-...".
// Read both formats; the \s* prefix tolerates the refs indentation.
function getStoredApiKey() {
  try {
    const raw = fs.readFileSync(CRED_FILE, 'utf8');
    const m = raw.match(/^\s*DEEPSEEK_API_KEY:\s*(\S+)\s*$/m);
    return (m && m[1]) ? m[1].trim() : null;
  } catch (_) { return null; }
}

// Save in the NEW "version: 1 / refs:" format (dsh 0.1.1+), preserving any
// existing refs (e.g. QWEN_MAC_API_KEY) so they are not clobbered.
function saveApiKey(key) {
  try {
    fs.mkdirSync(DSH_HOME, { recursive: true });
    const refs = {};
    try {
      const raw = fs.readFileSync(CRED_FILE, 'utf8');
      // new format: lines like "  NAME: value" under refs; old: "NAME: value".
      // Skip structural keys (version/refs) so they are not saved as refs.
      for (const m of raw.matchAll(/^\s*([A-Za-z0-9_]+):\s*(\S+)\s*$/gm)) {
        if (m[1] === 'version' || m[1] === 'refs') continue;
        refs[m[1]] = m[2];
      }
    } catch (_) {}
    refs['DEEPSEEK_API_KEY'] = String(key).trim();
    const lines = ['version: 1', 'refs:'];
    for (const k of Object.keys(refs).sort()) lines.push('  ' + k + ': ' + refs[k]);
    fs.writeFileSync(CRED_FILE, lines.join('\n') + '\n', 'utf8');
    return true;
  } catch (_) { return false; }
}

// ---- Built-in plugins bootstrap (idempotent, duplicate-free) ----
const BUILTIN_PLUGINS = ['dsh-fenggu'];
const LEGACY_PLUGINS = ['@signalight/dsh-codex-pet', 'pet-gallery', 'pet-floater', 'dsh-side-panel'];

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

// The dsh CLI auto-initializes a missing web profile on first server start,
// but ensureBuiltinPlugins runs before the server. Create the same minimal
// manifest up front so built-in plugins register on the very first launch.
function ensureProfileManifest() {
  const profileDir = path.join(DSH_HOME, 'profiles', 'web');
  const manifestPath = path.join(profileDir, 'package.json');
  if (fs.existsSync(manifestPath)) return;
  fs.mkdirSync(profileDir, { recursive: true });
  const manifest = {
    name: 'dsh-profile-web',
    private: true,
    dependencies: {},
    dsh: {
      profile: {
        bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']
      }
    }
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  const patchPath = path.join(profileDir, 'cordis.patch.yml');
  if (!fs.existsSync(patchPath)) {
    fs.writeFileSync(patchPath, '# User patch layer for the `web` profile.\n[]\n', 'utf8');
  }
}

function ensureBuiltinPlugins() {
  try {
    const profileDir = path.join(DSH_HOME, 'profiles', 'web');
    const profilePkgPath = path.join(profileDir, 'package.json');
    if (!fs.existsSync(profilePkgPath) || !RUNTIME_DIR) return;
    const pkg = JSON.parse(fs.readFileSync(profilePkgPath, 'utf8'));
    if (!pkg.dsh || !pkg.dsh.profile || !Array.isArray(pkg.dsh.profile.bundles)) return;
    const bundles = pkg.dsh.profile.bundles;
    let changed = false;

    // 1) Legacy cleanup: drop plugins that older releases bundled but this one
    //    no longer ships.
    for (const name of LEGACY_PLUGINS) {
      const idx = bundles.indexOf(name);
      if (idx !== -1) { bundles.splice(idx, 1); changed = true; }
      if (pkg.dependencies && Object.prototype.hasOwnProperty.call(pkg.dependencies, name)) {
        delete pkg.dependencies[name];
        changed = true;
      }
      try {
        const legacyDst = path.join(profileDir, 'node_modules', ...name.split('/'));
        if (fs.existsSync(legacyDst)) {
          fs.rmSync(legacyDst, { recursive: true, force: true });
          changed = true;
        }
      } catch (_) {}
    }

    // 2) Register the bundled plugins. Only register a bundle whose package is
    //    actually present; never poison the profile with an unresolvable row.
    for (const name of BUILTIN_PLUGINS) {
      const parts = name.split('/');
      const src = path.join(RUNTIME_DIR, 'dsh', 'node_modules', ...parts);
      const dst = path.join(profileDir, 'node_modules', ...parts);
      const rowPresent = bundles.includes(name);
      let present = fs.existsSync(dst);
      if (!present && fs.existsSync(src)) {
        try {
          copyDir(src, dst);
          present = fs.existsSync(dst);
        } catch (_) {
          present = false;
        }
      }
      if (!rowPresent && present) {
        bundles.push(name);
        pkg.dependencies = pkg.dependencies || {};
        pkg.dependencies[name] = 'file:' + src.replace(/\\/g, '/');
        changed = true;
      } else if (rowPresent && !present) {
        // Stale row from a broken earlier install: remove it so the profile
        // stays bootable; the next launch retries.
        const idx = bundles.indexOf(name);
        if (idx !== -1) bundles.splice(idx, 1);
        if (pkg.dependencies && Object.prototype.hasOwnProperty.call(pkg.dependencies, name)) {
          delete pkg.dependencies[name];
        }
        changed = true;
      }
    }
    if (changed) {
      pkg.dsh.profile.bundles = bundles;
      fs.writeFileSync(profilePkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    }
  } catch (_) {}
}

function whaleDataUri() {
  try {
    const p = path.join(RUNTIME_DIR, 'dsh', 'node_modules', '@deepseek-ai', 'dsh-web-frontend', 'dist', 'favicon.svg');
    const b64 = Buffer.from(fs.readFileSync(p)).toString('base64');
    return 'data:image/svg+xml;base64,' + b64;
  } catch (_) { return ''; }
}

// ---- Boot window UI (status first, errors copyable) ----
const BOOT_PAGE = path.join(__dirname, 'assets', 'boot.html');

function setBootStatus(text) {
  bootPhaseText = text;
  bootErrorTitle = null;
  bootErrorDetail = null;
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isLoading()) return;
  mainWindow.webContents.executeJavaScript('window.__dshSetStatus(' + JSON.stringify(text) + ')').catch(() => {});
}

function failBoot(title, detail) {
  bootFailed = true;
  booting = false;
  bootErrorTitle = title;
  bootErrorDetail = detail || '';
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.webContents.isLoading()) return; // did-finish-load applies it
  mainWindow.webContents.executeJavaScript('window.__dshFail(' + JSON.stringify(title) + ',' + JSON.stringify(detail || '') + ')').catch(() => {});
}

function resetBootPage() {
  bootFailed = false;
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isLoading()) return;
  mainWindow.webContents.executeJavaScript('window.__dshReset()').catch(() => {});
}

function describeBootError() {
  const parts = [];
  if (serverExited !== null) parts.push('服务进程已退出：exit code=' + String(serverExited.code) + ' signal=' + String(serverExited.signal));
  parts.push('服务地址：' + (appUrl || '（尚未取得，等待服务输出…）'));
  parts.push('运行时目录：' + String(RUNTIME_DIR));
  const tail = stderrTail();
  if (tail) parts.push('--- 服务端错误输出（末尾）---\n' + tail);
  return parts.join('\n\n');
}

// ---- Tray (background dwell) ----
function createTray() {
  let image = null;
  try {
    const p = path.join(__dirname, 'assets', 'tray-icon.png');
    image = nativeImage.createFromPath(p);
    if (image.isEmpty()) image = null;
  } catch (_) { image = null; }
  if (!image) {
    try { image = nativeImage.createFromDataURL(whaleDataUri()); } catch (_) {}
  }
  if (!image) return;

  tray = new Tray(image);
  tray.setToolTip('DeepSeek Harness');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开 DeepSeek Harness', click: showMainWindow },
    {
      label: '在浏览器中打开',
      click: () => {
        const u = getAppUrl();
        if (u) shell.openExternal(u);
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        quitting = true;
        app.quit();
      }
    }
  ]));
  tray.on('click', showMainWindow);
  tray.on('double-click', showMainWindow);
}

function showMainWindow() {
  if (setupWindow && !setupWindow.isDestroyed()) {
    setupWindow.show();
    setupWindow.focus();
    return;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  } else if (!quitting) {
    createMainWindow();
  }
}

// ---- Windows ----
function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    autoHideMenuBar: true,
    backgroundColor: '#f6f7f9',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  // Boot page first: visible immediately, no white wait.
  mainWindow.loadFile(BOOT_PAGE);
  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed() && !quitting) {
      mainWindow.show();
      if (bootFailed) {
        // State was set before the page existed; re-apply not needed (page shows error).
      }
    }
  });
  mainWindow.webContents.on('did-finish-load', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (bootErrorTitle !== null) {
      mainWindow.webContents.executeJavaScript(
        'window.__dshFail(' + JSON.stringify(bootErrorTitle) + ',' + JSON.stringify(bootErrorDetail || '') + ')'
      ).catch(() => {});
    } else {
      mainWindow.webContents.executeJavaScript('window.__dshSetStatus(' + JSON.stringify(bootPhaseText) + ')').catch(() => {});
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.indexOf('127.0.0.1') !== -1 || url.indexOf('localhost') !== -1) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // X button -> hide to tray (background dwell); Quit via tray menu really exits.
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

function showAppWindow() {
  if (quitting) return;
  const u = getAppUrl();
  if (!u) return;
  if (!mainWindow || mainWindow.isDestroyed()) createMainWindow();
  mainWindow.loadURL(u);
  mainWindow.show();
  mainWindow.focus();
}

function showSetupWindow() {
  setupWindow = new BrowserWindow({
    width: 500,
    height: 560,
    resizable: false,
    autoHideMenuBar: true,
    title: 'DeepSeek Harness - 首次配置',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  setupWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  setupWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(setupHtml()));
  setupWindow.on('closed', () => {
    setupWindow = null;
    if (!quitting && !setupDone) {
      isQuitting = true;
      quitting = true;
      app.quit();
    }
  });
}

function setupHtml() {
  const whale = whaleDataUri();
  return '<!doctype html><html><head><meta charset="utf-8"><style>'
    + '*{margin:0;padding:0;box-sizing:border-box}'
    + 'body{font-family:"Segoe UI",system-ui,sans-serif;background:#f6f7f9;display:flex;align-items:center;justify-content:center;height:100vh}'
    + '.card{background:#fff;border-radius:14px;box-shadow:0 6px 28px rgba(0,0,0,.10);width:420px;padding:36px 34px;text-align:center}'
    + '.logo{width:72px;height:72px;margin-bottom:14px}'
    + 'h1{font-size:20px;color:#111;margin-bottom:6px}'
    + 'p.sub{color:#666;font-size:13px;margin-bottom:22px}'
    + 'input{width:100%;padding:11px 12px;border:1px solid #d0d5dd;border-radius:8px;font-size:14px;outline:none;margin-bottom:10px}'
    + 'input:focus{border-color:#0b7;box-shadow:0 0 0 3px rgba(0,170,120,.12)}'
    + '.hint{font-size:12px;color:#888;margin-bottom:18px}'
    + '.hint a{color:#0b7;text-decoration:none}'
    + 'button{width:100%;padding:12px;background:#0a3;color:#fff;border:none;border-radius:8px;font-size:15px;cursor:pointer}'
    + 'button:hover{background:#099}'
    + '.err{color:#c33;font-size:12px;margin-top:10px;min-height:16px}'
    + '</style></head><body>'
    + '<div class="card">'
    + '<img class="logo" src="' + whale + '" alt="DeepSeek Harness">'
    + '<h1>DeepSeek Harness</h1>'
    + '<p class="sub">首次使用，请填写你的 DeepSeek API Key</p>'
    + '<input id="key" type="password" placeholder="sk-..." autocomplete="off" spellcheck="false">'
    + '<p class="hint">没有 Key？前往 <a href="https://platform.deepseek.com" target="_blank">platform.deepseek.com</a> 获取</p>'
    + '<button id="save">保存并启动</button>'
    + '<p class="err" id="err"></p>'
    + '</div>'
    + '<script>'
    + 'var b=document.getElementById("save");'
    + 'b.addEventListener("click",function(){var v=document.getElementById("key").value.trim();'
    + 'if(!v){document.getElementById("err").textContent="请输入 API Key";return;}'
    + 'window.dshSetup.submit(v);});'
    + 'document.getElementById("key").addEventListener("keydown",function(e){if(e.key==="Enter")b.click();});'
    + '<\/script>'
    + '</body></html>';
}

// ---- Boot orchestration ----
async function bootApp(retry) {
  if (booting) return;
  booting = true;
  bootFailed = false;
  bootPhaseText = '正在准备运行环境…';
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    resetBootPage();
    setBootStatus(bootPhaseText);
  }

  if (retry && serverProc) stopServer();

  try {
    ensureProfileManifest();
    ensureBuiltinPlugins();
  } catch (_) {}

  const hasKey = !!getStoredApiKey();

  if (!startServer()) {
    failBoot('未找到内置运行时，请重新安装', '运行时目录：' + String(RUNTIME_DIR));
    return;
  }

  bootPhaseText = '正在分配空闲端口并启动 DSH 服务…';
  setBootStatus(bootPhaseText);
  const ready = await waitForLaunchUrl(BOOT_WAIT_MS);

  if (quitting || isQuitting) { booting = false; return; }
  if (!ready) {
    failBoot('DSH 服务启动失败', describeBootError());
    return;
  }

  booting = false;
  if (hasKey) {
    showAppWindow();
  } else {
    // Keep the boot window alive (hidden) so the tray has a single owner.
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
    showSetupWindow();
  }
}

// ---- IPC ----
ipcMain.on('dsh-set-api-key', (event, key) => {
  if (saveApiKey(key)) {
    setupDone = true;
    if (setupWindow && !setupWindow.isDestroyed()) { setupWindow.close(); setupWindow = null; }
    if (!quitting) {
      const u = getAppUrl();
      if (!u) return;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
        mainWindow.loadURL(u);
      } else {
        createMainWindow();
        mainWindow.once('ready-to-show', () => showAppWindow());
      }
    }
  } else {
    if (setupWindow && !setupWindow.isDestroyed()) {
      setupWindow.webContents.executeJavaScript('document.getElementById("err").textContent="保存失败，请重试";');
    }
  }
});

ipcMain.on('dsh-boot-action', (event, action) => {
  if (action === 'quit') {
    isQuitting = true;
    quitting = true;
    app.quit();
  } else if (action === 'retry') {
    bootApp(true);
  }
});

// ---- App lifecycle ----
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showMainWindow();
  });

  app.whenReady().then(async () => {
    createTray();
    createMainWindow(); // window first; server boots behind it
    await bootApp(false);
  });

  app.on('window-all-closed', () => {
    if (mainWindow === null && setupWindow === null && !quitting) {
      app.quit();
    }
  });

  app.on('before-quit', () => {
    isQuitting = true;
    quitting = true;
    stopServer();
    if (tray) { tray.destroy(); tray = null; }
  });
}

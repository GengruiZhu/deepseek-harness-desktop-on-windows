const { app, BrowserWindow, dialog, shell, ipcMain, Tray, Menu, nativeImage } = require('electron');
const { spawn, exec } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');

const HOST = '127.0.0.1';
const PORT = Number(process.env.DSH_DESKTOP_PORT || 3080);
const URL = 'http://' + HOST + ':' + PORT;

const DSH_HOME = path.join(os.homedir(), '.dsh');
const CRED_FILE = path.join(DSH_HOME, '.credentials.yaml');

let serverProc = null;
let spawnedByUs = false;
let mainWindow = null;
let setupWindow = null;
let tray = null;
let quitting = false;
let isQuitting = false;
// dsh 0.1.2+ 的 web 界面强制一次性 token 鉴权：URL 形如
// http://127.0.0.1:<port>/?token=...，由服务端启动时打印在 stdout。
// 桌面壳解析该行后用它打开窗口，避免 401。
let authUrl = null;

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

function probe(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const req = http.get({ host: host, port: port, path: '/', timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => { req.destroy(); resolve(false); });
  });
}

async function waitForServer(host, port, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await probe(host, port, 1500)) return true;
    await new Promise((r) => setTimeout(r, 700));
  }
  return await probe(host, port, 1500);
}

/** dsh 0.1.2+ 打印 URL 行可能晚于端口就绪，等 token 出现。 */
function getAppUrl() {
  return authUrl || URL;
}

async function waitForAuthUrl(timeoutMs) {
  const start = Date.now();
  while (!authUrl && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 200));
  }
  return authUrl;
}

function startServer() {
  if (!RUNTIME_DIR) return false;
  const nodeExe = path.join(RUNTIME_DIR, 'node', 'node.exe');
  const cli = path.join(RUNTIME_DIR, 'dsh', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
  const cwd = path.join(RUNTIME_DIR, 'dsh');
  const env = Object.assign({}, process.env, {
    PATH: path.join(RUNTIME_DIR, 'node') + path.delimiter + (process.env.PATH || '')
  });
  serverProc = spawn(nodeExe, [cli, 'web', '--no-open', '--host', HOST, '--port', String(PORT)], {
    cwd: cwd,
    env: env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stdoutBuf = '';
  serverProc.stdout.on('data', (chunk) => {
    stdoutBuf += chunk;
    const m = stdoutBuf.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+)/);
    if (m) authUrl = m[1];
  });
  serverProc.stderr.on('data', () => {});
  spawnedByUs = true;
  return true;
}

function stopServer() {
  if (serverProc && spawnedByUs) {
    try { exec('taskkill /PID ' + serverProc.pid + ' /T /F', () => {}); } catch (_) {}
  }
  serverProc = null;
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
// The desktop app ships plugins bundled in the runtime. On first run we copy
// them into the web profile's node_modules and register them as bundles (the
// SAME thing `dsh plugin --profile web add` does, but done safely without the
// duplicate-loader-entry-id bug). Wrapped in try/catch — never blocks boot.
const BUILTIN_PLUGINS = ['dsh-fenggu'];

// Plugins shipped by older releases (0.5.x/0.6.x) that are no longer bundled:
// the pet system and the side panel. On startup they are removed from the
// profile (bundles rows + dependencies + copied packages) so no stale plugin
// gets loaded after the upgrade.
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
    //    no longer ships. Remove the bundle rows, the dependencies and the
    //    packages copied into the profile's node_modules.
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

    // 2) Register the bundled plugins (copy + bundle row + file: dependency).
    for (const name of BUILTIN_PLUGINS) {
      if (bundles.includes(name)) continue;
      const parts = name.split('/');
      const src = path.join(RUNTIME_DIR, 'dsh', 'node_modules', ...parts);
      const dst = path.join(profileDir, 'node_modules', ...parts);
      if (fs.existsSync(src) && !fs.existsSync(dst)) copyDir(src, dst);
      bundles.push(name);
      pkg.dependencies = pkg.dependencies || {};
      // file: path pointing at the bundled runtime copy, so the profile never
      // needs the npm registry for this plugin.
      pkg.dependencies[name] = 'file:' + src.replace(/\\/g, '/');
      changed = true;
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
    { label: '在浏览器中打开', click: () => { shell.openExternal(getAppUrl()); } },
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
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  } else if (!quitting) {
    createMainWindow();
  }
}

// ---- Windows ----

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadURL(getAppUrl());

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
    if (!quitting) app.quit();
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

ipcMain.on('dsh-set-api-key', (event, key) => {
  if (saveApiKey(key)) {
    if (setupWindow) { setupWindow.close(); setupWindow = null; }
    if (!quitting) createMainWindow();
  } else {
    if (setupWindow) {
      setupWindow.webContents.executeJavaScript('document.getElementById("err").textContent="保存失败，请重试";');
    }
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
    ensureBuiltinPlugins();

    const hasKey = !!getStoredApiKey();

    let running = await probe(HOST, PORT, 1500);
    if (!running) {
      if (!startServer()) {
        dialog.showErrorBox('DeepSeek Harness', '未找到内置运行时，请重新安装。');
        app.quit();
        return;
      }
      running = await waitForServer(HOST, PORT, 120000);
      if (running) await waitForAuthUrl(30000);
    }
    if (quitting) return;
    if (!running) {
      dialog.showErrorBox('DeepSeek Harness', '无法启动 DSH 服务（' + URL + '）。');
      app.quit();
      return;
    }

    if (hasKey) {
      createMainWindow();
    } else {
      showSetupWindow();
    }
  });

  app.on('window-all-closed', () => {
    // Main window hides to tray instead of closing; only quit if there's no
    // window to return to (e.g. first-run setup was closed).
    if (mainWindow === null && !quitting) {
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

const { app, BrowserWindow, shell, ipcMain, Tray, Menu, nativeImage, session } = require('electron');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const HOST = '127.0.0.1';
const BOOT_WAIT_MS = 120000;
const CHAT_PARTITION = 'persist:dsh-fenggu-chat';

// ---- 窗口顶栏（自己画的那一条）----
// 系统默认那条是「淡蓝底 + 一长串标题」，跟应用界面拼不到一起。做法照 Codex / Claude：
//   · 隐藏系统标题栏，用 titleBarOverlay 留住原生按钮；
//   · 顶栏**不留自己的颜色**：实时取页面背景色刷上去，所以浅色/深色主题都严丝合缝；
//   · 不加分割线、不加版本号、不加彩点 —— 那种「贴上去」的观感正是要避免的；
//   · 内容只留一个很轻的鲸鱼标记（Claude 那样），其余全让给窗口按钮。
const SHELL_TITLE = 'DeepSeek Harness';
const SHELL_BAR_H = 34;

/** 从 rgb()/rgba() 里取亮度，决定窗口按钮是深色还是浅色。 */
function barContrast(bg) {
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(String(bg || ''));
  if (!m) return { symbolColor: '#4b5563', dark: false };
  const luma = 0.2126 * Number(m[1]) + 0.7152 * Number(m[2]) + 0.0722 * Number(m[3]);
  return luma < 140 ? { symbolColor: '#e8eaed', dark: true } : { symbolColor: '#4b5563', dark: false };
}

function applyTitlebarColor(bg) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!/^rgba?\(/.test(String(bg || ''))) return;
  try {
    mainWindow.setBackgroundColor(bg);
    mainWindow.setTitleBarOverlay({ color: bg, symbolColor: barContrast(bg).symbolColor, height: SHELL_BAR_H });
  } catch (_) {}
}

/**
 * 给页面装上顶栏。原生按钮在右上角（titleBarOverlay），左边留一个很淡的鲸鱼标记，
 * 背景颜色由页面自己告诉我们（`dshShell.titlebar`），主进程再把窗口那条刷成同色。
 */
function installShellBar(contents) {
  if (!contents || contents.isDestroyed()) return;
  const whale = whaleDataUri();
  contents.insertCSS(`
    body { padding-top: ${SHELL_BAR_H}px !important; box-sizing: border-box !important; }
    #__dsh_shell_bar {
      position: fixed; top: 0; left: 0; right: 0; height: ${SHELL_BAR_H}px;
      display: flex; align-items: center; padding: 0 12px;
      -webkit-app-region: drag; user-select: none; pointer-events: auto;
      background: var(--dsh-shell-bar-bg, transparent);
      z-index: 2147483000;
    }
    #__dsh_shell_bar .mark {
      width: 18px; height: 18px;
      background-image: ${whale ? 'url("' + whale + '")' : 'none'};
      background-size: contain; background-repeat: no-repeat; background-position: center;
      /* 点鲸鱼 = 收起/展开侧栏（原来那个折叠按钮被我们藏起来了），
         所以这块不能是拖拽区，否则点击会被窗口拖动吃掉。 */
      -webkit-app-region: no-drag; cursor: pointer; border-radius: 6px; padding: 2px; box-sizing: content-box;
    }
    #__dsh_shell_bar .mark:hover { background-color: rgba(127, 127, 127, .14); }

    /* 侧栏顶部那行：品牌（鲸鱼 + deepseek HARNESS）跟顶栏重复 → 隐藏；
       折叠按钮也隐藏（功能挪到顶栏鲸鱼上）。整行改放「面板下拉」，
       所以把高度收紧一点，下面的内容整体上移。 */
    [class*="_logoRow"] [class*="_brandIdentity"],
    [class*="_logoRow"] [class*="_brand"],
    [class*="_logoRow"] > button { display: none !important; }
    /* 下拉现在并进了下面「工作区」那一行标题，顶栏这行就是空的 —— 直接收成 0 高，
       不留空白（展开态也不留）。 */
    [class*="_logoRow"] {
      height: 0 !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important;
      justify-content: flex-start !important;
    }
    /* 折叠成一条（只有图标）时，这一行没内容了 —— 留 36~48px 空白就是「缺口」，
       直接收成 0 高，让下面的图标顶上来。 */
    [class*="_collapsed"] [class*="_logoRow"] {
      height: 0 !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important;
    }
    /* 面板行（工作区 / Chat）由下拉接管，列表隐藏 */
    [class*="_panelList"] { display: none !important; }

    /* 面板下拉（Codex 那种「当前面板 ⌄」） */
    #__dsh_panel_picker {
      position: relative; display: inline-flex; align-items: center; gap: 6px;
      /* 左对齐：负 margin 抵掉自身内边距，让「工作区」和下面那行「工作区」在同一条竖线上 */
      -webkit-app-region: no-drag; cursor: pointer; padding: 5px 10px; margin-left: -10px; border-radius: 8px;
      font: 600 14px/1 "Segoe UI", system-ui, sans-serif; color: var(--dsw-alias-label-primary, #111);
      user-select: none;
    }
    #__dsh_panel_picker:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, .05)); }
    #__dsh_panel_picker .chev { display: inline-flex; width: 12px; height: 12px; opacity: .5; }
    #__dsh_panel_picker .chev svg { display: block; }
    /* 菜单挂到 body 上（fixed）—— 侧栏那行是 overflow:hidden，挂在里面会被裁掉，
       点了下拉什么都看不见。 */
    #__dsh_panel_menu {
      display: none; position: fixed; min-width: 168px; padding: 6px;
      border-radius: 10px;
      /* 颜色全走内核的主题变量：浅色/深色主题切换时菜单跟着变，不会一直是白底黑字 */
      background: var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-1, #fff));
      color: var(--dsw-alias-label-primary, #111);
      font-family: inherit;
      box-shadow: 0 10px 30px var(--dsw-alias-bg-mask-2, rgba(0, 0, 0, .16));
      border: 1px solid var(--dsw-alias-border-l3, var(--dsw-alias-border-l2, rgba(0, 0, 0, .08)));
      z-index: 2147483001;
    }
    #__dsh_panel_menu.open { display: block; }
    #__dsh_panel_menu .item {
      display: block; width: 100%; text-align: left; padding: 8px 10px; border: none;
      background: transparent; border-radius: 7px; cursor: pointer;
      font: 500 13px/1.2 "Segoe UI", system-ui, sans-serif; color: var(--dsw-alias-label-primary, #111);
    }
    #__dsh_panel_menu .item:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, .05)); }
    #__dsh_panel_menu .item.on { font-weight: 600; }
    /* 侧栏收起来（只有图标）时，下拉和「新会话」没地方放 —— 显隐由 JS 按侧栏实测宽度
       用内联 !important 控制（写成 CSS 的话要跟内核自己的类名规则打架，不稳）。 */

    /* 「新会话」原来是一整块大按钮，占掉半个侧栏 —— 内核那个按钮留着（点击仍然用它），
       但视觉上收起来，换成我们在下拉右边画的小按钮，两者并排一行。 */
    /* 内核那个大「新会话」：彻底藏死 —— 只写 display:none 的话，React 在折叠/展开时
       重新挂载它的那一瞬间还是会先画出来一帧（就是「虚空召唤」）。这里把所有能画的
       属性一起按住，且有样式表兜底，不依赖 JS 的执行时机。 */
    [class*="_newSession"] {
      display: none !important; visibility: hidden !important;
      width: 0 !important; height: 0 !important; min-width: 0 !important; min-height: 0 !important;
      margin: 0 !important; padding: 0 !important; overflow: hidden !important;
    }
    /* 只留图标（不写字），和下拉并排一行 */
    #__dsh_new_session {
      /* 右对齐：和数据/操作那一列对齐（靠 margin-left:auto 顶到行尾） */
      -webkit-app-region: no-drag; margin-left: auto; margin-right: 2px; width: 26px; height: 26px; padding: 0;
      display: inline-flex; align-items: center; justify-content: center;
      border-radius: 8px; border: none; background: transparent;
      color: var(--dsw-alias-label-secondary, #666); cursor: pointer;
    }
    #__dsh_new_session:hover {
      background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, .05));
      color: var(--dsw-alias-label-primary, #111);
    }
    #__dsh_new_session svg { display: block; }

    /* 工作区做成一张浮在灰色底上的白卡（Codex 那种观感）：窗口底色改成侧栏的灰，
       内容列四角给圆角、右侧和下方留一点缝，圆角才看得见（贴着窗口边是圆不起来的）。
       类名用 [class*=...] 匹配：前缀哈希每次升级都会变，后缀来自源码类名，比较稳。 */
    [class*="_frame"] { background: var(--dsh-shell-bar-bg, #F9FAFB) !important; }
    [class*="_centerCol"] { border-radius: 10px !important; overflow: hidden !important; margin: 0 6px 6px 0 !important; }
    [class*="_centerCol"] [class*="_root"] { border-radius: 10px !important; }
    /* 折叠/展开时不想要过渡动画：内容一边挤一边消失，很难看 */
    #__dsh_panel_picker, #__dsh_new_session { transition: none !important; }
  `).catch(() => {});
  contents.executeJavaScript(`(() => {
    const CLEAR = ['rgba(0, 0, 0, 0)', 'transparent', ''];
    if (!document.getElementById('__dsh_shell_bar')) {
      const bar = document.createElement('div');
      bar.id = '__dsh_shell_bar';
      const mark = document.createElement('span');
      mark.className = 'mark';
      bar.appendChild(mark);
      (document.body || document.documentElement).appendChild(bar);
    }
    const pick = (el) => (el ? getComputedStyle(el).backgroundColor : '');
    // 只认不透明色。设置弹窗打开时页面会盖一层半透明遮罩，取到它就会把顶栏刷成
    // 半透明 —— 底下的标题、内容就透上来了（就是「露馅」）。
    const opaque = (c) => {
      const m = /rgba?\\(([^)]+)\\)/.exec(String(c || ''));
      if (!m) return false;
      const parts = m[1].split(',').map((s) => Number(s.trim()));
      if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return false;
      const a = parts.length >= 4 ? parts[3] : 1;
      return a >= 0.95;
    };
    // 取「顶栏正下方、窗口左侧」那一列的颜色 —— 也就是侧栏/窗口 chrome 的底色。
    // 界面是「灰侧栏 + 白内容」两块，顶栏只能取侧栏那一种：取 body 的白会把侧栏
    // 切成两截（看着像贴上去的一条），取侧栏的灰才和 Claude 那样连成一片。
    const chromeColor = () => {
      let el = document.elementFromPoint(24, ${SHELL_BAR_H} + 40);
      // 从上往下把「半透明层」依次叠到第一层实色上：设置弹窗打开时页面会盖一层遮罩，
      // 遮罩本身就在取样点最上面 —— 只认实色会把遮罩跳过，顶栏就比界面亮一档，
      // 看着像贴在外面的一条。叠上去之后开/关弹窗都是同一个色。
      const layers = [];
      while (el) {
        const c = pick(el);
        if (opaque(c)) {
          let out = c;
          for (let i = layers.length - 1; i >= 0; i--) out = over(layers[i], out);
          return out;
        }
        if (c && !CLEAR.includes(c)) layers.push(c);
        el = el.parentElement;
      }
      return '';
    };
    /** src 叠在 dst 上（都是 rgb()/rgba() 字符串）。 */
    const over = (src, dst) => {
      const parse = (c) => {
        const m = /rgba?\\(([^)]+)\\)/.exec(String(c || ''));
        if (!m) return null;
        const p = m[1].split(',').map((s) => Number(s.trim()));
        if (p.length < 3 || p.some((n) => Number.isNaN(n))) return null;
        return { r: p[0], g: p[1], b: p[2], a: p.length >= 4 ? p[3] : 1 };
      };
      const s = parse(src);
      const d = parse(dst);
      if (!s || !d) return dst;
      const a = s.a + d.a * (1 - s.a);
      if (a <= 0) return dst;
      const mix = (x, y) => Math.round((x * s.a + y * d.a * (1 - s.a)) / a);
      return 'rgb(' + mix(s.r, d.r) + ', ' + mix(s.g, d.g) + ', ' + mix(s.b, d.b) + ')';
    };
    const sample = () => {
      // 侧栏收起来时**不再重新取样**：取样点（顶栏正下方左侧）会随侧栏宽度落到不同的
      // 底色上（灰侧栏 / 白内容），一收一放顶栏就跟着变色，很难看。
      // 收起状态下保持上次的颜色，等展开回来再继续跟随。
      const colEl = document.querySelector('[class*="_sidebarCol"]');
      const collapsedNow = !!colEl && (colEl.clientWidth || 999) < 200;
      if (collapsedNow && window.__dshShellBarColor) {
        ensurePicker();
        return;
      }
      let c = chromeColor();
      if (!c) {
        c = pick(document.body);
        if (!opaque(c)) c = pick(document.documentElement);
      }
      // 取不到（弹窗遮罩把整条路都盖住了）：保持上一次的颜色，别刷成透明。
      if (!opaque(c)) c = window.__dshShellBarColor || 'rgb(255, 255, 255)';
      ensurePicker();
      if (c === window.__dshShellBarColor) return;
      window.__dshShellBarColor = c;
      document.documentElement.style.setProperty('--dsh-shell-bar-bg', c);
      if (window.dshShell && window.dshShell.titlebar) window.dshShell.titlebar(c);
    };

    // 点顶栏的鲸鱼 = 收起/展开侧栏。
    // 两个坑：① 侧栏自己的折叠按钮被我们藏了，但还在 DOM 里 —— 要找**最后**一个按钮
    // （第一个现在是我们插的「新会话」）；② 顶栏是拖拽区，事件可能被拖动吃掉，
    // 所以监听挂在 document 上做事件代理（捕获阶段），只要事件到了就一定能处理。
    if (!window.__dshShellBarWired) {
      window.__dshShellBarWired = 1;
      const mark = document.querySelector('#__dsh_shell_bar .mark');
      if (mark) mark.title = '收起 / 展开侧栏';
      const toggleSidebar = () => {
        const row = document.querySelector('[class*="_logoRow"]');
        if (!row) return;
        const btns = Array.prototype.filter.call(row.querySelectorAll('button'),
          (b) => b.id !== '__dsh_new_session');
        const btn = btns[btns.length - 1];
        if (btn) btn.click();
      };
      document.addEventListener('click', (ev) => {
        const t = ev.target;
        if (t && t.closest && t.closest('#__dsh_shell_bar .mark')) {
          ev.stopPropagation();
          toggleSidebar();
        }
      }, true);
      document.addEventListener('mousedown', (ev) => {
        const t = ev.target;
        if (t && t.closest && t.closest('#__dsh_shell_bar .mark')) ev.stopPropagation();
      }, true);
    }

    /**
     * 面板下拉：内核把每个 sidebar.panellist 注册项渲染成一个带 aria-label 的按钮
     * （被我们隐藏了），所以这里读它们的名字、点它们切换 —— 等价于用户点那两行，
     * 不依赖内核没公开的内部状态。
     */
    const ensurePicker = () => {
      const row = document.querySelector('[class*="_logoRow"]');
      if (!row) return;
      const list = document.querySelector('[class*="_panelList"]');
      const rows = list ? Array.prototype.slice.call(list.querySelectorAll('button')) : [];
      if (rows.length < 2) return;   // 只有一个面板，用不着下拉
      const activeRow = rows.filter((b) => b.getAttribute('aria-current') === 'page')[0] || rows[0];
      let picker = document.getElementById('__dsh_panel_picker');
      if (!picker) {
        picker = document.createElement('div');
        picker.id = '__dsh_panel_picker';
        const lbl = document.createElement('span'); lbl.className = 'lbl';
        const chev = document.createElement('span'); chev.className = 'chev';
        chev.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.75 4.5L6 7.75L9.25 4.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        picker.appendChild(lbl); picker.appendChild(chev);
        const menu = document.createElement('div');
        menu.id = '__dsh_panel_menu';
        document.body.appendChild(menu);
        picker.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const r = picker.getBoundingClientRect();
          menu.style.left = Math.round(r.left) + 'px';
          menu.style.top = Math.round(r.bottom + 6) + 'px';
          menu.classList.toggle('open');
        });
        document.addEventListener('click', () => menu.classList.remove('open'));
        window.addEventListener('blur', () => menu.classList.remove('open'));
        document.addEventListener('scroll', () => menu.classList.remove('open'), true);
        row.insertBefore(picker, row.firstChild);
      }
      picker.querySelector('.lbl').textContent = activeRow.getAttribute('aria-label') || '面板';
      const sig = rows.map((b) => (b.getAttribute('aria-label') || '') + (b.getAttribute('aria-current') === 'page' ? '*' : '')).join('|');
      const menu = document.getElementById('__dsh_panel_menu');
      if (menu.dataset.sig !== sig) {
        menu.dataset.sig = sig;
        menu.textContent = '';
        rows.forEach((b) => {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'item' + (b.getAttribute('aria-current') === 'page' ? ' on' : '');
          item.textContent = b.getAttribute('aria-label') || '';
          item.addEventListener('click', (ev) => { ev.stopPropagation(); b.click(); menu.classList.remove('open'); });
          menu.appendChild(item);
        });
      }
      // 「新会话」不再另外画：工作区那一行右边本来就有新建入口，重复了。
      const nsBtn = document.querySelector('[class*="_newSession"]');

      /**
       * 把下拉并进**下面那行标题**：那行本来写着「工作区」+ 搜索/筛选/新建，
       * 现在标题文字换成「工作区 ⌄」（同一个名字说两遍很蠢）。找不到那行就退回原位。
       */
      const activeLabel = activeRow.getAttribute('aria-label') || '';
      const scope = row.closest('[class*="_sidebarCol"]') || document;
      let hosted = false;
      for (const el of scope.querySelectorAll('div, span')) {
        if (el.children.length || el.closest('#__dsh_panel_picker') || el.closest('#__dsh_panel_menu')) continue;
        if ((el.textContent || '').trim() !== activeLabel) continue;
        const parent = el.parentElement;
        if (!parent) continue;
        // 必须是「带按钮的那一行标题」（搜索/筛选/新建都在同一行），
        // 否则可能插进一个不可见的容器里 —— 那样下拉会直接消失。
        if (!parent.querySelector('button')) continue;
        // 同一个标题在 DOM 里可能不止一处（外壳一层、内层文本一层）：
        // 只藏第一个就会剩一个「工作区」在边上（上一版就是这样）。
        // 所以这里**不 break**，把这一行里等于标题的叶子全藏掉。
        el.style.setProperty('display', 'none', 'important');
        if (!parent.contains(picker)) parent.insertBefore(picker, parent.firstChild);
        hosted = true;
      }
      // 显隐用内联 !important 定死：写进样式表要跟内核自己的类名规则打架（试过，会被压掉），
      // 结果就是「按钮又不见了」。侧栏收成一条时（宽度很小）两个都藏起来。
      const col = document.querySelector('[class*="_sidebarCol"]') || row;
      const narrow = (col.clientWidth || 999) < 200;
      const force = (el, wide) => { if (el) el.style.setProperty('display', wide ? 'inline-flex' : 'none', 'important'); };
      force(picker, !narrow);
      // 顶栏那行的高度已经在样式表里收成 0（不管有没有并进标题行，它都不该占位置）。
      if (hosted) row.style.setProperty('display', 'none', 'important');
      // 内核那个大「新会话」**永远藏起来**：折叠/展开时反复切它的 display，会让它在
      // rail 里闪现一下再消失（「虚空召唤」就是这么来的）。新建入口在「工作区」那一行右侧。
      if (nsBtn) nsBtn.style.setProperty('display', 'none', 'important');
      // 收起来的时候：下拉让位给内核那两个面板图标（就是它原本折叠后露出来的那两个），
      // 否则那块位置空着，看着像缺了一角。
      const listEl = document.querySelector('[class*="_panelList"]');
      if (listEl) listEl.style.setProperty('display', narrow ? 'flex' : 'none', 'important');
      // 宽度一变立刻反应（原来靠 1.5s 轮询，折叠后要愣一下才消失）
      if (!window.__dshSidebarObs && window.ResizeObserver) {
        window.__dshSidebarObs = new ResizeObserver(() => { try { sample(); } catch (_) {} });
        try { window.__dshSidebarObs.observe(col); } catch (_) {}
      }
    };
    // 取色不要按 1.5 秒轮询 —— 每一轮都要 elementFromPoint + 沿祖先链读计算样式，
    // 拉图/滚动时会跟主线程抢时间（就是「卡得要死」的来源）。
    // 改成：只在真正会改变颜色的时刻取一次（加载 / 尺寸变化 / 主题类变化），
    // 再留一个 5 秒的兜底轮询（颜色没变就直接 return，几乎不花钱）。
    const scheduleSample = () => {
      if (window.__dshSampleTimer) return;
      window.__dshSampleTimer = setTimeout(() => { window.__dshSampleTimer = 0; try { sample(); } catch (_) {} }, 120);
    };
    sample();
    if (!window.__dshShellBarObs) {
      window.__dshShellBarObs = 1;
      try { new MutationObserver(scheduleSample).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] }); } catch (_) {}
      window.addEventListener('resize', scheduleSample);
      window.addEventListener('focus', scheduleSample);
      setInterval(scheduleSample, 5000);
    }
  })()`, true).catch(() => {});
}

/**
 * 以内嵌网页的身份去访问 chat.deepseek.com 时用的 UA。
 * 站点看到 UA 里的 "Electron/xx" 会判「使用环境异常」，所以这里直接由当前
 * Chromium 版本拼一个普通 Chrome 的 UA —— 每次启动跟着内核走，不用手写死。
 */
function plainChromeUA() {
  const chrome = (process.versions && process.versions.chrome) || '130.0.0.0';
  return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + chrome + ' Safari/537.36';
}

/** 在 Chat 面板那个分区上把 UA 定死，页面一加载就是它。 */
function applyChatUserAgent() {
  try {
    session.fromPartition(CHAT_PARTITION).setUserAgent(plainChromeUA());
  } catch (_) {}
}

/**
 * 在 chat 页面里跑的提取器：把整段会话（不只当前可见的那屏）取出来。
 * 页面没有虚拟滚动，所以 DOM 里就是全部消息；按「最长的可滚动容器」定位列表，
 * 再取它下面文本子节点最多的那一层当消息行。角色只是启发式判断，正文一定是原文。
 */
const CHAT_EXTRACT_SOURCE = String.raw`(() => {
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  let scroller = null;
  let bestScroll = 0;
  for (const el of document.querySelectorAll('div')) {
    if (!visible(el) || el.clientHeight < 200) continue;
    if (el.scrollHeight > el.clientHeight + 80 && el.scrollHeight > bestScroll) {
      bestScroll = el.scrollHeight;
      scroller = el;
    }
  }
  const root = scroller || document.body;
  let bestRows = null;
  const walk = (el, depth) => {
    if (!el || depth > 14) return;
    const kids = Array.from(el.children).filter((c) => (c.innerText || '').trim().length > 0);
    if (kids.length >= 2 && (!bestRows || kids.length > bestRows.length)) bestRows = kids;
    for (const c of kids) walk(c, depth + 1);
  };
  walk(root, 0);
  const rows = (bestRows || []).map((el) => {
    const text = (el.innerText || '').trim();
    const rich = !!el.querySelector('.katex, pre, code, table, [class*="markdown"]');
    return { role: rich ? 'assistant' : 'user', text };
  }).filter((r) => r.text.length > 0);
  return {
    text: (root.innerText || '').trim(),
    messages: rows,
    rows: rows.length,
    scrollHeight: root.scrollHeight || 0,
  };
})()`;

// 数据目录：默认 ~/.dsh。只有「默认目录里建不出安装回退链接」且该目录还没有凭证时，
// 才退到跟着程序走的便携目录；已经有数据的目录绝不动（见 resolveHome）。
let DSH_HOME = path.join(os.homedir(), '.dsh');
let CRED_FILE = path.join(DSH_HOME, '.credentials.yaml');
let HOME_NOTE = '';        // 换了数据目录时的说明，会进错误页
let HOME_BLOCKED = null;   // 默认目录被系统拒绝时的诊断文本

let serverProc = null;
let spawnedByUs = false;
let mainWindow = null;
let setupWindow = null;
let tray = null;
let quitting = false;
let isQuitting = false;
// 内嵌 Chat 面板（chat.deepseek.com）的 guest webContents。只有它允许被读取：
// 读的是页面可见文字，落到本地存档，并供 agent 取用。
let chatGuest = null;
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

/**
 * 清掉窗口的导航历史。启动页（boot.html）只是过渡画面，历史里留一条就等于
 * 给鼠标侧键/Alt+← 留了个坑：按下去退回启动页，而那页不会自己再往下走。
 */
/**
 * 宿主日志：写 <userData>/logs/server.log（超过 5MB 轮转一次）。
 * 宿主是整个软件的命脉，它崩了以前什么线索都不留，只能靠用户描述。
 */
function logServer(tag, text) {
  try {
    const dir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'server.log');
    try { if (fs.statSync(file).size > 5 * 1024 * 1024) fs.renameSync(file, file + '.1'); } catch (_) {}
    fs.appendFileSync(file, '[' + new Date().toISOString() + '] ' + tag + ' ' + String(text) + '\n', 'utf8');
  } catch (_) {}
}

function serverLogPath() {
  try { return path.join(app.getPath('userData'), 'logs', 'server.log'); } catch (_) { return ''; }
}
function clearNavHistory(wc) {
  try {
    if (wc.navigationHistory && typeof wc.navigationHistory.clear === 'function') wc.navigationHistory.clear();
    else if (typeof wc.clearHistory === 'function') wc.clearHistory();
  } catch (_) {}
}
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

/**
 * 启动器（dsh-app-boot）会把内置运行时里的每个 @deepseek-ai 包「链接」进
 * <home>\profiles\node_modules。这个链接在部分机器/卷上会被 Windows 拒绝，
 * 而启动器没有降级分支 —— 直接 EPERM 退出，用户只看到 errno -4048。
 * 所以在拉起服务之前，先自己照原样试一次。
 */
function canLinkFallback(homeDir) {
  const modulesDir = path.join(homeDir, 'profiles', 'node_modules');
  const target = path.join(RUNTIME_DIR, 'dsh', 'node_modules', '@deepseek-ai');
  const probe = path.join(modulesDir, '__link_probe__');
  if (!fs.existsSync(target)) return true;   // 没东西可链，交给启动器自己判断
  try {
    fs.mkdirSync(modulesDir, { recursive: true });
    fs.symlinkSync(target, probe, 'junction');
    return true;
  } catch (_) {
    return false;
  } finally {
    try { fs.rmSync(probe, { recursive: true, force: true }); } catch (_) {}
  }
}

function setHome(dir, note) {
  DSH_HOME = dir;
  CRED_FILE = path.join(dir, '.credentials.yaml');
  HOME_NOTE = note || '';
}

/**
 * 选这次启动用的数据目录：
 *   1. 环境里显式给了 DSH_HOME            -> 完全尊重，不猜；
 *   2. 默认目录能建链接                    -> 用它（绝大多数机器走这条）；
 *   3. 建不了、但默认目录还是空的（无凭证）-> 退到 <安装目录>\.dsh（同盘同卷，链接就建得出来）；
 *   4. 建不了、而目录里已经有数据          -> 不搬，保持原样，把诊断写进错误页。
 */
function resolveHome() {
  if (process.env.DSH_HOME) return;
  const standard = path.join(os.homedir(), '.dsh');
  if (canLinkFallback(standard)) { setHome(standard, ''); return; }
  const installRoot = path.dirname(path.dirname(RUNTIME_DIR));
  const portable = path.join(installRoot, '.dsh');
  const hasCreds = fs.existsSync(path.join(standard, '.credentials.yaml'));
  if (!hasCreds && canLinkFallback(portable)) {
    setHome(portable, '默认数据目录建不出安装链接，已改用便携目录：' + portable);
    try { logServer('home', 'module-fallback link blocked at ' + standard + '; using ' + portable); } catch (_) {}
    return;
  }
  setHome(standard, '');
  HOME_BLOCKED = '数据目录 ' + standard + ' 无法创建安装链接（Windows 拒绝建立 junction/reparse point）。'
    + (hasCreds ? ' 该目录里已有凭证，未擅自搬动。' : ' 程序旁边的目录也试过，同样建不出来。')
    + '\n\n可行办法（按推荐顺序）：'
    + '\n① 右键以管理员身份运行一次 —— 链接建好后会一直复用；'
    + '\n② 开启「开发者模式」（设置 → 系统 → 开发者选项）；'
    + '\n③ 把程序移到本地 NTFS 盘、纯英文路径（不要放网络盘/可移动盘/带中文的目录）。';
}

if (RUNTIME_DIR) resolveHome();

function startServer() {
  if (!RUNTIME_DIR) return false;
  const nodeExe = path.join(RUNTIME_DIR, 'node', 'node.exe');
  const cli = path.join(RUNTIME_DIR, 'dsh', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
  const cwd = path.join(RUNTIME_DIR, 'dsh');
  const env = Object.assign({}, process.env, {
    PATH: path.join(RUNTIME_DIR, 'node') + path.delimiter + (process.env.PATH || ''),
    DSH_APP_VERSION: app.getVersion(),
    // 显式传下去：启动器要在 <DSH_HOME>\profiles\node_modules 里铺安装链接，
    // 数据目录放哪，直接决定那些链接能不能建出来。
    DSH_HOME: DSH_HOME
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
    logServer('stdout', chunk);
    serverStdout += chunk;
    if (serverStdout.length > 65536) serverStdout = serverStdout.slice(-65536);
    const m = serverStdout.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+(?:\/\?token=[A-Za-z0-9_-]+)?)/);
    if (m) appUrl = m[1];
  });
  serverProc.stderr.on('data', (chunk) => {
    logServer('stderr', chunk);
    serverStderr += chunk;
    if (serverStderr.length > 65536) serverStderr = serverStderr.slice(-65536);
  });
  serverProc.on('exit', (code, signal) => {
    serverExited = { code, signal };
    serverProc = null;
    logServer('exit', 'code=' + String(code) + ' signal=' + String(signal));
    // 宿主意外退出：自动拉起来并把窗口接回新地址，别让用户对着「自动重连中」发呆。
    if (!quitting && !isQuitting && appUrl) {
      setTimeout(() => { if (!quitting && !isQuitting) restartServer(); }, 1200);
    }
  });
  spawnedByUs = true;
  logServer('spawn', JSON.stringify({ exe: nodeExe, port: portArg, cwd }));
  return true;
}

function stopServer() {
  if (serverProc && spawnedByUs) {
    try { exec('taskkill /PID ' + serverProc.pid + ' /T /F', () => {}); } catch (_) {}
  }
  serverProc = null;
}

/** 宿主挂了之后重新拉起，并把窗口指回新地址。 */
async function restartServer() {
  if (bootFailed) return;
  logServer('restart', 'host exited unexpectedly; restarting');
  bootPhaseText = '服务意外退出，正在重新拉起…';
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    resetBootPage();
    setBootStatus(bootPhaseText);
  }
  if (!startServer()) { failBoot('DSH 服务重启失败', '未找到内置运行时'); return; }
  const ok = await waitForLaunchUrl(BOOT_WAIT_MS);
  if (ok && !quitting && !isQuitting) {
    logServer('restart', 'ok url=' + String(getAppUrl()));
    showAppWindow();
  } else if (!ok) {
    failBoot('DSH 服务重启失败', describeBootError());
  }
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
const BUILTIN_PLUGINS = ['ds_zhuzhu_use'];
// 老版本残留：只清我们早期自己塞进去、后来不再随包发布的那些。
// 宠物类插件（dsh-pet / whale-girl / dsh-dafeiyu 等）是用户自己的东西，不动 ——
// 它们在设置里有独立开关，默认不启用。
const LEGACY_PLUGINS = [
  // 0.9.0-alpha1 起自研插件由 dsh-fenggu 更名为 ds_zhuzhu_use：老行必须清掉，
  // 否则 profile 里同时挂着新旧两份，两套路由 + 两套命令会当场互撞。
  'dsh-fenggu',
  '@signalight/dsh-codex-pet',
  'pet-gallery',
  'pet-floater',
  'dsh-side-panel'
];

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
  if (fs.existsSync(manifestPath)) {
    ensureNoBomJson(manifestPath);
    return;
  }
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

// 可选子代理驱动（Codex CLI 377 MB / Claude Code SDK 216 MB）不随安装包发布，
// 需要时在「设置 → 子代理」里下载。但它们对应的插件 bundle 行如果留着而依赖不在，
// Cordis 加载插件会失败 —— 那种失败会把整个 profile 拖下水（0.8.0 的 dsh-pet 就是
// 这么把人挡在门外的）。所以启动前先对账：驱动不在就把 bundle 行摘掉，装好了再加回来。
const OPTIONAL_DRIVER_PLUGINS = [
  { name: '@deepseek-ai/dsh-subagent-codex', probes: ['@openai/codex-win32-x64'] },
  { name: '@deepseek-ai/dsh-subagent-claude-code', probes: ['@anthropic-ai/claude-agent-sdk-win32-x64'] },
];

function optionalDriverPresent(probes) {
  const roots = [
    path.join(DSH_HOME, 'profiles', 'web', 'node_modules'),
    path.join(DSH_HOME, 'profiles', 'node_modules'),
    path.join(RUNTIME_DIR, 'dsh', 'node_modules'),
  ];
  return probes.every((p) => roots.some((root) => fs.existsSync(path.join(root, ...p.split('/'), 'package.json'))));
}

function ensureOptionalDriverBundles() {
  try {
    const profileDir = path.join(DSH_HOME, 'profiles', 'web');
    const profilePkgPath = path.join(profileDir, 'package.json');
    if (!fs.existsSync(profilePkgPath)) return;
    const pkg = JSON.parse(readTextNoBom(profilePkgPath));
    const bundles = pkg.dsh && pkg.dsh.profile && Array.isArray(pkg.dsh.profile.bundles) ? pkg.dsh.profile.bundles : null;
    if (!bundles) return;
    let changed = false;
    for (const driver of OPTIONAL_DRIVER_PLUGINS) {
      const here = bundles.indexOf(driver.name) !== -1;
      const ok = optionalDriverPresent(driver.probes);
      if (here && !ok) {
        bundles.splice(bundles.indexOf(driver.name), 1);
        if (pkg.dependencies && Object.prototype.hasOwnProperty.call(pkg.dependencies, driver.name)) delete pkg.dependencies[driver.name];
        changed = true;
        logServer('drivers', driver.name + ' 的依赖不在（未下载），先从 profile bundle 里摘掉');
      }
    }
    if (changed) {
      pkg.dsh.profile.bundles = bundles;
      fs.writeFileSync(profilePkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    }
  } catch (e) {
    logServer('drivers', 'bundle 对账失败（不影响启动）: ' + (e && e.message ? e.message : String(e)));
  }
}

function ensureBuiltinPlugins() {
  try {
    const profileDir = path.join(DSH_HOME, 'profiles', 'web');
    const profilePkgPath = path.join(profileDir, 'package.json');
    if (!fs.existsSync(profilePkgPath) || !RUNTIME_DIR) return;
    ensureNoBomJson(profilePkgPath);
    const pkg = JSON.parse(readTextNoBom(profilePkgPath));
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
      // Always refresh built-ins from the installed runtime: an upgrade must
      // replace a stale profile copy (a plugin only copied when missing left
      // old versions active forever).
      if (fs.existsSync(src)) {
        try {
          if (present) fs.rmSync(dst, { recursive: true, force: true });
          copyDir(src, dst);
          present = fs.existsSync(dst);
        } catch (_) {
          present = fs.existsSync(dst);
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

// JSON parsers reject a UTF-8 BOM. Profiles written/edited by PowerShell or
// older Notepad often carry one, which used to kill every later boot with
// "Unexpected token '﻿'". Strip/normalize it before dsh reads the file.
function readTextNoBom(file) {
  const raw = fs.readFileSync(file, 'utf8');
  return raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
}

function ensureNoBomJson(file) {
  if (!fs.existsSync(file)) return;
  const buf = fs.readFileSync(file);
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    fs.writeFileSync(file, buf.slice(3), 'utf8');
  }
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
  const lp = serverLogPath();
  if (lp) parts.push('宿主日志：' + lp);
  parts.push('数据目录：' + String(DSH_HOME));
  if (HOME_NOTE) parts.push('注意：' + HOME_NOTE);
  if (HOME_BLOCKED) parts.push('--- 数据目录链接失败（这才是真正的病因）---\n' + HOME_BLOCKED);
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
    // 顶栏：隐藏系统标题栏，改成我们自己的条（原生按钮由 titleBarOverlay 提供）。
    // 这里的初值只是「页面还没告诉我们主题之前」的兜底；页面一加载就会按真实背景色
    // 调 applyTitlebarColor() 刷成同色（浅色/深色都不会撞色）。
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#ffffff', symbolColor: '#4b5563', height: SHELL_BAR_H },
    backgroundColor: '#ffffff',
    // 显式给窗口图标：不写的话任务栏/窗口角标会回落到 exe 里的 16px 小图，
    // 那只小鲸鱼糊成一团，看着像别人的图标（被当成 Codex 的漩涡）。
    icon: path.join(__dirname, 'assets', 'app-icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // 左侧栏的 Chat 面板内嵌 chat.deepseek.com。该站发 frame-ancestors 'none'，
      // 普通 iframe 一定被拒；<webview> 是独立顶层上下文，不受这个限制。
      webviewTag: true
    }
  });

  // Boot page first: visible immediately, no white wait.
  mainWindow.loadFile(BOOT_PAGE);
  mainWindow.setTitle(SHELL_TITLE);
  // 页面自己的 <title> 不许覆盖窗口标题（内核界面会把它设成很长的品牌串）
  mainWindow.on('page-title-updated', (e) => {
    e.preventDefault();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setTitle(SHELL_TITLE);
  });
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
    installShellBar(mainWindow.webContents);
    if (bootErrorTitle !== null) {
      mainWindow.webContents.executeJavaScript(
        'window.__dshFail(' + JSON.stringify(bootErrorTitle) + ',' + JSON.stringify(bootErrorDetail || '') + ')'
      ).catch(() => {});
    } else {
      mainWindow.webContents.executeJavaScript('window.__dshSetStatus(' + JSON.stringify(bootPhaseText) + ')').catch(() => {});
    }
  });

  // 导航守卫：任何回到启动页（file://）的动作都直接拉回应用页；
  // 正常停在应用页时清空历史，让侧键「后退」无处可去。
  mainWindow.webContents.on('did-navigate', (_event, url) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (String(url).indexOf('file://') === 0) {
      const u = getAppUrl();
      if (u) { mainWindow.loadURL(u); return; }
    }
    installShellBar(mainWindow.webContents);
    clearNavHistory(mainWindow.webContents);
  });
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.alt && (input.key === 'Left' || input.key === 'ArrowLeft')) _event.preventDefault();
    if (input.key === 'BrowserBack') _event.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.indexOf('127.0.0.1') !== -1 || url.indexOf('localhost') !== -1) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('did-attach-webview', (_event, guest) => {
    chatGuest = guest;
    guest.on('destroyed', () => { if (chatGuest === guest) chatGuest = null; });
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
ensureOptionalDriverBundles();
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
// 页面把当前主题的背景色报上来，窗口那条（系统按钮所在区域）跟着刷成同色。
ipcMain.on('dsh-titlebar-color', (_event, color) => applyTitlebarColor(color));

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

// Chat 面板读取桥：只认 chat.deepseek.com 那个 guest，只回可见文字。
// Chat 面板读取桥：只认 chat.deepseek.com 那个 guest，只回该页面自己的内容。
ipcMain.handle('dsh-chat-read', async () => {
  try {
    if (!chatGuest || chatGuest.isDestroyed()) return { ok: false, error: 'Chat 面板还没打开' };
    const url = chatGuest.getURL() || '';
    if (url.indexOf('chat.deepseek.com') === -1) return { ok: false, error: '当前页面不是 chat.deepseek.com' };
    const data = await chatGuest.executeJavaScript(CHAT_EXTRACT_SOURCE, true);
    return {
      ok: true,
      url,
      title: chatGuest.getTitle() || '',
      text: String((data && data.text) || ''),
      messages: Array.isArray(data && data.messages) ? data.messages : [],
      rows: Number((data && data.rows) || 0),
    };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});ipcMain.on('dsh-boot-action', (event, action) => {
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
    applyChatUserAgent();
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

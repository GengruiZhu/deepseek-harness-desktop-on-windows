/**
 * ds_zhuzhu_use client — 峰谷徽章 + 软件信息 / 桌面插件 / 工作目录 / 会话版本 / 宠物设置页。
 */
(function () {
window.__ModuleLoader__.load({
	id: "ds_zhuzhu_use",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		let react = require("react");
		const { useState, useEffect, useCallback, useRef } = react;

		const inject = ["slots"];

		const S = {
			row: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", gap: "12px", borderBottom: "1px solid var(--dsw-alias-border-l2, #eee)" },
			label: { fontSize: "13px", color: "var(--dsw-alias-label-primary, #333)" },
			sub: { fontSize: "11px", color: "var(--dsw-alias-label-secondary, #888)", marginTop: "2px" },
			value: { fontSize: "13px", color: "var(--dsw-alias-label-primary, #333)" },
			btn: { fontSize: "12px", padding: "4px 12px", borderRadius: "6px", border: "1px solid var(--dsw-alias-border-l2, #ccc)", background: "var(--dsw-alias-bg-layer-1, #fff)", color: "var(--dsw-alias-label-primary, #333)", cursor: "pointer" },
			btnPrimary: { fontSize: "12px", padding: "5px 16px", borderRadius: "6px", border: "none", background: "var(--dsw-alias-button-primary-fill, #0a3)", color: "var(--dsw-alias-button-primary-foreground, #fff)", cursor: "pointer" },
			msg: { fontSize: "11px", color: "var(--dsw-alias-label-secondary, #888)", marginTop: "8px", whiteSpace: "pre-wrap" },
			select: { fontSize: "12px", padding: "4px 8px", borderRadius: "6px", border: "1px solid var(--dsw-alias-border-l2, #ccc)", background: "var(--dsw-alias-bg-layer-1, #fff)", color: "var(--dsw-alias-label-primary, #333)", maxWidth: "280px" },
			path: { fontSize: "11px", color: "var(--dsw-alias-label-secondary, #888)", wordBreak: "break-all", marginTop: "2px" },
		};

		// ==================== 峰谷徽章 ====================
		const COLORS = {
			peak: { dot: "#f59e0b", text: "#fbbf24", border: "rgba(245,158,11,.30)", bg: "rgba(245,158,11,.08)" },
			valley: { dot: "#10b981", text: "#34d399", border: "rgba(16,185,129,.30)", bg: "rgba(16,185,129,.08)" }
		};

		function fmtCountdown(ms) {
			if (ms == null || !Number.isFinite(ms)) return "";
			const mins = Math.max(0, Math.round(ms / 60000));
			const h = Math.floor(mins / 60);
			const m = mins % 60;
			return h > 0 ? h + "小时" + m + "分后转" : m + "分后转";
		}

		function usePeriod() {
			const [period, setPeriod] = useState(null);
			useEffect(() => {
				let alive = true;
				const load = () => {
					fetch("/api/ds-zhuzhu-use/period", { cache: "no-store" })
						.then((r) => r.json())
						.then((d) => { if (alive) setPeriod(d); })
						.catch(() => {});
				};
				load();
				const timer = setInterval(load, 30000);
				return () => { alive = false; clearInterval(timer); };
			}, []);
			return period;
		}

		function Badge() {
			const p = usePeriod();
			const [showToken, setShowToken] = useState(false);
			const [tokenDraft, setTokenDraft] = useState("");
			const [tokenMsg, setTokenMsg] = useState("");

			function saveToken() {
				const t = (tokenDraft || "").trim();
				if (!t) { setTokenMsg("令牌为空"); return; }
				fetch("/api/ds-zhuzhu-use/token", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ action: "set", token: t })
				})
					.then((r) => r.json())
					.then((d) => {
						if (d && d.ok) { setTokenMsg("已保存，重启后自动读取（可立即用 /usage 查看用量）"); setTokenDraft(""); }
						else setTokenMsg(d && d.error ? "保存失败：" + d.error : "保存失败");
					})
					.catch(() => setTokenMsg("保存失败（网络）"));
			}

			function clearToken() {
				fetch("/api/ds-zhuzhu-use/token", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ action: "clear" })
				})
					.then((r) => r.json())
					.then((d) => { setTokenMsg(d && d.ok ? "已清除令牌" : "清除失败"); })
					.catch(() => setTokenMsg("清除失败"));
			}

			if (!p) return null;
			const c = COLORS[p.period] || COLORS.valley;
			const remain = p.nextSwitchMs ? p.nextSwitchMs - p.now : null;
			const countdown = fmtCountdown(remain);
			const title = p.name + (p.nextName ? "，" + countdown + p.nextName : "");
			return react.createElement(
				"div",
				{ style: { display: "flex", justifyContent: "center", padding: "0 0 2px 0", fontFamily: "inherit", flexDirection: "column", alignItems: "center", gap: "4px" } },
				react.createElement(
					"div",
					{ title, style: {
							display: "inline-flex", alignItems: "center", gap: "6px", padding: "1px 10px", borderRadius: "999px", border: "1px solid " + c.border, background: c.bg, color: c.text, fontSize: "12px", lineHeight: "18px", userSelect: "none", pointerEvents: "auto"
						} },
					react.createElement("span", { style: { width: "6px", height: "6px", borderRadius: "999px", background: c.dot, display: "inline-block", flex: "none" } }),
					react.createElement("span", null, p.name),
					p.nextSwitchMs ? react.createElement("span", { style: { opacity: .72 } }, countdown + p.nextName) : null,
					react.createElement("button", { style: { background: "none", border: "none", color: c.text, cursor: "pointer", fontSize: "12px", padding: "0 0 0 4px", opacity: .75 }, title: "设置平台用量令牌（首次）", onClick: () => setShowToken((s) => !s) }, "⚙")
				),
				showToken
					? react.createElement(
							"div",
							{ style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary, #888)", display: "flex", flexDirection: "column", gap: "4px", alignItems: "center", maxWidth: "360px", textAlign: "center" } },
							react.createElement("div", null, "平台用量令牌（首次）：登录 platform.deepseek.com/usage → F12 → 控制台执行 JSON.parse(localStorage.getItem(\"userToken\")).value，复制结果粘贴到下面"),
							react.createElement("input", { type: "password", value: tokenDraft, onChange: (e) => setTokenDraft(e.target.value), placeholder: "粘贴 userToken……", style: { width: "300px", padding: "3px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #555", background: "#222", color: "#eee" } }),
							react.createElement("div", { style: { display: "flex", gap: "6px" } },
								react.createElement("button", { onClick: saveToken, style: { fontSize: "11px", padding: "2px 8px", cursor: "pointer" } }, "保存"),
								react.createElement("button", { onClick: clearToken, style: { fontSize: "11px", padding: "2px 8px", cursor: "pointer" } }, "清除")
							),
							react.createElement("div", { style: { opacity: .9 } }, tokenMsg)
						)
					: null
			);
		}

		// ==================== 软件信息 ====================
		function InfoRow(props) {
			return react.createElement("div", { style: S.row },
				react.createElement("div", null,
					react.createElement("div", { style: S.label }, props.label),
					props.sub ? react.createElement("div", { style: S.sub }, props.sub) : null
				),
				react.createElement("div", { style: S.value }, props.value)
			);
		}

		// 版本号比较：v0.8.1-rc.1 > v0.8.0 > v0.7.4-rc.1（同号时 rc/alpha 低于正式版）
		function parseVer(tag) {
			const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(String(tag || "").trim());
			if (!m) return null;
			return { nums: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ? m[4].split(".") : [] };
		}

		function cmpVer(a, b) {
			const A = parseVer(a);
			const B = parseVer(b);
			if (!A || !B) return 0;
			for (let i = 0; i < 3; i++) {
				if (A.nums[i] !== B.nums[i]) return A.nums[i] < B.nums[i] ? -1 : 1;
			}
			if (A.pre.length && !B.pre.length) return -1;
			if (!A.pre.length && B.pre.length) return 1;
			const n = Math.max(A.pre.length, B.pre.length);
			for (let i = 0; i < n; i++) {
				const x = A.pre[i];
				const y = B.pre[i];
				if (x === undefined) return -1;
				if (y === undefined) return 1;
				const xn = /^\d+$/.test(x);
				const yn = /^\d+$/.test(y);
				if (xn && yn) {
					if (Number(x) !== Number(y)) return Number(x) < Number(y) ? -1 : 1;
				} else if (x !== y) {
					return x < y ? -1 : 1;
				}
			}
			return 0;
		}

		function fmtSize(bytes) {
			const n = Number(bytes) || 0;
			if (n >= 1073741824) return (n / 1073741824).toFixed(2) + " GB";
			if (n >= 1048576) return (n / 1048576).toFixed(1) + " MB";
			if (n > 0) return Math.round(n / 1024) + " KB";
			return "";
		}

		function AboutSection() {
			const st = useUpdateStore();
			const [selected, setSelected] = useState("");

			react.useEffect(() => { if (!st.checked && !st.loading) checkUpdate(false); }, [st.checked, st.loading]);

			const current = (st.info && st.info.appVersion) || "";
			const currentTag = current && current !== "unknown" ? "v" + current : "";
			const options = st.releases.map((r) => r.tag);
			if (currentTag && options.indexOf(currentTag) === -1) options.unshift(currentTag);
			const sel = selected || currentTag || options[0] || "";
			const delta = (currentTag && sel) ? cmpVer(sel, currentTag) : null;
			const item = st.releases.find((r) => r.tag === sel);
			const d = st.dl || UPDATE_IDLE_DL();
			const busy = !!st.busy;
			const hasDl = d.phase === "downloading" || d.phase === "paused" || d.phase === "ready" || d.phase === "error" || d.partBytes > 0;

			function act() {
				if (!sel) return;
				const verb = delta > 0 ? "更新" : (delta < 0 ? "回退" : "重装");
				const sizeText = (item && item.asset && fmtSize(item.asset.size)) || "";
				const tip = "确定" + verb + "到 " + sel + " 吗？" + (sizeText ? "\n\n安装包 " + sizeText + "，下载完可以自己挑时候装。" : "");
				if (!window.confirm(tip)) return;
				startDownload(sel, item && item.asset ? item.asset.url : "", false);
			}

			return react.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } },
				react.createElement("div", { style: { fontSize: 13, color: "var(--dsw-alias-label-secondary, #888)" } }, "版本与反馈"),
				st.info ? react.createElement("div", null,
					InfoRow({ label: "软件版本", value: st.info.appVersion }),
					InfoRow({ label: "dsh 内核版本", value: st.info.kernelVersion }),
					InfoRow({ label: "反馈邮箱", value: st.info.contact })
				) : react.createElement("div", { style: S.msg }, "正在读取…"),

				react.createElement("div", { style: { marginTop: 12, fontSize: 13, color: "var(--dsw-alias-label-primary, #333)" } }, "版本历史（GitHub Releases）"),
				react.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" } },
					react.createElement("select", {
						value: sel,
						onChange: (e) => setSelected(e.target.value),
						style: S.select,
						disabled: st.loading || options.length === 0,
					},
						options.map((t) => react.createElement("option", { key: t, value: t }, t + (t === currentTag ? "（当前）" : "") + (st.latest && t === st.latest.tag ? "（最新）" : "")))
					),
					react.createElement("button", {
						onClick: act,
						style: { ...S.btnPrimary, opacity: (busy || st.loading || !sel || delta === 0) ? 0.5 : 1 },
						disabled: busy || st.loading || !sel || delta === 0,
					}, delta === null ? "下载并安装" : (delta > 0 ? "更新到此版本" : (delta < 0 ? "回退到此版本" : "已是当前版本"))),
					react.createElement("button", {
						onClick: () => checkUpdate(true),
						disabled: st.loading,
						style: { ...S.btn, display: "inline-flex", alignItems: "center", gap: 6 },
					}, st.loading ? react.createElement(Spinner, { size: 11 }) : null, "刷新列表"),
					st.loadError
						? react.createElement("span", {
								title: st.loadError,
								onClick: () => showError("刷新失败", st.loadError),
								style: { color: "var(--dsw-alias-state-error-primary, #dc2626)", fontSize: 15, cursor: "pointer" },
							}, "❗")
						: null
				),

				hasDl ? react.createElement("div", { style: { marginTop: 4 } },
					d.phase === "installing"
						? (d.installStarted
						    ? react.createElement("div", { style: S.msg }, "安装程序已启动，按提示完成即可。")
						    : d.installNote
						      ? react.createElement("div", { style: { ...S.msg, color: "var(--dsw-alias-state-error-primary, #c0392b)" } }, d.installNote)
						      : react.createElement("div", { style: S.msg }, "正在启动安装程序…"))
					: react.createElement(DownloadBar, { data: d, busy: busy })
				) : null,
				d.phase === "error"
					? react.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
							react.createElement("span", { style: { ...S.msg, color: "var(--dsw-alias-state-error-primary, #c0392b)", margin: 0 } }, "下载出错：" + d.error),
							react.createElement("button", { onClick: () => showError("下载出错", d.error), style: { ...S.btn, padding: "2px 8px" } }, "详情")
						)
					: null,

				react.createElement("div", { style: { marginTop: 8 } },
					react.createElement("a", { href: "https://github.com/GengruiZhu/deepseek-harness-desktop-on-windows", target: "_blank", rel: "noreferrer", style: { fontSize: 12, color: "var(--dsw-alias-brand-primary, #0a3)" } }, "打开 GitHub 主页")
				)
			);
		}

		// ==================== 桌面插件（官方内核自带的插件管理，应用内渲染） ====================
		// 0.9.1-alpha2 起官方 desktop 把插件管理收进了内核：装 / 卸 / 启停走的都是内核的
		// pluginManager Remote —— 官方内置的那个插件页（ui-plugin-manager）用的也是同一套。
		// 所以这里优先用官方 Remote，只有老外壳（0.9.1 / 0.9.2，alpha.1 内核）才回落到
		// window.dshDesktop.plugins 那五个受限通道。两者都没有时只渲染一句说明，绝不抛异常。
		let pluginCtx = null;

		// ctx.remote / ctx.layout 都不是本插件在 inject 里声明的服务，直接取属性会拿不到（cordis 的
		// 代理只对已注入的服务名放行）。reflect.get(name, false) 就是「不要求注入地读一个服务」，
		// 拿不到时返回 undefined，正好用来做能力探测。
		function clientService(name) {
			try {
				const viaReflect = pluginCtx && pluginCtx.reflect ? pluginCtx.reflect.get(name, false) : undefined;
				if (viaReflect) return viaReflect;
			} catch (_) { /* reflect 不可用时退回属性读取 */ }
			try { return pluginCtx ? pluginCtx[name] : undefined; } catch (_) { return undefined; }
		}

		function officialPluginManager() {
			// 官方插件页 inject 的是 'remote.pluginManager' 这个**独立服务名**：remote 服务本身只暴露
			// ctx / namespaces / connection 这些字段，命名空间不是它的可枚举属性。所以先按服务名取，
			// 取不到再退回命名空间属性，两条都不通才算「这一份内核没有插件管理」。
			try {
				const direct = clientService("remote.pluginManager");
				if (direct && typeof direct.listBundles === "function") return direct;
			} catch (_) { /* 服务未挂时按「不支持」处理 */ }
			try {
				const remote = clientService("remote");
				const manager = remote && remote.pluginManager;
				if (manager && typeof manager.listBundles === "function") return manager;
			} catch (_) { /* 命名空间也不可用时按「不支持」处理 */ }
			return null;
		}

		function legacyPluginBridge() {
			try {
				const api = window.dshDesktop && window.dshDesktop.plugins;
				if (api && typeof api.list === "function") return api;
			} catch (_) { /* 取 window.dshDesktop 本身抛异常时按「不支持」处理 */ }
			return null;
		}

		// 内置插件页就是侧栏那个「插件」面板，面板 id 由官方 ui-plugin-manager 声明为 "plugins"。
		// 用官方的 layout 服务切过去，不自己开窗、不自己管包。
		function openOfficialPluginPage() {
			try {
				const layout = clientService("layout");
				if (layout && typeof layout.selectPanel === "function") {
					layout.selectPanel("plugins");
					return "";
				}
			} catch (e) { return String((e && e.message) || e); }
			return "这一版界面里没有内置的插件管理页";
		}

		function changeResultText(result) {
			if (!result) return "";
			if (result.error && result.error.code) return "内核拒绝了这次改动：" + result.error.code;
			if (result.application === "failed") return "改动没能生效，请稍后重试。";
			if (result.application === "restart-required") return "改动已保存，重启应用后生效。";
			if (Array.isArray(result.pendingBuilds) && result.pendingBuilds.length > 0) {
				return "这个包要在安装时跑构建脚本，待批准：" + result.pendingBuilds.join("、");
			}
			return "已应用。";
		}

		function DesktopPluginsSection() {
			const faceRef = useRef(null);
			if (faceRef.current === null) {
				const official = officialPluginManager();
				const legacy = official ? null : legacyPluginBridge();
				faceRef.current = official
					? {
						kind: "official",
						list: () => official.listBundles().then((rows) => (Array.isArray(rows) ? rows : [])),
						toggle: (name, enabled) => official.setBundleEnabled(name, enabled),
						remove: (name) => official.removeBundle(name),
						add: (spec) => official.installBundle(spec, {})
					}
					: (legacy ? {
						kind: "legacy",
						list: () => legacy.list(),
						toggle: (name, enabled) => legacy.toggle(name, enabled),
						remove: (name) => legacy.remove(name),
						add: (spec) => legacy.add(spec)
					} : null);
			}
			const face = faceRef.current;
			const [rows, setRows] = useState(null);   // null = 还没读到
			const [msg, setMsg] = useState("");
			const [busy, setBusy] = useState("");     // 正在进行的写操作（行 key），空 = 空闲
			const [spec, setSpec] = useState("");

			const refresh = useCallback(() => {
				if (!face) return;
				setMsg("");
				face.list()
					.then((list) => setRows(Array.isArray(list) ? list : []))
					.catch((e) => { setRows([]); setMsg("读取插件列表失败：" + String((e && e.message) || e)); });
			}, [face]);

			useEffect(() => { refresh(); }, [refresh]);

			// 旧壳那套写操作会重启后端、并重挂整张应用页：切到 busy 之后就不再写前端状态。
			// 官方 Remote 不重挂页面，结果用 changeResultText 显示出来再刷一次列表。
			function run(key, task) {
				if (busy) return;
				setBusy(key);
				setMsg("");
				Promise.resolve()
					.then(task)
					.then((result) => {
						if (face.kind !== "official") return;
						setBusy("");
						setMsg(changeResultText(result));
						refresh();
					})
					.catch((e) => { setBusy(""); setMsg("操作失败：" + String((e && e.message) || e)); });
			}

			const openButton = react.createElement("button", {
				onClick: () => { const err = openOfficialPluginPage(); if (err) setMsg(err); },
				style: { ...S.btn, flex: "none" }
			}, "打开内置插件管理");

			if (!face) {
				return react.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } },
					react.createElement("div", { style: S.label }, "没有可用的插件管理接口"),
					react.createElement("div", { style: S.msg }, "这一份内核没挂 pluginManager Remote，外壳也没有开出插件通道。"),
					openButton
				);
			}

			const list = rows || [];
			const itemBox = { display: "flex", alignItems: "center", gap: "10px", padding: "8px 10px", border: "1px solid var(--dsw-alias-border-l2, #e5e5e5)", borderRadius: "8px", background: "var(--dsw-alias-bg-layer-1, #fff)" };
			const working = (key) => (busy === key ? "正在应用…" : "");
			const rowEnabled = (p) => p.enabled !== false;
			const rowRemovable = (p) => p.removable !== false && !p.readOnlyReason;

			return react.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } },
				react.createElement("div", { style: { fontSize: "13px", color: "var(--dsw-alias-label-secondary, #888)" } },
					face.kind === "official"
						? "插件管理走内核自带的 pluginManager，和内置的插件页是同一套：这里列的是当前 profile 的组合包，装 / 卸 / 启停结果完全一致。"
						: "这一版外壳还没有内置插件页，装卸由外壳的主进程执行，改完外壳会重启一次后端。"),
				react.createElement("div", { style: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" } },
					openButton,
					react.createElement("button", { onClick: refresh, disabled: !!busy, style: S.btn }, "刷新列表")
				),
				rows === null
					? react.createElement("div", { style: S.msg }, "正在读取桌面插件…")
					: list.length === 0
						? react.createElement("div", { style: S.msg }, "这个 profile 还没有第三方组合包。")
						: react.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } },
								list.map((p) => react.createElement("div", { key: p.name, style: itemBox },
									react.createElement("div", { style: { flex: 1, minWidth: 0 } },
										react.createElement("div", { style: { ...S.label, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, title: p.name }, p.name),
										react.createElement("div", { style: S.sub },
											(p.version ? "v" + p.version + "，" : "")
											+ (rowEnabled(p) ? "已启用" : "已停用")
											+ (p.installed === false ? "，安装提供" : "")
											+ (p.readOnlyReason === "management-required" ? "，需在内置插件页操作" : ""))
									),
									react.createElement("button", {
										onClick: () => run("toggle:" + p.name, () => face.toggle(p.name, !rowEnabled(p))),
										disabled: !!busy || p.readOnlyReason === "management-required",
										style: { ...S.btn, opacity: busy ? 0.5 : 1, flex: "none" },
									}, working("toggle:" + p.name) || (rowEnabled(p) ? "停用" : "启用")),
									react.createElement("button", {
										onClick: () => run("remove:" + p.name, () => face.remove(p.name)),
										disabled: !!busy || !rowRemovable(p),
										style: { ...S.btn, opacity: busy ? 0.5 : 1, flex: "none" },
									}, working("remove:" + p.name) || "卸载")
								))
							),
				react.createElement("div", { style: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginTop: "2px" } },
					react.createElement("input", {
						value: spec,
						onChange: (e) => setSpec(e.target.value),
						placeholder: "npm 包名或 name@version",
						disabled: !!busy,
						style: { ...S.select, flex: "1 1 220px", minWidth: "150px" },
					}),
					react.createElement("button", {
						onClick: () => { const s = spec.trim(); if (!s) return; run("add:" + s, () => face.add(s)); },
						disabled: !!busy || !spec.trim(),
						style: { ...S.btnPrimary, opacity: (busy || !spec.trim()) ? 0.5 : 1 },
					}, working("add:" + spec.trim()) || "安装"),
					react.createElement("div", { style: S.sub }, "装 / 卸 / 启停都交给内核执行；要更细的构建脚本审批、安装日志，去内置插件页。")
				),
				msg ? react.createElement("div", { style: S.msg }, msg) : null
			);
		}

		// ==================== 工作目录 ====================
		function WorkspaceSection() {
			const [data, setData] = useState(null);
			const [msg, setMsg] = useState("");

			const load = useCallback(() => {
				fetch("/api/dsh-about/workspace", { cache: "no-store" })
					.then((r) => r.json())
					.then((d) => { if (d && d.ok) setData(d.data); })
					.catch(() => setMsg("读取工作区失败"));
			}, []);
			useEffect(() => { load(); }, [load]);

			function openPath(p) {
				fetch("/api/dsh-about/workspace/open", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: p }) })
					.then((r) => r.json())
					.then((d) => setMsg(d && d.ok ? "已在资源管理器中打开" : ("打开失败：" + ((d && d.error) || ""))))
					.catch((e) => setMsg("打开失败：" + String(e)));
			}
			function forget(id) {
				if (!window.confirm("从工作区列表移除这个目录吗？（不会删除文件）")) return;
				fetch("/api/dsh-about/workspace/forget", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) })
					.then((r) => r.json())
					.then((d) => { setMsg(d && d.ok ? "已移除" : ("移除失败：" + ((d && d.error) || ""))); load(); })
					.catch((e) => setMsg("移除失败：" + String(e)));
			}

			const current = data && data.current;
			const list = (data && data.list) || [];
			return react.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } },
				react.createElement("div", { style: { fontSize: "13px", color: "var(--dsw-alias-label-secondary, #888)" } }, "当前工作区"),
				current
					? react.createElement("div", { style: { border: "1px solid var(--dsw-alias-border-l2, #eee)", borderRadius: 8, padding: "10px 12px" } },
							react.createElement("div", { style: S.label }, current.title),
							react.createElement("div", { style: S.path }, current.path),
							react.createElement("div", { style: { marginTop: "8px" } },
								react.createElement("button", { onClick: () => openPath(current.path), style: S.btn }, "在资源管理器中打开")
							)
						)
					: react.createElement("div", { style: S.msg }, "未读取到当前工作区"),
				react.createElement("div", { style: { fontSize: "13px", color: "var(--dsw-alias-label-secondary, #888)", marginTop: "8px" } }, "最近工作区"),
				list.length === 0
					? react.createElement("div", { style: S.msg }, "暂无记录")
					: list.map((w) =>
							react.createElement("div", { key: w.id, style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", borderBottom: "1px solid var(--dsw-alias-border-l2, #eee)", padding: "8px 0" } },
								react.createElement("div", null,
									react.createElement("div", { style: S.label }, w.title),
									react.createElement("div", { style: S.path }, w.path)
								),
								react.createElement("div", { style: { display: "flex", gap: "6px", flex: "none" } },
									react.createElement("button", { onClick: () => openPath(w.path), style: S.btn }, "打开"),
									react.createElement("button", { onClick: () => forget(w.id), style: S.btn }, "移除")
								)
							)
						),
				msg ? react.createElement("div", { style: S.msg }, msg) : null
			);
		}

		// ==================== /usage 富卡片 ====================
		function fmtMoney2(v) {
			const n = Number(v);
			return Number.isFinite(n) ? n.toFixed(2) : "–";
		}
		function fmtTokens(n) {
			const x = Number(n) || 0;
			return x.toLocaleString();
		}

		function UsageCard() {
			const [data, setData] = useState(null);
			const [err, setErr] = useState("");
			const [loading, setLoading] = useState(true);

			const load = useCallback(() => {
				setLoading(true);
				setErr("");
				fetch("/api/ds-zhuzhu-use/usage-card", { cache: "no-store" })
					.then((r) => r.json())
					.then((d) => {
						if (d && d.ok) setData(d.data);
						else setErr((d && d.error) || "获取失败");
					})
					.catch((e) => setErr("获取失败：" + String(e)))
					.finally(() => setLoading(false));
			}, []);
			useEffect(() => { load(); }, [load]);

			if (loading) {
				return react.createElement("div", { style: { border: "1px solid var(--dsw-alias-border-l2, #e5e5e5)", borderRadius: 14, padding: "14px 16px", background: "var(--dsw-alias-bg-layer-1, #fff)" } },
					react.createElement("span", { style: { fontSize: 12, color: "var(--dsw-alias-label-secondary, #888)" } }, "正在获取用量…"));
			}
			if (err || !data) {
				return react.createElement("div", { style: { border: "1px solid var(--dsw-alias-state-error-primary, #dc2626)", borderRadius: 14, padding: "14px 16px", background: "var(--dsw-alias-bg-layer-1, #fff)" } },
					react.createElement("div", { style: { fontSize: 12, color: "var(--dsw-alias-state-error-primary, #dc2626)" } }, "用量获取失败：" + (err || "未知错误")),
					react.createElement("button", { onClick: load, style: { ...S.btn, marginTop: 8 } }, "重试"));
			}

			const p = data.period || {};
			const progress = data.progress || null;
			const isPeak = p.period === "peak";
			const theme = isPeak
				? { bg: "#fdecec", bar: "#dc2626", text: "#b91c1c" }
				: { bg: "#e8f7ef", bar: "#059669", text: "#047857" };
			const bal = data.balance && data.balance.ok ? data.balance.data : null;
			const balInfo = bal && bal.balance_infos && bal.balance_infos[0] ? bal.balance_infos[0] : null;
			const balanceNum = balInfo ? Number(balInfo.total_balance) : NaN;
			const usage = data.usage;
			const okUsage = usage && !usage.error;
			const todayCost = okUsage ? usage.today.cost : 0;
			const todayTokens = okUsage ? usage.today.tokens : 0;
			const currency = okUsage && usage.currency ? usage.currency : "CNY";

			const stat = (label, value, sub) =>
				react.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 2 } },
					react.createElement("div", { style: { fontSize: 11, color: "var(--dsw-alias-label-secondary, #888)" } }, label),
					react.createElement("div", { style: { fontSize: 14, fontWeight: 600, color: "var(--dsw-alias-label-primary, #222)" } }, value),
					sub ? react.createElement("div", { style: { fontSize: 10, color: "var(--dsw-alias-label-tertiary, #999)" } }, sub) : null
				);

			const progressLabel = progress
				? (progress.current === "peak" ? "梁文峰" : "梁文谷")
				: (isPeak ? "梁文峰" : "梁文谷");
			const nextLabel = progress
				? (progress.next === "peak" ? "梁文峰" : "梁文谷")
				: (p.nextName || "");

						const scope = data.scope || { key: "all", model: "all" };
			const scopeParts = [];
			if (scope.key !== "all") scopeParts.push(scope.key);
			if (scope.model !== "all") scopeParts.push(scope.model);
			const scopeLabel = scopeParts.join(" · ");
const cardStyle = {
				border: "1px solid " + (isPeak ? "rgba(220,38,38,.30)" : "rgba(5,150,105,.30)"),
				borderRadius: 12,
				padding: "14px 16px",
				background: "var(--dsw-alias-bg-layer-1, #fff)",
				boxShadow: "0 4px 16px rgba(0,0,0,.05)",
				maxWidth: 300,
				minWidth: 280,
			};
			return react.createElement("div", { style: cardStyle },
				react.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 } },
					react.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, minWidth: 0 } }, react.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--dsw-alias-label-primary, #222)" } }, "Usage"), scopeLabel ? react.createElement("span", { style: { fontSize: 10, color: "var(--dsw-alias-label-secondary, #888)", border: "1px solid var(--dsw-alias-border-l2, #e5e5e5)", borderRadius: 999, padding: "1px 7px", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, title: scopeLabel }, scopeLabel) : null),
					react.createElement("span", { style: { fontSize: 11, fontWeight: 600, color: theme.text, background: theme.bg, border: "1px solid " + (isPeak ? "rgba(220,38,38,.28)" : "rgba(5,150,105,.28)"), borderRadius: 999, padding: "2px 9px" } }, progressLabel)
				),
				react.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 14px" } },
					stat("今日消费", currency + " " + fmtMoney2(todayCost)),
					stat("余额", Number.isFinite(balanceNum) ? currency + " " + balanceNum.toFixed(2) : "查询失败")
				),
				usage && usage.error
					? react.createElement("div", { style: { marginTop: 10, fontSize: 10, color: "var(--dsw-alias-state-error-primary, #dc2626)" } }, "用量查询失败：" + usage.error + "（可重新设置平台令牌）")
					: null
			);
		}

		// ==================== 通用设置：Usage 显示范围 ====================
		// 平台用量的真实维度是 (API Key × 模型)，这里选一个口径存到宿主侧，
		// /usage 卡片和 /usage 指令共用同一份设置。
		function UsageScopeRow() {
			const [data, setData] = useState(null);
			const [msg, setMsg] = useState("");
			const [busy, setBusy] = useState(false);

			const load = useCallback(() => {
				fetch("/api/ds-zhuzhu-use/scope", { cache: "no-store" })
					.then((r) => r.json())
					.then((d) => {
						if (d && d.ok) { setData(d.data); setMsg(d.data.error || ""); }
						else setMsg((d && d.error) || "读取失败");
					})
					.catch((e) => setMsg("读取失败：" + String(e)));
			}, []);
			useEffect(() => { load(); }, [load]);

			function save(next) {
				setBusy(true);
				setMsg("");
				fetch("/api/ds-zhuzhu-use/scope/set", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ scope: next }),
				})
					.then((r) => r.json())
					.then((d) => { if (d && d.ok) setData({ ...(data || {}), scope: d.scope }); else setMsg((d && d.error) || "保存失败"); })
					.catch((e) => setMsg("保存失败：" + String(e)))
					.finally(() => setBusy(false));
			}

			const scope = (data && data.scope) || { key: "all", model: "all" };
			const options = (data && data.options) || { keys: [], models: [] };

			return react.createElement("div", { style: S.row },
				react.createElement("div", { style: { minWidth: 0 } },
					react.createElement("div", { style: S.label }, "Usage 显示范围"),
					react.createElement("div", { style: S.sub }, "按平台上的 API Key / 模型筛选 /usage 卡片与指令的口径"),
					msg ? react.createElement("div", { style: { ...S.sub, color: "var(--dsw-alias-state-error-primary, #c0392b)" } }, msg) : null
				),
				react.createElement("div", { style: { display: "flex", gap: 6, flex: "none" } },
					react.createElement("select", {
						value: scope.key,
						disabled: busy || options.keys.length === 0,
						onChange: (e) => save({ key: e.target.value, model: scope.model }),
						style: S.select
					},
						react.createElement("option", { value: "all" }, "全部 API Key"),
						options.keys.map((k) => react.createElement("option", { key: k.name, value: k.name }, k.name))
					),
					react.createElement("select", {
						value: scope.model,
						disabled: busy || options.models.length === 0,
						onChange: (e) => save({ key: scope.key, model: e.target.value }),
						style: S.select
					},
						react.createElement("option", { value: "all" }, "全部模型"),
						options.models.map((m) => react.createElement("option", { key: m, value: m }, m))
					)
				)
			);
		}


		// ==================== 左侧栏：工作区 / Chat 两个入口 ====================
		// 官方 sidebar.panellist 是「全局面板登记表」：列表项的 id 就是 main 插槽的 key。
		// conversation 是内核保留的 key（原本的 agent 工作区），chat 是我们新加的纯聊天面板。
		const CHAT_URL = "https://chat.deepseek.com/";

		function panelGlyph(kind, size, active) {
			const s = size || 16;
			const color = active ? "var(--dsw-alias-label-primary, #222)" : "var(--dsw-alias-label-secondary, #888)";
			const common = { width: s, height: s, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" };
			if (kind === "chat") {
				return react.createElement("svg", common,
					react.createElement("path", {
						d: "M2.6 3.6h10.8a1 1 0 0 1 1 1v5.6a1 1 0 0 1-1 1H7.2l-3.1 2.3a.4.4 0 0 1-.64-.32V11.2h-.86a1 1 0 0 1-1-1V4.6a1 1 0 0 1 1-1Z",
						stroke: color, strokeWidth: 1.2, strokeLinejoin: "round"
					})
				);
			}
			return react.createElement("svg", common,
				react.createElement("rect", { x: 2, y: 3.2, width: 12, height: 9.6, rx: 1.4, stroke: color, strokeWidth: 1.2 }),
				react.createElement("path", { d: "M6.2 3.2v9.6", stroke: color, strokeWidth: 1.2 })
			);
		}

		function WorkspacePanelIcon(props) {
			return panelGlyph("workspace", props && props.size, props && props.active);
		}
		function ChatPanelIcon(props) {
			return panelGlyph("chat", props && props.size, props && props.active);
		}

		// webviewTag 没开的时候 <webview> 只是个死元素，这里做个探测好给出人话提示。
		function webviewAvailable() {
			try {
				const probe = document.createElement("webview");
				return typeof probe.getWebContentsId === "function";
			} catch (_) {
				return false;
			}
		}

		function fitWebview(el) {
			if (!el) return;
			el.style.width = "100%";
			el.style.height = "100%";
		el.style.minHeight = "0";
		el.style.flex = "1 1 auto";
			el.style.display = "flex";
			el.style.border = "0";
		}

		// 站点看到 UA 里的 "Electron/xx" 会弹「使用环境异常」。UA 由外壳启动时按当前
		// Chromium 版本设在 webview 分区上（免写死、跟着内核走）；这里只负责同步内容。
		const CHAT_SYNC_MS = 5000;

		// —— Chat 常驻表面：切面板不再销毁 webview ——
		// 官方 keyed 主槽一次只挂**一个**条目（ui-renderer 的 scoped-slots.tsx:806-812：
		// 一个 find + 单个 guarded 渲染）。所以以前挂在 main:"chat" 上的 webview，每次切回
		// 工作区都会被 React 连根卸载 —— Electron 规定 <webview> 一旦离开 DOM 就销毁整个
		// guest，再点回来等于重新加载一遍 chat.deepseek.com：这是「等一会儿」；而 guest 还在
		// 加载时被销毁，销毁动作跑在渲染进程的主线程上，表现就是「干脆不返回」。
		// 现在把 webview 搬进常驻的 shell.overlay（和宠物一个座位），main 的 chat 条目只留一个
		// 占位锚点，用来量出 webview 该落在哪；切面板只改容器 display，webview 一次都不销毁。
		const CHAT_ANCHOR_ATTR = "data-ds-zhuzhu-chat-anchor";
		const CHAT_HOST_ATTR = "data-ds-zhuzhu-chat-host";
		// 锚点和本体住在**两个不同的插槽**里，中间这根线走 window 事件而不是模块变量：
		// 事件不会因为「谁先挂载 / 模块被加载几次」而丢，重放一次就能自愈。
		const CHAT_EVENT = "ds-zhuzhu-chat-surface";
		const CHAT_REQUEST = "ds-zhuzhu-chat-request";

		function publishChatSurface(detail) {
			try { window.dispatchEvent(new CustomEvent(CHAT_EVENT, { detail })); } catch (_) { /* 派发失败不影响别的 */ }
		}

		// main 的 key:"chat" 条目：只占位 + 报尺寸，webview 不在这里。
		function ChatAnchor() {
			const ref = useRef(null);
			useEffect(() => {
				const el = ref.current;
				if (!el) return undefined;
				const push = () => {
					const box = el.isConnected ? el.getBoundingClientRect() : null;
					if (!box || box.width < 2 || box.height < 2) { publishChatSurface({ visible: false }); return; }
					// 报的是**视口坐标**：浮层里的容器用 position:fixed 定位，跟宠物浮层同一套。
					publishChatSurface({ visible: true, rect: { left: box.left, top: box.top, width: box.width, height: box.height } });
				};
				const ro = (typeof ResizeObserver === "function") ? new ResizeObserver(push) : null;
				if (ro) ro.observe(el);
				window.addEventListener("resize", push);
				window.addEventListener(CHAT_REQUEST, push);   // 握手：本体后到就问一次
				push();
				// 侧栏/右栏收展是 CSS 过渡，几何逐帧都在动：过渡收尾后再补一拍。
				const settle = setTimeout(push, 450);
				return () => {
					if (ro) ro.disconnect();
					window.removeEventListener("resize", push);
					window.removeEventListener(CHAT_REQUEST, push);
					clearTimeout(settle);
					publishChatSurface({ visible: false });
				};
			}, []);
			return react.createElement("div", {
				[CHAT_ANCHOR_ATTR]: "1",
				ref,
				style: { width: "100%", height: "100%", minWidth: 0, minHeight: 0 },
			});
		}

		// 常驻的 Chat 本体。active = 面板此刻被选中；不选中就整段轮询停掉，
		// 但 guest 不动、页面不重载 —— 再点回来是即时可见。
		function ChatSurface(props) {
			const active = !!(props && props.active);
			const [sync, setSync] = useState({ at: 0, state: "idle", msg: "" });
			const supported = webviewAvailable();

			// 面板开着的时候定期把页面可见文字同步到本地存档（宿主侧按天写 JSONL + latest.json）。
			useEffect(() => {
				if (!supported || !active) return undefined;
				let alive = true;
				const tick = () => {
					const api = window.dshChat;
					if (!api || typeof api.read !== "function") {
						setSync({ at: 0, state: "error", msg: "当前外壳不支持读取（需要 0.8.1+ 的外壳）" });
						return;
					}
					Promise.resolve()
						.then(() => api.read())
						.then((res) => {
							if (!alive) return undefined;
							if (!res || !res.ok) {
								setSync({ at: 0, state: "error", msg: (res && res.error) || "读取失败" });
								return undefined;
							}
							return fetch("/api/ds-zhuzhu-use/chat-snapshot", {
								method: "POST",
								headers: { "content-type": "application/json" },
								body: JSON.stringify({ url: res.url, title: res.title, text: res.text, messages: res.messages, rows: res.rows }),
							})
								.then((r) => r.json())
								.then((d) => {
									if (alive) {
										setSync({
											at: Date.now(),
											state: d && d.ok ? "ok" : "error",
											msg: d && d.ok ? "" : ((d && d.error) || "同步失败"),
											rows: (res.rows || 0),
											file: (d && d.file) || "",
										});
									}
								});
						})
						.catch((e) => {
							if (alive) setSync({ at: 0, state: "error", msg: String(e && e.message ? e.message : e) });
						});
				};
				tick();
				const timer = setInterval(tick, CHAT_SYNC_MS);
				return () => { alive = false; clearInterval(timer); };
			}, [supported, active]);

			if (!supported) {
				return react.createElement("div", { style: { flex: "1 1 auto", display: "flex", alignItems: "center", justifyContent: "center" } },
					react.createElement("div", { style: { textAlign: "center", display: "flex", flexDirection: "column", gap: 10, alignItems: "center" } },
						react.createElement("div", { style: { fontSize: 13, color: "var(--dsw-alias-label-secondary, #888)" } }, "当前外壳没有开启内嵌网页（webviewTag），Chat 面板无法显示。"),
						react.createElement("a", { href: CHAT_URL, target: "_blank", rel: "noreferrer", style: { fontSize: 13, color: "var(--dsw-alias-brand-primary, #0a3)" } }, "在浏览器里打开 chat.deepseek.com")
					)
				);
			}

			const pill = sync.state === "ok"
				? "已存 " + (sync.rows ? sync.rows + " 条 · " : "") + new Date(sync.at).toLocaleTimeString("zh-CN", { hour12: false })
				: (sync.state === "idle" ? "正在同步…" : "未同步 · " + sync.msg);

			return react.createElement("div", { style: { position: "relative", flex: "1 1 auto", minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", background: "var(--dsw-alias-bg-base, #fff)" } },
				react.createElement("webview", {
					src: CHAT_URL,
					allowpopups: "true",
					partition: "persist:dsh-fenggu-chat",
					ref: fitWebview,
					style: { flex: "1 1 auto", minHeight: 0, width: "100%" },
				}),
				react.createElement("div", {
      title: "网页内容会自动存到本地的 web-chat 目录，agent 用 /webchat 读取",
					style: {
						position: "absolute", right: 10, bottom: 10, maxWidth: 320,
						fontSize: 10, lineHeight: 1.3, padding: "3px 8px", borderRadius: 999,
						color: "var(--dsw-alias-label-secondary, #888)",
						background: "var(--dsw-alias-bg-layer-1, #fff)",
						border: "1px solid var(--dsw-alias-border-l2, #e5e5e5)",
						opacity: 0.86, pointerEvents: "none",
					}
				}, pill)
			);
		}

		// 常驻容器：第一次选中 Chat 才真的建 webview（不选中就不预加载站点），
		// 之后一直留着；没选中时只是 display:none —— 元素始终在 DOM 里，guest 不销毁。
		// 容器本身永远渲染（哪怕还没武装）：浮层插槽是 list 形态，槽位锚点元素一直在，
		// 有它我们才能量到自己的位置；没选中时 display:none，不占地方也不拦点击。
		function ChatOverlay() {
			const [surface, setSurface] = useState({ visible: false, rect: null });
			const [armed, setArmed] = useState(false);
			useEffect(() => {
				const onSurface = (event) => {
					const detail = (event && event.detail) || {};
					const rect = detail.visible === true && detail.rect ? detail.rect : null;
					setSurface({ visible: !!rect, rect });
					if (rect) setArmed(true);
				};
				window.addEventListener(CHAT_EVENT, onSurface);
				// 锚点比本体早挂载时，这一问就把当前状态补回来。
				try { window.dispatchEvent(new CustomEvent(CHAT_REQUEST)); } catch (_) { /* 没人在听就算了 */ }
				return () => { window.removeEventListener(CHAT_EVENT, onSurface); };
			}, []);
			const rect = surface.rect;
			const visible = !!rect && armed;
			return react.createElement("div", {
				[CHAT_HOST_ATTR]: "1",
				style: {
					position: "fixed",
					left: (rect ? rect.left : 0) + "px",
					top: (rect ? rect.top : 0) + "px",
					width: (rect ? rect.width : 0) + "px",
					height: (rect ? rect.height : 0) + "px",
					display: visible ? "flex" : "none",
					flexDirection: "column",
					minWidth: 0, minHeight: 0, overflow: "hidden",
					background: "var(--dsw-alias-bg-base, #fff)",
					zIndex: 1,
				}
			}, armed ? react.createElement(ChatSurface, { active: visible }) : null);
		}

		// ==================== 会话版本 ====================
		// 官方说回退内核后新格式会话不显示。这里用随插件发布的工具把「新代」隐藏起来
		// （原文件一个字节都不动），旧内核就会回落到它认得的旧代 —— 可逆。
		function fmtAge(ms) {
			if (ms == null || !Number.isFinite(ms)) return "";
			const mins = Math.round(ms / 60000);
			if (mins < 1) return "刚刚";
			if (mins < 60) return mins + " 分钟前";
			const hours = Math.round(mins / 60);
			if (hours < 48) return hours + " 小时前";
			return Math.round(hours / 24) + " 天前";
		}

		function shortProject(name) {
			const m = /^--(.+?)--$/.exec(String(name || ""));
			const raw = m ? m[1] : String(name || "");
			return raw.replace(/~0020/g, " ").replace(/-/g, " ").trim() || raw;
		}

		function SessionsSection() {
			const [list, setList] = useState(null);
			const [msg, setMsg] = useState("");
			const [busy, setBusy] = useState("");
			const [showAll, setShowAll] = useState(false);

			const load = useCallback(() => {
				setMsg("");
				fetch("/api/dsh-about/sessions", { cache: "no-store" })
					.then((r) => r.json())
					.then((d) => { if (d && d.ok) setList(d.data || []); else setMsg((d && d.error) || "读取失败"); })
					.catch((e) => setMsg("读取失败：" + String(e)));
			}, []);
			useEffect(() => { load(); }, [load]);

			function run(session, action, gen) {
				const verb = action === "hide" ? "隐藏" : "恢复";
				const tip = action === "hide"
					? "确定降级这个会话吗？\n\n会把 v" + gen + " 这一代改名成 .hidden-generation（不删除、不修改内容），\n运行时就回落到更低的代，旧内核也能读到它。"
					: "确定恢复吗？\n\n把 v" + gen + " 这一代改回正常文件名，运行时重新以它为最新代。";
				if (!window.confirm(tip)) return;
				setBusy(session.id + ":" + action);
				setMsg("");
				fetch("/api/dsh-about/sessions/action", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ id: session.id, action, gen, write: true }),
				})
					.then((r) => r.json())
					.then((d) => {
						setMsg(d && d.ok ? ("已完成：" + String(d.output || "").split(/\r?\n/).filter(Boolean).slice(-2).join(" / ")) : ("失败：" + ((d && d.error) || (d && d.output) || "未知错误")));
						load();
					})
					.catch((e) => setMsg("失败：" + String(e)))
					.finally(() => setBusy(""));
			}

			const rows = (list || []).map((s) => {
				const visible = s.generations.filter((g) => !g.hidden).sort((a, b) => b.version - a.version);
				const hidden = s.generations.filter((g) => g.hidden).sort((a, b) => b.version - a.version);
				return {
					...s,
					visible,
					hidden,
					newest: visible[0] || null,
					downgradeTo: visible.length > 1 ? visible[1].version : null,
					restoreGen: hidden.length ? hidden[0].version : null,
				};
			});
			const actionable = rows.filter((r) => r.downgradeTo !== null || r.restoreGen !== null);
			const shown = showAll ? rows : actionable;

			return react.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10 } },
				react.createElement("div", { style: { fontSize: 13, color: "var(--dsw-alias-label-secondary, #888)" } },
					"回退内核后旧版本读不了新格式的会话。这里把「新代」隐藏起来让运行时回落到旧代；文件不删不改，随时可恢复。"),
				react.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } },
					react.createElement("button", { onClick: load, style: S.btn }, "刷新"),
					react.createElement("button", { onClick: () => setShowAll((v) => !v), style: S.btn }, showAll ? "只看可操作的" : "显示全部会话"),
					react.createElement("span", { style: S.msg }, list ? (rows.length + " 个会话，其中 " + actionable.length + " 个可降级/可恢复") : "正在读取…")
				),
				msg ? react.createElement("div", { style: { ...S.msg, color: "var(--dsw-alias-state-error-primary, #c0392b)" } }, msg) : null,
				react.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6, maxHeight: 360, overflowY: "auto" } },
					shown.length === 0
						? react.createElement("div", { style: S.msg }, list ? "没有需要处理的会话。" : "")
						: shown.map((r) => react.createElement("div", {
								key: r.id,
								style: { border: "1px solid var(--dsw-alias-border-l2, #eee)", borderRadius: 8, padding: "8px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }
							},
								react.createElement("div", { style: { minWidth: 0 } },
									react.createElement("div", { style: S.label }, shortProject(r.project) + " · v" + (r.active == null ? "?" : r.active) + (r.newest ? "  " + fmtAge(r.ageMs) : "")),
									react.createElement("div", { style: S.path }, r.id),
									react.createElement("div", { style: S.sub }, "文件：" + r.generations.map((g) => "v" + g.version + (g.hidden ? "(已隐藏)" : "")).join("、"))
								),
								react.createElement("div", { style: { display: "flex", gap: 6, flex: "none" } },
									r.downgradeTo !== null
										? react.createElement("button", {
												onClick: () => run(r, "hide", r.newest.version),
												disabled: busy === r.id + ":hide",
												style: { ...S.btn, opacity: busy === r.id + ":hide" ? 0.5 : 1 }
											}, "降级到 v" + r.downgradeTo)
										: null,
									r.restoreGen !== null
										? react.createElement("button", {
												onClick: () => run(r, "show", r.restoreGen),
												disabled: busy === r.id + ":show",
												style: { ...S.btn, opacity: busy === r.id + ":show" ? 0.5 : 1 }
											}, "恢复 v" + r.restoreGen)
										: null
								)
							))
				)
			);
		}


		// ==================== 更新（常驻状态 + 弹窗） ====================
		// 设计要点：下载状态活在宿主进程里，前端只做投影。弹窗关掉、面板切走，
		// 侧栏入口照样显示进度；回来接着看，不会「显示一点就没了」。
		const UPDATE_SNOOZE_KEY = "ds-zhuzhu-use.update.snooze";
		const UPDATE_CHECK_MS = 30 * 60 * 1000;
		const DL_IDLE = { phase: "idle", tag: "", received: 0, total: 0, speed: 0, error: "", path: "", ready: false, partBytes: 0, fileBytes: 0 };

		// 转圈用的关键帧，只注入一次
		(function ensureSpin() {
			try {
				if (document.querySelector("style[data-ds-zhuzhu-use-spin]")) return;
				const tag = document.createElement("style");
				tag.dataset.dsZhuzhuUseSpin = "1";
				tag.textContent = "@keyframes dsZhuzhuUseSpin{to{transform:rotate(360deg)}}";
				document.head.appendChild(tag);
			} catch (_) {}
		})();

		function readLocal(key, fallback) {
			try {
				const raw = window.localStorage.getItem(key);
				return raw ? JSON.parse(raw) : fallback;
			} catch (_) {
				return fallback;
			}
		}
		function writeLocal(key, value) {
			try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
		}
		function isSnoozed(tag) {
			const until = readLocal(UPDATE_SNOOZE_KEY, {})[tag];
			return typeof until === "number" && until > Date.now();
		}
		function snooze(tag, ms) {
			const map = readLocal(UPDATE_SNOOZE_KEY, {});
			map[tag] = Date.now() + ms;
			writeLocal(UPDATE_SNOOZE_KEY, map);
		}

		const updateStore = {
			info: null,
			releases: [],
			checked: false,
			loading: false,
			loadError: "",
			latest: null,
			modal: false,
			logOpen: true,
			errOpen: false,
			errTitle: "",
			errText: "",
			msg: "",
			busy: "",
			dl: { ...DL_IDLE },
		};
		const updateListeners = new Set();
		function setUpdate(patch) {
			Object.assign(updateStore, patch);
			updateListeners.forEach((fn) => { try { fn(); } catch (_) {} });
		}
		function useUpdateStore() {
			const [, force] = react.useState(0);
			react.useEffect(() => {
				const fn = () => force((n) => n + 1);
				updateListeners.add(fn);
				return () => { updateListeners.delete(fn); };
			}, []);
			return updateStore;
		}
		function showError(title, text) {
			setUpdate({ errOpen: true, errTitle: title, errText: String(text || "") });
		}

		/** 所有下载/安装动作都打同一个接口族，回包直接覆盖本地投影。 */
		function dlCall(action, payload) {
			setUpdate({ busy: action });
			return fetch("/api/dsh-about/" + action, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(payload || {}),
			})
				.then((r) => r.json())
				.then((res) => {
					if (res && res.ok && res.data) setUpdate({ dl: { ...res.data } });
					else if (res && res.ok) setUpdate({ dl: { ...DL_IDLE } });
					else showError("操作失败", (res && res.error) || "宿主没有返回结果");
					return res;
				})
				.catch((e) => {
					showError("操作失败", String(e));
					return null;
				})
				.finally(() => setUpdate({ busy: "" }));
		}

		function startDownload(tag, url, install) {
			if (!tag) return Promise.resolve(null);
			if (updateStore.dl.phase === "downloading") return Promise.resolve(null);
			setUpdate({ modal: true });
			return dlCall(install ? "update" : "download", { tag, url });
		}
		const pauseDownload = () => dlCall("pause");
		const resumeDownload = () => dlCall("resume");
		const deleteDownload = () => dlCall("delete");
		const installDownloaded = () => dlCall("install");
const revealInstallerFile = () => dlCall("reveal");

		function checkUpdate(force) {
			if (updateStore.loading) return Promise.resolve();
			setUpdate({ loading: true, loadError: "" });
			const relReq = force
				? fetch("/api/dsh-about/releases/refresh", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).then((r) => r.json())
				: fetch("/api/dsh-about/releases", { cache: "no-store" }).then((r) => r.json());
			return Promise.all([
				fetch("/api/dsh-about/info", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
				relReq.catch((e) => ({ ok: false, error: String(e) })),
			])
				.then((results) => {
					const info = results[0] && results[0].ok ? results[0].data : null;
					const rel = results[1];
					if (!rel || !rel.ok) {
						const why = (rel && rel.error) || "版本列表获取失败";
						setUpdate({ loading: false, loadError: why });
						if (force) showError("刷新失败", why);
						return;
					}
					const releases = rel.data || [];
					const current = info && info.appVersion && info.appVersion !== "unknown" ? "v" + info.appVersion : "";
					let latest = null;
					for (const r of releases) {
						if (!r.asset) continue;
						if (!latest || cmpVer(r.tag, latest.tag) > 0) latest = r;
					}
					const newer = !!(latest && current && cmpVer(latest.tag, current) > 0);
					const patch = { info, releases, loading: false, checked: true, loadError: rel.warning || "" };
					patch.latest = newer ? latest : null;
					if (newer && !isSnoozed(latest.tag)) patch.modal = true;
					setUpdate(patch);
					if (force && rel.warning) showError("刷新有问题", rel.warning);
				})
				.catch((e) => {
					setUpdate({ loading: false, loadError: String(e) });
					if (force) showError("刷新失败", String(e));
				});
		}

		/** 下载进度投影：只在有活动时轮询，停下就自动停。 */
		function useUpdatePoll() {
			const st = useUpdateStore();
			const active = st.dl.phase === "downloading" || st.dl.phase === "installing" || !!st.busy;
			react.useEffect(() => {
				let alive = true;
				const tick = () => {
					fetch("/api/dsh-about/update-state", { cache: "no-store" })
						.then((r) => r.json())
						.then((d) => { if (alive && d && d.ok && d.data) setUpdate({ dl: { ...d.data } }); })
						.catch(() => {});
				};
				tick();
				if (!active) return () => { alive = false; };
				const timer = setInterval(tick, 700);
				return () => { alive = false; clearInterval(timer); };
			}, [active]);
			return st;
		}

		const US = {
			bar: { height: 6, borderRadius: 3, background: "var(--dsw-alias-bg-layer-2, #eceff3)", overflow: "hidden", flex: 1, minWidth: 80 },
			barFill: { height: "100%", background: "var(--dsw-alias-button-primary-fill, #0a3)", transition: "width .25s ease" },
			small: { fontSize: 11, color: "var(--dsw-alias-label-secondary, #888)", whiteSpace: "nowrap" },
			err: { fontSize: 11, color: "var(--dsw-alias-state-error-primary, #dc2626)" },
			icon: { width: 26, height: 26, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 7, border: "1px solid var(--dsw-alias-border-l2, #ddd)", background: "var(--dsw-alias-bg-layer-1, #fff)", cursor: "pointer", color: "var(--dsw-alias-label-primary, #333)", flex: "none", padding: 0, fontSize: 12, lineHeight: 1 },
		};

		function Spinner(props) {
			const size = (props && props.size) || 12;
			return react.createElement("span", {
				style: { display: "inline-block", width: size, height: size, border: "2px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", animation: "dsZhuzhuUseSpin .8s linear infinite" },
			});
		}

		function pctOf(d) {
			if (!d || !d.total) return null;
			return Math.max(0, Math.min(100, Math.round((d.received / d.total) * 100)));
		}
		function dlLine(d) {
			const pct = pctOf(d);
			const left = pct === null ? fmtSize(d.received) : pct + "%";
			const right = d.total ? fmtSize(d.received) + " / " + fmtSize(d.total) : "";
			const speed = d.speed ? fmtSize(d.speed) + "/s" : "";
			return [left, right, speed].filter(Boolean).join(" · ");
		}

		/** 进度条 + 右侧动作：下载中给暂停，暂停/出错给继续，完成给删除+安装。 */
		function DownloadBar(props) {
			const d = (props && props.data) || UPDATE_IDLE_DL();
			const compact = !!(props && props.compact);
			const pct = pctOf(d);
			const active = d.phase === "downloading";
			const paused = d.phase === "paused";
			const ready = d.phase === "ready" || (d.phase !== "downloading" && d.ready);
			const busy = !!props.busy;

			return react.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, width: "100%" } },
				react.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 } },
					react.createElement("div", { style: US.bar },
						react.createElement("div", { style: { ...US.barFill, width: (pct === null ? (active ? 8 : 0) : pct) + "%" } })
					),
					!compact ? react.createElement("div", { style: US.small }, d.tag + "　" + dlLine(d)) : null
				),
				active
					? react.createElement("button", { title: "暂停下载", onClick: pauseDownload, disabled: busy, style: US.icon }, "❚❚")
					: null,
				paused
					? react.createElement("button", { title: "继续下载", onClick: resumeDownload, disabled: busy, style: US.icon }, "▶")
					: null,
				ready
					? react.createElement("button", { title: "删除安装包", onClick: deleteDownload, disabled: busy, style: US.icon }, "🗑")
					: null,
				ready
					? react.createElement("button", { title: "立即安装", onClick: installDownloaded, disabled: busy, style: { ...US.icon, width: "auto", padding: "0 10px", color: "var(--dsw-alias-button-primary-foreground, #fff)", background: "var(--dsw-alias-button-primary-fill, #0a3)", border: "none" } }, busy ? "…" : "安装")
					: null
			);
		}
		const UPDATE_IDLE_DL = () => ({ ...DL_IDLE });

		/** 错误小窗：原始报错可复制。 */
		function ErrorWindow() {
			const st = useUpdateStore();
			if (!st.errOpen) return null;
			return react.createElement("div", { style: { position: "fixed", inset: 0, background: "rgba(15,18,23,.4)", zIndex: 2147483200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }, onClick: (e) => { if (e.target === e.currentTarget) setUpdate({ errOpen: false }); } },
				react.createElement("div", { style: { width: 520, maxWidth: "100%", maxHeight: "70vh", display: "flex", flexDirection: "column", background: "var(--dsw-alias-bg-layer-1, #fff)", borderRadius: 12, boxShadow: "0 18px 60px rgba(0,0,0,.28)", overflow: "hidden" } },
					react.createElement("div", { style: { padding: "12px 16px", fontSize: 14, fontWeight: 600, borderBottom: "1px solid var(--dsw-alias-border-l2, #eee)" } }, st.errTitle || "出错了"),
					react.createElement("textarea", {
						readOnly: true,
						value: st.errText,
						style: { flex: 1, minHeight: 160, margin: 0, padding: "12px 16px", border: "none", outline: "none", resize: "vertical", fontFamily: "Consolas, monospace", fontSize: 12, lineHeight: 1.5, color: "var(--dsw-alias-label-primary, #333)", background: "var(--dsw-alias-bg-layer-1, #fff)" },
						onFocus: (e) => e.target.select(),
					}),
					react.createElement("div", { style: { display: "flex", justifyContent: "flex-end", gap: 8, padding: "10px 16px", borderTop: "1px solid var(--dsw-alias-border-l2, #eee)" } },
						react.createElement("button", { onClick: () => setUpdate({ errOpen: false }), style: S.btnPrimary }, "关闭")
					)
				)
			);
		}

		function renderInline(text, keyBase) {
			const parts = [];
			const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
			let last = 0;
			let m;
			let k = 0;
			while ((m = re.exec(text)) !== null) {
				if (m.index > last) parts.push(text.slice(last, m.index));
				const token = m[0];
				if (token.indexOf("**") === 0) parts.push(react.createElement("strong", { key: keyBase + "-b" + k++ }, token.slice(2, -2)));
				else parts.push(react.createElement("code", { key: keyBase + "-c" + k++, style: { fontSize: "0.92em", background: "var(--dsw-alias-bg-layer-2, #f1f3f5)", padding: "0 3px", borderRadius: 3 } }, token.slice(1, -1)));
				last = re.lastIndex;
			}
			if (last < text.length) parts.push(text.slice(last));
			return parts;
		}

		// GitHub release 正文里最常见的那几种写法：标题 / 列表 / 引用块 / 粗体 / 行内代码。
		function renderChangelog(body) {
			const lines = String(body || "").split(/\r?\n/);
			const out = [];
			lines.forEach((raw, i) => {
				const line = raw.replace(/\s+$/, "");
				if (!line.trim()) { out.push(react.createElement("div", { key: "s" + i, style: { height: 6 } })); return; }
				const heading = /^#{1,6}\s+(.*)$/.exec(line);
				if (heading) {
					out.push(react.createElement("div", { key: "h" + i, style: { fontWeight: 600, marginTop: 10, marginBottom: 2 } }, renderInline(heading[1], "h" + i)));
					return;
				}
				const quote = /^>\s?(.*)$/.exec(line);
				if (quote) {
					out.push(react.createElement("div", { key: "q" + i, style: { borderLeft: "3px solid var(--dsw-alias-border-l2, #ddd)", paddingLeft: 8, marginTop: 4, color: "var(--dsw-alias-label-secondary, #777)" } }, renderInline(quote[1], "q" + i)));
					return;
				}
				const bullet = /^[-*]\s+(.*)$/.exec(line);
				if (bullet) {
					out.push(react.createElement("div", { key: "l" + i, style: { display: "flex", gap: 6, marginTop: 2 } },
						react.createElement("span", { style: { opacity: 0.55, flex: "none" } }, "•"),
						react.createElement("span", { style: { flex: 1, minWidth: 0 } }, renderInline(bullet[1], "l" + i))
					));
					return;
				}
				out.push(react.createElement("div", { key: "p" + i, style: { marginTop: 2 } }, renderInline(line, "p" + i)));
			});
			if (out.length === 0) out.push(react.createElement("div", { key: "empty", style: { opacity: 0.6 } }, "这个版本没有写更新说明。"));
			return out;
		}

		function UpdateModal() {
			const st = useUpdateStore();
			const latest = st.latest;
			const d = st.dl || UPDATE_IDLE_DL();
			if (!st.modal || !latest) return null;

			const current = (st.info && st.info.appVersion) || "";
			const sizeText = (latest.asset && fmtSize(latest.asset.size)) || "";
			const active = d.phase === "downloading";
			const paused = d.phase === "paused";
			const ready = d.phase === "ready" || (d.phase !== "downloading" && d.ready);
			const installing = d.phase === "installing";
			const failed = d.phase === "error";
			const busy = !!st.busy;

			const close = () => setUpdate({ modal: false });
			const snoozeDay = () => { snooze(latest.tag, 24 * 60 * 60 * 1000); setUpdate({ modal: false }); };
			const snoozeForever = () => { snooze(latest.tag, 3650 * 24 * 60 * 60 * 1000); setUpdate({ modal: false }); };

			return react.createElement("div", { style: { position: "fixed", inset: 0, background: "rgba(15,18,23,.38)", zIndex: 2147483100, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }, onClick: (e) => { if (e.target === e.currentTarget) close(); } },
				react.createElement("div", { style: { width: 640, maxWidth: "100%", maxHeight: "82vh", display: "flex", flexDirection: "column", background: "var(--dsw-alias-bg-layer-1, #fff)", borderRadius: 14, boxShadow: "0 18px 60px rgba(0,0,0,.28)", overflow: "hidden" } },
					react.createElement("div", { style: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "16px 18px 10px" } },
						react.createElement("div", null,
							react.createElement("div", { style: { fontSize: 15, fontWeight: 600 } }, "发现新版本 " + latest.tag),
							react.createElement("div", { style: US.small }, "当前 " + (current ? "v" + current : "未知") + (sizeText ? "　·　安装包 " + sizeText : ""))
						),
						react.createElement("button", { onClick: close, title: "关闭", style: { fontSize: 16, lineHeight: 1, padding: "2px 6px", border: "none", background: "none", color: "var(--dsw-alias-label-secondary, #999)", cursor: "pointer" } }, "✕")
					),

					react.createElement("div", { style: { padding: "0 18px" } },
						react.createElement("button", {
							onClick: () => setUpdate({ logOpen: !st.logOpen }),
							style: { display: "flex", alignItems: "center", gap: 6, border: "none", background: "none", color: "var(--dsw-alias-brand-primary, #0a3)", cursor: "pointer", padding: "4px 0", fontSize: 12 },
						}, (st.logOpen ? "▾ " : "▸ ") + "更新说明")
					),
					st.logOpen ? react.createElement("div", { style: { padding: "0 18px 8px", overflowY: "auto", maxHeight: "38vh", fontSize: 12.5, lineHeight: 1.62 } }, renderChangelog(latest.body)) : null,

					(active || paused || ready || installing || failed || d.partBytes > 0)
						? react.createElement("div", { style: { padding: "8px 18px 4px" } },
								failed
									? react.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
											react.createElement("span", { style: { ...US.err, flex: 1 } }, "下载出错：" + d.error),
											react.createElement("button", { onClick: () => showError("下载出错", d.error), style: US.icon, title: "查看报错" }, "!"),
											react.createElement("button", { onClick: resumeDownload, disabled: busy, style: US.icon, title: "重试" }, "↻")
										)
									: installing
										? (d.installStarted
										  ? react.createElement("div", { style: US.small }, "安装程序已启动，按提示完成即可 —— 它会在开装时自己关掉本窗口。")
										  : d.installNote
										    ? react.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
										        react.createElement("span", { style: { ...US.err, flex: 1 } }, d.installNote),
										        react.createElement("button", { onClick: revealInstallerFile, style: US.icon, title: "在资源管理器里定位" }, "📂"),
										        react.createElement("button", { onClick: () => showError("安装程序没能启动", [d.installNote, "文件：" + (d.path || ""), "", "可以直接在资源管理器里双击安装包。"].join("\n")), style: US.icon, title: "查看详情" }, "!")
										      )
										    : react.createElement("div", { style: US.small }, "正在启动安装程序…"))
										: react.createElement(DownloadBar, { data: d, busy: busy })
							)
						: null,

					react.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "12px 18px 16px", borderTop: "1px solid var(--dsw-alias-border-l2, #eee)", flexWrap: "wrap" } },
						react.createElement("a", {
							href: latest.htmlUrl || "https://github.com/GengruiZhu/deepseek-harness-desktop-on-windows/releases",
							target: "_blank",
							rel: "noreferrer",
							style: { fontSize: 12, color: "var(--dsw-alias-brand-primary, #0a3)", marginRight: "auto" },
						}, "在 GitHub 上查看"),
						(active || paused || ready || installing) ? null : react.createElement("button", { onClick: snoozeDay, style: S.btn }, "稍后提醒"),
						(active || paused || ready || installing) ? null : react.createElement("button", { onClick: snoozeForever, style: S.btn }, "跳过此版本"),
						ready
							? null
							: react.createElement("button", {
									onClick: () => (active || paused) ? null : startDownload(latest.tag, latest.asset ? latest.asset.url : "", false),
									disabled: busy || active || paused || installing,
									style: { ...S.btnPrimary, opacity: (busy || active || paused || installing) ? 0.5 : 1 },
								}, active ? "下载中…" : (paused ? "已暂停" : "下载"))
					)
				)
			);
		}

		/** 侧栏底部常驻入口：没新版就完全不渲染，有新版/有下载就一直在。 */
		function UpdateFooterAction() {
			const st = useUpdatePoll();

			react.useEffect(() => {
				checkUpdate(false);
				const timer = setInterval(() => checkUpdate(false), UPDATE_CHECK_MS);
				return () => clearInterval(timer);
			}, []);

			const d = st.dl || UPDATE_IDLE_DL();
			const downloading = d.phase === "downloading";
			const paused = d.phase === "paused";
			const ready = d.phase === "ready" || (d.phase !== "downloading" && d.ready);
			const failed = d.phase === "error";
			const hasUpdate = !!st.latest;
			if (!hasUpdate && !downloading && !paused && !ready && !failed) return null;

			const pct = pctOf(d);
			const label = downloading
				? "下载中 " + (pct === null ? fmtSize(d.received) : pct + "%")
				: paused
					? "已暂停 " + (pct === null ? "" : pct + "%")
					: ready
						? "待安装 " + d.tag
						: failed
							? "更新出错"
							: "有新版 " + (st.latest ? st.latest.tag : "");

			return react.createElement(react.Fragment, null,
				react.createElement("button", {
					onClick: () => setUpdate({ modal: true }),
					title: label,
					style: { display: "flex", flexDirection: "column", gap: 4, width: "100%", padding: "7px 10px", marginBottom: 4, borderRadius: 8, border: "none", background: "none", cursor: "pointer", textAlign: "left" },
				},
					react.createElement("span", { style: { display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: failed ? "var(--dsw-alias-state-error-primary, #dc2626)" : "var(--dsw-alias-brand-primary, #0a3)" } },
						react.createElement("span", { style: { width: 7, height: 7, borderRadius: 999, flex: "none", background: failed ? "#e5484d" : (ready ? "#0a3" : "#f59e0b") } }),
						react.createElement("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, label)
					),
					(downloading || paused) ? react.createElement("span", { style: { ...US.bar, height: 4 } },
						react.createElement("span", { style: { ...US.barFill, display: "block", width: (pct === null ? 8 : pct) + "%" } })
					) : null
				),
				react.createElement(UpdateModal, null),
				
				react.createElement(ErrorWindow, null)
			);
		}


		// ==================== 文档预览扩展：pdf / docx / xlsx / pptx ====================
		// 走官方 documentPreviews 扩展点（priority: extension 会盖过内置实现）：
		//   pdf  -> Chromium 自带的 PDF 阅读器（Electron 里 <iframe> 指向 blob 就能用）
		//   docx/xlsx/pptx -> 自己解 OOXML（zip + deflate-raw），按内容渲染，不引第三方库
		// 图片（png/svg/jpg/gif/webp/bmp/ico）官方内置已经支持，这里不动。
		const PV_PDF = "ds-zhuzhu-use/preview-pdf";
		const PV_DOCX = "ds-zhuzhu-use/preview-docx";
		const PV_SHEET = "ds-zhuzhu-use/preview-sheet";
		const PV_SLIDES = "ds-zhuzhu-use/preview-slides";
		const PV_MAX_BYTES = 64 * 1024 * 1024;

		function pvBytes(content) {
			if (!content || content.kind !== "bytes" || !content.data) return null;
			return content.data instanceof Uint8Array ? content.data : new Uint8Array(content.data);
		}

		/** 最小 ZIP 读取器：只解析中央目录，用 DecompressionStream('deflate-raw') 解压。 */
		function zipIndex(bytes) {
			const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
			let eocd = -1;
			const floor = Math.max(0, bytes.length - 66000);
			for (let i = bytes.length - 22; i >= floor; i--) {
				if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
			}
			if (eocd < 0) throw new Error("不是有效的 Office 文件（找不到 zip 目录）");
			const count = dv.getUint16(eocd + 10, true);
			let p = dv.getUint32(eocd + 16, true);
			const dec = new TextDecoder("utf-8");
			const entries = new Map();
			for (let i = 0; i < count; i++) {
				if (p + 46 > bytes.length || dv.getUint32(p, true) !== 0x02014b50) break;
				const method = dv.getUint16(p + 10, true);
				const compSize = dv.getUint32(p + 20, true);
				const nameLen = dv.getUint16(p + 28, true);
				const extraLen = dv.getUint16(p + 30, true);
				const commentLen = dv.getUint16(p + 32, true);
				const localOff = dv.getUint32(p + 42, true);
				const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
				p += 46 + nameLen + extraLen + commentLen;
				if (!name || name.slice(-1) === "/") continue;
				if (localOff + 30 > bytes.length || dv.getUint32(localOff, true) !== 0x04034b50) continue;
				const lName = dv.getUint16(localOff + 26, true);
				const lExtra = dv.getUint16(localOff + 28, true);
				const start = localOff + 30 + lName + lExtra;
				entries.set(name, { method, raw: bytes.subarray(start, start + compSize) });
			}
			return entries;
		}

		async function zipRead(entries, name) {
			const e = entries.get(name);
			if (!e) return null;
			if (e.method === 0) return e.raw;
			if (typeof DecompressionStream === "undefined") throw new Error("当前内核不支持解压（需要 Chromium 103+）");
			const stream = new Blob([e.raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
			return new Uint8Array(await new Response(stream).arrayBuffer());
		}

		async function zipText(entries, name) {
			const raw = await zipRead(entries, name);
			return raw ? new TextDecoder("utf-8").decode(raw) : "";
		}

		function decodeXml(s) {
			return String(s)
				.replace(/&lt;/g, "<").replace(/&gt;/g, ">")
				.replace(/&quot;/g, '"').replace(/&apos;/g, "'")
				.replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
				.replace(/&amp;/g, "&");
		}

		const PV = {
			wrapBox: { padding: 16, fontSize: 13, lineHeight: 1.7, color: "var(--dsw-alias-label-primary, #333)" },
			h: { fontWeight: 600, margin: "14px 0 6px", fontSize: 13 },
			muted: { color: "var(--dsw-alias-label-secondary, #888)", fontSize: 12 },
			slide: { border: "1px solid var(--dsw-alias-border-l2, #e5e5e5)", borderRadius: 10, padding: 12, marginBottom: 12, background: "var(--dsw-alias-bg-layer-1, #fff)" },
			cell: { border: "1px solid var(--dsw-alias-border-l2, #e5e5e5)", padding: "3px 8px", fontSize: 12, whiteSpace: "pre-wrap", verticalAlign: "top" },
			loading: { padding: 16, fontSize: 12, color: "var(--dsw-alias-label-secondary, #888)" },
			err: { padding: 16, fontSize: 12, color: "var(--dsw-alias-state-error-primary, #c0392b)", whiteSpace: "pre-wrap" },
		};

		/** docx -> 段落数组（纯函数，便于测试） */
async function parseDocx(data) {
  const entries = zipIndex(data);
  const xml = await zipText(entries, "word/document.xml");
  if (!xml) throw new Error("这是 .doc 旧格式或损坏的 docx（读不到 word/document.xml）");
  const paragraphs = [];
  for (const para of xml.split(/<w:p[ >]/).slice(1)) {
    const runs = [];
    const runRe = /<w:r(?: [^>]*)?>([\s\S]*?)<\/w:r>/g;
    let m;
    while ((m = runRe.exec(para)) !== null) {
      const body = m[1];
      let text = "";
      const tRe = /<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>|(<w:tab\/>)|(<w:br\/>)/g;
      let t;
      while ((t = tRe.exec(body)) !== null) {
        if (t[1] != null) text += decodeXml(t[1]);
        else if (t[2]) text += "\t";
        else text += "\n";
      }
      if (!text) continue;
      const bold = /<w:b\/>|<w:b [^>]*\/>/.test(body);
      const italic = /<w:i\/>|<w:i [^>]*\/>/.test(body);
      runs.push({ text, bold, italic });
    }
    paragraphs.push({ runs, text: runs.map((r) => r.text).join("") });
  }
  return { paragraphs };
}

/** xlsx -> {sheet, rows}（纯函数） */
async function parseSheet(data) {
  const entries = zipIndex(data);
  const sharedXml = await zipText(entries, "xl/sharedStrings.xml");
  const shared = sharedXml
    ? [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
        [...m[1].matchAll(/<t(?: [^>]*)?>([\s\S]*?)<\/t>/g)].map((t) => decodeXml(t[1])).join(""))
    : [];
  const sheetName = [...entries.keys()].filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()[0];
  if (!sheetName) throw new Error("读不到工作表（.xls 旧格式请先另存为 xlsx）");
  const sheetXml = await zipText(entries, sheetName);
  const rows = [];
  for (const rowM of sheetXml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    if (rows.length >= 500) break;
    const cells = [];
    for (const cM of rowM[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>|<c([^>]*)\/>/g)) {
      const attrs = cM[1] || cM[3] || "";
      const body = cM[2] || "";
      const isShared = /t="s"/.test(attrs);
      const isInline = /t="(str|inlineStr)"/.test(attrs);
      let value = "";
      const vM = /<v>([\s\S]*?)<\/v>/.exec(body);
      if (isShared && vM) value = shared[Number(vM[1])] != null ? shared[Number(vM[1])] : "";
      else if (vM) value = decodeXml(vM[1]);
      else if (isInline) value = [...body.matchAll(/<t(?: [^>]*)?>([\s\S]*?)<\/t>/g)].map((t) => decodeXml(t[1])).join("");
      cells.push(value);
      if (cells.length >= 80) break;
    }
    rows.push(cells);
  }
  return { sheet: sheetName.split("/").pop(), rows };
}

/** pptx -> slide 数组（纯函数） */
async function parseSlides(data) {
  const entries = zipIndex(data);
  const slideNames = [...entries.keys()]
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.replace(/\D/g, "")) - Number(b.replace(/\D/g, "")));
  if (!slideNames.length) throw new Error("读不到幻灯片（.ppt 旧格式请先另存为 pptx）");
  const slides = [];
  for (const name of slideNames.slice(0, 60)) {
    const xml = await zipText(entries, name);
    const lines = [];
    for (const pM of xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)) {
      const text = [...pM[1].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((t) => decodeXml(t[1])).join("");
      if (text.trim()) lines.push(text);
    }
    const relName = name.replace("ppt/slides/", "ppt/slides/_rels/") + ".rels";
    const relXml = await zipText(entries, relName);
    const images = [];
    for (const rM of relXml.matchAll(/Target="([^"]+\.(?:png|jpe?g|gif|bmp|webp))"/gi)) {
      const cleaned = rM[1].replace(/^\.\.\//, "ppt/").replace(/^\/?ppt\/slides\/\.\.\//, "ppt/");
      const key = cleaned.startsWith("ppt/") ? cleaned : "ppt/" + cleaned;
      const raw = await zipRead(entries, key);
      if (!raw || raw.byteLength === 0 || raw.byteLength > 4 * 1024 * 1024) continue;
      const ext = key.split(".").pop().toLowerCase();
      const mime = (ext === "jpg" || ext === "jpeg") ? "image/jpeg" : ext === "gif" ? "image/gif" : ext === "bmp" ? "image/bmp" : ext === "webp" ? "image/webp" : "image/png";
      let b64 = "";
      for (let i = 0; i < raw.length; i += 0x8000) b64 += String.fromCharCode.apply(null, raw.subarray(i, i + 0x8000));
      images.push("data:" + mime + ";base64," + btoa(b64));
    }
    slides.push({ lines, images });
  }
  return { slides };
}

/** pdf：交给 Chromium 自己的阅读器（Electron 原生支持），比 pdf.js 稳且不占体积。 */
		function PdfPreview(props) {
			const [url, setUrl] = useState("");
			const [err, setErr] = useState("");
			useEffect(() => {
				const data = pvBytes(props && props.content);
				if (!data) return undefined;
				if (data.byteLength > PV_MAX_BYTES) { setErr("文件太大（" + fmtSize(data.byteLength) + "），超过预览上限 " + fmtSize(PV_MAX_BYTES)); return undefined; }
				const blob = new Blob([data], { type: "application/pdf" });
				const u = URL.createObjectURL(blob);
				setUrl(u);
				return () => { try { URL.revokeObjectURL(u) } catch (_) {} };
			}, [props && props.content]);
			if (err) return react.createElement("div", { style: PV.err }, err);
			if (!url) return react.createElement("div", { style: PV.loading }, "正在准备 PDF…");
  // #toolbar=0 关掉 Chromium 阅读器的黑条，view=FitH 让页面自适应面板宽度 —— 只留内容
  return react.createElement("iframe", { src: url + "#toolbar=0&navpanes=0&statusbar=0&view=FitH", style: { width: "100%", height: "100%", border: 0, background: "#fff", display: "block" }, title: "PDF" });
		}

		/** docx：读 word/document.xml，段落还原成文本（保留加粗/斜体/下划线标记）。 */
		function DocxPreview(props) {
			const [state, setState] = useState({ status: "loading" });
			useEffect(() => {
				let alive = true;
				const data = pvBytes(props && props.content);
				if (!data) return undefined;
								parseDocx(data).then((res) => { if (alive) setState({ status: "ok", ...res }); })
				  .catch((e) => { if (alive) setState({ status: "error", error: e && e.message ? e.message : String(e) }); });
				return () => { alive = false; };
			}, [props && props.content]);

			if (state.status === "loading") return react.createElement("div", { style: PV.loading }, "正在解析文档…");
			if (state.status === "error") return react.createElement("div", { style: PV.err }, "文档解析失败：" + state.error);
			const parapraphNodes = state.paragraphs.map((p, i) =>
				react.createElement("div", { key: "p" + i, style: { marginBottom: 6 } },
					p.runs.length
						? p.runs.map((r, j) => react.createElement("span", {
								key: "r" + j,
								style: { fontWeight: r.bold ? 600 : undefined, fontStyle: r.italic ? "italic" : undefined },
							}, r.text))
						: react.createElement("span", null, "\u00a0")
				)
			);
			return react.createElement("div", { ref: props.scrollportRef, style: { ...PV.wrapBox, overflow: "auto", height: "100%" } },
				react.createElement("div", { style: PV.muted }, "Word 文档 · " + state.paragraphs.length + " 段"),
				parapraphNodes
			);
		}

		/** xlsx/xls：读 sharedStrings + sheet1，还原成表格（取缓存值，不重算公式）。 */
		function SheetPreview(props) {
			const [state, setState] = useState({ status: "loading" });
			useEffect(() => {
				let alive = true;
				const data = pvBytes(props && props.content);
				if (!data) return undefined;
								parseSheet(data).then((res) => { if (alive) setState({ status: "ok", ...res }); })
				  .catch((e) => { if (alive) setState({ status: "error", error: e && e.message ? e.message : String(e) }); });
				return () => { alive = false; };
			}, [props && props.content]);

			if (state.status === "loading") return react.createElement("div", { style: PV.loading }, "正在解析表格…");
			if (state.status === "error") return react.createElement("div", { style: PV.err }, "表格解析失败：" + state.error);
			return react.createElement("div", { ref: props.scrollportRef, style: { ...PV.wrapBox, overflow: "auto", height: "100%" } },
				react.createElement("div", { style: PV.muted }, "表格 · " + state.sheet + " · " + state.rows.length + " 行"),
				react.createElement("table", { style: { borderCollapse: "collapse", marginTop: 8 } },
					react.createElement("tbody", null,
						state.rows.map((cells, i) => react.createElement("tr", { key: "r" + i },
							cells.map((v, j) => react.createElement("td", { key: "c" + j, style: PV.cell }, v))
						))
					)
				)
			);
		}

		/** pptx：按页取文字与内嵌图片，做成一页一张卡片的预览。 */
/** 从资源地址里取文件名（判断扩展名、给宿主缓存用）。 */
function resourceName(props) {
  try {
    const addr = String((props && props.resourceAddress) || "");
    const tail = addr.split("?")[0].split("/").filter(Boolean).pop() || "";
    return decodeURIComponent(tail);
  } catch (_) {
    return "";
  }
}

function base64ToBlobUrl(b64, mime) {
  const bin = atob(String(b64 || ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

function bytesToBase64(data) {
  let out = "";
  for (let i = 0; i < data.length; i += 0x8000) {
    out += String.fromCharCode.apply(null, data.subarray(i, i + 0x8000));
  }
  return btoa(out);
}

/**
 * 优先用本机 Office 渲染：文件交给宿主 -> Office 导出 PDF -> 这里用 Chromium 的阅读器显示。
 * 装好即生效，不用任何配置；机器上没有 Office 就直接退回简化预览（并说明原因）。
 */
function withNativeOffice(Rough, kind) {
  return function OfficeNativePreview(props) {
    const [pdfUrl, setPdfUrl] = useState("");
    const [failed, setFailed] = useState("");
    const address = String((props && props.resourceAddress) || "");

    useEffect(() => {
      let alive = true;
      let url = "";
      setPdfUrl("");
      setFailed("");
      const data = pvBytes(props && props.content);
      if (!data) return undefined;
      const name = resourceName(props) || ("document." + kind);
      fetch("/api/dsh-about/office-pdf", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, data: bytesToBase64(data) }),
      })
        .then((r) => r.json())
        .then((res) => {
          if (!alive) return;
          if (res && res.ok && res.data && res.data.pdf) {
            url = base64ToBlobUrl(res.data.pdf, "application/pdf");
            setPdfUrl(url);
          } else {
            setFailed((res && res.error) || "Office 渲染失败");
          }
        })
        .catch((e) => { if (alive) setFailed(String(e && e.message ? e.message : e)); });
      return () => {
        alive = false;
        if (url) { try { URL.revokeObjectURL(url) } catch (_) {} }
      };
    }, [address, props && props.content]);

    if (pdfUrl) {
      return react.createElement("iframe", {
        src: pdfUrl + "#toolbar=0&navpanes=0&statusbar=0&view=FitH",
        title: "Office 文档",
        style: { width: "100%", height: "100%", border: 0, background: "#fff", display: "block" },
      });
    }
    if (failed) {
      return react.createElement("div", { style: { height: "100%", display: "flex", flexDirection: "column", minHeight: 0 } },
        react.createElement("div", { style: { padding: "6px 12px", fontSize: 11, color: "var(--dsw-alias-label-secondary, #888)", borderBottom: "1px solid var(--dsw-alias-border-l2, #eee)" } },
          "原生 Office 渲染没成功（" + failed + "），下面是简化预览"),
        react.createElement("div", { style: { flex: "1 1 auto", minHeight: 0 } }, react.createElement(Rough, props))
      );
    }
    return react.createElement("div", { style: PV.loading }, "正在用本机 Office 渲染…");
  };
}

const NativeDocxPreview = withNativeOffice(DocxPreview, "docx");
const NativeSheetPreview = withNativeOffice(SheetPreview, "xlsx");
const NativeSlidesPreview = withNativeOffice(SlidesPreview, "pptx");
function SlidesPreview(props) {
			const [state, setState] = useState({ status: "loading" });
			useEffect(() => {
				let alive = true;
				const data = pvBytes(props && props.content);
				if (!data) return undefined;
								parseSlides(data).then((res) => { if (alive) setState({ status: "ok", ...res }); })
				  .catch((e) => { if (alive) setState({ status: "error", error: e && e.message ? e.message : String(e) }); });
				return () => { alive = false; };
			}, [props && props.content]);

			if (state.status === "loading") return react.createElement("div", { style: PV.loading }, "正在解析演示文稿…");
			if (state.status === "error") return react.createElement("div", { style: PV.err }, "演示文稿解析失败：" + state.error);
			return react.createElement("div", { ref: props.scrollportRef, style: { ...PV.wrapBox, overflow: "auto", height: "100%" } },
				react.createElement("div", { style: PV.muted }, "演示文稿 · " + state.slides.length + " 页"),
				react.createElement("div", { style: { marginTop: 8 } },
					state.slides.map((s, i) => react.createElement("div", { key: "s" + i, style: PV.slide },
						react.createElement("div", { style: PV.muted }, "第 " + (i + 1) + " 页"),
						s.lines.length
							? s.lines.map((l, j) => react.createElement("div", { key: "l" + j, style: { marginTop: 4, whiteSpace: "pre-wrap" } }, l))
							: react.createElement("div", { style: { ...PV.muted, marginTop: 4 } }, "（本页无文字）"),
						s.images.length
							? react.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 } },
									s.images.map((src, k) => react.createElement("img", { key: "i" + k, src, style: { maxWidth: 220, maxHeight: 140, borderRadius: 6, border: "1px solid var(--dsw-alias-border-l2, #eee)" } }))
								)
							: null
					))
				)
			);
		}


		// ==================== 宠物 ====================
		// 宠物插件是用户自己的东西：这里只做「默认不启用 + 一键开关」，不动它的任何文件。
		// 改的是 profile 的 bundles 列表，所以需要重启软件才生效。
		// 会话实时状态：宠物要跟着 agent 演出，状态从会话插槽拿（不猜、不轮询 agent 内部）。
// 这个模块级的最近状态由 PetDock（挂在会话插槽里）写入，浮层订阅。
const petLive = { state: "IDLE", listeners: new Set() };
function petPublishState(next) {
  if (!next || petLive.state === next) return;
  petLive.state = next;
  petLive.listeners.forEach((fn) => { try { fn(next); } catch (_) {} });
}
function petSubscribeState(fn) {
  petLive.listeners.add(fn);
  return () => { petLive.listeners.delete(fn); };
}

// ⚠️ 下面用到的字段名都是对着真实契约核过的，别凭印象改：
//   SessionSnapshot(session): sessionId · running · lastAgentError · promptError · openError
//                            · awaitingFirstTurn · promptAttempted · blank · pendingSubmissions · queue
//   InputState(input):       phase('plain'|'adjudicating'|'claimed'|'submitting') · draft · queue · claim
//   这两个快照里【没有】 busy / streaming / thinking / error / pendingInteraction。
//   以前那版就是按这些不存在的字段写的，所以永远算回 IDLE —— 宠物看着像死的一样。
const petNoopSelector = () => undefined;
const petIdentity = (s) => s;

/**
 * 取一个「注进来的 hook」，拿不到就退化成一个普通函数。
 * hooks 规则要求 render 期无条件调用，所以这里不能写成 if (fn) fn(...) 分支。
 */
function petPickHook(props, name, selector) {
  const fn = (props && typeof props[name] === "function") ? props[name] : petNoopSelector;
  try {
    return fn(selector);
  } catch (_) {
    return undefined;
  }
}

function petErrText(v) {
  if (v === undefined || v === null || v === false || v === "") return "";
  if (typeof v === "string") return v;
  return String((v && (v.message || v.code)) || v);
}

/** 纯函数：从真实快照推导宠物状态（三个入参都是普通值，方便单测）。 */
function petStateFromProps(session, input, pendingInteraction) {
  try {
    const s = session || {};
    const i = input || {};
    if (petErrText(s.lastAgentError) || petErrText(s.promptError) || petErrText(s.openError)) return "ERROR";
    if (pendingInteraction) return "WAITING";
    // running 是唯一的「agent 在跑」权威字段（SessionSnapshot.running）。
    if (s.running === true) return "WORKING";
    // 已交出但还没落地：等第一个 turn，或输入机还在提交/裁决中。
    if (s.awaitingFirstTurn === true) return "THINKING";
    const ph = i.phase;
    if (ph === "submitting" || ph === "claimed" || ph === "adjudicating") return "THINKING";
    return "IDLE";
  } catch (_) {
    return "IDLE";
  }
}

/** 挂在会话插槽里：只把状态广播出去，自己什么都不画（渲染统一由浮层负责）。 */
function PetDock(props) {
  // 优先用注入的 useSession 订阅（会话快照一变就重渲），拿不到才退回 ownerProps.session。
  const subscribed = petPickHook(props, "useSession", petIdentity);
  const session = subscribed || (props && props.session) || null;
  const input = (props && props.input) || null;
  const sid = session ? session.sessionId : undefined;
  // 审批挂起：官方选择器给的是 ReadonlyMap<SessionId, PendingInteraction>，取本会话那条。
  const pending = petPickHook(props, "useSessionPendingInteraction", (snap) =>
    (sid === undefined || !snap || typeof snap.get !== "function") ? undefined : snap.get(sid)
  );

  const next = petStateFromProps(session, input, pending);
  const prevRef = useRef("");
  const timerRef = useRef(null);
  const latestRef = useRef(next);
  latestRef.current = next;

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = next;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    // 干完活且没出错 → 播一次庆祝（资源里的 success 段），1.6s 后自己回 IDLE。
    if (prev === "WORKING" && next === "IDLE") {
      petPublishState("SUCCESS");
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        // 这 1.6s 里又开工了就别抢它的状态
        if (latestRef.current === "IDLE") petPublishState("IDLE");
      }, 1600);
      return;
    }
    petPublishState(next);
  }, [next]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  return null;
}

// 宠物动作：dafeiyu 那套 clips 里的 motion 字段（breathe/think/work/wait/bounce/shake/dizzy）
// 用 CSS 关键帧做——不占 JS 帧、不触发布局，只有 transform。
(function ensurePetMotion() {
  try {
    if (document.querySelector("style[data-dsh-pet-motion]")) return;
    const tag = document.createElement("style");
    tag.dataset.dshPetMotion = "1";
    tag.textContent = [
      "@keyframes dshPetBreathe{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-2px) scale(1.012)}}",
      "@keyframes dshPetThink{0%,100%{transform:rotate(-1.8deg)}50%{transform:rotate(1.8deg)}}",
      "@keyframes dshPetWork{0%,100%{transform:translateX(-3px) rotate(-.6deg)}50%{transform:translateX(3px) rotate(.6deg)}}",
      "@keyframes dshPetWait{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}",
      "@keyframes dshPetBounce{0%,100%{transform:translateY(0)}35%{transform:translateY(-8px)}70%{transform:translateY(-3px)}}",
      "@keyframes dshPetShake{0%,100%{transform:translateX(0) rotate(0)}25%{transform:translateX(-3px) rotate(-2deg)}75%{transform:translateX(3px) rotate(2deg)}}",
      "@keyframes dshPetDizzy{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}",
    ].join("");
    document.head.appendChild(tag);
  } catch (_) {}
})();

const PET_MOTION_MS = { breathe: 3200, think: 2400, work: 1200, wait: 2200, bounce: 1100, shake: 620, dizzy: 2400 };
function petMotionStyle(motion) {
  if (!motion || !PET_MOTION_MS[motion]) return {};
  const name = "dshPet" + motion.charAt(0).toUpperCase() + motion.slice(1);
  return { animation: name + " " + PET_MOTION_MS[motion] + "ms ease-in-out infinite" };
}

// 大小不再只给三挡：40px 到 2000px 随便拉，档位只是三个快捷刻度。
const PET_SIZE_MIN = 40;
const PET_SIZE_MAX = 2000;
const PET_SIZES = [["small", "小"], ["medium", "中"], ["large", "大"]];
const PET_SIZE_TICKS = [["small", 72], ["medium", 112], ["large", 168]];
const PET_SIZE_PRESET = { small: 72, medium: 112, large: 168 };

// 随机小动作的默认池。宿主会从 manifest 的 idleMicroClips 透出来；万一宿主版本旧、
// 没给这个字段，就回退到这几个 —— 否则「随机做动作」会静默变成一个都不播。
const PET_DEFAULT_MICROS = ["waving", "thinking"];

/**
 * 解析可用的随机动作池：manifest 声明的（或默认的）减去资源里根本不存在的段。
 * 纯函数，方便单测 —— 这个功能以前就是因为宿主没透字段而静默失效的。
 */
function petMicroPool(resource, clips, isAtlas) {
  const usable = (k) => {
    const c = clips && clips[k];
    if (!c) return false;
    if (Array.isArray(c.frames)) return c.frames.length > 0;
    // 图集资源：「有帧」= 有行号
    return !!isAtlas && Number.isFinite(Number(c.row));
  };
  const listed = (resource && Array.isArray(resource.idleMicroClips) && resource.idleMicroClips.length)
    ? resource.idleMicroClips
    : PET_DEFAULT_MICROS;
  return listed.filter(usable);
}


/** 选项 → 实际像素。纯函数：拉条(sizePx) 优先，否则退回档位，默认 112。 */function petSizePx(options) {
  const o = options || {};
  const n = Number(o.sizePx);
  if (Number.isFinite(n) && n > 0) return Math.round(Math.min(PET_SIZE_MAX, Math.max(PET_SIZE_MIN, n)));
  return PET_SIZE_PRESET[o.size] || 112;
}

/**
 * 朝向索引 → 可见的位移 + 微倾（绕脚底，读作「重心偏了一下」）。
 * 为什么需要：朝向帧本身画得极含蓄 —— Codex 自己的规格就只有 20–25° 的头部俯仰/偏转
 * （见 pro-honey/qa/look-mechanics.md），而 pro-honey 是全身立绘，脸在 192×208 里只占一点点。
 * QA 实测每步只改动约 2000 像素（格子总共 39936 像素，约 5%）。只看帧，人眼分辨不出来，
 * 表现就是「绕不了一圈」。所以帧负责五官细节，这一层负责把方位放大到看得见。
 */
function petGazeTransform(idx, px) {
  // 注意别用 Number() 一把梭：Number(null) === 0，会把「不注视」当成「朝正上」。
  if (idx === null || idx === undefined || idx === "") return null;
  const n = Number(idx);
  if (!Number.isFinite(n)) return null;
  const i = ((Math.round(n) % 16) + 16) % 16;
  const rad = (i * 22.5) * Math.PI / 180;      // 0° = 正上，顺时针
  const size = px || 112;
  const d = Math.max(3, Math.min(24, size * 0.05));
  const tiltMax = Math.max(2.5, Math.min(10, size * 0.035));
  const tx = Math.sin(rad) * d;
  const ty = -Math.cos(rad) * d;
  const rot = Math.sin(rad) * tiltMax;
  return {
    idx: i,
    transform: "translate(" + tx.toFixed(2) + "px," + ty.toFixed(2) + "px) rotate(" + rot.toFixed(2) + "deg)",
    tx: tx, ty: ty, rot: rot,
  };
}

// 单击 / 长按 的互动反应。
// 单击 = 打个招呼，长按 = 停下来看看你 —— 都**不该**播拖拽那套跑动动画。
// 段名可以由资源在 manifest 里覆盖（pokeClip / pressClip），没声明就用这两个默认值。
const PET_LONG_PRESS_MS = 450;
const PET_SLEEP_AFTER_MS = 120000;      // 空闲两分钟没人理 -> 打盹
const PET_DEFAULT_POKE = "waving";
const PET_DEFAULT_PRESS = "thinking";
// 各种互动对应的默认段名。资源里声明了 `${kind}Clip` 就用它的，没声明才回退到这里。
// 没有默认值、资源也没声明的（angry/startle/fall/drop/wake/walk）就安静地不做反应。
const PET_REACTION_DEFAULTS = {
  poke: PET_DEFAULT_POKE, press: PET_DEFAULT_PRESS,
  angry: "", startle: "", fall: "", drop: "", wake: "", walk: "",
};

/** 纯函数：某只宠物对某种互动该播哪一段。取不到就返回空串（安静地不做反应）。 */
function petReactionClip(resource, kind) {
  const clips = (resource && resource.clips) || null;
  if (!clips || !kind) return "";
  const usable = (n) => !!(n && clips[n]);
  const declared = resource[kind + "Clip"];
  if (usable(declared)) return declared;
  const fb = PET_REACTION_DEFAULTS[kind];
  return usable(fb) ? fb : "";
}

/** 一段动画播完要多久（帧数 × 帧间隔）。用来决定互动反应什么时候复位。 */
function petClipMs(resource, name) {
  const c = resource && resource.clips && resource.clips[name];
  if (!c) return 600;
  const n = (Array.isArray(c.frames) && c.frames.length) ? c.frames.length : 6;
  return Math.max(240, n * (c.frameMs || 160));
}

/**
 * 图集资源：加载一次，在 canvas 里数出**每行的前导非空格数** = 该行真实帧数。
 *
 * 为什么要数而不能写死：Codex 把每段动画横排进 8 列，行尾的空格补透明。
 * 实测 idle 是 7 帧、waving 只有 4 帧、failed 是 8 帧 —— 都按 8 帧播的话，
 * 宠物每轮会「空一帧」（那一格是透明的，看起来就是闪一下）。
 * 数一遍之后任何 Codex 图集丢进来都能自解释，不需要附带元数据。
 */
const petAtlasCache = new Map();
const petAtlasBusy = new Set();

function petAtlasScan(key, url, cellW, cellH, lookRows, onDone) {
  if (petAtlasCache.has(key)) return petAtlasCache.get(key);
  if (petAtlasBusy.has(key)) return null;
  if (typeof Image !== "function" || typeof document === "undefined") return null;
  petAtlasBusy.add(key);
  const im = new Image();
  im.onload = () => {
    let info = null;
    try {
      const w = im.naturalWidth || im.width;
      const h = im.naturalHeight || im.height;
      const cols = Math.max(1, Math.round(w / cellW));
      const rows = Math.max(1, Math.round(h / cellH));
      const cv = document.createElement("canvas");
      cv.width = w;
      cv.height = h;
      const cx = cv.getContext("2d");
      cx.drawImage(im, 0, 0);
      const counts = [];
      for (let r = 0; r < rows; r++) {
        let n = 0;
        for (let c = 0; c < cols; c++) {
          const d = cx.getImageData(c * cellW, r * cellH, cellW, cellH).data;
          let solid = 0;
          // alpha 每 17 个像素抽一个（步长 4*17）够判空，不必把 350 万像素全扫
          for (let i = 3; i < d.length; i += 68) if (d[i] > 24) solid++;
          if (solid > 16) n = c + 1;
        }
        counts.push(n);
      }
      info = { cols, rows, counts, lookRows };
    } catch (_) { info = null; }
    petAtlasCache.set(key, info);
    petAtlasBusy.delete(key);
    try { onDone(); } catch (_) {}
  };
  im.onerror = () => { petAtlasBusy.delete(key); };
  im.src = url;
  return null;
}

/** 一段动画有多少帧。图集看行号 + 扫描结果（没扫完就按列数兜底），目录式看帧数组。 */
function petClipCount(clips, name, atlas, atlasInfo) {
  const d = clips && clips[name];
  if (!d) return 0;
  if (Array.isArray(d.frames)) return d.frames.length;
  if (!atlas) return 0;
  const row = Number(d.row) || 0;
  // 扫描过了就以扫描为准：某行真的一个非空格都没有时它就是 0 帧（别硬凑成 8 帧去播空白）
  if (atlasInfo && Array.isArray(atlasInfo.counts)) return atlasInfo.counts[row] || 0;
  return Math.max(1, Number(atlas.cols) || 8);
}

/** 一帧一帧地播：只在需要时开定时器，帧序列长度 1 就不开（静态图零开销）。 */
function PetSprite({ resourceId, resource, state, size, scale, clipOverride, lookFrame }) {
  const [frame, setFrame] = useState(0);
  const [micro, setMicro] = useState("");
  const [blink, setBlink] = useState(false);
  const [atlasInfo, setAtlasInfo] = useState(null);
  const clips = (resource && resource.clips) || null;
  const atlas = (resource && resource.atlas) || null;
  const rev = (resource && resource.rev) ? ("&v=" + encodeURIComponent(resource.rev)) : "";
  const sheetUrl = atlas ? ("/api/ds-zhuzhu-use/pets/asset?id=" + encodeURIComponent(resourceId) + "&kind=sprite" + rev) : "";
  const atlasKey = atlas ? (resourceId + "@" + (resource.rev || "")) : "";
  const baseClip = (resource && resource.stateMap && resource.stateMap[state]) || (clips && state && clips[state.toLowerCase()] ? state.toLowerCase() : "idle");
  // 外部强制段（拖拽时播 dragging / running-left / running-right）：资源里没有这一段
  // 就安静地忽略，退回正常演出。
  const forced = clipOverride && clips && clips[clipOverride] ? clipOverride : "";
  const micros = petMicroPool(resource, clips, !!atlas);
  // 两个判据必须分开：
  //   restful —— 「能插播小动作」（只看基段是不是 idle）
  //   isIdle  —— 「能注视光标」（插播期间让位）
  // 早前只有一个 isIdle，插播一开始它就从 true 翻成 false，effect 被清理、alive=false，
  // 那个负责「播完复位」的定时器永远不触发 —— 宠物就卡在小动作的最后一帧不动了。
  const restful = baseClip === "idle" && !forced;
  const isIdle = restful && !micro;
  // 注视光标：只在「闲着 / 没被强制 / 没在播小动作」时接管一帧。
  // 图集走 9/10 两行的 16 个朝向；帧目录式走 look 段。
  const lookClip = (clips && clips.look && Array.isArray(clips.look.frames) && clips.look.frames.length) ? clips.look : null;
  const lookTotal = atlas ? 16 : (lookClip ? lookClip.frames.length : 0);
  const gazing = lookFrame != null && isIdle && lookTotal > 0;
  // 眨眼：资源声明 blinkClip 时，隔几秒闪一下。优先级放在 gaze 之上 —— 眨眼跟看哪儿无关。
  // 有 blinkDoubleClip 时约四分之一概率连眨两下。
  const blinkName = (resource && typeof resource.blinkClip === "string") ? resource.blinkClip : "";
  const blinkDoubleName = (resource && typeof resource.blinkDoubleClip === "string") ? resource.blinkDoubleClip : "";
  const ok = (n) => !!n && !!(clips && clips[n]);
  const canBlink = ok(blinkName) || ok(blinkDoubleName);
  const blinkPick = (blink && ok(blinkDoubleName) && Math.random() < 0.25)
    ? blinkDoubleName : (ok(blinkName) ? blinkName : blinkDoubleName);
  const clipName = forced || micro ||
    ((blink && canBlink) ? blinkPick : (gazing ? "look" : baseClip));
  const def = clips ? (clips[clipName] || clips.idle || null) : null;
  const frames = (def && Array.isArray(def.frames) && def.frames.length) ? def.frames : null;
  // 图集模式下的落格：{row, col}。注视是按方位挑定一帧，绝不能跑帧定时器（否则 16 个朝向会被轮播）
  let cell = null;
  if (atlas) {
    if (gazing) {
      const lr = (Array.isArray(atlas.lookRows) && atlas.lookRows.length === 2) ? atlas.lookRows : [9, 10];
      const i = Math.max(0, Math.min(15, Math.round(Number(lookFrame) || 0)));
      cell = { row: i < 8 ? lr[0] : lr[1], col: i % 8 };
    } else if (def) {
      cell = { row: Number(def.row) || 0, col: 0 };
    }
  }
  const count = cell ? petClipCount(clips, clipName, atlas, atlasInfo) : (frames ? frames.length : 1);
  // 眨眼时长：按实际选中的那一段算（连眨是 4 帧 × 90ms，单眨是 3 帧）
  const blinkMs = canBlink
    ? Math.max(130, petClipCount(clips, blinkPick, atlas, atlasInfo) * (((clips && clips[blinkPick]) || {}).frameMs || 130))
    : 130;
  const frameMs = (def && def.frameMs) || 180;
  const loop = !(def && def.loop === false);
  // 凝视 = 按光标方位挑定一帧，两条路径都要处理：
  //   图集   -> cell.col（row 9/10 的哪一列）
  //   帧目录 -> look 段的第 lookFrame 帧
  // 早前只写了图集那条，帧目录下 shown 一直停在 0 —— 而 look 的第 0 帧正是「000 up」，
  // 表现就是宠物一直抬头望天、完全不跟鼠标。
  const lookIdx = Math.max(0, Math.min(Math.round(Number(lookFrame) || 0), Math.max(0, count - 1)));
  const shown = gazing
    ? (cell ? cell.col : lookIdx)
    : Math.min(frame, Math.max(0, count - 1));

  // 图集只要加载一次 + 扫一次；扫完 setState 触发重渲染（帧数从「按列数兜底」换成真实值）
  useEffect(() => {
    if (!atlas) { setAtlasInfo(null); return undefined; }
    const hit = petAtlasCache.get(atlasKey);
    if (hit !== undefined) { setAtlasInfo(hit); return undefined; }
    setAtlasInfo(null);
    petAtlasScan(atlasKey, sheetUrl, atlas.cellW, atlas.cellH, atlas.lookRows, () => {
      setAtlasInfo(petAtlasCache.get(atlasKey) || null);
    });
    return undefined;
  }, [atlasKey, sheetUrl]);

  useEffect(() => {
    setFrame(0);
    if (!cell && (!frames || frames.length <= 1)) return undefined;
    if (gazing || count <= 1) return undefined;
    const timer = setInterval(() => {
      setFrame((f) => {
        const next = f + 1;
        if (next < count) return next;
        return loop ? 0 : count - 1;
      });
    }, frameMs);
    return () => clearInterval(timer);
  }, [resourceId, clipName, count, frameMs, gazing, loop, !!cell]);

  // 预拉 + 预解码整段帧。配合宿主把 clip 帧标成可缓存（max-age），
  // 循环播放就不再是「每帧一次请求 + 现场解码」的顿挫感 —— 这是掉帧的主因。
  // 图集不用预拉：整张表就一个请求，扫描那步已经把它拉下来了。
  useEffect(() => {
    if (atlas || !frames || frames.length <= 1 || typeof Image !== "function") return undefined;
    const made = [];
    for (let i = 0; i < frames.length; i++) {
      const im = new Image();
      try { im.decoding = "async"; } catch (_) {}
      im.src = "/api/ds-zhuzhu-use/pets/asset?id=" + encodeURIComponent(resourceId) +
               "&kind=" + encodeURIComponent("clip:" + clipName + ":" + i) + rev;
      made.push(im);
    }
    return () => { made.length = 0; };
  }, [resourceId, clipName, frames ? frames.length : 0, rev, atlas]);

  // 空闲/思考时的随机小动作：隔 6–14 秒随便挑一段播一次，播完再排下一次。
  // 依赖里放的是 restful（不是 isIdle）—— 否则插播一开始就把自己这套定时器清掉了。
  useEffect(() => {
    if (!restful || !micros.length || !clips) return undefined;
    let alive = true;
    let wait = null, hold = null;
    const schedule = () => {
      if (!alive) return;
      wait = setTimeout(() => {
        if (!alive) return;
        const pick = micros[Math.floor(Math.random() * micros.length)];
        const n = petClipCount(clips, pick, atlas, atlasInfo);
        if (!n) { schedule(); return; }
        const c = clips && clips[pick];
        setMicro(pick);
        hold = setTimeout(() => {
          if (!alive) return;
          setMicro("");
          schedule();
        }, n * (((c && c.frameMs) || 150)));
      }, 12000 + Math.random() * 16000);
    };
    schedule();
    return () => { alive = false; if (wait) clearTimeout(wait); if (hold) clearTimeout(hold); };
  }, [restful, resourceId, micros.join(","), atlasInfo, !!atlas]);

  // 眨眼：闲着/思考时隔 3.5~7.5 秒闪一下。只依赖 restful 等稳定值 —— 眨眼状态本身
  // 绝不能进依赖，否则一闪就把这套定时器清掉（和小动作那个坑同源）。
  // 时长按该段的真实帧数算：将来换成真正的闭眼 2 帧也能完整播完，而不是只闪第一帧。
  useEffect(() => {
    if (!canBlink || !restful) { setBlink(false); return undefined; }
    let alive = true, wait = null, hold = null;
    const loop = () => {
      if (!alive) return;
      wait = setTimeout(() => {
        if (!alive) return;
        setBlink(true);
        hold = setTimeout(() => {
          if (!alive) return;
          setBlink(false);
          loop();
        }, blinkMs);
      }, 3500 + Math.random() * 4000);
    };
    loop();
    return () => { alive = false; if (wait) clearTimeout(wait); if (hold) clearTimeout(hold); };
  }, [canBlink, restful, resourceId, blinkName, blinkMs]);

  // 资源内容版本号：拼进 URL，换图后浏览器才会重取（否则它一直用内存里的旧解码结果）。
  const src = frames
    ? "/api/ds-zhuzhu-use/pets/asset?id=" + encodeURIComponent(resourceId) + "&kind=" + encodeURIComponent("clip:" + clipName + ":" + shown) + rev
    : "/api/ds-zhuzhu-use/pets/asset?id=" + encodeURIComponent(resourceId) + rev;
  const w = Math.round((size || 112) * (scale || 1));
  // 整体位移+微倾是我早前加的「假动作」，用来放大看不出来的转头 —— 但实测真图本身
  // 头部横向就有 47px(pro) / 68px(flash) 的可见位移（576 画布），按 sizePx=350 折到屏幕
  // 是 28~42px，本来就看得见。副作用是整个身子跟着歪（用户报的「身体也在动」）。
  // 所以默认关掉，只有资源显式声明 gazeLean: true 才启用。
  const gaze = (gazing && resource && resource.gazeLean) ? petGazeTransform(shown, w) : null;
  // 图集：拿整张表当背景，用 background-position 精确落格。
  // 这样根本不存在「切片」这一步 —— 浏览器按格子裁，多一个像素都不会露出来。
  // 位置/尺寸都用浮点，避免取整后格子之间出现 1px 缝。
  let inner;
  if (cell && atlas) {
    const cw = Number(atlas.cellW) || 192;
    const ch = Number(atlas.cellH) || 208;
    const k = w / cw;                                   // 显示像素 / 源像素
    const cols = (atlasInfo && atlasInfo.cols) || Number(atlas.cols) || 8;
    const rows = (atlasInfo && atlasInfo.rows) || 11;
    inner = react.createElement("div", {
      style: {
        width: w, height: (w * ch / cw) + "px",
        backgroundImage: "url(" + sheetUrl + ")",
        backgroundRepeat: "no-repeat",
        backgroundSize: (cols * cw * k) + "px " + (rows * ch * k) + "px",
        backgroundPosition: (-shown * cw * k) + "px " + (-cell.row * ch * k) + "px",
        userSelect: "none", pointerEvents: "none",
        filter: w <= 420 ? "drop-shadow(0 6px 14px rgba(0,0,0,.22))" : "none",
        ...petMotionStyle(def && def.motion),
      },
    });
  } else {
    // 既没有图集格、也没有帧数组、连立绘都没有 —— 什么可画的都没有。
    // 这种情况真实存在：宿主还是旧版（不认 pet.json，不给 atlas），而 manifest 里的段
    // 只有 frameMs 没有 frames。此时硬渲染一个 <img> 会得到一张「碎图」图标，不如不画。
    if (!frames && resource && resource.hasPortrait === false) return null;
    inner = react.createElement("img", {
      src,
      alt: clipName,
      draggable: false,
      style: {
        width: w, height: "auto", display: "block", userSelect: "none", willChange: "transform",
        // drop-shadow 每帧都要重新栅格化整块图。拉到大尺寸时（用户能拉到 2000px）
        // 这个滤镜本身就能把帧率吃掉，所以只在中小尺寸留着。
        filter: w <= 420 ? "drop-shadow(0 6px 14px rgba(0,0,0,.22))" : "none",
        ...petMotionStyle(def && def.motion),
      },
    });
  }
  return react.createElement("div", {
    // 外层专门扛「注视」的位移/微倾，内层保留自己的 motion 关键帧动画 ——
    // 两者都写 transform，放同一个元素上动画会把内联样式盖掉。
    style: {
      display: "block", lineHeight: 0, transformOrigin: "50% 92%",
      willChange: "transform",
      transform: gaze ? gaze.transform : "none",
      transition: "transform 150ms ease-out",
    },
  }, inner);
}

/** 宠物浮层：只订阅一个轻量状态，默认关时直接不渲染（零成本）。 */
// 气泡专用的关键帧单独放一个 <style>，免得被上面那个 motion 标签的
// 「已存在就 return」挡掉（热重载时旧标签还在，新关键帧就注册不进去了）。
(function ensurePetBubbleCss() {
  try {
    if (document.querySelector("style[data-dsh-pet-bubble]")) return;
    const tag = document.createElement("style");
    tag.dataset.dshPetBubble = "1";
    tag.textContent = [
      "@keyframes dshPetBubbleIn{from{opacity:0;transform:translateY(5px) scale(.9)}to{opacity:1;transform:none}}",
      "@keyframes dshPetDot{0%,80%,100%{opacity:.28;transform:translateY(0)}40%{opacity:1;transform:translateY(-2px)}}",
    ].join("");
    document.head.appendChild(tag);
  } catch (_) {}
})();

// Codex 那种「头顶气泡」：把状态用文字讲出来。
// 没有它，宠物只是在手舞足蹈，人根本看不出它在干嘛。
const PET_BUBBLE = {
  THINKING: { text: "思考中", busy: true, accent: "" },
  WORKING: { text: "干活中", busy: true, accent: "" },
  WAITING: { text: "等你确认", busy: false, accent: "#c07a00" },
  SUCCESS: { text: "搞定", busy: false, accent: "#1f8f4e" },
  ERROR: { text: "出错了", busy: false, accent: "#c93a3a" },
};

function PetBubble({ state, size }) {
  const b = PET_BUBBLE[state];
  if (!b) return null;
  const px = size || 112;
  const font = Math.max(11, Math.min(15, Math.round(px * 0.115)));
  const gap = Math.max(3, Math.round(font * 0.3));
  const bg = b.accent || "rgba(26,26,30,.9)";
  // 尾巴跟气泡同色，用纯 CSS 三角形做。
  const tail = {
    position: "absolute", left: "50%", bottom: -Math.round(font * 0.32),
    transform: "translateX(-50%)", width: 0, height: 0,
    borderLeft: "5px solid transparent", borderRight: "5px solid transparent",
    borderTop: "6px solid " + bg,
  };
  return react.createElement("div", {
    style: {
      pointerEvents: "none", alignSelf: "center", position: "relative",
      marginBottom: Math.round(font * 0.85),
      padding: Math.round(font * 0.36) + "px " + Math.round(font * 0.7) + "px",
      borderRadius: 999, background: bg, color: "#fff",
      fontSize: font, lineHeight: 1.25, whiteSpace: "nowrap",
      fontFamily: "ui-sans-serif, system-ui, 'Microsoft YaHei', sans-serif",
      boxShadow: "0 4px 14px rgba(0,0,0,.3)",
      border: "1px solid rgba(255,255,255,.16)",
      display: "flex", alignItems: "center", gap: gap,
      animation: "dshPetBubbleIn .18s ease-out",
    },
  },
    b.text,
    b.busy ? react.createElement("span", { style: { display: "inline-flex", gap: 3 } },
      [0, 1, 2].map((i) => react.createElement("span", {
        key: i,
        style: {
          width: 4, height: 4, borderRadius: 999, background: "#fff", display: "block",
          animation: "dshPetDot 1.1s ease-in-out infinite",
          animationDelay: (i * 0.16) + "s",
        },
      }))
    ) : null,
    react.createElement("span", { style: tail })
  );
}

// 选项一改就通知浮层立刻拉一次，不用等 10s 轮询。
const petOptionListeners = new Set();
function petNotifyOptions() { petOptionListeners.forEach((fn) => { try { fn(); } catch (_) {} }); }

function PetOverlay() {
  const [state, setState] = useState(null);
  const [live, setLive] = useState("IDLE");
  const [drag, setDrag] = useState(null);      // 拖动中的容器左上角 {x,y}
  const [placed, setPlaced] = useState(null);  // 松手后本地记住的位置（不等 10s 轮询回包）
  const [box, setBox] = useState(null);        // 最近量到的容器尺寸，用来夹住屏幕边界
  const [vp, setVp] = useState(() => ({
    w: typeof window === "undefined" ? 1280 : window.innerWidth,
    h: typeof window === "undefined" ? 800 : window.innerHeight,
  }));
  const [look, setLook] = useState(null);   // 0..15 朝向索引，null = 不用注视
  const [reaction, setReaction] = useState("");   // 单击/长按/连点…的互动反应段名
  // 注意：绝不能叫 `react` —— 那会把模块级的 react 遮住，渲染时 react.createElement 就不是函数了。
  const [sleeping, setSleeping] = useState(false);   // 长时间没动静 -> 打盹
  const [stroll, setStroll] = useState(null);        // 溜达中 {x0,x1,y,t0,dur}
  const boxRef = useRef(null);
  const dragRef = useRef(null);
  const pressRef = useRef(null);            // 长按计时器
  const reactRef = useRef(null);            // 互动反应的复位计时器
  const savedAtRef = useRef(0);   // 刚存过的时刻：挡住「还在路上的旧轮询回包」把宠物弹回角落
  const petResRef = useRef(null); // 最近一次渲染的 resource：给 effect 用，避开提前 return 造成的 TDZ
  const spotRef = useRef(null);   // 最近一次渲染算出的「宠物在哪」，同理
  const liveRef = useRef("IDLE");
  const prevLiveRef = useRef("IDLE");
  const activeRef = useRef(Date.now());     // 最后一次「有动静」的时刻
  const clicksRef = useRef([]);             // 最近的点击时刻，用来识别「被连点」
  liveRef.current = live;
  useEffect(() => petSubscribeState(setLive), []);
  // 长按/互动反应的计时器要在卸载时清掉。**必须和其他 hook 放在一起，
  // 绝不能放到下面那几个提前 return 之后** —— 那是条件调用 hook，
  // React 会直接抛错把整个组件干掉（宠物整个消失，就是我踩的这个坑）。
  useEffect(() => () => { clearTimeout(pressRef.current); clearTimeout(reactRef.current); }, []);

  // 「有动静」计时：鼠标一动、点一下、或者状态变了，都算。用于打盹/醒来。
  // 只在距上次记录超过 1 秒时才写 ref —— 免得每帧都赋值（这个监听是全局的）。
  useEffect(() => {
    const bump = () => { const t = Date.now(); if (t - activeRef.current > 1000) activeRef.current = t; };
    window.addEventListener("mousemove", bump);
    window.addEventListener("pointerdown", bump, true);
    return () => {
      window.removeEventListener("mousemove", bump);
      window.removeEventListener("pointerdown", bump, true);
    };
  }, []);
  // 状态一变也算「有动静」（开工了、出错了都该把它叫醒）。
  useEffect(() => { activeRef.current = Date.now(); }, [live]);
  // 进入「干活」的瞬间吓一跳（startle），播完自动落到 working。
  // 这个 effect 必须待在 hooks 区（提前 return 之前）—— 放到下面就是条件 hook。
  useEffect(() => {
    const prev = prevLiveRef.current;
    prevLiveRef.current = live;
    if (live === "WORKING" && prev !== "WORKING") reactTo("startle");
  }, [live]);
  // 打盹：只在「空闲」且真的很久没人理它的时候。
  // 每 5 秒查一次，开销可以忽略；睡着期间唤醒由上面的动静计时负责。
  useEffect(() => {
    const iv = setInterval(() => {
      const idleFor = Date.now() - activeRef.current;
      if (idleFor > PET_SLEEP_AFTER_MS && liveRef.current === "IDLE") setSleeping(true);
      else if (idleFor < 1500) setSleeping((was) => { if (was) reactTo("wake"); return false; });
    }, 5000);
    return () => clearInterval(iv);
  }, []);
  // 溜达：每隔 1.5~4 分钟挑一次，沿屏幕横向走一小段。溜达期间播 walk。
  useEffect(() => {
    let alive = true, wait = null;
    const schedule = () => {
      if (!alive) return;
      wait = setTimeout(() => {
        if (!alive) return;
        setStroll((cur) => {
          if (cur) return cur;
          const r = petResRef.current;
          if (!r || liveRef.current !== "IDLE") return null;
          const info = spotRef.current;      // 渲染期写好的「当前位置」，避开提前 return 造成的 TDZ
          if (!info) return null;
          const dir = Math.random() < 0.5 ? -1 : 1;
          // 溜达用**带方向**的段：横向移动用 walk（没有方向）会别扭。
          // 资源没声明就退回 walk，再没有就干脆不溜达。
          const move = petReactionClip(r, dir < 0 ? "strollLeft" : "strollRight") || petReactionClip(r, "walk");
          if (!move) return null;
          const dist = 60 + Math.round(Math.random() * 90);
          const x1 = Math.max(0, Math.min(info.vw - info.w, info.x + dir * dist));
          if (Math.abs(x1 - info.x) < 20) return null;
          return { x0: info.x, x1: x1, y: info.y, t0: Date.now(), dur: 1500, clip: move };
        });
        schedule();
      }, 90000 + Math.random() * 150000);
    };
    schedule();
    return () => { alive = false; if (wait) clearTimeout(wait); };
  }, []);
  // 溜达的位移推进
  useEffect(() => {
    if (!stroll) return undefined;
    const iv = setInterval(() => {
      const k = Math.min(1, (Date.now() - stroll.t0) / stroll.dur);
      const x = Math.round(stroll.x0 + (stroll.x1 - stroll.x0) * k);
      setPlaced({ x, y: stroll.y });
      if (k >= 1) {
        clearInterval(iv);
        savedAtRef.current = Date.now();
        fetch("/api/ds-zhuzhu-use/pets/options", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ options: { pos: { x: stroll.x1, y: stroll.y } } }),
        }).catch(() => {});
        setStroll(null);
      }
    }, 60);
    return () => clearInterval(iv);
  }, [stroll]);
  useEffect(() => {
    let alive = true;
    const tick = () => {
      fetch("/api/ds-zhuzhu-use/pets/state", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          if (!alive || !d || !d.ok) return;
          setState(d.data);
          // 磁盘上没有自定位置了（点了「归位」/改了锚点）→ 丢掉本地记忆，回到角落。
          // 但刚拖完的头几秒不认，否则一个早于 POST 发出的回包会把它弹回去。
          const p = d.data.options && d.data.options.pos;
          if (!p && Date.now() - savedAtRef.current > 3000) setPlaced(null);
        })
        .catch(() => {});
    };
    petOptionListeners.add(tick);
    tick();
    const timer = setInterval(tick, 10000);
    return () => { alive = false; petOptionListeners.delete(tick); clearInterval(timer); };
  }, []);
  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  // 注视光标：算出「宠物 -> 光标」的方位，挑 16 个朝向帧里的一个。
  // 角度约定跟 look-directions.png 的标签一致：0° 正上，顺时针（90°右 / 180°下 / 270°左），
  // 所以是 atan2(dx, -dy)。rAF 节流 + 值不变就不 setState（React 会跳过同值更新）。
  // 气泡会把容器撑高，所以「脸」的基准要减掉气泡、按精灵本身算，不然一冒泡视线就偏上。
  const pxNow = petSizePx((state && state.options) || {});
  const bubbleFont = Math.max(11, Math.min(15, Math.round(pxNow * 0.115)));
  const bubbleH = PET_BUBBLE[live] ? Math.round(bubbleFont * 2.9) : 0;
  // 只有「闲着」的时候才需要跟着光标转头。跑任务时（WORKING/...）根本不会注视，
  // 那就一个 mousemove 监听都不挂 —— 这是掉帧的主因之一，白白每帧量一次布局。
  // THINKING 也算：思考时宠物播的是 idle 段（不再单独抽搐），所以照样可以瞟光标。
  const canGaze = live === "IDLE" || live === "THINKING";
  useEffect(() => {
    if (!canGaze) { setLook(null); return undefined; }
    let raf = 0;
    let last = null;
    // getBoundingClientRect 会强制同步布局：全局 mousemove 每帧量一次，整页都跟着抖。
    // 空闲时宠物是不动的，量一次缓存着用就行（200ms 兜底，窗口滚动/缩放也能自愈）。
    let rect = null, rectAt = 0;
    const apply = () => {
      raf = 0;
      const e = last;
      if (!e) return;
      const node = boxRef.current;
      if (!node) { setLook(null); return; }
      const now = Date.now();
      if (!rect || now - rectAt > 200) { rect = node.getBoundingClientRect(); rectAt = now; }
      if (!rect.width || !rect.height) { setLook(null); return; }
      const spriteH = Math.max(1, rect.height - bubbleH);
      // 「脸」大致在精灵块的上三分之一处
      const dx = e.clientX - (rect.left + rect.width / 2);
      const dy = e.clientY - (rect.top + bubbleH + spriteH * 0.33);
      if (Math.hypot(dx, dy) < 24) { setLook(null); return; }   // 贴脸了就不扭
      const deg = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
      setLook(Math.round(deg / 22.5) % 16);
    };
    const onMove = (e) => {
      last = e;
      if (raf) return;
      raf = (typeof requestAnimationFrame === "function")
        ? requestAnimationFrame(apply)
        : (apply(), 0);
    };
    const onLeave = () => setLook(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("blur", onLeave);
    document.addEventListener("mouseleave", onLeave);
    return () => {
      if (raf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("blur", onLeave);
      document.removeEventListener("mouseleave", onLeave);
    };
  }, [canGaze, bubbleH, pxNow]);

  if (!state || !state.enabled) return null;
  const inst = state.instances || [];
  if (!inst.length) return null;
  const resId = state.resourceId || ((state.resources && state.resources[0] && state.resources[0].id) || "");
  if (!resId) return null;
  const res = (state.resources || []).find((r) => r.id === resId) || null;
  const opts = state.options || {};
  const anchor = String(opts.anchor || "bottom-right");
  const px = petSizePx(opts);
  const scale = (res && res.scale) || 1;

  // 位置优先级：正在拖 → 本地记住的 → 磁盘存的；三样都没有才用角落锚点。
  const stored = (opts.pos && Number.isFinite(opts.pos.x) && Number.isFinite(opts.pos.y)) ? opts.pos : null;
  const want = drag || placed || stored;
  const boxW = (box && box.w) || Math.round(px * scale);
  const boxH = (box && box.h) || Math.round(px * scale);
  const clampTo = (v, hi) => Math.round(Math.max(0, Math.min(Math.max(0, hi), v)));
  const at = want ? { x: clampTo(want.x, vp.w - boxW), y: clampTo(want.y, vp.h - boxH) } : null;
  const vert = at ? { top: at.y } : (anchor.indexOf("top") === 0 ? { top: 24 } : { bottom: 18 });
  const horiz = at ? { left: at.x } : (anchor.indexOf("left") !== -1 ? { left: 18, alignItems: "flex-start" } : { right: 18, alignItems: "flex-end" });
  // 给 effect 用的「当前状态快照」。必须在这里（渲染期）写：
  // effect 里的定时器回调可能在组件已经提前 return 的那一帧之后才跑，
  // 那时候直接读 res/at 会撞上 TDZ（const 还没初始化）。
  petResRef.current = res;
  spotRef.current = {
    x: at ? at.x : (anchor.indexOf("left") !== -1 ? 18 : Math.max(0, vp.w - boxW - 18)),
    y: at ? at.y : (anchor.indexOf("top") === 0 ? 24 : Math.max(0, vp.h - boxH - 18)),
    w: boxW, h: boxH, vw: vp.w, vh: vp.h,
  };

  // 互动反应：播一段就复位。计时器挂在 ref 上，新一轮反应会顶掉上一轮。
  // 用 petResRef 而不是直接读 res —— 理由同上。
  function reactTo(kind) {
    const r = petResRef.current;
    const name = petReactionClip(r, kind);
    clearTimeout(reactRef.current);
    reactRef.current = null;
    if (!name) { setReaction(""); return; }
    setReaction(name);
    reactRef.current = setTimeout(() => { reactRef.current = null; setReaction(""); }, petClipMs(r, name));
  }
  // 松手落地：先播 fall（下落）再播 drop（站稳）。两段串起来，缺哪段就只播另一段。
  function landSequence() {
    const r = petResRef.current;
    const fall = petReactionClip(r, "fall");
    const drop = petReactionClip(r, "drop");
    clearTimeout(reactRef.current);
    reactRef.current = null;
    const playDrop = () => {
      if (!drop) { setReaction(""); reactRef.current = null; return; }
      setReaction(drop);
      reactRef.current = setTimeout(() => { reactRef.current = null; setReaction(""); }, petClipMs(r, drop));
    };
    if (!fall) { playDrop(); return; }
    setReaction(fall);
    reactRef.current = setTimeout(playDrop, petClipMs(r, fall));
  }
  // 被连点：4 秒内点 3 下以上就生气。返回这次该播哪一段。
  function noteClick() {
    const now = Date.now();
    clicksRef.current = clicksRef.current.filter((t) => now - t < 4000);
    clicksRef.current.push(now);
    return clicksRef.current.length >= 3 ? "angry" : "poke";
  }

  // 拖拽：容器保持 pointerEvents:none（绝不挡应用），只有宠物本体接管指针。
  //
  // 三种手势必须分开（用户报过：只点一下没拖，就已经在播拖拽动画了）：
  //   单击            -> 互动反应（pokeClip，默认打招呼）
  //   长按 450ms 不动 -> 另一种反应（pressClip，默认思考那段）
  //   真的移动过      -> 才是拖拽动画（dragging / running-left / running-right）
  // 关键：按下时**不能**立刻算作拖拽 —— 只看「有没有移动过」这个标志。
  function grab(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const node = boxRef.current;
    if (!node) return;
    const r = node.getBoundingClientRect();
    dragRef.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, x0: e.clientX, y0: e.clientY, w: r.width, h: r.height, moved: false, dir: "", lastX: e.clientX, held: false };
    setBox({ w: r.width, h: r.height });
    setDrag({ x: r.left, y: r.top, dir: "", moved: false });
    clearTimeout(pressRef.current);
    pressRef.current = setTimeout(() => {
      const d = dragRef.current;
      if (!d || d.moved) return;
      d.held = true;                       // 长按已触发 -> 抬手时不再算单击
      reactTo("press");
    }, PET_LONG_PRESS_MS);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
  }
  function move(e) {
    const d = dragRef.current;
    if (!d) return;
    // 3px 死区：单纯点一下不算摆放，免得误触把宠物钉死。
    if (!d.moved && Math.abs(e.clientX - d.x0) + Math.abs(e.clientY - d.y0) > 3) {
      d.moved = true;
      clearTimeout(pressRef.current);      // 开始拖了，长按作废
      pressRef.current = null;
      setReaction("");                        // 互动反应让位给拖拽
    }
    if (!d.moved) return;
    // 拖动方向决定播 running-right 还是 running-left
    // （Codex 那两只的 running-left/right 就是「朝拖拽方向跑」用的）
    const step = e.clientX - d.lastX;
    if (Math.abs(step) > 0.5) d.dir = step > 0 ? "right" : "left";
    d.lastX = e.clientX;
    setDrag({ x: e.clientX - d.dx, y: e.clientY - d.dy, dir: d.dir, moved: true });
    e.preventDefault();
  }
  function drop(e) {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    clearTimeout(pressRef.current);
    pressRef.current = null;
    setDrag(null);
    if (!d.moved) {
      if (!d.held) reactTo(noteClick());   // 没移动、也没长按 -> 单击（连点多次会变成生气）
      return;                              // 单击/长按都不改位置
    }
    landSequence();                        // 松手：先落（fall）再站稳（drop）
    const nx = clampTo(e.clientX - d.dx, vp.w - d.w);
    const ny = clampTo(e.clientY - d.dy, vp.h - d.h);
    savedAtRef.current = Date.now();
    setPlaced({ x: nx, y: ny });
    fetch("/api/ds-zhuzhu-use/pets/options", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ options: { pos: { x: nx, y: ny } } }),
    })
      .then((r) => r.json())
      .then((dd) => { if (dd && dd.ok && dd.data) setState(dd.data.state); })
      .catch(() => {});
  }
  function ungrab() {
    clearTimeout(pressRef.current);
    pressRef.current = null;
    if (!dragRef.current) return;
    dragRef.current = null;
    setDrag(null);
  }
  const dragging = drag !== null && drag.moved === true;   // 只有真的移动过才算拖拽
  // 拖拽时播哪一段：资源里有 dragging 段就用它（老的 flash-honey 是这么设计的），
  // 否则按拖动方向播 running-left / running-right（Codex 那两只的用法）。
  // 注意 dragging 已经只代表「真的移动过」—— 单纯按下不算。
  const dragClip = dragging
    ? ((res && res.clips && res.clips.dragging) ? "dragging" : ("running-" + ((drag && drag.dir) || "right")))
    : "";
  // 主宠物的最终选段优先级：拖拽 > 互动反应 > 溜达(walk) > 打盹(sleep) > 由 PetSprite 按状态决定。
  // （凝视在 PetSprite 里优先级更低，所以只要有 override 它就会让位。）
  const walkClip = petReactionClip(res, "walk");
  const sleepClip = petReactionClip(res, "sleep");
  const rootOverride = dragging ? dragClip
    : (reaction
      || ((stroll && stroll.clip) ? stroll.clip
        : ((sleeping && sleepClip) ? sleepClip : "")));

  return react.createElement("div", {
    ref: boxRef,
    style: { position: "fixed", ...vert, ...horiz, zIndex: 2147482000, pointerEvents: "none", display: "flex", flexDirection: "column", gap: 6 },
  },
    inst.slice().reverse().map((it) =>
      react.createElement("div", {
        key: it.id,
        title: it.kind === "root" ? ("主宠物 · " + live + "　单击互动 / 长按看看你 / 按住拖走") : ("子代理 " + it.owner),
        onPointerDown: grab,
        onPointerMove: move,
        onPointerUp: drop,
        onPointerCancel: ungrab,
        style: {
          pointerEvents: "auto", cursor: dragging ? "grabbing" : "grab", touchAction: "none",
          display: "flex", flexDirection: "column", alignItems: "center",
        },
      },
        // 状态气泡只挂在主宠物头上（子代理自己不报状态）。
        (it.kind === "root") ? react.createElement(PetBubble, { state: live, size: px }) : null,
        react.createElement(PetSprite, {
          resourceId: resId,
          resource: res,
          state: it.kind === "root" ? live : "IDLE",
          size: it.kind === "root" ? px : Math.round(px * 0.62),
          scale,
          clipOverride: it.kind !== "root" ? "" : rootOverride,
          lookFrame: (!rootOverride && it.kind === "root") ? look : null,
        })
      )
    )
  );
}
const PET_ANCHORS = [["bottom-right", "右下"], ["bottom-left", "左下"], ["top-right", "右上"], ["top-left", "左上"]];

/** 宠物系统选项（开启后才展开）。 */
function PetOptions() {
  const [state, setState] = useState(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [sizeDraft, setSizeDraft] = useState(null);
  const sizeTimer = useRef(null);

  const load = useCallback(() => {
    fetch("/api/ds-zhuzhu-use/pets/state", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d && d.ok) setState(d.data); else setMsg((d && d.error) || "读取失败"); })
      .catch((e) => setMsg("读取失败：" + String(e)));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { if (sizeTimer.current) clearTimeout(sizeTimer.current); }, []);

  // 拉条拖动时 260ms 去抖提交：拖动过程中就能看到宠物变大变小，
  // 又不会每动一下就写一次磁盘。这条路径不碰 busy，免得「启用」按钮跟着闪。
  function saveQuiet(patch) {
    fetch("/api/ds-zhuzhu-use/pets/options", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ options: patch }),
    })
      .then((r) => r.json())
      .then((d) => { if (d && d.ok) { setState(d.data.state); petNotifyOptions(); } else setMsg((d && d.error) || "保存失败"); })
      .catch((e) => setMsg("保存失败：" + String(e)));
  }
  function onSizeInput(v) {
    setSizeDraft(v);
    if (sizeTimer.current) clearTimeout(sizeTimer.current);
    sizeTimer.current = setTimeout(() => saveQuiet({ sizePx: v }), 260);
  }

  function save(patch) {
    setBusy(true);
    setMsg("");
    // 改锚点 = 放弃自定位置，否则「位置」下拉看起来毫无反应（宠物被拖过就不跟它走了）。
    const body = (patch && Object.prototype.hasOwnProperty.call(patch, "anchor")) ? { ...patch, pos: null } : patch;
    fetch("/api/ds-zhuzhu-use/pets/options", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ options: body }),
    })
      .then((r) => r.json())
      .then((d) => { if (d && d.ok) { setState(d.data.state); petNotifyOptions(); } else setMsg((d && d.error) || "保存失败"); })
      .catch((e) => setMsg("保存失败：" + String(e)))
      .finally(() => setBusy(false));
  }

  const opt = (state && state.options) || {};
  const res = (state && state.resources) || [];
  const on = !!opt.enabled;
  // 拉条显示值：拖动中优先本地草稿（否则要等一个来回），提交后落回磁盘值。
  const shownSize = (sizeDraft != null) ? sizeDraft : petSizePx(opt);

  return react.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } },
    react.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 } },
      react.createElement("div", null,
        react.createElement("div", { style: S.label }, "启用宠物"),
        react.createElement("div", { style: S.sub }, on ? "已开启：会跟着 agent 与子代理出现" : "默认关闭，开启后才占资源")
      ),
      react.createElement("button", {
        onClick: () => save({ enabled: !on }),
        disabled: busy,
        style: { ...(on ? S.btn : S.btnPrimary), opacity: busy ? 0.5 : 1 },
      }, busy ? "…" : (on ? "停用" : "启用"))
    ),
    on ? react.createElement("div", null,
      react.createElement("div", { style: S.row },
        react.createElement("div", null,
          react.createElement("div", { style: S.label }, "外观"),
          react.createElement("div", { style: S.sub }, res.length ? "内置 + 你放进 ~/.dsh/pets/resources/ 的" : "没扫描到资源")
        ),
        react.createElement("select", {
          value: opt.resourceId || "",
          onChange: (e) => save({ resourceId: e.target.value }),
          style: S.select,
        },
          react.createElement("option", { value: "" }, "（未选择）"),
          res.map((r) => react.createElement("option", { key: r.id, value: r.id }, r.name + (r.builtin ? "（内置）" : "")))
        )
      ),
      react.createElement("div", { style: { ...S.row, display: "block" } },
        react.createElement("div", { style: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 } },
          react.createElement("div", null,
            react.createElement("div", { style: S.label }, "大小"),
            react.createElement("div", { style: S.sub }, "拉条随便拉，" + PET_SIZE_MIN + "–" + PET_SIZE_MAX + " px；下面三个是快捷刻度")
          ),
          react.createElement("div", { style: { ...S.sub, marginTop: 0, fontVariantNumeric: "tabular-nums" } }, Math.round(shownSize) + " px")
        ),
        react.createElement("input", {
          type: "range",
          min: PET_SIZE_MIN, max: PET_SIZE_MAX, step: 2,
          value: shownSize,
          onInput: (e) => onSizeInput(Number(e.target.value)),
          onChange: (e) => onSizeInput(Number(e.target.value)),
          style: { width: "100%", marginTop: 8, accentColor: "var(--dsw-alias-button-primary-fill, #0a3)", cursor: "pointer" },
        }),
        react.createElement("div", { style: { display: "flex", gap: 6, marginTop: 8 } },
          PET_SIZE_TICKS.map(([k, v]) =>
            react.createElement("button", {
              key: k,
              onClick: () => onSizeInput(v),
              style: { ...((Math.round(shownSize) === v) ? S.btnPrimary : S.btn), padding: "3px 10px" },
            }, (PET_SIZES.find(([kk]) => kk === k) || [, k])[1] + " " + v)
          )
        )
      ),
      react.createElement("div", { style: S.row },
        react.createElement("div", null,
          react.createElement("div", { style: S.label }, "位置"),
          react.createElement("div", { style: S.sub }, opt.pos
            ? ("已自定 (" + Math.round(opt.pos.x) + ", " + Math.round(opt.pos.y) + ")")
            : "按住宠物可以直接拖到任意位置")
        ),
        react.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } },
          react.createElement("select", { value: opt.anchor || "bottom-right", onChange: (e) => save({ anchor: e.target.value }), style: S.select },
            PET_ANCHORS.map(([v, t]) => react.createElement("option", { key: v, value: v }, t))
          ),
          opt.pos ? react.createElement("button", { onClick: () => save({ pos: null }), disabled: busy, style: { ...S.btn, opacity: busy ? 0.5 : 1 } }, "归位") : null
        )
      ),
      react.createElement("div", { style: S.row },
        react.createElement("div", null,
          react.createElement("div", { style: S.label }, "子代理分身上限"),
          react.createElement("div", { style: S.sub }, "每多一个子代理就多一只 mini，走了自动收回")
        ),
        react.createElement("select", { value: String(opt.miniMax == null ? 2 : opt.miniMax), onChange: (e) => save({ miniMax: Number(e.target.value) }), style: S.select },
          [0, 1, 2, 3, 4].map((n) => react.createElement("option", { key: n, value: String(n) }, n === 0 ? "不要分身" : String(n) + " 只"))
        )
      )
    ) : null,
    msg ? react.createElement("div", { style: S.msg }, msg) : null
  );
}

		// ==================== 宠物资源（按需下载） ====================
		// 安装包里不再带宠物（两只加起来 120 MB，对不用宠物的人是净负担）。
		// 资源放在仓库的 pet-assets 分支，这里只管「列出 / 下载 / 删除」，
		// 装完就落在用户宠物目录，和手工丢进去的文件夹完全同一条读取路径。
		function petBytes(n) {
			const mb = Number(n || 0) / 1048576;
			return mb >= 1 ? mb.toFixed(1) + " MB" : "";
		}

		function PetAssets({ onChanged }) {
			const [reg, setReg] = useState(null);
			const [dl, setDl] = useState(null);
			const [msg, setMsg] = useState("");
			const [busy, setBusy] = useState(false);
			const [spin, setSpin] = useState(false);

			const load = useCallback((refresh) => {
				if (refresh) setSpin(true);
				return fetch("/api/ds-zhuzhu-use/pets/registry" + (refresh ? "?refresh=1" : ""), { cache: "no-store" })
					.then((r) => r.json())
					.then((d) => {
						if (d && d.ok) {
							setReg(d.data);
							setDl(d.data.downloads || null);
							if (refresh && d.data.source !== "remote") {
								setMsg("没读到仓库清单（" + (d.data.error || "网络问题") + "），下面用的是内置列表");
							} else if (refresh) setMsg("");
						} else setMsg((d && d.error) || "读取清单失败");
					})
					.catch((e) => setMsg("读取清单失败：" + String(e)))
					.finally(() => { if (refresh) setSpin(false); });
			}, []);
			useEffect(() => { load(false); }, [load]);

			// 下载中按 700ms 拉进度。下载跑在宿主里，这个面板关掉也不影响它 ——
			// 回来时拉到的仍然是真实进度。
			const dlPhase = dl && dl.phase;
			useEffect(() => {
				if (dlPhase !== "downloading" && dlPhase !== "unpacking") return undefined;
				const t = setInterval(() => {
					fetch("/api/ds-zhuzhu-use/pets/install-state", { cache: "no-store" })
						.then((r) => r.json())
						.then((d) => {
							if (!d || !d.ok) return;
							setDl(d.data);
							if (d.data.phase === "done") {
								setMsg("装好了：重启软件后就能在「外观」里选它");
								load(false);
								if (onChanged) onChanged();
							} else if (d.data.phase === "error") {
								setMsg("下载失败：" + (d.data.error || ""));
							}
						})
						.catch(() => {});
				}, 700);
				return () => clearInterval(t);
			}, [dlPhase, load, onChanged]);

			function post(path, body, ok) {
				setBusy(true);
				setMsg("");
				fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) })
					.then((r) => r.json())
					.then((d) => {
						if (d && d.ok) { if (ok) ok(d.data); }
						else setMsg((d && d.error) || "操作失败");
					})
					.catch((e) => setMsg("操作失败：" + String(e)))
					.finally(() => setBusy(false));
			}

			const items = (reg && reg.items) || [];
			const rowStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "8px 0", borderBottom: "1px solid var(--dsw-alias-border-l2, #eee)" };
			const barOuter = { height: "4px", borderRadius: "2px", background: "var(--dsw-alias-border-l2, #e5e5e5)", overflow: "hidden", marginTop: "6px" };
			const barInner = (pct) => ({ height: "100%", width: pct + "%", background: "var(--dsw-alias-button-primary-fill, #0a3)", transition: "width .2s linear" });
			const small = { fontSize: "11px", color: "var(--dsw-alias-label-secondary, #888)", marginTop: "4px" };

			return react.createElement("div", null,
				react.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" } },
					react.createElement("div", null,
						react.createElement("div", { style: S.label }, "宠物资源"),
						react.createElement("div", { style: S.sub }, "安装包里不带宠物，需要哪只下哪只（约 60–70 MB 一只）")
					),
					react.createElement("button", {
						style: { ...S.btn, display: "inline-flex", alignItems: "center", gap: "6px" },
						onClick: () => load(true),
						disabled: spin,
					},
						spin ? react.createElement(Spinner, { size: 12 }) : null,
						"刷新清单"
					)
				),
				items.length === 0
					? react.createElement("div", { style: small }, reg ? "清单里没有可下载的宠物" : "正在读清单…")
					: react.createElement("div", { style: { marginTop: "6px" } },
						items.map((it) => {
							const mine = dl && dl.id === it.id;
							const running = mine && (dl.phase === "downloading" || dl.phase === "unpacking");
							const pct = mine && dl.total > 0 ? Math.min(100, Math.round((dl.received / dl.total) * 100)) : 0;
							return react.createElement("div", { key: it.id, style: rowStyle },
								react.createElement("div", { style: { minWidth: 0 } },
									react.createElement("div", { style: S.value },
										it.name,
										it.installed ? react.createElement("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary, #888)", marginLeft: "8px" } }, "已安装") : null
									),
									it.note ? react.createElement("div", { style: S.sub }, it.note) : null,
									running
										? react.createElement("div", { style: { width: "220px" } },
											react.createElement("div", { style: barOuter }, react.createElement("div", { style: barInner(dl.phase === "unpacking" ? 100 : pct) })),
											react.createElement("div", { style: small },
												dl.phase === "unpacking" ? "正在解压…" : (pct + "% · " + petBytes(dl.received) + (dl.speed ? " · " + petBytes(dl.speed) + "/s" : ""))
											)
										)
										: null
								),
								react.createElement("div", { style: { display: "flex", gap: "8px", alignItems: "center", flexShrink: 0 } },
									react.createElement("span", { style: S.sub }, petBytes(it.size)),
									running
										? react.createElement("button", { style: S.btn, disabled: busy, onClick: () => post("/api/ds-zhuzhu-use/pets/install/cancel", {}, (d) => { setDl(d); setMsg("已取消"); }) }, "取消")
										: it.installed
											? react.createElement("button", { style: S.btn, disabled: busy, onClick: () => post("/api/ds-zhuzhu-use/pets/uninstall", { id: it.id }, () => { setMsg("已删除 " + it.name); load(false); if (onChanged) onChanged(); }) }, "删除")
											: react.createElement("button", { style: S.btnPrimary, disabled: busy, onClick: () => post("/api/ds-zhuzhu-use/pets/install", { id: it.id }, (d) => setDl(d)) }, "下载")
								)
							);
						})
					),
				reg && reg.installDir ? react.createElement("div", { style: S.path }, "装到这个目录：" + reg.installDir) : null,
				msg ? react.createElement("div", { style: S.msg }, msg) : null
			);
		}

		// ==================== 子代理驱动 + agent 预设维护 ====================
		// 两个可选驱动（Codex CLI 377 MB / Claude Code SDK 216 MB）不放进安装包：
		// 用到再从 npm 拉，装到 profile 的 node_modules（内核就在那儿找它们）。
		// 这块就放在设置里「agent 预设」的旁边 —— 因为预设里那两行正是靠它们。
		function fmtMB(n) {
			const mb = Number(n || 0) / 1048576;
			if (mb >= 1024) return (mb / 1024).toFixed(2) + " GB";
			return (mb >= 10 ? mb.toFixed(0) : mb.toFixed(1)) + " MB";
		}

		function SubagentSection() {
			const [data, setData] = useState(null);
			const [st, setSt] = useState(null);
			const [presets, setPresets] = useState(null);
			const [msg, setMsg] = useState("");
			const [busy, setBusy] = useState("");

			const load = useCallback(() => {
				return fetch("/api/ds-zhuzhu-use/drivers", { cache: "no-store" })
					.then((r) => r.json())
					.then((d) => {
						if (d && d.ok) { setData(d.data.items); setSt(d.data.state); }
						else setMsg((d && d.error) || "读取驱动状态失败");
					})
					.catch((e) => setMsg("读取驱动状态失败：" + String(e)));
			}, []);
			const loadPresets = useCallback(() => {
				return fetch("/api/ds-zhuzhu-use/presets", { cache: "no-store" })
					.then((r) => r.json())
					.then((d) => { if (d && d.ok) setPresets(d.data); })
					.catch(() => {});
			}, []);
			useEffect(() => { load(); loadPresets(); }, [load, loadPresets]);

			// 下载中每 800ms 拉进度；完成后刷新（装好了预设那边就能启用了）
			const phase = st && st.phase;
			useEffect(() => {
				if (phase !== "downloading") return undefined;
				const t = setInterval(() => {
					fetch("/api/ds-zhuzhu-use/drivers/state", { cache: "no-store" })
						.then((r) => r.json())
						.then((d) => {
							if (!d || !d.ok) return;
							setSt(d.data);
							if (d.data.phase === "done") { setMsg("装好了：预设里对应的那行已经可以启用"); load(); loadPresets(); }
							else if (d.data.phase === "error") setMsg("下载失败：" + (d.data.error || ""));
						})
						.catch(() => {});
				}, 800);
				return () => clearInterval(t);
			}, [phase, load, loadPresets]);

			function post(path, body, ok, note) {
				setBusy((body && body.id) || path);
				setMsg("");
				return fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) })
					.then((r) => r.json())
					.then((d) => {
						if (d && d.ok) { if (ok) ok(d.data); if (note) setMsg(note); }
						else setMsg((d && d.error) || "操作失败");
					})
					.catch((e) => setMsg("操作失败：" + String(e)))
					.finally(() => setBusy(""));
			}

			const items = data || [];
			const card = { border: "1px solid var(--dsw-alias-border-l2, #e6e6e6)", borderRadius: "10px", padding: "12px 14px", marginTop: "8px" };
			const barOuter = { height: "4px", borderRadius: "2px", background: "var(--dsw-alias-border-l2, #e5e5e5)", overflow: "hidden", marginTop: "8px" };
			const barInner = (p) => ({ height: "100%", width: p + "%", background: "var(--dsw-alias-button-primary-fill, #0a3)", transition: "width .2s linear" });
			const small = { fontSize: "11px", color: "var(--dsw-alias-label-secondary, #888)", marginTop: "4px" };
			const chip = (text, tone) => react.createElement("span", {
				style: {
					fontSize: "11px", padding: "1px 8px", borderRadius: "999px", marginLeft: "8px",
					border: "1px solid " + (tone === "on" ? "rgba(16,185,129,.4)" : "var(--dsw-alias-border-l2, #ddd)"),
					color: tone === "on" ? "#059669" : "var(--dsw-alias-label-secondary, #888)",
					background: tone === "on" ? "rgba(16,185,129,.08)" : "transparent",
				},
			}, text);

			const problems = (presets || []).reduce((n, p) => n + ((p.issues || []).length), 0);
			return react.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 4 } },
				react.createElement("div", { style: S.label }, "子代理驱动"),
				react.createElement("div", { style: S.sub }, "Codex CLI / Claude Code SDK 不随安装包发布（合计约 590 MB），用到再下；装好后预设里对应的行会自动启用"),
				items.map((it) => {
					const running = st && st.id === it.id && st.phase === "downloading";
					const pct = running && st.total > 0 ? Math.min(100, Math.round((st.received / st.total) * 100)) : 0;
					return react.createElement("div", { key: it.id, style: card },
						react.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" } },
							react.createElement("div", null,
								react.createElement("span", { style: S.value }, it.name),
								chip(it.installed ? "已安装" : "未安装", it.installed ? "on" : ""),
								!it.pluginPresent ? chip("插件缺失", "") : null
							),
							react.createElement("div", { style: { display: "flex", gap: "8px", alignItems: "center", flexShrink: 0 } },
								react.createElement("span", { style: S.sub }, fmtMB(it.packages.reduce((n, p) => n + (p.approx || 0), 0))),
								running
									? react.createElement("button", { style: S.btn, disabled: !!busy, onClick: () => post("/api/ds-zhuzhu-use/drivers/cancel", {}, (d) => { setSt(d); setMsg("已取消"); }) }, "取消")
									: it.installed
										? react.createElement("button", { style: S.btn, disabled: !!busy, onClick: () => post("/api/ds-zhuzhu-use/drivers/remove", { id: it.id }, () => { setMsg("已删除 " + it.name); load(); loadPresets(); }) }, "删除")
										: react.createElement("button", { style: S.btnPrimary, disabled: !!busy, onClick: () => post("/api/ds-zhuzhu-use/drivers/install", { id: it.id }, (d) => setSt(d)) }, "下载并安装")
							)
						),
						react.createElement("div", { style: S.sub }, it.note),
						running
							? react.createElement("div", null,
								react.createElement("div", { style: barOuter }, react.createElement("div", { style: barInner(pct) })),
								react.createElement("div", { style: small },
									"第 " + st.index + "/" + st.totalParts + " 个包 · " + (st.part || "") + " · " + pct + "% · " +
									fmtMB(st.received) + (st.speed ? " · " + fmtMB(st.speed) + "/s" : ""))
							)
							: null,
						it.installed
							? react.createElement("div", { style: { ...small, wordBreak: "break-all" } }, "装在：" + it.installDir)
							: null
					);
				}),

				react.createElement("div", { style: { height: 1, background: "var(--dsw-alias-border-l2, #eee)", margin: "14px 0 6px" } }),
				react.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" } },
					react.createElement("div", null,
						react.createElement("div", { style: S.label }, "预设维护"),
						react.createElement("div", { style: S.sub }, "内核升级会改插件名：老预设里那些行会让整个预设加载失败，这里一键改掉（改前自动备份）")
					),
					problems
						? react.createElement("button", {
							style: S.btnPrimary, disabled: !!busy,
							onClick: () => post("/api/ds-zhuzhu-use/presets/fix", {}, (d) => {
								setMsg("已修复 " + d.fixed.filter((x) => x.changed).length + " 个预设（原文件已备份成 .bak-…）");
								setPresets(d.presets);
							}),
						}, "全部修复（" + problems + "）")
						: null
				),
				(presets || []).length === 0
					? react.createElement("div", { style: small }, "没有自定义预设（用的是内核自带的）")
					: react.createElement("div", null,
						(presets || []).map((p) => react.createElement("div", { key: p.id, style: card },
							react.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" } },
								react.createElement("div", { style: { minWidth: 0 } },
									react.createElement("span", { style: S.value }, p.id),
									(p.issues || []).length ? chip((p.issues.length) + " 处待修", "") : chip("正常", "on")
								),
								(p.issues || []).length
									? react.createElement("button", {
										style: S.btn, disabled: !!busy,
										onClick: () => post("/api/ds-zhuzhu-use/presets/fix", { id: p.id }, (d) => {
											setMsg("已修复 " + p.id + "（原文件已备份）");
											setPresets(d.presets);
										}),
									}, "修复")
									: null
							),
							(p.issues || []).map((r, i) => react.createElement("div", { key: i, style: small },
								r.action === "rename"
									? "· " + r.id + "：包已改名，改为 " + r.renameTo
									: r.action === "disable"
										? "· " + r.id + "：需要 " + (r.driver === "codex" ? "Codex CLI" : "Claude Code SDK") + "，未安装 → 先禁用它"
										: "· " + r.id + "：驱动已装好 → 启用它"
							)),
							react.createElement("div", { style: { ...small, wordBreak: "break-all" } }, p.file)
						))
					),
				msg ? react.createElement("div", { style: S.msg }, msg) : null
			);
		}

function PetsSection() {
			const [data, setData] = useState(null);
			const [msg, setMsg] = useState("");
			const [busy, setBusy] = useState("");
			// 装/删宠物资源之后要让「外观」下拉重新拉一次 —— 用 key 重挂载最省事，
			// 也避免在两处各存一份资源列表（那份迟早会不一致）。
			const [resNonce, setResNonce] = useState(0);

			const load = useCallback(() => {
				fetch("/api/ds-zhuzhu-use/pets", { cache: "no-store" })
					.then((r) => r.json())
					.then((d) => { if (d && d.ok) setData(d.data); else setMsg((d && d.error) || "读取失败"); })
					.catch((e) => setMsg("读取失败：" + String(e)));
			}, []);
			useEffect(() => { load(); }, [load]);

			function toggle(item) {
				setBusy(item.name);
				setMsg("");
				fetch("/api/ds-zhuzhu-use/pets/set", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ name: item.name, enabled: !item.enabled }),
				})
					.then((r) => r.json())
					.then((d) => {
						if (d && d.ok) setMsg((item.enabled ? "已停用" : "已启用") + "，重启软件后生效");
						else setMsg((d && d.error) || "保存失败");
						load();
					})
					.catch((e) => setMsg("保存失败：" + String(e)))
					.finally(() => setBusy(""));
			}

			const items = (data && data.items) || [];
			return react.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10 } },
				react.createElement(PetOptions, { key: resNonce }),
				react.createElement("div", { style: { height: 1, background: "var(--dsw-alias-border-l2, #eee)", margin: "2px 0 6px" } }),
				react.createElement("div", { style: { fontSize: 13, color: "var(--dsw-alias-label-secondary, #888)" } },
					"宠物插件默认不启用。开着玩可以，它会占用输入框附近的位置，也可能和其它插件抢命令名。"),
    // 第三方宠物插件列表已合并进上面的系统开关，页面只留一个「启用」。
				react.createElement("div", { style: { height: 1, background: "var(--dsw-alias-border-l2, #eee)", margin: "6px 0" } }),
				react.createElement(PetAssets, { onChanged: () => setResNonce((n) => n + 1) }),
				msg ? react.createElement("div", { style: S.msg }, msg) : null
			);
		}



		// ==================== 注册 ====================
		function apply(ctx) {
			// 设置页要拿 ctx.remote.pluginManager 和 ctx.layout，把上下文留给它们。
			pluginCtx = ctx;
			ctx.slots.inject("conversation.input.dock", () =>
				ctx.slots.register({
					name: "conversation.input.dock",
					id: "ds_zhuzhu_use",
					order: 50
				}, Badge)
			);

			ctx.slots.inject("conversation.chat.commandview", () =>
				ctx.slots.register({
					name: "conversation.chat.commandview",
					key: "usage"
				}, UsageCard)
			);

			ctx.slots.inject("settings.section", () =>
				ctx.slots.register({
					name: "settings.section",
					// 内核自带的「agent 预设」那块是 order 20；紧挨着它放（20.5），
					// 因为这里管的正是预设里那两行依赖的可选驱动。
					id: "subagent-drivers",
					order: 20.5,
					label: () => "子代理"
				}, SubagentSection)
			);

			ctx.slots.inject("settings.section", () =>
				ctx.slots.register({
					name: "settings.section",
					id: "software-info",
					order: 21,
					label: () => "软件信息"
				}, AboutSection)
			);

			ctx.slots.inject("settings.section", () =>
				ctx.slots.register({
					name: "settings.section",
					// 位置：官方「插件」那一页（ui-settings-plugins 的 settings.section order 15）
					// 之后。我们自己的页码是 20.5 / 21 / 23 / 24 / 25，所以接在 26 上，
					// 既不和「宠物」25 撞，也落在插件列表后面。
					id: "desktop-plugins",
					order: 26,
					label: () => "桌面插件"
				}, DesktopPluginsSection)
			);

			ctx.slots.inject("settings.section", () =>
				ctx.slots.register({
					name: "settings.section",
					id: "workspace-manager",
					order: 23,
					label: () => "工作目录"
				}, WorkspaceSection)
			);
		}

				// 侧栏底部的更新入口（官方 sidebar.footer.action 插槽），与设置页共用同一份状态。
		function applyWithUpdateEntry(ctx) {
			// documentPreviews 是**可选**依赖：拿不到就只跳过文档预览，别的照常注册。
			// 以前它写在 inject 里 —— 一旦这个服务缺失/改名，Cordis 会让整只插件原地等待，
			// 不 apply、不报错、不写日志，于是宠物/设置页//usage 卡片全部静默消失。
			// 教训：只有「没有它这插件就毫无意义」的服务才配放进 inject。
			const dp = (typeof ctx.get === "function") ? ctx.get("documentPreviews") : undefined;
			const dpRegister = (def) => (dp && typeof dp.register === "function") ? dp.register(def) : () => {};
			ctx.slots.inject("settings.section", () =>
				ctx.slots.register({ name: "settings.section", id: "session-versions", order: 24, label: () => "会话版本" }, SessionsSection)
			);
						dpRegister({ id: PV_PDF, extensions: ["pdf"], priority: "extension", title: () => "PDF", loading: "bytes-complete" });
dpRegister({ id: PV_DOCX, extensions: ["docx", "doc", "rtf"], priority: "extension", title: () => "Word", loading: "bytes-complete" });
dpRegister({ id: PV_SHEET, extensions: ["xlsx", "xlsm", "xls"], priority: "extension", title: () => "Excel", loading: "bytes-complete" });
dpRegister({ id: PV_SLIDES, extensions: ["pptx", "ppt"], priority: "extension", title: () => "PowerPoint", loading: "bytes-complete" });

			ctx.slots.inject("sidebar.right.tab.document", () => {
				ctx.slots.register({ name: "sidebar.right.tab.document", key: PV_PDF }, PdfPreview);
				ctx.slots.register({ name: "sidebar.right.tab.document", key: PV_DOCX }, NativeDocxPreview);
				ctx.slots.register({ name: "sidebar.right.tab.document", key: PV_SHEET }, NativeSheetPreview);
				ctx.slots.register({ name: "sidebar.right.tab.document", key: PV_SLIDES }, NativeSlidesPreview);
			});
						ctx.slots.inject("settings.section", () =>
				ctx.slots.register({ name: "settings.section", id: "pets", order: 25, label: () => "宠物" }, PetsSection)
			);
			ctx.slots.inject("conversation.input.dock", () =>
				ctx.slots.register({ name: "conversation.input.dock", id: "ds_zhuzhu_use-pet-state", order: 60 }, PetDock)
			);

			// 宠物浮层挂官方的全局浮层座位 shell.overlay（list / root）。
			// 官方给这个座位的原话就是「要一个盖在整个应用上的自有表面就挂这里」：
			// 可叠加、默认点击穿透，而我们的容器本来就是 position:fixed +
			// pointerEvents:none，天然合身；卸载时随 fiber 一起回收，不留空 DOM。
			// 旧写法挂在 sidebar.footer.action —— 那是侧栏底部按钮的位置，语义不对，
			// 侧栏收起时也没有座位可落。
			ctx.slots.inject("shell.overlay", () =>
				ctx.slots.register({ name: "shell.overlay", id: "ds_zhuzhu_use-pet", order: 60 }, PetOverlay)
			);

			// Chat 的常驻本体也挂在 shell.overlay，排在宠物前面（order 40 < 60），
			// 免得挡住宠物。面板没选中时它只是 display:none —— webview 一直留在 DOM 里，
			// 切回工作区不再销毁 guest，也就没有「等一会儿 / 不返回」了（见 ChatOverlay 的注释）。
			ctx.slots.inject("shell.overlay", () =>
				ctx.slots.register({ name: "shell.overlay", id: "ds_zhuzhu_use-chat", order: 40 }, ChatOverlay)
			);
			// main 的 chat 条目现在只是「量落点的锚点」：webview 不在这一层，
			// 因为 keyed 主槽一次只挂一个条目，挂在这里就必然被反复卸载。
			ctx.slots.inject("main", () =>
				ctx.slots.register({ name: "main", key: "chat" }, ChatAnchor)
			);

			ctx.slots.inject("sidebar.panellist", () =>
				ctx.slots.register({ name: "sidebar.panellist", id: "conversation", order: 10, label: () => "工作区" }, WorkspacePanelIcon)
			);

			ctx.slots.inject("sidebar.panellist", () =>
				ctx.slots.register({ name: "sidebar.panellist", id: "chat", order: 20, label: () => "Chat" }, ChatPanelIcon)
			);

			ctx.slots.inject("settings.general.item", () =>
				ctx.slots.register({ name: "settings.general.item", id: "ds_zhuzhu_use-usage-scope", order: 50 }, UsageScopeRow)
			);

			ctx.slots.inject("sidebar.footer.action", () =>
				ctx.slots.register({ name: "sidebar.footer.action", id: "ds_zhuzhu_use-update", order: 50 }, UpdateFooterAction)
			);
			apply(ctx);
		}

		exports.apply = applyWithUpdateEntry;
		exports.inject = inject;
		return module.exports;
	}
});
})();

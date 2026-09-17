# 宠物资源（pets）

本分支用于存放桌面端的**宠物资源**，不参与 `main` 的发布流程（`main` 只放壳代码与文档）。

## 目录约定

```text
pets/
  flash-honey/     # Q 版蓝发鲸尾女仆，193 个文件 ≈ 67 MB
    manifest.json  # 必需：段定义（clips / idleMicroClips / look 接口 …）
    idle/  thinking/  working/  waiting/  success/  error/   # 帧序列，文件名排序即播放顺序
    waving/  nod/  bow/  stretch/  look_around/  happy/  shy/  think_pose/
    dance/  sleepy/  eat/  jump/  walk/  running-left/  running-right/
    blink/  blink_double/  drag/  fall/  drop/  sleep/  wake/  poke/  startle/  head_pat/  angry/
    look/            # 16 朝向凝视（0° = 正上，顺时针，每格 22.5°）
    spritesheet.webp # 仅留档：客户端不会拿它切片
  pro-honey/       # 高挑优雅蓝发鲸尾少女，195 个文件 ≈ 56 MB
```

一个宠物 = 一个目录，最少只需 `manifest.json`。字段说明、切片规则与 `look/` 朝向约定见宠物目录内的说明。

## 怎么取用

只想要其中一个宠物、又不想把整分支拉下来：

```bash
git clone --depth 1 --branch pet-assets --filter=blob:none --sparse <repo-url>
cd <repo>
git sparse-checkout set pets/pro-honey     # 或 pets/flash-honey
```

也可以在 GitHub 网页上进入目录逐个下载，或对整个分支用 **Download ZIP**。

## 注意

- 两个宠物合计约 **123 MB / 389 个文件**。git 的各分支共享同一对象库，所以 `clone` 本仓库的**任何**分支都会把这部分一并拉下 —— 在意体积就用上面的 partial clone。
- 目录里是**帧序列 + `manifest.json`**，不是图集；`spritesheet.webp` 只是留档，宿主不会据此切片。
- 帧图建议保持 PNG 原样（`.gitattributes` 已把 `*.png` 标为 binary），不要跑批量压缩/重命名，否则 `manifest.json` 里的帧路径会对不上。

---

## Pets (English)

This branch holds the desktop app's **pet assets**; it does not take part in `main`'s release flow.

- One directory per pet, each with a `manifest.json` plus per-state frame folders (`idle/`, `thinking/`, …).
- ~123 MB / 389 files total. All branches share one object store, so any clone of this repo pulls them — use partial clone / sparse checkout to grab a single pet.
- The frames are pre-sliced PNG sequences; `spritesheet.webp` is kept for reference only and is never sliced at runtime.

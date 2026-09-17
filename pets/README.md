# 宠物资源（pets）

本分支用于存放桌面端的**宠物资源**，不参与 `main` 的发布流程（`main` 只放壳代码与文档）。
**授权与条款跟随 `main`**：与仓库根目录的 [LICENSE](../LICENSE)（MIT）一致。

## 内容

| 文件 | 说明 | 大小 |
|---|---|---|
| `flash-honey.zip` | Q 版蓝发鲸尾女仆（227 条目） | 67.2 MB |
| `pro-honey.zip` | 高挑优雅蓝发鲸尾少女（229 条目） | 56.0 MB |

两个压缩包内部**已带顶层目录**（`flash-honey/…`、`pro-honey/…`），解包即得完整宠物目录：

```text
<pet-id>/
  manifest.json      # 必需：段定义（clips / idleMicroClips / look 接口 …）
  idle/  thinking/  working/  waiting/  success/  error/     # 帧序列，文件名排序即播放顺序
  waving/  nod/  bow/  stretch/  look_around/  happy/  shy/  think_pose/
  dance/  sleepy/  eat/  jump/  walk/  running-left/  running-right/
  blink/  blink_double/  drag/  fall/  drop/  sleep/  wake/  poke/  startle/  head_pat/  angry/
  look/              # 16 朝向凝视（0° = 正上，顺时针，每格 22.5°）
  spritesheet.webp   # 仅留档：客户端不会拿它切片
```

## 怎么用

1. 下载并解包（解包后是一个以宠物 id 命名的目录）
2. 把整个目录放进**用户宠物目录**：

   ```text
   %USERPROFILE%\.dsh\pets\resources\<pet-id>\
   ```

   即与内置宠物（插件自带的 `pets/`）并列；客户端启动时会扫描该目录，设置页里即可切换。
3. 重启桌面端生效（宠物资源在启动时扫描）。

> 客户端读的是**解包后的 `manifest.json` + 帧目录**，压缩包只是分发载体 —— 直接把 zip 丢进 pets 目录不会被识别。

## 注意

- 两者合计约 **123 MB**。git 各分支共享同一对象库，所以 `clone` 本仓库的**任何**分支都会把这部分一并拉下；只要其中一个的话，用 partial clone 更省：

  ```bash
  git clone --depth 1 --branch pet-assets --filter=blob:none --sparse <repo-url>
  cd <repo>
  git sparse-checkout set pets
  ```

- 目录里是**帧序列 + `manifest.json`**，不是图集；`spritesheet.webp` 只是留档，宿主不会据此切片。
- 帧图请保持 PNG 原样（`.gitattributes` 已把 `*.png` / `*.zip` / `*.webp` 标为 binary），不要批量压缩或重命名，否则 `manifest.json` 里的帧路径会对不上。

---

## Pets (English)

This branch holds the desktop app's **pet assets**; it does not take part in `main`'s release flow.
**Licensing follows `main`**: the repository's [LICENSE](../LICENSE) (MIT).

- `flash-honey.zip` (67.2 MB) and `pro-honey.zip` (56.0 MB); each archive already contains its top-level `<pet-id>/` folder.
- Unpack and drop the folder into `%USERPROFILE%\.dsh\pets\resources\<pet-id>\`, next to the built-in pets, then restart the app.
- The client loads the unpacked `manifest.json` + frame folders — a `.zip` sitting in the pets directory is not recognized.
- ~123 MB total; every branch shares one object store, so any clone pulls it — use partial clone / sparse checkout if you only want one pet.

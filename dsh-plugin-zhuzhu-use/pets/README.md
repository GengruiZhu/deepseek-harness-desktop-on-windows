# pets/（内置宠物目录 —— 0.9.0-alpha1 起**故意为空**）

这个目录是「内置宠物」的扫描位置：宿主的 `petBuiltinDir()` 指的就是这里。

## 为什么不往里放宠物

两只宠物（flash-honey / pro-honey）解包后约 120 MB，压缩后也有 123 MB。放进安装包意味着：

- 不用宠物的人白付 123 MB 的下载与磁盘；
- 想要其中一只的人也得先下另一只。

所以从 **0.9.0-alpha1** 起，宠物资源不进安装包，改成**按需下载**：

> 设置 → 宠物 → **宠物资源** → 下载

资源放在仓库的 `pet-assets` 分支（`pets/*.zip` + `pets/index.json` 清单），
下载后解包落到用户宠物目录：

```text
%USERPROFILE%\.dsh\pets\resources\<pet-id>\
```

也就是和手工丢进去的文件夹**完全同一条读取路径**（`petUserDir()`），
外观下拉里会直接出现，不需要改任何代码。

## 资源契约（自己做的宠物必须满足）

```text
<pet-id>/
  manifest.json     # 必需：id / format:'clips' / clips{} / stateMap{} / idleMicroClips[] …
  idle/ thinking/ working/ waiting/ success/ error/   # 帧序列，文件名排序即播放顺序
  look/             # 16 朝向可选
  …                 # 其余互动段（poke / head_pat / drag / walk / sleep …）按需
```

- 帧图保持 PNG 原样，别改名或压缩，否则 `manifest.json` 里的路径会对不上。
- `spritesheet.webp` 只是留档：客户端读的是帧目录，不做图集切片
  （纯 Codex 格式的宠物包例外：`pet.json` + 图集才走 sprite 那条路）。
- 目录名 = 宠物 id。**同名目录只能是同一个人装的**：宿主会拒绝覆盖不是自己装的目录
  （见 `petUninstall` / `petInstall` 里的 `_installed.json` 标记）。

## 加一只新宠物（不用发新版客户端）

1. 打包成 `<pet-id>.zip`（压缩包内带顶层 `<pet-id>/` 目录）
2. 传到 `pet-assets` 分支的 `pets/`
3. 在 `pets/index.json` 的 `pets` 数组里加一行（id / name / file / size / note）

客户端「宠物资源」里点刷新就能看到它。

## Pets (English)

This directory is the *built-in* pet scan root, and it is intentionally empty since
0.9.0-alpha1: the two pets ship as ~123 MB of archives, which is a waste for anyone
not using pets. They now live on the `pet-assets` branch and are downloaded from
**Settings → Pets → Pet resources** into `%USERPROFILE%\.dsh\pets\resources\<pet-id>\` —
the same path hand-made pets use.

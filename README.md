# Mask — 代码标注与反标注工具

一个用于对代码进行标注（mark）和反标注（unmark）的 VS Code 扩展：

- **Masked** — 高亮敏感或值得关注的代码（灰色背景）
- **To Read** — 标记还需要回头阅读的代码（绿色背景）

标注是纯可视化的标记：文件内容不会被修改。所有标注持久化到单个 JSON 存储文件，
因此重启后依然存在，文件重命名、移动后能自动找回，并且（在检测到 OneDrive 时）
可跨机器同步。

> 本仓库是 [rbnnghs/mask](https://github.com/rbnnghs/mask) 的深度修改版 fork，
> 与上游的差异汇总见[与上游版本的差异](#与上游版本的差异)。

## 功能特性

- 🔖 两种标注类型，各自独立的高亮样式：**Masked** 与 **To Read**
- ↩️ 精确反标注 — 只取消一个区域的一部分时，其余部分保持标注
- 🔀 同类型的重叠或相邻标注自动合并
- 💾 单个 JSON 文件持久化，所有工作区共用
- ☁️ OneDrive 同步 — 标注跟随你到其他机器
- 📁 标注在文件重命名/移动后依然有效（按文件大小、行数和 MD5 哈希重新匹配）
- 🧹 文件行数缩减后，超出文件末尾的标注范围会被自动清理
- 🗂️ 资源管理器徽章按标注行数百分比显示：☐ < 33% · ◪ 33–66% · ▤ 67–99% · ■ 100%
- 🖱️ 悬停在标注上可查看其类型和最近一次标注时间
- 🗑️ 按文件夹批量「Clear All Masks」，带确认对话框

## 使用方法

### 标注代码

1. 选中要标注的代码（需要非空选区）。
2. 执行任一标注命令：

   | 操作 | 方式 |
   | --- | --- |
   | 标注为 **Masked** | `Ctrl+K Ctrl+M` / `Cmd+K Cmd+M`，或右键菜单 → **Mask as Masked** |
   | 标注为 **To Read** | 右键菜单 → **Mask as ToRead**，或命令面板 |

执行后文档会自动保存，标注随即写入存储文件。同一区域先从另一种类型中移除，
再标注为当前类型，因此一个范围不会同时是 Masked 和 To Read。

### 反标注代码

1. 选中已标注的文本 — 可以是整个区域，也可以只是想清除的那一部分。
2. 按 `Ctrl+K Ctrl+U` / `Cmd+K Cmd+U`，或右键菜单 → **Remove Mask**。

**Remove Mask** 会同时清除选区内的两种标注。只取消更大区域中的一段时，
该区域会被切分：选区之外的部分保持标注。

### 示例

```javascript
const config = {
    apiKey: "abc123def456",   // 标注为 Masked → 灰色高亮
    url: "https://api.example.com",
    secret: "mysecret789",    // 标注为 To Read → 绿色高亮
};
```

- 这两行会获得灰色 / 绿色背景，并在概览标尺上显示标记。
- 文件在资源管理器中显示徽章（如 ◪ = 33–66% 的行已标注），tooltip 中包含
  统计数量和最近标注时间。
- 悬停在这两行上会显示标注类型和最近一次标注时间。

### 复制行为

上游版本的「复制时替换」在本 fork 中已禁用：复制包含标注的选区时，
原文原样复制，不发生任何替换，且复制输出始终为纯文本。
`Change Mask Replacement Text` 命令仍保留，但其文本只随新标注一起存储，
不会应用到剪贴板。

### 命令一览

| 命令 | 标题 | 入口 |
| --- | --- | --- |
| `mask.markMasked` | Mask as Masked | `Ctrl+K Ctrl+M`，编辑器右键菜单 |
| `mask.markToRead` | Mask as ToRead | 编辑器右键菜单，命令面板 |
| `mask.unmarkMasked` | Remove Mask | `Ctrl+K Ctrl+U`，编辑器右键菜单 |
| `mask.changeReplacementText` | Change Mask Replacement Text | 命令面板 |
| `mask.findAllReferencesAndExpand` | Find All References and Auto Expand | `Ctrl+1` / `Cmd+1` |
| `mask.clearAllMask` | Clear All Masks | 资源管理器文件夹右键菜单，命令面板 |

说明：

- **Find All References and Auto Expand** 对光标所在符号执行 Find All References，
  并逐个遍历命中位置以展开 References 视图。其 `Ctrl+1` / `Cmd+1` 键绑定在光标
  位于编辑器内时会覆盖默认的「聚焦第一个编辑器组」。
- **Clear All Masks** 在确认对话框之后，递归清除所选文件夹内所有已标注文件的
  两种标注；从命令面板执行时目标是第一个工作区文件夹。

## 存储

所有标注存放在一个 JSON 文件中，所有工作区共用：

1. `<OneDrive>/.vscode-mask-storage/mask-storage.json` — 只要检测到 OneDrive
   目录（环境变量、`~/OneDrive` 或 `~/OneDrive - <组织名>`）就使用它，
   标注因此可跨机器同步
2. `<workspace>/.vscode/mask-storage.json` — 没有 OneDrive 时的回退位置
3. `~/.vscode-mask-storage.json` — 未打开工作区文件夹时的回退位置

每条记录存储标注范围，以及用于在重命名/移动后重新关联标注的文件元数据：

```json
{
  "file:///d%3A/project/config.js": {
    "ranges": [
      { "start": { "line": 1, "character": 15 }, "end": { "line": 1, "character": 34 } }
    ],
    "toReadRanges": [],
    "filename": "config.js",
    "fileSize": 1042,
    "lineCount": 48,
    "md5Hash": "9a8b7c…",
    "lastMaskedTime": 1757100000000,
    "lastToReadTime": 1757200000000
  }
}
```

加载时，仅凭元数据匹配上的记录会被重新以当前路径为键写入；超出文件末尾的范围
被丢弃；没有元数据的旧记录会被就地升级补全。

## 配置项

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `mask.maskedDecorationColor` | `#5f636833` | Masked 区域的背景色 |
| `mask.toReadDecorationColor` | `#9ad29a55` | To Read 区域的背景色 |
| `mask.decorationColor` | `#ff000033` | Masked 背景色的旧版回退值 |
| `mask.replacementText` | `[***]` | 随新标注存储的替换文本（不会应用于复制） |

## 安装

本 fork 未发布到扩展市场（市场上的 `mask` 包是上游原版）。请从源码构建安装：

```powershell
npm install
npm run compile
npx @vscode/vsce package   # 生成 mask-<version>.vsix
code --install-extension mask-0.0.4.vsix
```

不想安装的话，也可以在 VS Code 中打开本仓库，按 `F5` 启动扩展开发宿主直接体验。

## 环境要求

- VS Code 1.96.0 或更高版本

## 与上游版本的差异

相对于 [rbnnghs/mask](https://github.com/rbnnghs/mask) 0.0.1：

- 在 **Masked** 之外新增 **To Read** 标注类型，各自拥有独立的高亮颜色
- 标注持久化到单个跨工作区 JSON 文件，检测到 OneDrive 时存入其中以实现云同步
- 按内容元数据（大小、行数、MD5）匹配文件，标注在重命名和移动后依然有效；
  过期范围自动清理
- 资源管理器徽章显示标注行数百分比；悬停显示类型与最近标注时间
- 部分反标注可精确切分范围；重叠标注自动合并
- 新增命令：**Clear All Masks**、**Find All References and Auto Expand**
- 复制时替换已禁用；标注仅为可视化标记
- 标注 / 反标注后自动保存文档，不再弹出确认提示

## 已知问题

- 标注行数百分比基于磁盘上的文件计算；刚编辑未保存的内容可能让资源管理器
  徽章滞后一次保存。
- 内容完全相同的两个文件（大小、行数和 MD5 一致）共享同一条存储记录，
  在其中一个上做的标注也会出现在另一个上。

## 参与贡献

欢迎贡献！请随时提交 Pull Request。

## 许可证

本扩展基于 [rbnnghs/mask](https://github.com/rbnnghs/mask)，采用
[MIT License](LICENSE) 授权。

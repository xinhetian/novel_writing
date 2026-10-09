# 墨间 · 暖纸书房

一款在 Windows 本机运行的中文网络小说创作网站。米白纸面、墨绿点缀、宋体正文。无需安装 npm 依赖。

## 启动

双击 **start.cmd**，自动打开 http://127.0.0.1:3210 。需要 Node.js 22 或更新版本；启动脚本也会寻找本机 Codex 附带的 Node。

也可以在项目目录运行：

```powershell
node server.mjs
```

使用 Windows 环境变量 OPENAI_API_KEY；请勿把密钥写入代码、README 或 Git。设置后重新启动服务。可选变量 OPENAI_TEXT_MODEL（默认 gpt-4.1）、OPENAI_IMAGE_MODEL（默认 gpt-image-2）、PORT（默认 3210）。模型可用性取决于账户权限。

启动器后台运行服务。如需停止，可在任务管理器中结束对应的 node.exe；手动启动时按 Ctrl+C。不要在尚未保存时结束进程。

## 功能

- 多作品、多章节，章节和作品重命名。
- 正文、大纲、人物设定、世界观；字数统计、字体和字号、专注模式。
- 自动保存到磁盘、保存失败提示、多窗口版本冲突保护。
- 选段续写、润色、扩写、大纲生成；草稿先保存在本地，作者决定是否追加到正文。
- 选段生成水墨、电影感或插画配图，本地图库。
- TXT 导出到项目内；最近 50 次保存备份。
- 无云同步、无遥测、无外部字体、无浏览器持久化小说缓存。

## 数据在哪里

所有创作数据位于项目内的 **local-data/**：

| 路径 | 内容 |
| --- | --- |
| library.json | 全部作品、章节与设定 |
| backups/ | 最近 50 次保存前的资料快照 |
| drafts/ | AI 生成草稿 |
| images/ | 配图及其元数据 |
| exports/ | 导出的 TXT |
| server.log / server-error.log | 本地服务启动日志，不记录正文或密钥 |

备份恢复：先关闭服务，将当前 library.json 另存留档，再把需要的 backups 文件复制为 library.json，重新启动。资料损坏时服务会停止，不会用空数据覆盖。备份与原文在同一磁盘，不防磁盘损坏；如需额外备份，请复制到你控制的本地设备。

## AI 与隐私边界

只有点击生成并在预览窗口确认后，才调用 OpenAI。请求仅含窗口展示的参考片段、要求和固定的创作助手指令，**不会自动发送整章、整书或其他设定**。文字接口设置 store: false。API Key 只在本机服务端读取，不传给浏览器。

“本地保存”并不表示 AI 请求不经过云端。OpenAI 将处理你确认的输入，相关保留规则由账户与 API 数据政策决定。API 调用会产生费用。没有 Key 或无法联网时仍可正常本地写作。

接口参考：[文字生成](https://developers.openai.com/api/docs/guides/text)、[Responses 存储设置](https://developers.openai.com/api/docs/guides/migrate-to-responses)、[图片生成](https://developers.openai.com/api/reference/resources/images/methods/generate)。

## GitHub 内容隔离

.gitignore 默认忽略所有内容，仅逐项放行程序源码。local-data、密钥、日志、图片和导出均不被收录。
本地 Git hooks 在提交与推送前检查源码白名单和常见 Key 格式，推送时也检查现有历史。它们是防误操作措施，不能阻止刻意绕过 hooks 或把正文手工粘贴到源码中。

首次克隆后启用：

```powershell
git config core.hooksPath .githooks
node scripts/check-repository.mjs
```

不要强制添加本地资料，不要对 local-data 启用第三方云同步。GitHub 只托管源码；网站无需部署到云端。

## 开发与验证

纯 Node.js HTTP 服务与原生 HTML / CSS / JavaScript，无运行时第三方依赖。服务仅监听 127.0.0.1，检查 Host / Origin / Fetch Metadata，写操作要求每次启动生成的令牌；静态文件显式白名单，正文不记录到日志。

```powershell
node --test tests/server.test.mjs
node scripts/check-repository.mjs --history
```

测试使用模拟 AI 返回值，不调用付费 API。覆盖保存与恢复、版本冲突、损坏保护、外站访问阻止、显式发送确认、选段范围和本地配图/草稿/导出。

# PiJ

**把 Jev 接进编码流程：Jev 辅助决策，主模型推理与写代码。**

[English](README.md) | 简体中文

PiJ 是基于 [Pi](https://github.com/earendil-works/pi) 的终端 coding agent。它有独立的 `pij` 命令、配置与会话目录，并把 [Jev](https://typesafe.ai/) 接入技能选择、源码搜索和失败诊断。当前版本为 **0.1.0，本地可运行**；尚未发布到 npm。

```text
  PiJ  v0.1.0   Fast judgment. Deliberate code.
  Jev decisions · Pi execution · your coding model

  /pij status & modes    /model coding model    /login connect

  > Find why refresh tokens stop working after a session expires.
```

## 启动

需要 Node.js **22.19+**、npm 和 [ripgrep](https://github.com/BurntSushi/ripgrep)（`rg`，供 `pij_search` 使用）。

```sh
git clone https://github.com/tonyzdev/PiJ.git
cd PiJ
npm ci --ignore-scripts
npm run build
npm start
```

第一次启动后使用 `/login` 连接你的主模型，再用 `/model` 选择模型。PiJ 的主模型登录与 Pi 分开保存，不会自动导入 Pi 或 Codex 的凭据。

要启用 Jev，在启动进程的环境里设置 `TYPESAFE_API_KEY`。也可以复制 `.env.example` 为 `.env`，填入后运行：

```sh
node --env-file=.env bin/pij.mjs
```

PiJ 不自动加载项目中的 `.env`。没有 Jev key 时，标准 coding agent 仍可使用已连接的主模型，Jev 判断会明确回退。

### 通过 Vercel AI Gateway 使用 Jev

[Jev 已上线 AI Gateway](https://vercel.com/changelog/typesafe-ai-jev-now-available-on-ai-gateway)。PiJ 支持官方 AI SDK 7 的实验性 `evaluate` API，模型为 `typesafe-ai/jev`。终端继续在本地运行，无需把 PiJ 部署到 Vercel。

在 `.env` 中配置以下变量，随后用上面的 `node --env-file` 命令启动：

```dotenv
PIJ_JEV_PROVIDER=vercel
AI_GATEWAY_API_KEY=你的_Gateway_API_Key
```

只设置 Gateway key 时自动选择 Vercel；同时设置两种 key 时默认 TypeSafe 直连，用 `PIJ_JEV_PROVIDER` 明确选择。两条路径的 key 不混用。Gateway 调用启用 `zeroDataRetention: true`、禁用 SDK 重试，并受相同的请求/响应大小和超时限制。Gateway 的账户、计费和访问资格仍由 Vercel 决定。

Pi 也支持用 `AI_GATEWAY_API_KEY` 连接生成式主模型：在 `/model` 中选择 `vercel-ai-gateway` 下的 coding model，即可共用 Gateway key。Jev 的 evaluation 调用与主模型的文本生成仍是两条独立流程；也可以让主模型继续使用其他提供商。

可选：将当前 checkout 安装为本地命令，之后在任意项目运行 `pij`：

```sh
npm link --ignore-scripts
cd /path/to/your/project
pij
```

## 三项 Jev 能力

**技能建议。** 每次用户请求开始时，Jev 根据请求筛选技能，再阅读最多三个候选的说明和指令片段，确认是否适用。主模型收到最多两个建议，完整技能目录仍保留。只处理允许模型调用的技能；超过 254 个候选时跳过推荐。技能判断具有建议性质，不保证主模型一定加载或正确使用它。

**源码搜索。** `pij_search` 提供字面关键词时使用 ripgrep 检索；省略 `patterns` 时，根据自然语言问题扫描真实源码窗口，再让 Jev 排序。保留原文件路径、行号和原文；最多提供 32 个候选，默认返回 8 个片段。自然语言扫描最多枚举 1,000 个合规文件、每文件 256 KiB、总计 4 MiB，超出部分不被检索。它不是全仓库语义索引。

**实验性源码摘录。** 设置 `PIJ_SOURCE_BRIEFING=1` 后，每条新请求开始时自动提供最多六个文件的真实摘录。`assist` 使用 Jev 排序；`off` 和 `observe` 使用确定性选择。`assist` 仍包含失败分流，当前对照不能把效果单独归因给排序。摘录是编辑前的快照，后续仍需核对当前源码。这项实验默认关闭，尚未证明有稳定的完整任务收益；详见[实验设计](docs/experiments.md)和[实测记录](docs/experiment-results.md)。

**失败分流。** 工具返回错误后，Jev 判断更像代码、环境、依赖、网络、权限问题，还是无法判断，再附上固定的调查建议。每轮最多分析两个失败结果。原始错误和失败状态保留，不自动重试，不自动扩大权限。

Pi 的文件编辑、终端执行、流式输出、模型选择、OAuth/API key 登录、会话续接、分支和上下文压缩继续由锁定版本的 Pi SDK 提供。

## 命令

| 命令 | 用途 |
| --- | --- |
| `pij` | 交互式 coding session |
| `pij "任务"` | 带初始任务启动 |
| `pij -p "任务"` | 一次运行并打印结果 |
| `pij doctor` | 检查本地环境与凭据是否存在，不请求网络 |
| `pij decisions` | 查看最近的决策元数据 |
| `pij --jev-mode observe` | 以观察模式启动 |
| `pij --pi-help` | 查看继承的 Pi 参数 |
| `/pij` | 会话内状态和统计 |
| `/pij decisions` | 会话内最近决策 |
| `/pij assist` | 应用建议和搜索排序 |
| `/pij observe` | 调用 Jev 并记录元数据，不应用结果 |
| `/pij off` | 不请求 Jev |
| `/login`、`/model`、`/resume` | 主模型登录、选择、恢复会话 |

会话中的模式切换仅作用于当前运行实例；下次启动使用 `PIJ_MODE` 或 `--jev-mode`。`observe` 仍会产生 Jev 请求与费用。

## 配置

| 环境变量 | 默认值 |
| --- | --- |
| `TYPESAFE_API_KEY` | 未设置，Jev 回退 |
| `AI_GATEWAY_API_KEY` | 未设置，供 Vercel 路径使用 |
| `PIJ_JEV_PROVIDER` | `typesafe` 或 `vercel`，按上面的 key 规则自动选择 |
| `PIJ_HOME` | `~/.pij/agent` |
| `PIJ_MODE` | `assist` |
| `PIJ_JEV_MODEL` | TypeSafe：`jev-latest`；Vercel：`typesafe-ai/jev` |
| `PIJ_JEV_TIMEOUT_MS` | `1800`，范围 50–30000 |
| `PIJ_SOURCE_BRIEFING` | 实验性初始源码摘录：`0`（默认）或 `1` |
| `PIJ_JEV_ENDPOINT` | TypeSafe：`https://api.typesafe.ai/v1/systemone`；Vercel：SDK base URL `https://ai-gateway.vercel.sh/v4/ai` |

主模型沿用 Pi 支持的提供商环境变量和 `/login`。全局认证、设置、技能、会话位于 PiJ home；项目仍兼容 Pi 的 `.pi/` 资源和 `AGENTS.md`。项目扩展加载保留 Pi 的信任机制。

## 数据与回退

- 在 `assist` 和 `observe` 模式下，当前请求、候选技能说明/指令片段、检索到的源码、失败工具输出可能发送到 TypeSafe；选择 Gateway 时通过 Vercel 转发。不开启无关后台扫描。
- `off` 不向 TypeSafe 发请求。它不会阻止主模型按正常 coding agent 流程接收上下文。
- Jev 每次调用有总超时、响应校验和取消机制。请求最多 90 KB，响应最多 1 MB；成功结果仅在内存中缓存五分钟、最多 128 项。连续三个计入的服务失败进入 30 秒冷却。
- 本地 `decisions/*.jsonl` 记录阶段、模式、耗时、token 数、缓存与回退状态，以及实际 Pi 会话 ID 和用户消息条目 ID（`sessionId` / `userMessageId`）。同一用户请求中的多次模型、工具回合保持相同用户消息 ID，旧日志仍可读取；不记录请求、答案、源码或工具日志。每个运行实例的日志上限 2 MB；历史文件由用户保留或删除。
- **Pi 的会话记录另行保存正常对话和工具内容**，上述“元数据”限制只适用于 PiJ 决策日志。
- 相关性分数和 confidence 都不是“代码正确率”。代码正确性仍依靠检查、编译、测试和实际验收。
- `pij_search` 尊重 ignore 文件，并过滤隐藏文件、常见凭据文件、依赖与产物目录；`path` 只接受目录，`glob` 只能进一步缩小范围。为避免显式路径绕过 ignore 规则，检索从工作目录根开始；超出扫描上限时会明确提示。它不是秘密检测器，源码中硬编码的凭据不会被自动识别。

## 开发与验证

```sh
npm run check
npm test
npm run build
node bin/pij.mjs doctor
```

测试使用本地 HTTP 服务替代远程模型；真实 Pi runtime 会运行搜索、失败工具和文件写入，验证三种模式的集成行为。测试不会请求真实模型或使用付费凭据。

见 [验证记录](docs/verification.md)、[产品设计](docs/design.md) 和 [实现计划](docs/implementation-plan.md)。真实 Jev 的鉴权、连通和响应格式已验证；主模型的完整编码任务效果及速度、成本改善仍待对照测试。

## 结构

```text
bin/pij.mjs       CLI 入口
src/cli.ts        PiJ 命令与 Pi SDK 启动
src/extension.ts  会话、工具和界面集成
src/jev.ts        有界 Jev HTTP 客户端
src/gateway.ts    Vercel evaluation 协议适配
src/decisions.ts  技能、检索、失败判断
src/search.ts     源码检索与精确片段
src/telemetry.ts  本地决策元数据
test/            单元及真实 Pi runtime 集成测试
```

MIT license. Pi 及其他依赖保留各自许可证，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

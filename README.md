# mail2telegram（Cloudflare Worker）

私人仓库。基于 [TBXark/mail2telegram](https://github.com/TBXark/mail2telegram) 改造，对齐本仓库配套的 Docker `mail2telegram` 体验：

**收信 → Gemini 抽验证码（失败才本地正则）→ Telegram（预览 + 邮箱）**

- 摘要 / Summary / OpenAI 路径已移除
- 消息按钮只有 **预览**、**邮箱**（URL 直达）
- 验证码样式：AI 解析 **加粗**；本地正则 *斜体*
- 配置源码以 `src/` 为准；根目录旧 `worker.js` / `build/` 勿当现行逻辑

本地备忘见 [`tips`](./tips)。

---

## 快速配置

### 1. KV（必须）

Worker → **绑定** → KV Namespace，变量名必须是 **`DB`**。  
仅有全局 KV 命名空间不够，必须绑到本 Worker。  
本仓库 `wrangler.jsonc` 已写命名空间 id，CF Builds / `wrangler deploy` 应自动带上绑定。

### 2. 变量

| 名称 | 类型 | 说明 |
|------|------|------|
| `TELEGRAM_BOT` | Secret 推荐 | `token,chat_id`（与 Docker 相同；兼容旧 `TELEGRAM_TOKEN` + `TELEGRAM_ID`） |
| `GEMINI_API_KEY` | Secret 推荐 | Google AI Studio Key（`AIza…`）。Worker 出口常在受限地区，Gemini 可能 400，此时自动本地正则 |
| `DOMAIN` | Var | Worker 域名，**不要** `https://`，如 `mail2telegram.xxx.workers.dev` |
| `FORWARD_LIST` | Var | 可选。备份邮箱，逗号分隔；取**第一个**决定「邮箱」按钮；须在 Email Routing 目标地址已验证 |
| `FORWARD_DIR` | Var | 可选。仅 Gmail：跳到该标签/文件夹（如 `Backup`）；非 Gmail 忽略；不配则 Gmail 首页 |
| `DEBUG` | Var | 默认关。`true`：TG 显示本地兜底时的错误原因，并打 webhook 详日志 |

一般不用改：`GEMINI_MODEL`（默认 `gemini-2.5-flash-lite`）、`TIMEZONE`（`Asia/Shanghai`）、`GMAIL_U`（`0`）、`MAIL_TTL`、黑白名单等。

`wrangler` 已 `keep_vars = true`，部署不会清空 Dashboard 明文 Vars（密钥仍建议用 Secret）。

### 3. Email Routing

将域名 Catch-all（或规则）**发送到本 Worker**。  
备份靠 `FORWARD_LIST`，不要指望 Catch-all 再转一份到邮箱。

### 4. 绑定 Webhook

部署后打开一次：

`https://<DOMAIN>/init`

---

## 「邮箱」按钮规则

| 条件 | 行为 |
|------|------|
| 邮件带 `X-GM-THRID` | 优先 Gmail 精准深链（Email Routing 通常没有） |
| `FORWARD_LIST` 首个为 Gmail + 配了 `FORWARD_DIR` | 打开该标签/文件夹 |
| Gmail 未配 `FORWARD_DIR` | Gmail 首页 |
| Outlook / Hotmail / Live | Outlook 网页首页（忽略 `FORWARD_DIR`） |
| 其它域名 | `https://mail.<域名>` |
| 无 `FORWARD_LIST` 且无 `FORWARD_DIR` | 不显示「邮箱」，只留「预览」 |

已**取消** `rfc822msgid` 搜索链接。

---

## 部署

### Cloudflare Builds / Git 连接

推送到本私人仓库后，用 CF 连接该仓库构建即可。确保构建识别为 Worker（仓库内有 `wrangler.jsonc`）。

### 命令行

```bash
git clone git@github.com:shengshk/mail2telegramcf.git
cd mail2telegramcf
# 按需改 wrangler.jsonc 里的 kv id
pnpm i   # 或 npm / yarn
pnpm pub # wrangler deploy --keep-vars
```

部署后访问 `/init`，并在 Dashboard 确认 **绑定 `DB`** 与 Vars/Secrets。

---

## Telegram 行为摘要

```
验证码：123456          ← AI：加粗；本地：斜体
发件人：…
收件人：…
时间
[预览] [邮箱]
```

黑白名单仍可用内置小程序（`/white` `/block` `/test` → Open Manager）维护，规则存在 KV。

---

## 已知限制

1. **Gemini 地区**：Worker 出网 IP 可能被 Google 拒绝（`User location is not supported`），会回退本地正则；Docker 同 Key 往往正常。
2. **无附件展示**：大附件靠 `FORWARD_LIST` 备份到真实邮箱查看。
3. **预览依赖 KV**：`DB` 未绑定会导致缓存失败；发 TG 已尽量不因缓存失败而中断，但预览链接可能 404。

---

## 许可

上游为 MIT。本仓库为私人修改版，仅供所有者使用。


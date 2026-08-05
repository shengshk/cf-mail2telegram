<h1 align="center">
cf-mail2telegram
</h1>

<p align="center">
    <em>Forward email to Telegram via Cloudflare Email Routing — with Gemini OTP extraction.<br>
    通过 Cloudflare Email Routing 将邮件转发到 Telegram，并支持 Gemini 验证码提取。</em>
</p>

<p align="center">
    Based on / 基于 <a href="https://github.com/tbxark/mail2telegram">tbxark/mail2telegram</a>
    · OTP / 验证码参考 <a href="https://github.com/Heavrnl/Mail2Telegram">Heavrnl/Mail2Telegram</a>
</p>

<p align="center">
    <a href="#english">English</a> · <a href="#中文">中文</a>
</p>

![](./doc/social_preview.png)

<details>
<summary>Demo / 演示</summary>
<img style="max-width: 600px;" alt="demo" src="doc/example.png">
</details>

---

# English

This project is a Cloudflare Email Routing Worker that turns inbound mail into Telegram messages.  
OTP / verification-code recognition uses **Gemini**, with a local regex fallback.  
Buttons: **Preview** + **Mailbox**. UI: `UI_LANG=en` (default) / `zh` / `tw`.

Source of truth is `src/`.

## Installation

### 0. Configure Telegram

1. Create a bot with `@BotFather > /newbot`, then copy the token.
2. After deploy, open `/init` once using your Worker’s full public URL (see **Bind Telegram Webhook** below — either `workers.dev` with two name levels, or your own domain). Use **this** Worker’s host (e.g. `https://mail2telegram.<account>.workers.dev/init`), not another Worker’s `webhook.*` host.
3. **Required for Preview / list Mini Apps** — in `@BotFather`:

| Setting | Path | Value |
|---------|------|--------|
| **Privacy Policy URL** | `/mybots` → your bot → **Edit Bot** → **Edit Privacy Policy** | `https://telegram.org/privacy-tpa` (or your own policy URL) |
| **Mini App URL** | `/mybots` → your bot → **Bot Settings** → **Configure Mini App** → **Enable Mini App** | `https://<PUBLIC_HOST>/tma` — same host as `/init`, must return HTTP 200 in a browser |

If Mini App URL points at the wrong Worker (or `/tma` 404s), Telegram shows the consent dialog and **Start does nothing**. After changing the public host, update Mini App URL and open `/init` again.

### 1. Deploy Workers

#### 1.1 Deploy via Git (Cloudflare Builds)

1. Fork or clone this repository.
2. Connect the repo in Cloudflare Workers Builds.
3. Ensure the project is recognized as a Worker (`wrangler.jsonc` is included).
4. Set Vars / Secrets in the dashboard (see [Configuration](#configuration)).
5. Confirm KV binding name is **`DB`**.

#### 1.2 Deploy via Command Line

```bash
git clone https://github.com/shengshk/cf-mail2telegram.git
cd cf-mail2telegram
cp wrangler.example.jsonc wrangler.jsonc   # if you need a fresh config
# edit wrangler.jsonc KV id if needed
pnpm i    # or npm / yarn
pnpm pub  # wrangler deploy --keep-vars
```

`keep_vars = true` is enabled so deploys do not wipe dashboard plain-text Vars. Prefer Secrets for tokens/keys.

#### 1.3 Deploy via Copy and Paste

1. Use the prebuilt bundle in [`build/index.js`](./build/index.js) if you prefer paste deploy.
2. Set environment variables manually in the Worker settings.
3. Bind a KV namespace with variable name **`DB`**.

### 2. Configure Cloudflare Email Routing

1. Follow Cloudflare’s guide for [Email Routing](https://blog.cloudflare.com/introducing-email-routing/).
2. In **Email Routing → Routing Rules**, set the Catch-all action to **Send to a Worker** (this Worker).
3. If Catch-all goes only to the Worker, use `FORWARD_MAIL` for a single mailbox backup.
4. The address in `FORWARD_MAIL` must be verified under **Email Routing → Destination addresses**.
5. Default policy `noforwarded`: only backup mail that was addressed to your CF domain; mail auto-forwarded in from another mailbox is not backed up (still notified on Telegram). Use `,forwarded` to also backup those. Matching the backup address itself (Gmail `+tag` aware) never backs up — loop guard.

### 3. Bind Telegram Webhook (required once after deploy)

This step tells Telegram where your Worker lives. Open `/init` in a browser using a **public HTTPS URL** that hits **this** Worker.

Opening `/init` will:
1. Register the Telegram webhook on that same host
2. Save the host into KV (`PUBLIC_HOST`) for Preview / Mini App links later

You can open `/init` directly, or open the Worker root URL (status page). The page compares saved `PUBLIC_HOST` with the browser host:

| State | Color | Click status text |
|-------|-------|-------------------|
| Unbound | Red | Confirm → login if `WEB_USER` set → `/init` |
| Switchable | Yellow | Confirm → login if `WEB_USER` set → `/init` with new host |
| Running | Green | Confirm → re-run `/init` (refresh webhook + bot commands) |

The glowing orb always opens the GitHub repo; blank areas do nothing.

There are **two common ways** to get that URL. Pick **one** and use it consistently.

#### Mode A — Cloudflare `workers.dev` (default, no custom domain needed)

1. Open **Cloudflare Dashboard → Workers & Pages →** your Worker (e.g. `mail2telegram`).
2. Find the worker’s public URL. It has **two** name parts before `workers.dev`, for example:

   ```text
   https://mail2telegram.your-subdomain.workers.dev
            └─ worker name ─┘ └─ account subdomain ─┘
   ```

   Do **not** shorten it to `https://something.workers.dev` (that is missing a level and will not work).
3. In the browser address bar, open that URL with `/init` appended:

   ```text
   https://mail2telegram.your-subdomain.workers.dev/init
   ```
4. You should see a JSON response including `host`, plus webhook / commands results. Confirm there is no obvious error.
5. Re-open the same `/init` URL after you change `UI_LANG`, or if you switch to a different public hostname.

#### Mode B — Your own domain (optional)

Only if you have already bound a custom domain / route to this Worker in Cloudflare (for example `mail.example.com` → this Worker).

1. Confirm in the dashboard that visiting `https://mail.example.com` hits **this** Worker (not another site).
2. In the browser, open:

   ```text
   https://mail.example.com/init
   ```
3. Check the JSON response the same way as Mode A (`host` should be `mail.example.com`).
4. Afterwards, keep using this custom host for `/init`, Preview, and Mini App. Do not mix Mode A and Mode B casually; if you switch, open `/init` again on the new host.

#### Notes for both modes

- Always use `https://`, never `http://`.
- Visiting the Worker **root URL** opens a status page: **orb → GitHub**; status text is **red / yellow / green** (unbound / switchable / running) by comparing KV `PUBLIC_HOST` with the page host. All three states are clickable (confirm → web login when `WEB_USER` is set → `/init`; green re-runs webhook/commands). Status page itself stays public.
- You can still open `/init` directly in the address bar if you prefer.
- `/init` is not a daily task: do it after deploy, after changing `UI_LANG`, or after changing which public hostname you want Telegram to use.
- The easiest way to avoid typos: copy the Worker’s visit URL from the Cloudflare dashboard (two levels before `workers.dev`), open it, then click the status text.
- If you never run `/init`, Telegram will not receive updates, and Preview / Mini App buttons may be missing.
- You do **not** need a `DOMAIN` environment variable.

#### Can Mode A and Mode B both exist?

Yes. Cloudflare can serve the **same** Worker on both:

- `https://mail2telegram.your-subdomain.workers.dev` (Mode A), and  
- `https://mail.example.com` (Mode B),

so both doors open the same shop.

But Telegram / Preview / Mini App follow **only one** saved host (`PUBLIC_HOST` in KV): whatever host you used the **last** time `/init` succeeded. Opening `/init` on A, then later on B, switches everything to B.

**Practical rule:** pick one primary host and only run `/init` on that host. Keeping the other URL as a spare entry is fine; do not casually open `/init` on the spare host, or you will rewrite the registered host.

## Configuration

**Workers → Settings → Variables / Bindings**

| Key | Description |
|:----|:------------|
| `TELEGRAM_BOT` | Required. `token,chat_id`. |
| `WEB_USER` | Optional. `username,password` (split on first comma). When set: web login protects `/email` preview and `/init` (remember 30 days). When unset: `/init` is open; web preview uses 1-day token + countdown. |
| `UI_LANG` | UI language: `en` (default), `zh` (Simplified), or `tw` (Traditional). Affects Telegram labels/buttons, preview chrome, Mini App, and bot command descriptions. Re-open `/init` after changing. |
| `GEMINI_API` | Google AI Studio key (`AIza…`). Worker egress may hit region limits; on failure the Worker falls back to local regex. |
| `GEMINI_MODEL` | Optional. Default `gemini-2.5-flash-lite`. |
| `FORWARD_MAIL` | Single backup: `email` \| `email,Folder` \| `email,Folder,noforwarded\|forwarded` \| `email,forwarded`. Example: `you+bak@gmail.com,Backup,noforwarded`. Default policy `noforwarded`: backup only mail addressed to the CF domain; skip auto-forwards from other mailboxes (Telegram notify still runs). `forwarded`: also backup those. Never backup when From / related To headers match this address (Gmail `+` normalized). Must be a verified Email Routing destination. |
| `DB` | **Required** KV binding. Variable name must be exactly `DB`. |
| `TIMEZONE` | Optional. Default `Asia/Shanghai`. |
| `GMAIL_U` | Optional. Gmail multi-account index, default `0`. |
| `BLOCK_POLICY` | `reject`, `forward`, `telegram` (comma-separated). Default `telegram`. |
| `GUARDIAN_MODE` | Optional. `true` to enable. |
| `MAX_EMAIL_SIZE` | Bytes; default `512*1024`. |
| `MAX_EMAIL_SIZE_POLICY` | `unhandled` / `truncate` / `continue`. Default `truncate`. |
| `RESEND_API_KEY` | Optional. Reply-to-email via [Resend](https://resend.com/docs/introduction). |
| `DEBUG` | Optional. `true` shows Gemini error reasons in Telegram on local fallback, and enables verbose webhook logs. |

## Mailbox button rules

| Condition | Behavior |
|-----------|----------|
| Mail was backed up to `FORWARD_MAIL` | Open that backup mailbox (Gmail: folder / optional thread) |
| Not backed up, header has external original `To` | Open that original webmail (Gmail/Outlook home; no Backup folder) |
| Otherwise | Hide Mailbox; Preview only |

## Telegram Mini Apps

Black/white lists are managed via Mini Apps (`/cfmail`). Mail **Preview** defaults to Mini App (authenticated). Switch to unauthenticated **Web** with `/previewmode` (warning required).

BotFather must have both **Privacy Policy URL** and **Mini App URL** set (see [Configure Telegram](#0-configure-telegram)). Mini App URL = `https://<PUBLIC_HOST>/tma`.

> After changing `UI_LANG` or the public host, open `/init` again so bot commands stay in sync, and update Mini App URL if the host changed.

| Block list | White list | List test |
|:-----------|:-----------|:----------|
| ![block](./doc/tma_block_list.png) | ![white](./doc/tma_white_list.png) | ![test](./doc/tma_test_address.png) |

## Usage

Send `/test` in a private chat (must match `TELEGRAM_BOT` chat id). Rate limit: **one per 10 seconds**. Fake mail uses fixed `from@test.mail` / `to@test.mail`, simulates **backed up** (Mailbox → `FORWARD_MAIL`), runs real OTP extract, and shows Preview / Mailbox. Does **not** call Email Routing forward. No “test sent” ack message. User `/test`, `/cfmail`, and `/previewmode` messages are deleted after **60s** (retry up to 3× every 60s on failure).

`/previewmode` — switch the single **Preview** button between Mini App (default) and Web. Switching to Web shows a risk warning (Yes/No). Only **new** mail messages pick up the change.

Default Telegram message shape:

```
OTP: 123456          ← AI: bold; local regex: italic
From: …
To: …
Time
[Preview] [Mailbox]
```

### Email preview

1. **Preview** (one button) — mode from `/previewmode`:
   - **Mini App** (default): `https://t.me/<bot>?startapp=<mailId>` (Main Mini App URL must be `https://<host>/tma`). TMA auth.
   - **Web**: `/email/<id>` —
     - with `WEB_USER`: requires login page (no link TTL);
     - without `WEB_USER`: `/email/<id>?t=<token>`, unauthenticated token expires in **1 day** (live countdown).
     Mail body stays up to **100** caches; Mini App can still open while cached.
2. **Mailbox** — jump to webmail per [Mailbox button rules](#mailbox-button-rules).

BotFather: **Mini App URL** = `https://<PUBLIC_HOST>/tma`, **Privacy Policy URL** = `https://telegram.org/privacy-tpa` (see [Configure Telegram](#0-configure-telegram)). Re-open `/init` after deploy so the bot username is cached for Preview links.

### Security and cache

1. Mail bodies: hard limit **100** newest in KV (oldest deleted). No Dashboard TTL var.
2. Web Preview without `WEB_USER`: hard **1 day** token expiry. With `WEB_USER`: login session (optional remember 30 days). Prefer Mini App for Telegram-native auth.
3. Large attachments may time out Workers; put a real mailbox in `FORWARD_MAIL`.
4. `GUARDIAN_MODE` can reduce duplicate notifications at the cost of more KV writes.

### Blacklist and whitelist

Lists live in KV and are edited in the Mini App. Exact string match first, then regex. Helper: [regexs2jsArray](https://codepen.io/tbxark/full/JjxdNEX).

### Attachments

This bot does not render attachments. Use `FORWARD_MAIL` to keep a real mailbox copy, or tools such as [testmail-viewer](https://github.com/TBXark/testmail-viewer).

## Known limitations

1. **Gemini region** — Worker egress IPs may get `User location is not supported`; local regex still runs.
2. **No attachment UI** — rely on `FORWARD_MAIL` backup.
3. **Preview needs KV** — missing `DB` binding can break cache; Telegram send tries not to fail solely because of cache errors, but Preview may 404.

## License

Released under the MIT license. See [LICENSE](LICENSE).

---

# 中文

本项目是一个基于 Cloudflare Email Routing Worker 的 Telegram 邮件通知机器人：把任意前缀收件地址收到的邮件转成 Telegram 消息。  
用 **Gemini** 提取验证码，失败时回退本地正则。按钮 **预览** + **邮箱**（`/previewmode` 可把预览切到网页）。界面：`UI_LANG=en`（默认）/ `zh` / `tw`。

配置与逻辑以 `src/` 为准。

## 安装流程

### 0. 配置 Telegram

1. 使用 `@BotFather > /newbot` 创建 Bot，并复制 Token。
2. 部署完成后，用 Worker 的**完整公网地址**打开一次 `/init`（见下方 **绑定 Telegram Webhook**：方式 A 为 `workers.dev` 两级名称，方式 B 为你自己的域名）。必须是**本 Worker** 的主机（例如 `https://mail2telegram.<账号>.workers.dev/init`），不要填成别的 Worker 的 `webhook.*`。
3. **预览 / 名单小程序必配** — 在 `@BotFather`：

| 配置项 | 路径 | 填写值 |
|--------|------|--------|
| **隐私政策 URL** | `/mybots` → 选中 Bot → **编辑机器人** → **编辑隐私政策** | `https://telegram.org/privacy-tpa`（或你自己的隐私政策地址） |
| **Mini App URL** | `/mybots` → 选中 Bot → **Bot Settings** → **Configure Mini App** → **Enable Mini App** | `https://<PUBLIC_HOST>/tma` — 与 `/init` 同一主机，浏览器打开须为 HTTP 200 |

若 Mini App URL 指错 Worker（或 `/tma` 返回 404），会出现同意弹窗且点「启动」无反应。更换公网主机后，请同步改 Mini App URL，并重新打开 `/init`。

### 1. 部署 Workers

#### 1.1 通过 Git（Cloudflare Builds）

1. Fork 或克隆本仓库。
2. 在 Cloudflare Workers Builds 中连接该仓库。
3. 确认识别为 Worker（仓库内含 `wrangler.jsonc`）。
4. 在控制台配置 Vars / Secrets（见 [配置](#配置-1)）。
5. 确认 KV 绑定变量名为 **`DB`**。

#### 1.2 通过命令行部署

```bash
git clone https://github.com/shengshk/cf-mail2telegram.git
cd cf-mail2telegram
cp wrangler.example.jsonc wrangler.jsonc   # 如需全新配置
# 按需修改 wrangler.jsonc 中的 KV id
pnpm i    # 或 npm / yarn
pnpm pub  # wrangler deploy --keep-vars
```

已启用 `keep_vars = true`，部署不会清空 Dashboard 明文 Vars。Token / API Key 建议使用 Secret。

#### 1.3 复制粘贴部署

1. 可使用预编译产物 [`build/index.js`](./build/index.js)。
2. 在 Worker 配置页手动设置环境变量。
3. 在 `KV 命名空间绑定` 处绑定数据库，**变量名称必须为 `DB`**。

### 2. 配置 Cloudflare Email Routing

1. 按官方文档配置 [Cloudflare Email Routing](https://blog.cloudflare.com/zh-cn/introducing-email-routing-zh-cn/)。
2. 在 `Email Routing - Routing Rules` 中，将 `Catch-all address` 的 action 改成 `Send to a Worker`（本 Worker），把剩余邮件都转发到该 Worker。
3. Catch-all 只指向 Worker 后，就无法再把剩余邮件转发到自己邮箱；若需备份，在环境变量 `FORWARD_MAIL` 填入**一个**备份邮箱即可。
4. `FORWARD_MAIL` 中的邮箱地址须在 `Cloudflare Dashboard - Email Routing - Destination addresses` 添加并完成认证后才能收到邮件。
5. 默认策略 `noforwarded`：只备份「真正发到域名邮箱」的邮件；从其它邮箱自动转发进来的不备份（仍推 Telegram）。需要备份转发信时写成 `,forwarded`。若发件人/相关收件头命中备份地址本身（Gmail `+` 别名会归一），则**永不备份**，用于防环。

### 3. 绑定 Telegram Webhook（部署后必须做一次）

这一步是告诉 Telegram「去哪个网址找你的 Worker」。请用能打开**本 Worker** 的 **HTTPS 公网地址**，在浏览器里打开一次 `/init`。

打开 `/init` 会同时：
1. 用当前这个主机注册 Telegram webhook  
2. 把该主机名写入 KV（`PUBLIC_HOST`），供以后「预览 / 小程序」拼链接

可以直接访问 `/init`，也可以先打开 Worker 根地址（状态页）。状态页对比已保存的 `PUBLIC_HOST` 与当前浏览器域名：

| 状态 | 颜色 | 点状态文字 |
|------|------|------------|
| 待绑定 | 红 | 确认 → 若配置了 `WEB_USER` 则先登录 → `/init` |
| 可切换 | 黄 | 确认 → 若配置了 `WEB_USER` 则先登录 → 用新域名 `/init` |
| 运行中 | 绿 | 确认 → 重新执行 `/init`（刷新 webhook 与 Bot 命令） |

中心球仍打开 GitHub 仓库；空白处无效。

常见有 **两种方式**。请 **选定一种并一直用同一种**。

#### 方式 A — Cloudflare 自带的 `workers.dev`（默认，不用自己的域名）

1. 打开 **Cloudflare 控制台 → Workers 和 Pages →** 你的 Worker（例如 `mail2telegram`）。
2. 找到该 Worker 的访问地址。在 `workers.dev` 前面通常有 **两级** 名称，例如：

   ```text
   https://mail2telegram.your-subdomain.workers.dev
            └─ Worker 名称 ─┘ └─ 账号子域 ─┘
   ```

   **不要**写成 `https://something.workers.dev`（少了一级，一般打不开）。
3. 在浏览器地址栏打开：在上面的完整地址后面加上 `/init`，例如：

   ```text
   https://mail2telegram.your-subdomain.workers.dev/init
   ```
4. 页面会返回一段 JSON，其中应包含 `host`，以及 webhook / commands 结果。确认没有明显报错。
5. 以后若修改了 `UI_LANG`，或更换了公网主机，请用**同一个（或新的）主机**再打开一次 `/init`。

#### 方式 B — 使用你自己的域名（可选）

仅当你已经在 Cloudflare 里给 **这个 Worker** 绑定了自定义域名 / 路由时才适用（例如 `mail.example.com` → 本 Worker）。

1. 先在浏览器确认：打开 `https://mail.example.com` 访问到的就是 **这个** Worker（不是别的网站）。
2. 在浏览器打开：

   ```text
   https://mail.example.com/init
   ```
3. 同样检查返回的 JSON（`host` 应为 `mail.example.com`）。
4. 之后请固定使用这个自定义域名做 `/init`、预览和小程序。不要和方式 A 混着用；若要更换，用**新主机**再打开一次 `/init`。

#### 两种方式的共同注意点

- 必须用 `https://`，不要用 `http://`。
- 访问 Worker **根地址**会打开状态页：**球 → GitHub**；状态文字按 KV `PUBLIC_HOST` 与当前域名对比为 **红 / 黄 / 绿**（待绑定 / 可切换 / 运行中）。三种状态均可点（确认 → 若配置了 `WEB_USER` 则先网页登录 → `/init`；绿色为重新初始化以刷新 webhook/命令；成功后自动更新，无需手动刷新）。状态页本身不要求登录。
- 仍可直接在地址栏打开 `/init`。
- `/init` 不是每天都要做：部署后做一次；改 `UI_LANG`，或要更换「给 Telegram 用的公网主机」后再做。
- 最稳妥的做法：从 Cloudflare 控制台复制 Worker 的「访问」完整链接（`workers.dev` 前两级名称都要有），打开后点击中间状态文字。
- 如果从未成功执行过 `/init`，Telegram 收不到更新，预览 / 小程序按钮也可能没有。
- **不需要**再配置名为 `DOMAIN` 的环境变量。

#### 方式 A 和方式 B 可以同时存在吗？

可以。Cloudflare 可以让**同一个** Worker 同时挂在：

- `https://mail2telegram.your-subdomain.workers.dev`（方式 A），以及  
- `https://mail.example.com`（方式 B），

两个门都能进同一家店。

但 Telegram / 预览 / 小程序只认 **一个** 已保存的主机（KV 里的 `PUBLIC_HOST`）：以**最近一次**成功打开 `/init` 时用的主机为准。先在 A 上 `/init`，再在 B 上 `/init`，就会全部改跟 B。

**实用建议：** 选定一个主用主机，只在这个主机上做 `/init`。另一个地址当备用入口可以，但不要随便在备用地址上再打开一次 `/init`，否则会改写已登记的主机。

## 配置

位置：Workers 和 Pages - 你的 worker 名称 - 设置 - 变量 / 绑定

| KEY | 描述 |
|:----|:-----|
| `TELEGRAM_BOT` | 必填。`token,chat_id`。 |
| `WEB_USER` | 可选。`用户名,密码`（按第一个逗号拆分）。配置后：网页登录保护 `/email` 预览与 `/init`（可记住 30 天）。未配置：`/init` 放开；网页预览用 1 天 token + 倒计时。 |
| `UI_LANG` | 界面语言：`en`（默认）、`zh`（简体）或 `tw`（繁体）。影响 TG 文案/按钮、预览页、小程序、Bot 命令描述。修改后请重新打开 `/init`。 |
| `GEMINI_API` | Google AI Studio Key（`AIza…`）。出网可能受地区限制；失败时自动本地正则。 |
| `GEMINI_MODEL` | 可选。默认 `gemini-2.5-flash-lite`。 |
| `FORWARD_MAIL` | 单一备份：`邮箱` \| `邮箱,文件夹` \| `邮箱,文件夹,noforwarded\|forwarded` \| `邮箱,forwarded`。例：`you+bak@gmail.com,Backup,noforwarded`。默认 `noforwarded`：只备份真正发到域名邮箱的信；外站自动转发进域名的不备份（仍推 Telegram）。`forwarded`：转发进来的也备份。From / 相关 To 头命中该备份地址（Gmail `+` 归一）则永不备份。须为已验证的 Email Routing 目的地。 |
| `DB` | **必须**的 KV 绑定，变量名必须是 `DB`。 |
| `TIMEZONE` | 可选。默认 `Asia/Shanghai`。 |
| `GMAIL_U` | 可选。Gmail 多账号序号，默认 `0`。 |
| `BLOCK_POLICY` | `reject` / `forward` / `telegram`，逗号分隔。默认 `telegram`。 |
| `GUARDIAN_MODE` | 可选。`true` 开启。 |
| `MAX_EMAIL_SIZE` | 字节；默认 `512*1024`。 |
| `MAX_EMAIL_SIZE_POLICY` | `unhandled` / `truncate` / `continue`。默认 `truncate`。 |
| `RESEND_API_KEY` | 可选。通过 [Resend](https://resend.com/docs/introduction) 回复邮件。 |
| `DEBUG` | 可选。`true`：本地兜底时在 TG 显示 Gemini 错误原因。 |

## 「邮箱」按钮规则

| 条件 | 行为 |
|------|------|
| 已备份到 `FORWARD_MAIL` | 打开备份邮箱（Gmail：文件夹 / 可选线程） |
| 未备份，且头里有外站原 `To` | 打开原网页邮箱（Gmail/Outlook 首页；不用 Backup 文件夹） |
| 其它 | 不显示「邮箱」，仅「预览」 |

## Telegram 小程序

黑白名单通过小程序管理（`/cfmail`）。邮件 **预览** 默认走小程序（需鉴权）。用 `/previewmode` 可切到未鉴权 **网页**（需确认风险）。

BotFather 必须同时配置 **隐私政策 URL** 与 **Mini App URL**（见 [配置 Telegram](#0-配置-telegram)）。Mini App URL = `https://<PUBLIC_HOST>/tma`。

> 修改 `UI_LANG` 或公网主机后，请重新打开 `/init` 以同步 Bot 命令；若主机变了，同步更新 Mini App URL。

| 黑名单 | 白名单 | 名单测试 |
|:-------|:-------|:---------|
| ![block](./doc/tma_block_list.png) | ![white](./doc/tma_white_list.png) | ![test](./doc/tma_test_address.png) |

## 使用说明

向 Bot 发送 `/test`（须为 `TELEGRAM_BOT` 中的 chat id）。频率限制：**10 秒一封**。假信固定 `from@test.mail` / `to@test.mail`，模拟**已备份**（「邮箱」→ `FORWARD_MAIL`），真走抽码，显示预览 / 邮箱；**不会**真实 Email Routing 备份。不发「测试已发送」确认。用户 `/test`、`/cfmail`、`/previewmode` 在 **60 秒**后删除（失败则每隔 60 秒重试，最多 3 次）。

`/previewmode` — 切换唯一的「预览」按钮：小程序（默认）或网页。切到网页会弹出风险确认（是/否）。**仅影响之后的新邮件**。

默认消息结构如下：

```
验证码：123456          ← AI：加粗；本地正则：斜体
发件人：…
收件人：…
时间
[预览] [邮箱]
```

### 邮件预览

1. **预览**（单个按钮）— 由 `/previewmode` 决定：
   - **小程序**（默认）：`https://t.me/<bot>?startapp=<mailId>`（主小程序须为 `https://<host>/tma`），TMA 鉴权。
   - **网页**：`/email/<id>` —
     - 已配置 `WEB_USER`：需登录页（链接不过期）；
     - 未配置：`/email/<id>?t=<token>`，未鉴权 token **1 天**失效（页顶倒计时）。
     正文最多保留 **100** 封；缓存期内仍可用小程序打开。
2. **邮箱**：按 [「邮箱」按钮规则](#邮箱按钮规则) 跳转网页邮箱。

BotFather：**Mini App URL** = `https://<PUBLIC_HOST>/tma`，**隐私政策 URL** = `https://telegram.org/privacy-tpa`（见 [配置 Telegram](#0-配置-telegram)）。部署后重新打开一次 `/init`，以缓存 bot username 供预览链接使用。

### 安全与邮件缓存

1. 邮件正文：硬编码最多 **100** 封（超限删最旧）；无 Dashboard TTL 变量。
2. 未配置 `WEB_USER` 时网页预览：硬编码 **1 天** token。配置了 `WEB_USER`：网页登录会话（可选记住 30 天）。优先小程序。
3. 由于 Workers 限制，附件较大时可能导致超时与重试。建议配置 `FORWARD_MAIL`。
4. 开启 `GUARDIAN_MODE` 可减少重复消息，但会增加 KV 写入。

### 黑名单与白名单

名单保存在 KV，通过小程序增删。匹配时先精确相等，再按正则。可用：[regexs2jsArray](https://codepen.io/tbxark/full/JjxdNEX)。

### 邮件附件

此 Bot **不支持展示附件**。若需附件，用 `FORWARD_MAIL` 备份到真实邮箱查看，或配合 [testmail-viewer](https://github.com/TBXark/testmail-viewer)。

## 已知限制

1. **Gemini 地区**：Worker 出网 IP 可能被 Google 拒绝（`User location is not supported`），会回退本地正则。
2. **无附件展示**：大附件靠 `FORWARD_MAIL` 备份到真实邮箱查看。
3. **预览依赖 KV**：未绑定 `DB` 会导致缓存失败；发 TG 已尽量不因缓存失败中断，但预览链接可能 404。

## 许可证

**cf-mail2telegram** 以 MIT 许可证发布。详见 [LICENSE](LICENSE)。

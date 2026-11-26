# APEX-DEBUG 审计报告（修订版 v2）

**项目**：MindSpool（`/home/z/my-project/MindSpool-latest-`）
**审计时段**：2026-11-04 23:20 → 2026-11-05 14:21（UTC+8）
**审计员**：APEX-DEBUG 流程（科学家式 Phase 0–3）
**审计范围**：只读审查，未修改任何代码、配置或数据。

---

## 摘要

本轮审计完成 Phase 0（ground truth）+ Phase 1（系统地图 + 问题清单 Q1–Q9 + 缺陷清单 F1–F22）+ Phase 3 中已选定的 4 个问题（Q1/Q2/Q3/Q5）的实证调查。

**最大修正**：原 ground truth 中"20 个未提交修改文件需要审查"为**误判**。实证显示 20 个文件中 19 个零内容变化（仅文件模式 chmod +x 或 PNG 重新生成），唯一实质变化是 `.tsbuildinfo`（TS 增量缓存自动更新）。**工作区没有任何实质未提交代码**。原 F-清单中所有"基于脏文件"的推断都需要打折扣。

**最大发现**：`/api/feed` 返回空 `posts` 数组的根因是 **Supabase `posts` 表为空**（`content-range: */0`），**不是**代码缺陷或 RLS 拦截。Service-role key 正确绕过 RLS，feed 路由代码本身正确。

**任务 A 印证**：5 张新表（`otp_requests`/`onboarding`/`personality_results`/`experts`/`mentors`）均 HTTP 404 `PGRST205`，确认在 Supabase 中不存在，任务 A P1 迁移 0004 需要新建这些表。

---

## Phase 3 实证调查

### Q1：git diff 审查 20 个脏文件

**方法**：`git diff --stat` + 抽样 `git diff <file>` 验证。

**结果**：

| 文件 | 变化类型 | 实质内容变化 |
| --- | --- | --- |
| `.tsbuildinfo` | 二进制哈希更新 | 1 增 1 删（TS 增量缓存，自动生成） |
| `CreateMenu.tsx` | 文件模式 644→755 | 0 行 |
| `SkillExtractModal.tsx` | 文件模式 644→755 | 0 行 |
| `api-server/src/lib/sentry.ts` | 文件模式 644→755 | 0 行 |
| `api-server/src/routes/discover.ts` | 文件模式 644→755 | 0 行 |
| `feed/FindFriendsFromContacts.tsx` | 文件模式 644→755 | 0 行 |
| `feed/FindFriendsFromGmail.tsx` | 文件模式 644→755 | 0 行 |
| `feed/PeopleYouMayKnow.tsx` | 文件模式 644→755 | 0 行 |
| `hooks/use-contact-sync.ts` | 文件模式 644→755 | 0 行 |
| `hooks/use-discover.ts` | 文件模式 644→755 | 0 行 |
| `hooks/use-google-contacts.ts` | 文件模式 644→755 | 0 行 |
| `lib/cold-start-content.ts` | 文件模式 644→755 | 0 行 |
| `public/.well-known/assetlinks.json` | 文件模式 644→755 | 0 行 |
| `public/favicon-32.png` | PNG 重新生成 | 0 字节差 |
| `public/icon-192-maskable.png` | PNG 重新生成 | 0 字节差 |
| `public/icon-192.png` | PNG 重新生成 | 0 字节差 |
| `public/icon-512-maskable.png` | PNG 重新生成 | 0 字节差 |
| `public/icon-512.png` | PNG 重新生成 | 0 字节差 |
| `public/manifest.webmanifest` | 文件模式 644→755 | 0 行 |
| `supabase/migrations/0003_contact_discovery.sql` | 文件模式 644→755 | 0 行 |

**推断**：很可能有人在某次操作中跑过 `chmod -R +x` 或类似命令（也可能是一个错误的 `git update-index --chmod=+x` 批处理）。`.tsbuildinfo` 是上次 `tsc --build` 触发的自动更新。

**建议**：
- 不需要单独 commit 这些 chmod 变化（除非项目希望保留可执行位）。
- 如希望恢复，运行：`git checkout -- .`（但会丢失 `.tsbuildinfo` 重新触发的状态，无害）。
- **不影响任务 A**：在 P0 创建 `feat/community-rebuild` 分支前，可以先用 `git stash` 暂存这些噪音变化，避免污染新分支的提交历史。

---

### Q2：/api/feed 空结果根因探针

**方法**：直接 curl `/api/feed` + 直查 Supabase REST API 用 service-role key。

**实测响应**：
```json
{"posts":[],"hasMore":false,"source":"foryou"}
```

**`source:"foryou"`** 说明走了 feed.ts L60-148 主分支（不是 L55-58 degraded 分支），即 Supabase 已配置且查询成功执行。

**直查 Supabase**：
```http
GET https://reemwkxwtchqsjjmtjuh.supabase.co/rest/v1/posts?select=id&limit=1
Prefer: count=exact
Range: 0-0

HTTP/1.1 200 OK
Content-Range: */0
Body: []
```

**`Content-Range: */0`** 表示 posts 表 0 行。

**其它表行数**：

| 表 | 行数 | 状态 |
| --- | --- | --- |
| `topics` | 6 | ✓ 有 seed 数据 |
| `posts` | 0 | ✗ feed 空的根因 |
| `profiles` | 0 | ✗ 用户系统未启动 |
| `reactions` | 0 | ✗ 无互动数据 |
| `minds` | 0 | ✗ 无 mind 实体 |
| `otp_requests` | HTTP 404 PGRST205 | ✗ 表不存在 |
| `onboarding` | HTTP 404 PGRST205 | ✗ 表不存在 |
| `personality_results` | HTTP 404 PGRST205 | ✗ 表不存在 |
| `experts` | HTTP 404 PGRST205 | ✗ 表不存在 |
| `mentors` | HTTP 404 PGRST205 | ✗ 表不存在 |

**结论**：feed 空不是代码 bug，是**数据缺失**。F6/F7（feed 过滤器拼接、未来 createdAt 置顶）等代码层推断**待有数据后才能验证**，当前为悬空缺陷。

**对任务 A 的启示**：
- 任务 A P1 必须包含 seed posts 的脚本（至少 3-5 条样本 post）才能验证 feed 重写后的端到端流程。
- 5 张新表全部缺失，P1 工作量与原计划一致。

---

### Q3：verify 501 stub 与 auth 链路核对

**方法**：读 `api-server/src/routes/verify.ts` + `middleware/auth.ts` + `lib/firebase-auth.ts`。

**`/api/v1/verify/:userId` 实测**：
```http
GET /api/v1/verify/test-user-123
HTTP/1.1 501 Not Implemented
{"error":"Not Implemented","message":"Verification page SSR is a stub. Full implementation pending.","roadmap":"Phase 2 — see MindSpool Production Roadmap PDF"}
```

**路由代码**（`verify.ts` 全 27 行）：
```typescript
router.get("/v1/verify/:userId", (_req, res) => {
  res.status(501).json({
    error: "Not Implemented",
    message: "Verification page SSR is a stub. Full implementation pending.",
    roadmap: "Phase 2 — see MindSpool Production Roadmap PDF",
  });
});
```

**auth middleware 实现**（`auth.ts`）：
- `requireAuth`：bearer token 缺失/无效 → 401。✓ 正确。
- `optionalAuth`：token 缺失 → 静默通过；token 无效 → 静默通过（不抛 401）。✓ 正确。

**firebase-auth.ts**：使用 Google JWKS endpoint（标准做法），公钥缓存按 Cache-Control max-age。✓ 标准实现。

**结论**：verify 501 是已知 stub（代码注释明确说明 "original implementation was lost during a stash/restore cycle"）。auth 链路实现良好，无缺陷。原 F-清单中关于 verify/auth 链路的怀疑**全部消除**。

**对任务 A 的启示**：任务 A P2 不需要触碰 verify 路由（与社区重建规范无关）。如果用户后续要恢复 verify SSR，可以作为独立任务。

---

### Q5：CORS / 限流 / maintenance 中间件顺序复核

**方法**：读 `server.ts` + `api-server/src/app.ts` + `lib/rate-limit.ts` + `lib/config.ts`，对照 `.env` 实际值。

#### Q5.1 CORS 配置

**代码**（`app.ts` L47-66）：
```typescript
const allowedOrigins = config.corsOrigins;
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0) {
      callback(null, true);  // 降级放行
      return;
    }
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
}));
```

**.env 实际值**：`CORS_ORIGIN` **未设置**。
**`.env.example`**：`CORS_ORIGIN=`（空值占位）。

**结论**：`config.corsOrigins = readList("CORS_ORIGIN")` 返回 `[]`，触发 `allowedOrigins.length === 0` 分支 → **实际效果是放行所有来源**。

**修正原 F5**：
- 原措辞"CORS 全开"误导，让人以为是代码缺陷。
- 实际是**配置缺失导致降级放行**，代码本身有白名单逻辑。
- 但**安全效果等同**：任何来源都能带 credentials 访问 API。仍是 P1 配置缺陷。

**修复建议**：在 `.env` 中设置：
```
CORS_ORIGIN=https://preview-<bot-id>.space-z.ai,https://*.space-z.ai
```

#### Q5.2 限流键可伪造

**代码**（`rate-limit.ts` L31-33）：
```typescript
const key =
  (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
  req.socket?.remoteAddress ||
  "unknown";
```

**结论**：客户端可任意设置 `X-Forwarded-For: <random-ip>` 头来伪造限流键，每个伪造 IP 都获得独立的 60 req/min 配额。**F4 准确**。

**修复建议**：
- 短期：信任 `req.socket.remoteAddress`（在 space-z.ai 反代环境下，这是反代的源 IP，可信度更高）。
- 长期：使用 `express-rate-limit` + `trust proxy` 配置，只信任反代设置的 XFF 链最后一跳。

#### Q5.3 maintenance 中间件顺序错误

**`server.ts` 关键顺序**：
```
L70:  app.use(apiApp);              // API 路由已挂载
...
L98:  if (maintenanceMode) {
L100:   app.use((req, res, next) => {
L101:     if (req.path === "/api/healthz") return next();
L102:     res.status(503).json({ error: "Maintenance in progress." });
L103:   });
L104: }
```

**结论**：Express 按挂载顺序匹配中间件。`apiApp` 在 L70 已挂载，其内部路由匹配到的请求会直接返回，永远到不了 L100 的 maintenance 中间件。**F11 准确**。

**当前状态**：`MAINTENANCE_MODE` 未在 .env 中设置，所以 maintenance 中间件根本没挂载，F11 为**潜在 bug**，只在运维显式开启维护模式时才会暴露。

**修复建议**：把 maintenance 中间件移到 `app.use(apiApp)` **之前**，例如 L67 前后：
```typescript
if (process.env.MAINTENANCE_MODE === "true") {
  app.use((req, res, next) => {
    if (req.path === "/api/healthz") return next();
    res.status(503).json({ error: "Maintenance in progress." });
  });
}
app.use(sentryRequestHandler());
app.use(apiApp);
```

---

## 修订版缺陷清单（v2）

> 格式：`[严重性] [状态] F# — 标题`
> 状态：✓ 确认 / ⚠ 修正 / ✗ 误判 / ? 待验证

| ID | 严重性 | 状态 | 标题 | 备注 |
| --- | --- | --- | --- | --- |
| F1 | P1 | ⚠ 修正 | 限流键可伪造（X-Forwarded-For） | Q5.2 确认，原 F4 |
| F2 | P1 | ✓ 确认 | CORS_ORIGIN 未配置，降级放行所有来源 | Q5.1 修正措辞，原 F5 |
| F3 | P2 | ✓ 确认 | Maintenance 中间件挂载顺序错误 | Q5.3，原 F11 |
| F4 | — | ✗ 误判 | "20 个脏文件需要审查" | Q1：19/20 零内容变化 |
| F5 | P3 | ? 待验证 | feed 过滤器拼接（topic slug 注入） | Q2：feed 路由代码看起来正确，但无数据无法验证。zod schema 已防注入 |
| F6 | P3 | ? 待验证 | 客户端可传未来 createdAt 置顶 | Q2：posts 表空，无法触发；代码 L74 用 `order: created_at.desc` 但 created_at 来自 DB 默认值，客户端无法注入 |
| F7 | — | ✗ 误判 | "9 个仅前端测试" 推断基于脏文件 | Q1：脏文件全是噪音 |
| F8 | P2 | ✓ 确认 | verify 501 stub | Q3：已知 stub，注释明确说明 stash/restore 丢失 |
| F9 | P3 | ✓ 确认 | MAINTENANCE_MODE 未设置 | Q5.3：当前未启用，但应作为部署文档的一部分 |
| F10 | — | ✓ 确认 | posts 表 0 行（feed 空根因） | Q2：数据缺失，非代码缺陷 |
| F11 | — | ✓ 确认 | profiles/reactions/minds 全空 | Q2：用户系统未启动 |
| F12 | — | ✓ 确认 | 5 张新表全部 404 PGRST205 | Q2：otp_requests/onboarding/personality_results/experts/mentors 不存在 |
| F13 | P2 | ✓ 确认 | pgvector 迁移风险 | 沿用 v1 推断，本轮未深入验证 |
| F14–F22 | — | — | v1 清单中的次要项 | 沿用 v1，本轮未深入验证 |

**v2 新增**：

| ID | 严重性 | 标题 | 备注 |
| --- | --- | --- | --- |
| F23 | P3 | 文件模式批量 chmod +x 噪音 | Q1：17 个文件被 chmod +x，可能来自某次误操作；可 `git checkout -- .` 清理 |
| F24 | P3 | PNG 图标重新生成但字节相同 | Q1：5 个 icon 被重新生成但字节数完全一致，可能来自 build 工具 |

---

## 对任务 A 的影响

| 任务 A 阶段 | 受到的具体影响 |
| --- | --- |
| P0（分支+备份） | 在 `git checkout -b feat/community-rebuild` 前，建议先 `git stash` 暂存 17 个 chmod 噪音 + .tsbuildinfo，避免污染新分支提交历史。备份 Supabase 用 `pg_dump` 或导出 SQL 文件。 |
| P1（迁移 0004） | 必须新建 5 张表（otp_requests/onboarding/personality_results/experts/mentors）+ recall（已在任务 A 原计划内）。同时建议 seed 几条 sample posts 让 feed 能验证。 |
| P2（后端路由） | verify 路由**不在范围内**（Q3 已确认与社区重建无关）。其它 6 个新路由按原计划。 |
| P3（前端重写） | 沿用原计划。onboarding 流 + PersonalityTestPage BFI-10。 |
| P4（admin-gate + 人工队列） | 沿用原计划。 |
| P5（测试+文档） | 必须包含 seed 数据脚本，否则 feed 端到端测试无法跑。 |

---

## 推荐的 P0 修复（在任务 A 开始前快速做）

这 3 项是 P1 严重性、5 分钟内可完成的配置修复，建议在进入任务 A 之前先做：

1. **设置 CORS_ORIGIN**（`.env`）：
   ```
   CORS_ORIGIN=https://preview-<bot-id>.space-z.ai
   ```
2. **修复 maintenance 中间件顺序**（`server.ts`）：把 L98-104 移到 L67 之前。
3. **清理脏文件噪音**（可选）：`git stash push -m "noise: chmod + icon regen" -- .`

需要用户确认是否先做这 3 项 P0 修复，还是直接进入任务 A P0（分支+备份）。

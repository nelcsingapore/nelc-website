# NELC 词汇学院

词汇和语法练习入口是 `https://nelc.sg/vocab/`。教师从 `/vocab/?teacher=1` 登录现有教师账号。教师可以在学生列表创建账号，或在学生报告中补发链接。链接有效期 7 天，确认登录后只能使用一次。设备会话有效期 90 天，老师补发链接时会撤销该学生的旧链接和旧会话。

已有学生可以在原学生报告中直接生成链接，保留原 UID 和记录。作业可使用旧的 `#hw=...` 链接，新链接使用 `?hw=...`。登录学生的成绩、错词和练习进度归入本人账号。游客可做同一份作业，结果只留在当次页面。教师作业列表隐藏历史游客提交，数据库中的历史文档无需删除。

## 部署

静态页面由 GitHub Pages 提供。Cloudflare Worker 仅代理 `nelc.sg/vocab/api/*`，Cloud Run 后端在新加坡访问 `nelc-vocab2` 的现有 Firestore。教师登录和教师后台使用原有 Firebase 权限。

1. 在 Google Cloud 控制台为 `nelc-vocab2` 关联结算账号。确认部署者能启用 Cloud Run、Cloud Build 和 Artifact Registry，并能创建和绑定服务账号。Cloud Build 的构建身份需要 Cloud Run Builder 权限。
2. 从仓库根目录在 Cloud Shell 执行以下命令。将 `<教师 Firebase UID>` 替换为教师的 Firebase Authentication UID。多个 UID 用逗号分隔；对应 `users/{uid}` 的 `role` 须为 `teacher`。

   ```bash
   project=nelc-vocab2
   service_account="nelc-vocab-run@$project.iam.gserviceaccount.com"

   gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --project "$project"
   gcloud iam service-accounts create nelc-vocab-run --project "$project"

   for role in roles/datastore.user roles/firebaseauth.viewer; do
     gcloud projects add-iam-policy-binding "$project" \
       --member "serviceAccount:$service_account" --role "$role"
   done

   gcloud run deploy nelc-vocab-api --project "$project" --region asia-southeast1 \
     --source vocab-backend --service-account "$service_account" --allow-unauthenticated \
     --set-env-vars '^|^GOOGLE_CLOUD_PROJECT=nelc-vocab2|PUBLIC_ORIGIN=https://nelc.sg|TEACHER_UIDS=<教师 Firebase UID>'
   ```

   访问服务的 `/healthz` 验证启动，并在数据库默认实例为 `vocabLoginLinks`、`vocabSessions`、`vocabSubmissionReceipts` 的 `expiresAt` 配置 Firestore TTL。登录接口独立检查过期时间，TTL 用于清理历史凭据。

3. 在 DNS 管理方确认 `nelc.sg` 的完整记录。若使用 Cloudflare Worker 路由，先在 Cloudflare 导入并核对现有网站和邮件记录，再按控制台指引切换域名服务器。保持 GitHub Pages 自定义域设置，启用对根域的代理，绑定 `nelc.sg/vocab/api/*` 至 Worker。Worker 的入口是 `vocab-backend/worker.mjs`，变量 `CLOUD_RUN_ORIGIN` 填 Cloud Run 服务的 HTTPS URL。检查 `https://nelc.sg/vocab/api/healthz` 与原网站都可访问。
4. 合并前，在同源测试环境使用两名学生和一个游客做端到端检查。生产发布时协调 GitHub Pages 更新与 Firestore 规则切换。先备份线上规则并核对项目中的其他规则，再将 `vocab-backend/firestore.rules` 合并到线上规则，关闭旧版直接写入成绩的入口。若该规则文件覆盖项目的全部现有集合，可用下列命令发布。

   ```bash
   firebase deploy --project nelc-vocab2 --config vocab-backend/firebase.json --only firestore:rules
   ```

   若需回退，恢复发布前的网页和 Firestore 规则。保留已有提交和账号数据。

## 验收

在中国大陆手机流量下，用微信内置浏览器分别以两名学生和一名游客完成：

- 老师建立两个学生账号并私发链接，确认预览不消耗链接，学生确认后重复使用会提示失效。
- 两名学生分别打开群里的同一个普通作业链接，核对昵称、完成练习，关闭页面再从群里打开，确认登录会话仍有效。
- 老师在学生学习报告和作业详情核对两名学生的成绩、错题和完成时间。补发一人的链接后，旧会话失效，原记录仍在同一学生名下。
- 游客打开相同作业、查看分数和答案、关闭后重开。确认没有游客进度，教师后台也没有新增学生或提交。

后端测试可通过 `cd vocab-backend && npm test` 运行。

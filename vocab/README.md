# NELC 词汇学院

单文件的英语词汇练习页面，部署在 https://nelc.sg/vocab/

- **词库**：NELC 1000 / 2000 Words / 4000 Words + VocabMonster 250 SAT Words，
  共 6090 个词条、4767 个不重复单词，全部带音标，其中 4479 个词配有教材原例句。
- **练习**：看词选义 / 听音选义（入门）、听音拼写 / 中译英默写 / 例句听写（进阶）。
- **词汇量检测**：分层抽样 + 蒙猜校正，按 CEFR 给出教学起点。
- **访客模式**：不注册即可使用全部功能，进度存本机浏览器。

## 更新方法

把新版 HTML 覆盖到 `vocab/index.html`，然后提交推送即可，一分钟左右生效。

```
cp .../nelc-vocab-app-v2.html vocab/index.html
git add vocab && git commit -m "更新词汇程序" && git push
```

学生看到旧版就让他们按 Cmd/Ctrl + Shift + R 强制刷新。

## 后端

Firebase 项目 `nelc-vocab2`（nelcsingapore@gmail.com）：
Firestore 在 asia-southeast1，安全规则已发布（学生只能读写自己那份，
只有 role=teacher 能看全部，禁止任何人修改自己的 role 和 plan）。

### ⚠️ 已获授权的网域：`nelc.sg` 还没加

Firebase 控制台 → Authentication → Settings → 已获授权的网域 → 添加 `nelc.sg`。

2026-10-21 查过 `identitytoolkit.googleapis.com/v1/projects`，列表里只有
`localhost` / `nelc-vocab2.firebaseapp.com` / `nelc-vocab2.web.app` 三个默认项。

**这一项只影响 Google 登录，不影响用户名密码登录** —— 授权网域是 OAuth 弹窗流程
才检查的东西，邮箱密码登录根本不走这一步。所以账号登录一直是好的，
Google 登录一直是坏的，表面上很容易误判成"域名已经授权了"。

想确认有没有生效，直接查这个公开接口（apiKey 本来就印在页面里）：

```bash
curl -s "https://identitytoolkit.googleapis.com/v1/projects?key=AIzaSyCEUyqhlK-GHd60A2oep5DoIIYQM6ItadE"
```

另外顺手确认 Authentication → Sign-in method 里 Google 是「已启用」并选了
「项目支持电子邮件」—— 没启用的话报的是 `auth/operation-not-allowed`，是另一个错。

账号功能可用 `ACCOUNTS_ENABLED` 开关整体关闭，关闭时退回纯访客模式。

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

**上线后必须做一次**：Firebase 控制台 → Authentication → Settings →
已获授权的网域 → 添加 `nelc.sg`。不加的话学生在正式网址上注册/登录会被拒绝。

账号功能可用 `ACCOUNTS_ENABLED` 开关整体关闭，关闭时退回纯访客模式。

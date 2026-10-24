# 今天吃啥

面向日本生活场景的手机网页应用。当前已完成多人组队选择食物的核心流程，个人附近餐馆功能待开发。

## 已完成

- 输入昵称，创建房间或通过六位房间号加入。
- 房间成员共享候选食物清单，页面约每 3 秒读取一次更新。
- 成员可以添加候选、删除自己提交的候选；房主可以删除任意候选、清空清单。
- 房主从云端候选中随机抽选，所有成员读取同一份结果，刷新后仍可查看。
- 添加、删除或清空候选后，旧抽选结果失效。
- 抽选历史保存在数据库，目前没有历史列表页面。

## 技术结构

使用 Next.js App Router、React、TypeScript 和 Supabase PostgreSQL。

浏览器调用本项目的 Next.js API，API 验证房间身份后访问 Supabase。Supabase Secret key 只在服务端使用。

昵称用于显示；房间身份由浏览器中的 HttpOnly Cookie 验证。localStorage 保存部分界面状态，数据库保存共享清单和结果。不同浏览器会拥有不同的成员身份。

## 本地启动

所有命令均在 `what-to-eat` 项目根目录执行。

首次取得项目后安装依赖：

```sh
npm ci
```

在项目根目录创建 `.env.local`，配置这两个变量的真实值：

- `SUPABASE_URL`：Supabase 项目的 HTTPS URL。
- `SUPABASE_SECRET_KEY`：同一项目的服务端 Secret key。

不要给 Secret key 变量增加 `NEXT_PUBLIC_` 前缀，不要将真实密钥写进源码。环境文件已被 `.gitignore` 排除，重新取得项目时需要单独配置。

如果使用全新数据库，按照文件编号在 Supabase SQL Editor 中执行 `app/database/001_initial_schema.sql` 至 `007_draw_room.sql`。已完成配置的数据库无需为了启动而再次执行全部 SQL。

启动开发服务器：

```sh
npm run dev
```

打开终端显示的 Local 地址，通常为 `http://localhost:3000`。终端需持续运行；按 Control + C 会停止本地网页服务。

开发环境可通过 `/api/health/database` 检查连接，该接口在生产环境返回 404。

## 检查与测试

检查代码规范和构建：

```sh
npm run lint
npm run build
```

自动流程测试需要开发服务器已在 `http://localhost:3000` 运行。在另一个终端执行：

```sh
node scripts/test-group-flow.cjs
```

测试会创建独立测试房间和两名成员，检查抽选权限、空清单、共享结果，以及修改候选后旧结果失效。结束时测试房间保留两名成员和三条抽选历史，候选清单为空。脚本只在内存中保存测试 Cookie。

这个脚本测试 API 和数据库流程；页面按钮和同步显示还需要在普通窗口与无痕窗口中分别验收。

## 主要目录

- `app/group/`：多人房间页面、加入表单、云端候选与抽选界面。
- `app/api/rooms/`：创建、加入、读取房间，以及候选增删、清空和抽选 API。
- `lib/rooms/access.ts`：验证房间成员身份。
- `lib/supabase/admin.ts`：服务端数据库客户端。
- `app/database/`：数据库结构和函数 SQL。
- `scripts/test-group-flow.cjs`：多人 API 流程测试。

## 本地生产模式

先停止占用同一端口的开发服务器，再执行：

```sh
npm run build
npm run start
```

构建只生成运行文件；`npm run start` 才会持续提供网页服务。该项目包含服务端 API，上线时需要能够运行 Next.js 服务端的环境。

## 后续计划

1. 保存当前版本，配置远程代码备份并部署 HTTPS 测试网址，邀请朋友验证多人流程。
2. 接入日本餐馆搜索，完成个人定位、范围筛选、候选列表、随机选择和地图导航。
3. 最后统一调整页面布局，将不同流程拆为独立页面，并加入中文、日文、英文。
4. 手机网页稳定后，再考虑可安装形式。

Git 提交保存在本机仓库；推送到远程仓库后才形成远程代码备份。数据库数据和本地环境变量不包含在代码提交中。

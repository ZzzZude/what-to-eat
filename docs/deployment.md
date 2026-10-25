# 更新现有 Vercel 部署

现有线上网址：<https://what-to-eat-two-iota.vercel.app/>。

代码仓库：<https://github.com/ZzzZude/what-to-eat>，当前本机分支为 `main`。沿用已有 Vercel 项目，无需新建项目、数据库或重新执行 SQL。

## 1. 先补齐线上环境变量

打开 [Vercel 控制台](https://vercel.com/dashboard)，选择绑定上述网址的项目，进入 **Settings → Environment Variables**（部分界面直接在侧栏显示 Environment Variables）。

| 名称 | 内容 | 使用位置 |
| --- | --- | --- |
| `SUPABASE_URL` | 已有 Supabase 项目的 HTTPS URL | 多人房间 |
| `SUPABASE_SECRET_KEY` | 同一项目已有的服务端 Secret key | 多人房间 |
| `HOTPEPPER_API_KEY` | 本地已验证可用的餐馆搜索 Key | 附近餐馆及类型目录 |

已有的两个 Supabase 变量正确配置时保留，新增或确认 `HOTPEPPER_API_KEY`。值从本机 `.env.local` 的对应等号后复制，不包含变量名，也不要粘贴到聊天、截图或源码中。变量名可参照根目录的 `.env.example`；示例中的空值不能直接用于部署。

本次正式网址使用 **Production** 环境。如果之后需要分支预览，再为相应 Preview 环境配置所需变量。不要添加 `NEXT_PUBLIC_` 前缀。

保存环境变量后，它们只对后续部署生效。先完成下面的新代码更新，避免仅对旧代码重新部署后误以为“附近吃”已经上线。参见 [Vercel 环境变量说明](https://vercel.com/docs/environment-variables/managing-environment-variables)。

## 2. 确认现有部署设置

在项目设置中确认 Git 仓库和正式环境分支与准备推送的位置一致。当前本机仓库对应 `ZzzZude/what-to-eat`，分支为 `main`；如果控制台不同，先核对，不要直接更换绑定。

- Framework Preset 使用 **Next.js**。
- 仓库根目录已包含 `package.json`，Root Directory 应为仓库根目录 `./`。本机外层的“吃什么app”文件夹不属于需要填写的子目录。
- 使用 Next.js 默认构建设置；构建命令为 `npm run build`，安装可使用 `npm ci`。
- Node.js 使用 Vercel 支持的 **22.x 或 24.x**；当前 Supabase 依赖要求至少 Node.js 22。可用版本以 [Vercel 官方说明](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions) 为准。

项目包含服务端 API，保留 Next.js 部署方式。无需配置静态导出或另加 `vercel.json`。

## 3. 保存并推送新版代码

在项目根目录执行验证：

```sh
node scripts/test-nearby.cjs
npm run lint
npm run build
git diff --check
```

在 GitHub Desktop 中选择 `what-to-eat` 仓库，检查本次变更包含附近页面、地点与餐馆 API、收藏和测试。确认真实 `.env.local` 不在待提交列表内；`.env.example` 只包含空值，可以提交。

填写提交说明，例如“完成附近餐馆搜索、筛选、替换、抽选与收藏”，提交后推送到绑定的远程分支。若启用了 Vercel 自动部署，推送会触发构建；进入该项目的 Deployments，确认这次部署对应新的提交，状态为 **Ready**，并用于 **Production**。

只有旧提交的 Redeploy 不会包含本机尚未推送的功能。若没有自动触发，先检查 Git 绑定、分支和构建错误，再针对新提交创建部署。无需重复建立项目。

## 4. 在 HTTPS 正式网址验收

1. 打开首页，确认“附近吃”可进入，访问 `/nearby` 不再显示 404。
2. 先用“手动指定”搜索公共地点 `新宿駅`，选中地点后查找餐馆。这一步不需要设备定位权限，同时验证地点服务和线上餐馆 Key。
3. 检查类型单选、多选，列表默认 20 家，可切换 5、10、15 家；测试单家替换、整批替换和抽选。
4. 收藏一家店，刷新后展开“我的收藏”，确认仍可打开详情和导航。
5. 在真实手机浏览器打开同一 HTTPS 网址，验证当前位置授权、定位、软键盘和 Google 地图跳转。
6. 使用两个浏览器或设备，验证原有多人房间的加入、候选共享和抽选仍正常。

收藏属于浏览器和网站来源：本机 `localhost`、线上网址，以及不同设备之间不会自动同步。线上首次看到空收藏属于正常情况。

生产环境的 `/api/health/hotpepper` 和 `/api/health/database` 按设计返回 404；请使用实际搜索与房间流程验证。附近页面本身返回 404 才表示需要检查代码版本或部署设置。

若上线后需要恢复旧版本，可在 Vercel 控制台选择之前正常的部署恢复正式流量；代码、数据库和浏览器收藏是不同的存储，不要通过删除数据库来处理部署问题。

# 星尘 · 灵感宇宙

版本 2.2.2。本地优先的灵感记录 PWA，无需安装依赖或运行构建。

## 本次修改

- 桌面左侧导航移除 01、02 编号。

- 电脑和手机详情中的按钮统一为“选择灵感”。
- 手机记录列表左滑露出右侧删除按钮，右滑或轻点收起。点击删除仍需二次确认。

## 发布到 GitHub Pages

1. 解压本发布包。
2. 在 GitHub 创建一个仓库；使用 GitHub Free 时选择 Public（公开仓库）。
3. 把解压后文件夹内的全部内容上传到仓库 main 分支。请保留 audio 文件夹；不要只上传 ZIP，也不要把外层文件夹套在仓库根目录。仓库根目录应直接看到 index.html。
4. 打开仓库 Settings → Pages。
5. 在 Build and deployment 中，Source 选择 Deploy from a branch。
6. Branch 选择 main，Folder 选择 /(root)，点击 Save。
7. 等待部署完成，使用 Pages 页面显示的 HTTPS 地址访问。

.nojekyll 已包含在发布包中。网页资源使用相对路径，支持 https://用户名.github.io/仓库名/ 这样的项目地址，无需修改代码。

官方说明：https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

## 手机桌面与离线

在 iPhone Safari 中打开新的 HTTPS 地址，使用“分享 → 添加到主屏幕”。桌面图标为白金色四芒星。首次加载完成后支持离线记录；首次交互后启用声音。手机采用竖屏布局。

## 将原网址的灵感迁移过来

记录保存在浏览器本地，换网址不会自动带过来。先在原网址“备份与设置 → 导出全部数据”，再在 GitHub Pages 新网址“备份与设置 → 导入备份”。发布包只包含程序及内置示例，不包含你的个人记录。

## 文件说明

- index.html、style.css、universe.css：页面与样式。
- app.mjs、model.mjs、space.mjs、gestures.mjs、audio.mjs：应用、数据、星空、手势及音频源码。
- audio/：背景音乐。
- manifest.webmanifest、sw.js：桌面安装与离线支持。
- icon-platinum-*.png：新桌面及浏览器图标；其余图标作为兼容资源保留。

本项目不需要服务器、数据库账号或 API Key。不要通过双击 index.html 的方式验证离线与安装功能；请使用 GitHub Pages 的 HTTPS 地址。

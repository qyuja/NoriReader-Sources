# 随阅书源 · NoriReader Sources

随阅的 JS 书源、配置入口、适配模块与编写指南。源在 App 内执行，返回统一的书籍、目录、正文或网盘文件模型，由原生阅读器负责展示。

## 添加到随阅

进入 **设置 → 管理书源 → 右上角 +**，粘贴下方地址并填写别名。添加后可切换合集，在首页左上角选择网站；网盘在合集右侧齿轮内登录，连接后出现在首页的「网盘」分组。

| 源包 | 配置入口 |
| --- | --- |
| 官方合集 1.9.0 | [index.config.js](https://raw.githubusercontent.com/qyuja/NoriReader-Sources/main/index.config.js) |
| 网盘合集 1.2.0 | [cloud-drives.config.js](https://raw.githubusercontent.com/qyuja/NoriReader-Sources/main/cloud-drives.config.js) |
| 可选小说站 1.3.1 | [novels.config.js](https://raw.githubusercontent.com/qyuja/NoriReader-Sources/main/novels.config.js) |
| 小说源编写示例 | [example-novel.config.js](https://raw.githubusercontent.com/qyuja/NoriReader-Sources/main/example-novel.config.js) |

官方合集地址：

```text
https://raw.githubusercontent.com/qyuja/NoriReader-Sources/main/index.config.js
```

也可直接添加完整脚本：

```text
https://raw.githubusercontent.com/qyuja/NoriReader-Sources/main/index.js
```

请复制 `raw.githubusercontent.com` 地址。GitHub 的 `/blob/main/…` 是网页地址，不能作为源入口。配置里的 `script: './index.js'` 会相对配置地址解析。

随阅全新安装默认进入本地书库，需要手动添加源。已经添加的源可在管理书源中刷新；从旧地址迁移时重新添加本仓库链接，相同源 ID 会更新已有源及保存的入口地址。以后刷新使用新地址。

## 源包内容

- **官方合集**：苦瓜书盘、笔趣阁、古登堡计划、书海阁、新笔趣阁、笔趣屋、少年小说、顶点、全本小说网、新天禧、小说虎；声明夸克、百度和 WebDAV 网盘。
- **网盘合集**：仅包含夸克、百度和 WebDAV，不包含网站。WebDAV 使用 App 原生连接表单和文件访问。
- **可选小说站**：笔趣阁 info / 365、零点、书海阁、第八中文、101、速读谷，使用独立站点 ID，可与官方合集共存。

站点的搜索、筛选和在线阅读能力并不完全相同，详见[站点调查](docs/source-site-audit.md)。夸克、百度适配器的真实账号登录、转存和读取仍需分别验证；本仓库不包含账号或登录凭据。

## 编写自己的源

新源推荐使用 **Nori Source v2 / SDK 2.1.0**。阅读[完整制作指南](docs/nori-source-authoring.md)：从离线源开始，接入小说与漫画的搜索、分类、详情、章节、正文、资源、登录，再打包、验证和发布分组合集。

- [SDK、Schema 与打包说明](docs/nori-source-v2/README.md)
- [可直接导入的 v2 离线包](docs/nori-source-v2/examples/offline.nori.json)（下载 JSON 或复制 Raw 地址）
- [完整 HTML 小说站作者模板](docs/nori-source-v2/examples/web-novel/source.yaml)

v2 作者使用 YAML + ES 模块，发布为自包含 `.nori.json`。旧 JS 源继续使用下方原有入口和文档。

1. 阅读[快速开始](docs/quickstart.md)，复制示例并修改源 ID、站点域名和解析规则。
2. 按 [JS 源协议](docs/js-sources.md) 实现搜索、筛选、分页、详情与正文，或声明网盘入口。
3. 提交到自己的 GitHub 仓库，使用对应 Raw 地址添加到 App，验证完整阅读流程。

[example-source.js](example-source.js) 是虚构站点模板；[example-novel.js](example-novel.js) 是完整小说适配示例。[旧 JSON 配置](docs/sources.md) 保留兼容说明。

## 仓库结构

```text
index.js / index.config.js                官方合集及入口
novels.js / novels.config.js              可选小说站及入口
cloud-drives.js / cloud-drives.config.js  网盘合集及入口
example-*.js                             编写示例
src/source-definitions.js                 分组、站点、筛选、网盘与源清单
src/websites.js                           首页、详情及网站解析
src/catalogs.js                           搜索、筛选及列表分页
src/novel-reading.js                      目录与章节正文
src/drives.js                             网盘文件、分享及转存方法
scripts/                                 生成与检查工具
docs/                                    编写指南及站点调查
```

修改官方合集时，编辑 `src/`，再生成根目录的单文件源。配置、站点清单和筛选放在上方声明区，执行方法放在下方，不在方法区追加站点或覆盖注册信息。

```sh
python3 scripts/build_source.py
node scripts/check_sources.mjs
git diff --check
```

上面的旧 JS 生成与检查工具只需要 Python 3.9+ 和 Node.js 22+，无需安装第三方依赖。Nori v2 打包器另需 Python 3.10+ 和 `scripts/source_protocol/requirements-v2.txt` 中的依赖，安装与使用见完整制作指南。检查通过后提交模块与生成文件并推送到 `main`；GitHub Actions 会检查生成文件是否同步。App 端需要用户主动刷新，不会随仓库更新自动替换本机源。

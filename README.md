# 随阅书源 · NoriReader Sources

Nori JSON 源合集、制作指南、SDK 参考、打包工具与配套示例。源负责请求和解析，随阅负责原生界面、阅读、账号保管与阅读记录。

## 制作源

从[完整制作指南](docs/nori-source-authoring.md)开始，依次接入搜索、分类、详情、章节目录、小说正文或漫画图片，再验证完整阅读流程。

- [SDK、Schema 与作者资料](docs/nori-source/README.md)
- [打包与静态检查](docs/nori-source/packager.md)
- [完整 HTML 小说站模板](docs/nori-source/examples/web-novel/source.yaml)
- [小说、漫画与 NSFW 分组合集](docs/source-collections/README.md)

作者可以使用 YAML 配置和 ES 模块编写，发布时把模块嵌入一个 `.nori.json` 文件。示例中的网络接口是虚构地址，需要替换为实际站点的请求与解析规则。

## 导入源

在随阅的管理书源中添加下面的地址，或下载 [Nori 书源合集](nori-sources.nori.json) 后从文件导入：

```text
https://raw.githubusercontent.com/qyuja/NoriReader-Sources/main/nori-sources.nori.json
```

合集沿用 ziyong123 已验证成员，包含 64 个独立源，分为小说 52 个、漫画 7 个、NSFW 5 个。NSFW 组同时用于成人小说和成人漫画，目前主合集中该组的成员都是漫画。

这些成员此前完成了搜索、详情、章节目录和正文样本检查，漫画还检查了每个样本章节前最多三张图片的下载和 ImageIO 像素解码。本次上传保持源文件内容与身份不变，不代表重新验证了每个站点、作品、章节、账号或实体设备。

另有 [NSFW 适配草稿](drafts/nsfw.nori.json)，包含 11 条小说和 7 条漫画定义，含尚未通过完整阅读验证的源。草稿仅用于普通追加测试；不要用它“从文件更新”完整合集，否则会按子集替换。

GitHub 的 `/blob/main/…` 是网页地址；作者 YAML、分开的 JS 模块和检查报告都不是导入文件。

已有源需要在管理书源中主动刷新或更新。相同 ID 合集普通添加时追加新成员，已有成员保留；需要替换成员或修改已有成员的分组时，对原合集执行“从文件更新”或“从 URL 更新”。

首次制作源也可以先导入[离线示例](docs/nori-source/examples/offline.nori.json)，确认搜索、详情、目录和正文流程后再接入真实站点。

## 工具

需要 Python 3.10+ 和已安装的 `uv`。在仓库根目录执行：

```sh
uv run --with-requirements scripts/source_protocol/requirements.txt \
  scripts/pack_source.py init work/my-source --id org.example.reader --name 我的书源
uv run --with-requirements scripts/source_protocol/requirements.txt \
  scripts/pack_source.py pack work/my-source -o dist/my-source.nori.json
uv run --with-requirements scripts/source_protocol/requirements.txt \
  scripts/pack_source.py validate dist/my-source.nori.json
uv run --with-requirements scripts/source_protocol/requirements.txt \
  scripts/check_sources.py
```

也可以在 Python 虚拟环境中安装 requirements 文件，再使用该环境的 Python 执行上述脚本。仓库检查覆盖文档链接、示例结构和作者项目与发布包的一致性；真实网站、账号、漫画图片下载解码与设备试读需分别记录结果。

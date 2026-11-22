# 随阅书源 · NoriReader Sources

Nori JSON 源的制作指南、SDK 参考、打包工具与配套示例。源负责请求和解析，随阅负责原生界面、阅读、账号保管与阅读记录。

## 制作源

从[完整制作指南](docs/nori-source-authoring.md)开始，依次接入搜索、分类、详情、章节目录、小说正文或漫画图片，再验证完整阅读流程。

- [SDK、Schema 与作者资料](docs/nori-source/README.md)
- [打包与静态检查](docs/nori-source/packager.md)
- [完整 HTML 小说站模板](docs/nori-source/examples/web-novel/source.yaml)
- [小说、漫画与 NSFW 分组合集](docs/source-collections/README.md)

作者可以使用 YAML 配置和 ES 模块编写，发布时把模块嵌入一个 `.nori.json` 文件。示例中的网络接口是虚构地址，需要替换为实际站点的请求与解析规则。

## 导入源

在随阅的管理书源中导入 `.nori.json` 文件，或添加该文件的 HTTPS Raw 地址。可先使用[离线示例](docs/nori-source/examples/offline.nori.json)确认导入、搜索、详情、目录和正文：

```text
https://raw.githubusercontent.com/qyuja/NoriReader-Sources/main/docs/nori-source/examples/offline.nori.json
```

GitHub 的 `/blob/main/…` 是网页地址；作者 YAML、分开的 JS 模块和检查报告都不是导入文件。

已有源需要在管理书源中主动刷新或更新。相同 ID 合集普通添加时追加新成员，已有成员保留；需要替换成员或修改已有成员的分组时，对原合集执行“从文件更新”或“从 URL 更新”。

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

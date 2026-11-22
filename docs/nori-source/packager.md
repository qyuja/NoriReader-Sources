# Nori JSON 源打包与检查

在本仓库根目录执行。需要 Python 3.10+，使用已安装的 uv 隔离依赖：

```sh
uv run --with-requirements scripts/source_protocol/requirements.txt \
  scripts/pack_source.py init work/my-source --id org.example.reader --name 我的书源
uv run --with-requirements scripts/source_protocol/requirements.txt \
  scripts/pack_source.py pack work/my-source -o dist/my-source.nori.json
uv run --with-requirements scripts/source_protocol/requirements.txt \
  scripts/pack_source.py validate dist/my-source.nori.json
```

不用 uv 时，创建 Python 虚拟环境，安装 requirements.txt 后使用该环境的 Python 执行同一脚本。

`init` 创建尚不存在的目录，生成完整离线源、编辑器类型与 Schema；`pack` 读取 YAML/JSON 和本地 ES 模块，生成自包含 JSON；`validate` 只读取发布包；`capabilities` 输出随本仓库同步的宿主清单。

`pack` 默认写入同名 `.report.json`。`--report` 指定报告位置，`--force` 允许覆盖已有产物；不能覆盖作者输入，也不能把包和报告写到同一文件。退出码 0 表示静态有效，2 表示失败。有错误时不写新包；旧输出文件可能还在，应检查本次报告，避免误发旧包。

| 检查项 | 意义 |
| --- | --- |
| authoring | UTF-8、JSON/YAML 类型、重复字段、本地模块嵌入、16 MiB 包限制 |
| schema | Nori JSON 结构、必填项、类型与互斥字段 |
| references | 模块、端点、会话、能力、分页及可静态确定的结果关系 |
| javascript | Tree-sitter 语法、包内依赖、显式导入与导出 |
| selectors / behavior | 固定 not-run，不运行源、不联网 |
| hostSupport | 默认 current 目标对照 host.json；passed/partial/failed |

`--target protocol` 只供协议草稿，hostSupport 为 not-checked，不能据此承诺 App 支持。打包器不扫描并推断所有 JS 能力使用，作者要在 requires 中显式声明。

配置中的 `{file: reader.js}` 相对配置目录解析且不能越界；多个模块都要在 modules 列出。模块名规范为相对 `.js` 路径；保留源码原文，不压缩、不执行、不解析 npm。模块内容和结果模型仍需在实际 App/QuickJS 中验证。

当前工具不接受动态 import、JSX、decorator、import attributes 或带转义的模块说明符/导入导出名称。YAML 不接受 anchor、alias、merge、重复字段或非 JSON 值。`true/false` 是布尔，`yes/no/on/off` 保持字符串。

本目录的 host.json 是发布时从 App 清单同步的快照。升级工具时应连同 Schema、sdk.d.ts、离线模板和能力清单一并核对；改一份清单不会升级用户的 App。

完整制作、运行检查、故障定位与发布方式见 [指南](../nori-source-authoring.md)。

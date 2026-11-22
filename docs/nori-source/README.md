# Nori JSON 源作者资料

第一次制作源，请从 [完整制作指南](../nori-source-authoring.md) 开始。当前资料描述 Nori JSON 源；具体 App 是否支持某项能力，以实际安装的 App 和 [host.json](host.json) 为准。

| 文件 | 用途 |
| --- | --- |
| [sdk.md](sdk.md) / [sdk.d.ts](sdk.d.ts) | SDK 方法与类型 |
| [execution.md](execution.md) | 请求、认证、分页、状态和执行预算 |
| [schema.json](schema.json) | 自包含发布包的 JSON Schema |
| [authoring.schema.json](authoring.schema.json) | 支持本地模块 file 引用的作者 Schema |
| [host.json](host.json) | 本次同步的宿主能力与预算快照 |
| [packager.md](packager.md) | Python 打包和静态检查 |
| [offline.source.yaml](examples/offline.source.yaml) / [offline.js](examples/offline.js) | 无需网络的完整小说源 |
| [offline.nori.json](examples/offline.nori.json) | 可导入 App 的离线包 |
| [web-novel/source.yaml](examples/web-novel/source.yaml) / [reader.js](examples/web-novel/reader.js) | HTML 小说站的完整在线操作模板 |
| [html.nori.json](examples/html.nori.json) / [json-api.nori.json](examples/json-api.nori.json) | plan 请求与提取示例 |
| [aggregate.source.yaml](examples/aggregate.source.yaml) / [aggregate.js](examples/aggregate.js) | 登录、混合内容、在线与文件版、临时资源解析 |

网络示例使用虚构接口，静态有效不代表真实站点可读。模板中的 ES 模块在打包时嵌入 JSON，不单独作为源导入。

本目录的 Schema、SDK 类型、能力清单及静态工具来自 NoriReader 当前作者接口，不包含 App 私有实现。公开仓库提供 Python 工具；Swift 的 `NoriSourceTool` / `SourceProbe` 需要 App 工程和对应构建环境。

# 随阅书源

本仓库维护 Nori JSON 源的制作文档、作者工具与配套示例。

- 文档入口为 `docs/nori-source-authoring.md`，SDK、Schema、模板和能力清单位于 `docs/nori-source/`。文档名称与路径使用 Nori JSON 源，不按协议代次命名。
- 发布入口是自包含 `.nori.json`；YAML 和 ES 模块是作者输入，示例修改后同步重新打包。保留格式字段、能力标识、源 ID 和站点 ID 的实际契约。
- 合集分组使用根 `groups` 与成员 `group`，可分为小说、漫画和 NSFW；分组元数据不改动子源程序与账号身份。
- 源不包含账号、Cookie、密码、测试登录信息、App 私有实现或本机文件。网络示例使用虚构地址，不宣称真实站点可读。
- 修改后安装 `scripts/source_protocol/requirements.txt`，运行 `python scripts/check_sources.py`、离线项目 init/pack/validate 和 `git diff --check`。
- 文档链接、静态打包、App 导入、真实网站、账号与设备验证分别报告；静态检查不代表阅读流程或远端服务可用。
- 保持改动聚焦，不恢复旧 JS 分发入口或无关兼容文档。

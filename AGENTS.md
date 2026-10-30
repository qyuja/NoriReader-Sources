# 随阅书源

本仓库维护随阅源包和编写文档，分发入口为根目录 JS / config.js 文件。

- 保持源 ID、站点 ID 和现有协议兼容；新增站点和能力以实际接口验证为准。
- 编辑 `src/source-definitions.js` 的声明和对应执行模块，再运行 `python3 scripts/build_source.py`；不要只修改生成的 `index.js`、`novels.js` 或 `cloud-drives.js`。
- 配置入口相对引用同目录脚本，文档导入地址使用本仓库 GitHub Raw 地址。
- 源不包含账号、Cookie、密码、测试登录信息、App 私有实现或本机文件。
- 源协议以 `docs/js-sources.md` 为准；源请求与解析负责内容模型，App 负责原生 UI、阅读、账号和支付。
- 修改后运行生成器、`node scripts/check_sources.mjs` 和 `git diff --check`。列表、搜索、正文、真实网盘账号与 App 内验收分别报告；静态检查不代表远端服务可用。
- 保持改动聚焦，不引入无关重构或防御逻辑。

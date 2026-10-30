# 编写第一个随阅源

一个源可以包含多个网站和网盘。你提供请求、解析和内容模型，随阅负责列表、详情页、分页阅读、目录、主题、进度、书签与标注。

## 1. 选择入口

- 从零接网站：复制根目录的 [example-source.js](../example-source.js)。其中使用虚构域名，需要替换网站和选择器。
- 参考完整小说流程：阅读 [example-novel.js](../example-novel.js)。它包含分类、搜索、列表分页、详情、目录和正文续页。
- 只连接 WebDAV：使用下方的最小源。无需写 JS 登录或下载方法。

```js
var source = {
  manifest: {
    apiVersion: 1,
    id: 'my.library',
    name: '我的书库',
    version: '1.0.0',
    domains: [],
    sites: [],
    drives: [{
      id: 'webdav',
      name: 'WebDAV',
      root: '',
      authentication: {kind: 'webDAV', domains: []}
    }]
  }
};
```

WebDAV 的服务器和凭据由用户在 App 原生表单填写。源只声明连接类型；不把密码、Cookie 或个人网盘文件地址写进配置。

## 2. 声明站点和能力

为你的源设置独立的 `manifest.id`，每个网站也使用独立 `site.id`。`manifest.domains` 填网络请求实际需要的域名，不带协议或路径；站点 `homepage` 使用完整 HTTPS 地址。

| 能力 | 回调与结果 |
| --- | --- |
| 首页、分类、列表分页 | `catalog({siteID, filters, cursor}) → {books, nextCursor}` |
| 搜索 | 声明 `search`；可由 `catalog({query, …})` 处理，或旧式 `search({siteID, query, page})` 回调 |
| 详情和章节目录 | `detail({siteID, book}) → {book, chapters, resources?}` |
| 分页目录 | 协议 2 的 `chapters({siteID, book, cursor}) → {chapters, nextCursor}` |
| 小说正文 | `content({siteID, chapter}) → {title, paragraphs}` |
| 漫画正文 | 同一 `content` 回调返回按阅读顺序排列的 `images` |
| 文件资源 | `detail` 返回 `resources`，包含文件名、类型及 HTTPS 下载地址 |

`catalog` 的 `query` 非空时表示搜索；首页筛选与搜索筛选分别声明。返回真实的下一页游标，没有下一页就返回 `null`；不要按结果数量猜测是否还有下一页。具体字段见 [JS 源协议](js-sources.md)。

## 3. 配置筛选

站点在 `catalog.filters` 声明首页分类、状态、读者、字数、排序等选项；`catalog.searchFilters` 仅声明搜索接口实际支持的条件。静态选项直接写在结构里；分类需要访问网站时，声明 `dynamicFilters: true` 并实现 `catalogFilters`。

官方合集使用 [src/source-definitions.js](../src/source-definitions.js) 中的 `websiteRules`，可以直接参考每站的请求路径、字段选择器、下一页和 `optionsSource` 动态分类声明。加入 `sourceDefinitions.official.siteIDs` 才会出现在官方合集的活动站点清单中。

## 4. 发布入口

在你自己的公开 GitHub 仓库同一目录保存 `index.js` 与 `index.config.js`：

```js
var sourceConfig = {
  apiVersion: 1,
  name: '我的阅读源',
  script: './index.js',
  defaultSite: 'my.novels'
};
```

`defaultSite` 必须是脚本声明的网站 ID；纯网盘源省略它。配置只引用一层完整源，不可再指向另一份配置。配置入口的 `apiVersion: 1` 与完整脚本的协议 1 / 2 相互独立。

在 App「设置 → 管理书源 → +」添加：

```text
https://raw.githubusercontent.com/你的用户名/你的仓库/main/index.config.js
```

仓库文件放在子目录时，保留相同目录层级；也可以直接添加完整 JS 的 Raw 地址。更新源时保留源 ID，增加版本号，推送后在 App 管理书源中刷新。

## 5. 验证

修改本仓库的官方模块后运行：

```sh
python3 scripts/build_source.py
node scripts/check_sources.mjs
```

自己的单文件源可先检查语法：

```sh
node --check index.js
```

随后在 App 验证添加、首页筛选、搜索、下一页、详情、完整目录和至少两章正文。JS 返回完整章节，按屏分页与相邻章节预加载由 App 处理；目录分页与同章正文续页是源需要处理的两种不同网页分页。

Node 检查不会调用随阅原生的 `host`、访问网站或登录网盘，实际请求和阅读仍需在 App 中验证。网站返回验证页或失败响应时抛出相应错误，不把它们当作空结果。

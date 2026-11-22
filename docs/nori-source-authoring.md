# Nori JSON 源制作完整指南

本文对应当前 Nori JSON 源格式。宿主支持的能力以 [host.json](nori-source/host.json) 和实际安装的 App 为准。核对日期：2026-11-22。

使用 AI 辅助制作时，先看 [AI Agent 操作指南](nori-source-agent-guide.md)，其中提供任务提示词、执行步骤和验证交付要求。

书源负责告诉随阅“去哪请求、怎样提取、哪些内容属于同一本书”。列表、阅读器、翻页、主题、账号保管、书架和阅读进度由 App 处理。制作一个在线源，就是把网站接到这条流程：

```text
首页 / 分类 ─ catalog ─┐
                      ├─ Book → detail → Edition → chapters → Chapter → content → Document
搜索 ────── search ──┘                                                    └─ Asset → 图片 / 文件
```

本指南按实际制作顺序说明小说、漫画、文件版本、分页、登录、检查和发布。例子中的 `*.example.com` 是虚构接口约定，不能当成已经适配的真实站点。

## 目录

1. [先选对格式](#1-先选对格式)
2. [准备工具并跑通离线源](#2-准备工具并跑通离线源)
3. [调查目标网站](#3-调查目标网站)
4. [建立作者项目](#4-建立作者项目)
5. [身份与数据模型](#5-身份与数据模型)
6. [网络和能力声明](#6-网络和能力声明)
7. [接入搜索与分类](#7-接入搜索与分类)
8. [接入详情和章节目录](#8-接入详情和章节目录)
9. [接入小说正文](#9-接入小说正文)
10. [接入漫画正文与封面](#10-接入漫画正文与封面)
11. [处理临时图片和文件地址](#11-处理临时图片和文件地址)
12. [分页与完整章节](#12-分页与完整章节)
13. [筛选设置与用户动作](#13-筛选设置与用户动作)
14. [登录和账号](#14-登录和账号)
15. [选择 plan 或 JS](#15-选择-plan-或-js)
16. [编码加密状态和缓存](#16-编码加密状态和缓存)
17. [逐步验证完整阅读流程](#17-逐步验证完整阅读流程)
18. [定位常见错误](#18-定位常见错误)
19. [制作小说漫画分组合集](#19-制作小说漫画分组合集)
20. [发布更新和交付](#20-发布更新和交付)
21. [参考文件](#21-参考文件)

## 1. 先选对格式

| 文件 | 用途 | 新源怎样选 |
| --- | --- | --- |
| `source.yaml` + `*.js` | 作者编辑的配置和模块 | 推荐这样编写 |
| `*.nori.json`，`format: nori-source`、`schemaVersion: 2` | 自包含的 Nori JSON 源发布包 | 交给 App 导入 |
| `format: nori-collection`、`schemaVersion: 1` | 把多个独立源装进一个 JSON 文件 | 用于“小说 / 漫画 / NSFW”等分组 |

Nori JSON 源的操作返回 `Book / Edition / Chapter / Document`，使用 `nori.http` 等 SDK。

`schemaVersion` 标识文件结构，`version` 标识源的更新，`sdkVersion` 标识宿主能力基线。字段值和 `requires` 中的能力名称按 Schema 与宿主清单填写；用户安装的 App 也要支持所声明的能力。

## 2. 准备工具并跑通离线源

以下命令在本公开书源仓库根目录执行。需要 Git、Python 3.10+ 和已安装的 `uv`。也可以自行创建 Python 虚拟环境，安装 `scripts/source_protocol/requirements.txt` 后，把 `uv run --with-requirements …` 换成该环境的 `python`。

```sh
git clone https://github.com/qyuja/NoriReader-Sources.git
cd NoriReader-Sources

uv run --with-requirements scripts/source_protocol/requirements.txt \
  scripts/pack_source.py capabilities

uv run --with-requirements scripts/source_protocol/requirements.txt \
  scripts/pack_source.py init work/my-source \
  --id org.example.myreader --name 我的书源

uv run --with-requirements scripts/source_protocol/requirements.txt \
  scripts/pack_source.py pack work/my-source -o dist/my-source.nori.json

uv run --with-requirements scripts/source_protocol/requirements.txt \
  scripts/pack_source.py validate dist/my-source.nori.json
```

`init` 的目标目录必须尚不存在。它生成可运行的离线小说源、类型声明、作者 Schema 和编辑器配置。先把 `dist/my-source.nori.json` 导入随阅，搜索“山海”、打开详情、查看两章目录并试读，再开始修改真实网站。

发布包示例也可直接从 [offline.nori.json](nori-source/examples/offline.nori.json) 下载。在支持 Nori JSON 的 App 中，进入管理书源的导入入口，选择 JSON 文件，或粘贴该文件的 HTTPS Raw 地址。YAML 和分开的 JS 是作者输入，不能分别作为 Nori JSON 发布包导入。

公开书源仓库提供 Python 静态打包器，**不包含 App 的 Swift/QuickJS 执行器**。后文 `NoriSourceTool`、`SourceProbe` 命令只供有 NoriReader App 工程访问权限的开发者使用；其他作者用静态检查和 App 内试读完成联调。不要在本仓库直接执行 `swift run NoriSourceTool`。

## 3. 调查目标网站

先在浏览器正常打开网站，用开发者工具的 Network 面板观察一次完整阅读流程。记录实际返回的接口和数据，不只记录首页是否返回 HTTP 200。

| 流程 | 要记录的东西 |
| --- | --- |
| 搜索 | 地址、GET/POST、关键词字段、编码、是否分页、无结果的响应 |
| 首页 / 分类 | 分类值、筛选值、列表接口、真实的续页信号 |
| 详情 | 书籍 ID、标题、作者、封面、简介、在线 / 文件版本 |
| 章节目录 | 章节 ID、顺序、分卷、是否分页、锁定 / 登录标记 |
| 小说正文 | 正文节点或接口、章内续页、编码、是否有解码字体 |
| 漫画正文 | 完整图片列表、顺序、原图、CDN 域、请求头和过期时间 |
| 登录 | 登录方式、状态检查接口、账号所用端点 |

首页 200 可能只返回登录页、验证页或 JavaScript 外壳。Nori HTTP 不是浏览器，不会自动执行网页脚本。页面由 JS 渲染时，优先找它实际使用的 JSON 接口或可解析的初始数据；不要把整页脚本 `eval` 后尝试复刻浏览器。

地址有 `旧地址 -> 新地址` 时，用最终确认的正常地址设置端点，并检查封面、图片和后续跳转的主机。HTTPS 与 HTTP 都正常时优先使用 HTTPS；只在站点确实需要时声明 HTTP 或跳过证书校验。

## 4. 建立作者项目

建议保留这样的目录：

```text
my-source/
  source.yaml                 站点、端点、能力、操作入口
  reader.js                   请求和解析
  nori-sdk.d.ts               init 生成的类型
  nori-authoring.schema.json  init 生成的作者 Schema
  jsconfig.json               init 生成的编辑器配置
dist/
  my-source.nori.json         App 导入的发布包
  my-source.nori.report.json  打包报告，不导入 App
```

从零接 HTML 小说站时，可以复制 [web-novel/source.yaml](nori-source/examples/web-novel/source.yaml) 和 [reader.js](nori-source/examples/web-novel/reader.js)。这两个文件包含搜索、分类、动态筛选定义、详情、章节和正文的完整函数；需要按目标网站替换域名、路径和选择器。

最小结构如下，完整值以配套文件为准：

```yaml
format: nori-source
schemaVersion: 2
id: org.example.myreader
name: 我的小说源
version: 1.0.0
requires: [core-v2]
modules:
  reader.js: {file: reader.js}
sites:
  - id: novels
    name: 示例小说站
    kinds: [novel]
    requires: [script-v2, http-v1, html-v1, css-v1, url-v1, content-v1]
    network:
      endpoints:
        web:
          baseURL: https://books.example.com/
          allowedHosts: [books.example.com]
        images:
          baseURL: https://images.example.com/
          allowedHosts: [images.example.com]
    operations:
      filters: {script: {module: reader.js, export: filters}}
      catalog: {script: {module: reader.js, export: catalog}}
      search: {script: {module: reader.js, export: search}}
      detail: {script: {module: reader.js, export: detail}}
      chapters: {script: {module: reader.js, export: chapters}}
      content: {script: {module: reader.js, export: content}}
```

包内模块名使用 `.js` 相对路径，`file` 相对 YAML 所在目录解析，且不能越出作者项目目录。发布时打包器把文件内容嵌进 `modules`。包内模块可以 `import { parseBook } from './helpers.js'`，但要把 `helpers.js` 一并列入 `modules`；不能直接 import npm、远程 URL、Node 内置模块或另一个文件系统位置。

YAML/JSON 不允许重复字段。YAML 不使用 anchor、alias、merge 或非 JSON 类型。普通对象、数组、字符串、布尔、数字和 null 均可使用。

## 5. 身份与数据模型

先选稳定 ID，再写请求。源改名、升级版本或换镜像域名时，不要随意换包 ID、站点 ID、书籍 ID 或章节 ID。书名可能重名，临时图片 URL 会过期，它们不适合充当稳定身份。

| 模型 | 必填字段 | 关键约束 |
| --- | --- | --- |
| `Book` | `id, title, kind` | `kind` 只能为 `novel` 或 `comic`，必须属于本站 `kinds` |
| `Edition` | `id, title, kind` | `chapters` 走在线目录；`file` 必须提供 `resource` |
| `Chapter` | `kind: chapter, id, title` | `locator` 保存正文请求需要的非敏感参数 |
| `Section` | `kind: section, id, title` | 分卷标题，不请求正文 |
| `Document` | `id, chapterID, kind, blocks` | `chapterID` 对应输入章节，`kind` 对应书籍 |
| `Asset` | `id, mediaType, source` | 封面、正文图、字体或电子书资源 |

```js
const book = {
  id: '123', title: '示例小说', kind: 'novel',
  authors: ['示例作者'], summary: '简介',
  locator: { url: 'https://books.example.com/books/123/' },
  metadata: { status: 'ongoing', tags: ['奇幻'] }
};
```

`authors` 是数组；状态用 `ongoing / completed / unknown`。没有字数或作者时可以省略，不把未知信息编成 0。同一列表中的 ID 不重复；同一本书跨搜索、分类和详情应返回相同 ID。`detail` 必须保留输入的 `book.id` 和 `kind`。

`locator` 不是固定的 URL 字段，而是源自己定义的普通 JSON 对象。可以保存 `{bookID:'123'}`、`{url:'…'}` 或 `{chapterID:'456'}`。后续函数按相同约定读取它。不要保存 Cookie、密码、令牌或过期签名。

## 6. 网络和能力声明

每次请求选择一个 `network.endpoints`，每个端点列出实际允许的主机。`books.example.com` 不自动包含 `m.books.example.com`，也不包含图片 CDN。主机列表不写协议、端口或路径，不用 `*`。

```js
const response = await nori.http.request({
  endpoint: 'web', method: 'GET', path: '/search',
  query: { q: input.query, page: input.page }
});
const html = response.body;
```

`path` 和完整 `url` 任选一种。路径参数写成 `path:'/books/{id}'`、`parameters:{id:input.book.id}`；它只编码一个路径段。查询参数用 `query`，表单用 `form`，JSON 请求体用 `json`，不要先手动编码后再编码一次。`form / json / text / bytes` 互斥。

响应正文是 **`response.body` 属性**；JSON 使用 **`response.json()`**，二进制使用 `response.bytes()`。不要调用 `response.text()` 或 `fetch()`。HTTP 非 2xx 会由 SDK 报错；200 响应内的业务错误仍需自己检查。

| 功能 | 需要声明的能力 |
| --- | --- |
| ES 模块操作 | `script-v2` |
| plan 操作 | `plan-v1` |
| HTTP 请求 | `http-v1` |
| HTML + CSS | `html-v1, css-v1` |
| 读取 JSON | `json-v1` |
| JSONPath | `json-v1, jsonpath-v1` |
| URL 工具 | `url-v1` |
| 正文块构造 | `content-v1`；HTML 另需 `html-v1` |
| 持久状态 / 临时缓存 | `state-v1` / `cache-v1` |
| 其他能力 | 查 [SDK](nori-source/sdk.md) 和 [host.json](nori-source/host.json) |

能力可写在根或站点的 `requires` 中，两者取并集。通常把 `core-v2` 放根，站点特有能力放站点。JS 调用需要的能力不会由打包器自动补齐。

需要 HTTP 时，在对应站点追加 `http-insecure-v1`。需要跳过 HTTPS 证书检查时追加 `tls-insecure-v1`，例如：

```yaml
requires: [script-v2, http-v1, http-insecure-v1, tls-insecure-v1]
```

HTTP 能力与证书能力分别生效。跳过证书检查不解决 403、405、验证码或失效签名，也不能让旧 App 突然支持新能力。端点主机限制仍然有效；优先修复站点证书或使用正常 HTTPS 地址。

## 7. 接入搜索与分类

`search(input,nori)` 接收 `input.query`。`catalog` 用于首页或分类列表。两者都返回：

```js
return { items: [book], next: null };
```

没有搜索结果可以返回空数组。请求或解析失败要报错，不要用 `catch { return {items:[],next:null}; }` 把失败伪装成无结果。

HTML 列表的典型解析方式：

```js
const document = nori.dom.parse(response);
try {
  const items = nori.dom.selectAll(document, '.book').map(node => {
    const link = nori.dom.select(node, 'a.details');
    const titleNode = nori.dom.select(node, '.title');
    if (!link || !titleNode) nori.fail('value_invalid', '书籍卡片缺少名称或链接', '/items');
    return {
      id: nori.dom.attr(node, 'data-book-id'),
      title: nori.dom.text(titleNode).trim(),
      kind: 'novel',
      locator: { url: nori.url.resolve(nori.dom.attr(link, 'href'), response.url) }
    };
  });
  return { items, next: null };
} finally {
  nori.dom.free(document);
}
```

同一响应只创建一次 DOM，节点用完释放。相对 URL 以 **`response.url` 最终响应地址**解析，不能一律拼首页。CSS 由 SwiftSoup 执行；网页开发者工具里可用的选择器也需要在 Nori 中核对。XPath 固定 XPath 1.0；JSONPath 使用 RFC 9535。

API 站点可以把响应 JSON 映射成相同的 Book。先判断业务成功字段，再读取列表；不要逐本请求详情来凑搜索数据。混合小说 / 漫画站要把 `input.contentKind` 落到实际查询中；返回的每本书也必须符合本次请求类型。

## 8. 接入详情和章节目录

详情返回完整书籍和可读版本：

```js
export function detail(input, nori) {
  return {
    book: input.book,
    editions: [{ id: 'online', title: '在线阅读', kind: 'chapters',
      locator: { catalogURL: input.book.locator.url } }]
  };
}
```

上例仅说明返回形状；真实源应请求详情并补全作者、简介、封面等。一个站有多个在线线路或文件版时，为每个版本给稳定的 edition ID。不同版本的章节和阅读位置独立管理。

`chapters` 接收 `input.book` 和 `input.edition`，返回：

```js
return {
  items: [
    { kind: 'section', id: 'volume-1', title: '第一卷' },
    { kind: 'chapter', id: 'chapter-1', title: '第一章',
      locator: { url: 'https://books.example.com/books/123/1.html' },
      access: { state: 'available' } }
  ],
  next: null
};
```

章节保持网站实际顺序。排除“最新几章”重复摘要、推荐书链接和广告。章节 ID 用站点 ID 或稳定路径，不用本页数组下标；否则目录新增一章就可能让全部阅读身份变化。

访问状态是 `available / loginRequired / locked / unknown`。站点明确限制时保留限制，不把所有 VIP 标记都当成当前账号不可读；正文请求仍以服务端权限为准。

详情已经拿到首批目录时，可以增加 `chapterPage:{editionID:'online',page:{items,next}}`。editionID 必须属于本次 editions；App 消费首批后只接续剩余页，避免再请求相同目录。

## 9. 接入小说正文

`content` 接收书籍、版本和章节，返回完整一章的 `Document`。普通文本可以逐段构造：

```js
return {
  id: input.chapter.id,
  chapterID: input.chapter.id,
  kind: 'novel',
  title: input.chapter.title,
  blocks: paragraphs.map((text, index) => ({
    kind: 'paragraph', id: 'p:' + index, text
  }))
};
```

HTML 正文优先用原生块构造，保留段落、标题、强调、列表和图片顺序：

```js
const document = nori.dom.parse(response);
try {
  const body = nori.dom.select(document, '#content');
  if (!body) nori.fail('value_invalid', '没有找到小说正文', '/content');
  const extracted = nori.content.blocks(body, {
    format: 'html', baseURL: response.url, remove: ['.advertisement']
  });
  return {
    id: input.chapter.id, chapterID: input.chapter.id,
    kind: 'novel', title: input.chapter.title, ...extracted
  };
} finally {
  nori.dom.free(document);
}
```

`remove` 应对应确认的广告节点；不要用宽泛正则改写正文。非空章节不能返回空 blocks。没有完整正文、验证码页或乱码时应报告错误。

文字 marks 的 `start / length` 使用 UTF-16 偏移。自己构造时注意 emoji 等字符长度，不按字节数计算。阅读器按屏分页，源只负责返回完整内容。

## 10. 接入漫画正文与封面

漫画站在 `kinds` 声明 `comic`，搜索、详情中的 Book 和正文 Document 都返回 `kind:'comic'`。漫画正文用有序图片块，并把 Asset 放进同一个 Document 的 assets：

```js
const assets = {};
const blocks = urls.map((url, index) => {
  const id = 'page:' + index;
  assets[id] = {
    id, role: 'image', mediaType: 'image/jpeg',
    source: { url, endpoint: 'images' }
  };
  return { kind: 'image', id, asset: id };
});
return {
  id: input.chapter.id, chapterID: input.chapter.id,
  kind: 'comic', title: input.chapter.title, blocks, assets
};
```

上例假设接口返回 JPEG 原图。真实源按实际格式填写 `mediaType`；已知原始像素尺寸时填写 Asset.width / height。`assets` 的键、Asset.id 和 block.asset 必须对应。

要取完整正文图，检查懒加载 `data-src`、页面初始 JSON 或实际章节 API。HTML 里只有前两张图时，不能就把两张预览当整章。排除封面、缩略图和广告，并保留阅读顺序。

封面同样是 Asset，放到 `book.cover`，role 为 `cover`。如果 CDN 要求 Referer 或 User-Agent，把它写到 **图片端点** headers；只给网页请求加头不会自动覆盖另一个图片端点。图片、封面和下载域都要在相应 allowedHosts 中明确声明。

## 11. 处理临时图片和文件地址

有签名或到期时间的地址，不应直接作为长期缓存的正文资源地址。给资源保存稳定定位，让 `resolveResource` 在真正加载时获取新地址：

```js
// content 的 assets 中保存这个对象，不保存带临时签名的 URL。
const asset = {
  id: 'page:0', role: 'image', mediaType: 'image/jpeg',
  source: { locator: { chapterID: input.chapter.id, index: 0 } }
};

export async function resolveResource(input, nori) {
  const locator = input.asset.source.locator;
  const response = await nori.http.request({
    endpoint: 'api', method: 'GET', path: '/chapters/{id}/images',
    parameters: { id: locator.chapterID }
  });
  const data = response.json(); // 此例约定 {images:[{url,expiresAt}]}。
  const image = data.images[locator.index];
  if (!image) nori.fail('value_invalid', '图片页码不存在', '/asset/source/locator/index');
  return { url: image.url, endpoint: 'images', expiresAt: image.expiresAt };
}
```

这个片段另需声明 `json-v1`、`api / images` 端点和 `operations.resolveResource`。解析器接收 Asset，因此把必要的稳定信息放到 Asset 自己的 locator；不要假设每个资源调用都携带原章节对象。expiresAt 只在服务返回有效未来时间时设置。

如果服务器或 CDN 缓存了含过期签名的 HTML，重新解析同一份旧 HTML 仍会得到坏地址。先确认网站允许的缓存刷新办法，例如它支持的请求参数或 Cache-Control 头，再在请求层处理。需要缓存一章的图片列表时使用 `cache-v1` 和短 TTL，确保短于有效期；不要把某个站的十秒 TTL 当成所有站通用规则。

EPUB 等文件版本放在详情的 editions 中：

```js
{ id: 'epub', title: 'EPUB', kind: 'file', resource: {
  id: 'epub-file', role: 'publication', mediaType: 'application/epub+zip',
  source: { locator: { fileID: 'stable-file-123' } }
} }
```

`resolveResource` 用稳定 fileID 换下载地址，原生加载器负责下载和打开。文件资源通过 Edition 的 resource 声明；网盘账号与分享转存另按现有网盘接口接入。

## 12. 分页与完整章节

所有列表和目录都要返回 `next`，结束时明确是 null。根据源站真实行为选一种续页：

| `next` | 下次源调用收到什么 | 适合情况 |
| --- | --- | --- |
| `null` | 不再续页 | 单页或末页 |
| `{kind:'url',url:'https://…'}` | `input.cursor` 为续页 URL | 页面提供下一页链接；plan 只允许 GET |
| `{kind:'token',value:'cursor-2'}` | `input.cursor` 为 value | API token 或 JS 自定义非空定位 |
| `{kind:'page'}` | `input.page` 递增、cursor=null | 接口有真实 hasMore，按页码请求 |

JS 的 URL 续页仍要自己读取 input.cursor 构造请求。plan 的 nextURL 模式会直接使用完整续页 URL，不再重复附加首屏 query。page 模式从第 1 页开始；不要用 `items.length > 0` 猜永远还有下一页。

App 对外的 `nextCursor` 是宿主包装，不是源应该返回的字段。失败不推进游标；查询、筛选、账号、设置或源版本变化后重新从第一页开始。

章节目录可以通过多次 `chapters` 调用续页。**content 没有 next 字段**：网站把一章拆成多个网页时，由本次脚本在请求预算内收齐、检查链接不重复且仍属同章，再一次返回 Document。中途失败要让整章失败，不能把半章标成成功；下一章链接也不能误合并。

## 13. 筛选设置与用户动作

`settings` 保存用户长期配置；`filters.catalog / filters.search` 分别影响首页和搜索。控件类型是 `text / toggle / select / multiSelect`，选择项用网站真实值。

```yaml
filters:
  catalog:
    - id: category
      title: 分类
      control: select
      defaultValue: all
      options:
        - {value: all, title: 全部}
        - {value: fantasy, title: 奇幻}
```

请求读取 `input.filters.category`。布尔配置传 JSON true/false，多选传字符串数组，不全部转字符串。`when` 只能依赖前面已定义的控件。

动态筛选实现 `operations.filters` 对应的函数：

```js
export function filters(input, nori) {
  return { fields: input.scope === 'search' ? [] : [{
    id: 'category', title: '分类', control: 'select', defaultValue: 'all',
    options: [{value:'all',title:'全部'}, {value:'fantasy',title:'奇幻'}]
  }] };
}
```

返回的是当前 scope 的完整控件定义。如果宿主调用 filters，不要只写静态选项却遗漏操作入口。网站没有的筛选不添加；不同类型的筛选不能只改变显示文字而不影响实际请求。

用户动作通过 `actions` 声明 id、title、effect，并由 `action` 返回 `{changed:boolean}`。effect=read 不改变远端账号数据，write 有远端副作用，只能从用户明确触发的入口执行。不要在搜索、详情或初始化中暗中执行签到、购买、转存等写操作。

## 14. 登录和账号

登录通过站点的 `sessions` 声明，类型为 `web / form / script`。账号和 Cookie 由 App 原生层保管；普通操作只引用会话名和读取 `input.sessionStatus`。

下面是虚构 JSON API 的完整 form 会话片段，放在 site 下，另需 `plan-v1, http-v1, json-v1, jsonpath-v1, auth-form-v1`：

```yaml
sessions:
  member:
    kind: form
    endpoint: api
    fields:
      - {id: username, title: 账号, type: text}
      - {id: password, title: 密码, type: password}
    request:
      endpoint: api
      method: POST
      path: /session
      json:
        username: {credential: username}
        password: {credential: password}
    response: {format: json}
    token: {jsonpath: $.token}
    credential: {header: X-API-Key, encoding: plain}
    check:
      plan:
        request: {endpoint: api, method: GET, path: /session/status, session: member}
        response: {format: json}
        result:
          fields:
            authenticated: {jsonpath: $.authenticated}
            displayName: {jsonpath: $.displayName}
```

普通请求写 `session:'member'`，宿主按声明注入凭据。图片也需要认证时，在资源 source 上指定绑定到该端点的 session。一个会话绑定一个端点，API 的令牌不会自动发送到另一个 CDN 端点。

站点要求把令牌放 query/form/json 时，声明 `auth-request-v1` 并使用 `credentialBindings`；资源只支持 query 绑定。源脚本拿不到原生令牌读回接口。script 登录中的 `nori.credentials` 和 `nori.authentication.storeCredential()` 仅在认证阶段有效。

登录完成要用 check 证明 authenticated，不以“有 Cookie”判断成功。不要把测试账号、Cookie、密码、令牌放进源包、locator、state、cache、日志或 GitHub。完整配置见 [aggregate.source.yaml](nori-source/examples/aggregate.source.yaml)。

## 15. 选择 plan 或 JS

简单的“一次请求 → 字段提取”适合 plan。多请求、循环、解密、章内合页或复杂分支使用 JS 操作。同站点可按操作混用，两者返回相同模型。

plan 需要 `request / response / result`，列表还需要 `pagination`；与 script 互斥。最外层 result 用 `fields` 明确构造模型。完整示例见 [HTML plan](nori-source/examples/html.nori.json) 和 [JSON API plan](nori-source/examples/json-api.nori.json)。

表达式速查：

| 表达式 | 例子 |
| --- | --- |
| 输入 | `{input:'/query'}` |
| 用户设置 | `{setting:'category'}` |
| CSS 文本 / 属性 | `{css:'.title',read:'text'}` / `{css:'a',attr:'href'}` |
| JSONPath | `{jsonpath:'$.data.books[*]',all:true}` |
| 对象 / 数组映射 | `{fields:{…}}` / `{each:{select:…,fields:{…}}}` |
| 常量对象 | `{literal:{…}}` |
| 顺序处理 | `steps:[{op:'trim'},{op:'emptyToNull'},{op:'resolveURL'}]` |

裸字符串就是常量，不是隐式选择器。`all:true` 返回数组，默认取第一项、无匹配为 null。默认 scope 是当前 each 条目，没有条目时为响应根；需要根节点时写 scope=document。

plan 中的字段 script 必须同步，只处理当前值，不能请求网络、写状态或返回 Promise。操作级 script 可以 async。模块初始化只定义函数与常量，不请求网络；每次调用环境独立，不依赖上次调用的全局变量。

## 16. 编码加密状态和缓存

请求可指定 `charset:'gbk'` 等实际字符集；缺省按 HTTP charset、UTF-8 解码。乱码先查原始字节和编码，不用字符串替换掩盖解码问题。

SDK 提供 codec 的 Base64、编码和摘要，以及 crypto 的 HMAC、AES、DES、Ed25519、RSA 等已声明能力。二进制使用 Uint8Array，字符串通过 codec 明确编码，不能猜某段字符串到底是 Hex、Base64 还是原始密钥。算法、密钥格式和所需能力见 [SDK](nori-source/sdk.md)。

`state` 是非敏感持久状态；`cache` 是有到期时间的临时 JSON。两者按包、站点、版本和账号隔离，只有操作成功并通过结果校验才提交。不要用它们保存阅读位置或账号秘密。

```js
let data = nori.cache.get('public-categories');
if (data === undefined) {
  data = (await nori.http.request({endpoint:'api',method:'GET',path:'/categories'})).json();
  nori.cache.set('public-categories', data, {ttlMs: 300000});
}
```

当前宿主主要上限：每次操作墙钟 30 秒、JS 执行 10 秒、12 次 SDK 请求、单响应 4 MiB、VM 内存 32 MiB。policy 只能收紧；当前同站点操作和 SDK 网络桥串行，不承诺 Promise.all 并发。原生图片另限 20 MiB，文件下载沿用 80 MiB。预算以 [host.json](nori-source/host.json) 和对应 App 为准。

DOM/ZIP 句柄只在本次调用中有效，用完释放。SDK 不提供文件系统、Node、浏览器 DOM、任意原生 UI 或全局 fetch/setTimeout。需要等待时使用声明了 `task-v1` 的 `nori.task.sleep()`。

## 17. 逐步验证完整阅读流程

验证分成下面几层。不要把“静态 valid”“首页 200”或“返回图片 URL”写成“全站可读”。

| 层 | 检查内容 | 能证明什么 |
| --- | --- | --- |
| 打包 / 静态 | Schema、模块、引用、能力 | 格式和可静态确定的关系有效 |
| 操作执行 | catalog/search/detail/chapters/content | 当前样本在 Nori 运行时返回合法结果 |
| 真实资源 | 封面和正文图/文件下载、解码 | 当前地址能取得可读字节 |
| App 试读 | 搜索点入、详情、翻章、重启恢复 | 实际安装和阅读链路正常 |

公开仓库作者至少执行第 2 节静态命令，再在 App 检查：有结果和无结果搜索；首屏与分类分页；详情与目录末页；首章、中间章、最新公开章；漫画每张图的顺序与加载；刷新/重开后重新读图。需要登录的站点，用自己的账号检查登录前后和失效状态，不把账号写入仓库。

静态报告中的 `selectors: not-run` 和 `behavior: not-run` 是正常的范围说明。打包器不联网，不会验证 CSS 是否命中网页，也不运行 JS。`--target protocol` 更不代表当前 App 支持；实际发布用默认 current 目标。

有 App 工程权限时，以下命令在 **NoriReader App 工程根目录**执行。`/tmp/my-source.nori.json` 先替换为自己的包，`--site` 使用 YAML 中的站点 ID：

```sh
swift run NoriSourceTool inspect /tmp/my-source.nori.json
swift run NoriSourceTool run /tmp/my-source.nori.json \
  --site notes --operation catalog
```

CLI 默认禁止网络，真实站点需 `--allow-network`；`--pages 2` 在同一上下文继续列表/目录，`--filters` 与 `--settings` 接收控件 ID 到 JSON 原类型的映射，`--state` 保存非敏感状态。操作输入文件按下面依赖逐步构造：

```json
{"query":"山海","contentKind":"novel"}
```

```text
search --input search.json        → result.value.items[0] 作为 book
detail --input detail.json        → {book,contentKind}
chapters --input chapters.json    → {book,edition,contentKind}
content --input content.json      → {book,edition,chapter,contentKind}
resolveResource --input asset.json → {asset,book,edition}，如使用 locator 资源
```

在 `detail.json` 等文件中放上一步的真实完整对象，不只传书名或内部显示 URL。命令举例：

```sh
swift run NoriSourceTool run /tmp/my-source.nori.json \
  --site books --operation search --input /tmp/search.json --allow-network
swift run NoriSourceTool run /tmp/my-source.nori.json \
  --site books --operation content --input /tmp/content.json --allow-network

swift run SourceProbe --inspect-source /tmp/my-source.nori.json
swift run SourceProbe --audit-source /tmp/my-source.nori.json /tmp/audit.json books
swift run SourceProbe --gateway-read /tmp/my-source.nori.json books 关键词
```

`--audit-source` 对原生 Nori JSON 当前检查操作模型，不保证正文图已下载。`--gateway-read` 走实际 ReadingGateway 并检查首张图下载与 ImageIO 解码；仍不能代替全章每张图、多个作品和真机验证。还要阅读输出：工具打印图片失败时，不应只凭进程退出码判定成功。

## 18. 定位常见错误

| 错误 / 现象 | 意思 | 先检查 |
| --- | --- | --- |
| `value_invalid /book/kind` | 书籍类型与站点或本次请求不一致 | `sites[].kinds`、Book.kind、input.contentKind 都是 novel/comic 且一致 |
| `unsupported_feature requires tls-insecure-v1` | 当前 App 宿主缺少声明能力 | App 版本及其清单；正常证书站删去不必要能力，确实需要则使用支持的 App |
| `unsupported_feature /operations/filters` | 调用了未实现操作 | filters 声明、模块导出和当前 scope |
| `response.text is not a function` | 使用了浏览器 Fetch 的接口 | 改为 `response.body`；JSON 用 `response.json()` |
| `/result/BookPage` 等 | 动态返回结果不符合模型 | items/next、ID 字符串、必填值，避免把 HTML 错误页映射为 Book |
| `/blocks/asset` 或 `/assets/id` | 图片引用断开 | assets 的键、Asset.id、block.asset 三者一致 |
| 403、验证码或拒绝访问 | 服务器拒绝当前请求 | 实际权限、验证页、端点头、CDN、签名有效期；不当作空结果 |
| 正文有列表但图片全白 | 图片 URL 不等于可读资源 | 从原生资源加载链路下载，核对 MIME、解码、重定向和请求头 |
| `access_denied` / 不允许的 URL | 请求不属于声明范围或服务端拒绝 | 实际主机、对应 endpoint、重定向主机和 HTTP 能力 |
| 目录只到一半 | 续页没接全 | 真正末页 next=null、章节稳定 ID、分卷和重复摘要 |
| 搜索一直空 | 解析没命中或请求字段错误 | 方法、编码、业务成功字段、选择器、验证页 |
| timeout / 请求数超限 | 单次流程超过预算 | 是否逐本补详情、无限重试或把全站抓取塞进一次调用 |
| 更新文件后旧漫画源还在 | 使用了普通追加导入 | 对原合集执行“从文件更新 / 刷新”，不要当作又添加一份 |

错误路径是 JSON Pointer，数组从 0 起算。区分“源包定义错误”“当前 App 不支持”“站点拒绝”“解析结果不符合模型”，按对应层修复。错误需要保留操作、字段位置和状态；不要把带私密参数的整条 URL 打进日志。

## 19. 制作小说漫画分组合集

合集是安装容器，里面是已经打包的完整子源对象。每个子源继续独立执行、设置、登录、开关和保存阅读身份。不要把多个源的 JS 粘成一个函数，也不能把 YAML 文件名、URL 或 JSON 数组当成一个成员。

按内容把源分为“小说”“漫画”“NSFW”；NSFW 同时容纳成人小说与成人漫画。以原源明确的成人标记和站点实际内容为依据，不仅凭普通小说站出现成人广告就判断正文类型。仅修改分组时使用合集成员的 `group`，保留子源 ID、模块和站点配置。

下面的生成脚本假设你已在 dist 生成小说、漫画、成人小说和成人漫画四份包：

```python
import json
from pathlib import Path

sources = []
for filename, group in [
    ('novel.nori.json', '小说'),
    ('comic.nori.json', '漫画'),
    ('adult-novel.nori.json', 'NSFW'),
    ('adult-comic.nori.json', 'NSFW'),
]:
    source = json.loads((Path('dist') / filename).read_text(encoding='utf-8'))
    source['group'] = group
    sources.append(source)

collection = {
    'format': 'nori-collection', 'schemaVersion': 1,
    'id': 'org.example.mycollection', 'name': '我的书源合集', 'version': '1.0.0',
    'groups': ['小说', '漫画', 'NSFW'], 'sources': sources
}
Path('dist/nori-sources.nori.json').write_text(
    json.dumps(collection, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
```

`sources[i].group` 要和顶层 groups 精确匹配；未设置或未匹配的成员位于顶层。站点自己的 `presentation.group` 与合集成员 group 负责不同层级。子源 ID 不能重复，合集 ID 不能等于成员 ID，不允许嵌套合集。

`pack_source.py validate` 检查单个 Nori JSON 源，不接受整个合集。先逐包验证，再用 [合集 Schema](source-collections/schema.json) 检查容器，并在 App 或 `SourceProbe --inspect-source` 检查各成员导入。分组元数据由合集提取，不要把带 group 的成员直接当独立源交给 Nori JSON Schema。

同 ID 合集的**普通添加是追加**：新成员加入，重复成员保留本机已有版本，文件中没出现的旧成员仍保留。明确“刷新 / 从文件更新 / 从 URL 更新”才按更新文件替换；完整更新成功时才会移除缺席成员。部分成员失败会保留相关旧安装，具体见 [合集说明](source-collections/README.md)。

所以，想把“28 个漫画源换成 1 个新源”，要发布同 ID 合集的新版本，并让已安装用户对原合集执行更新。仅在文件中删掉 28 项后再次普通导入，不保证它们从用户安装中消失。

## 20. 发布更新和交付

每次修改作者 YAML/JS 后重新打包；不要只改生成的 JSON 或只上传没有嵌入模块的 YAML。报告可随发布保留，真正的导入入口是 JSON。

建议自己的仓库保留：

```text
sources/my-source/source.yaml
sources/my-source/reader.js
dist/my-source.nori.json
docs/validation.md                本次样本、日期、操作与资源结果
```

推送后，App 添加文件对应的 Raw 地址，例如：

```text
https://raw.githubusercontent.com/你的用户名/你的仓库/main/dist/my-source.nori.json
```

GitHub `/blob/main/…` 是网页，不是源文件地址；`*.report.json` 也不是源入口。发布前用 Raw 地址下载一次，确认得到 JSON 且通过相同静态检查。

升级时保持包/站点/书籍/版本/章节的稳定 ID，递增作者 `version`。文件名或名称不代表身份。普通添加与明确更新的行为有区别；需要升级已安装的源时使用管理书源的刷新或更新入口。仓库更新不会自动替换用户本机源。域名或代码变动后，要重新检查请求、账号状态和图片资源；不要承诺只换 version 就能保留全部授权状态。

交付记录至少写明：源版本、对应 App/SDK、测试日期、搜索词、作品与章节样本、目录是否到末页、正文是否完整、漫画是否实际下载解码、登录是否实测。未验证的账号、站点、全量章节和真机表现明确写未验证。

## 21. 参考文件

- [SDK 使用说明](nori-source/sdk.md)与 [TypeScript 类型](nori-source/sdk.d.ts)：可调用方法、输入输出。
- [执行契约](nori-source/execution.md)：能力、权限、分页、生命周期和错误。
- [发布 Schema](nori-source/schema.json)、[作者 Schema](nori-source/authoring.schema.json)与 [宿主清单](nori-source/host.json)：结构和支持基线。
- [打包器说明](nori-source/packager.md)：命令、静态检查范围、报告和模块约束。
- [离线源作者配置](nori-source/examples/offline.source.yaml)、[模块](nori-source/examples/offline.js)和 [发布包](nori-source/examples/offline.nori.json)：无需网络即可导入试读。
- [HTML 小说站作者项目](nori-source/examples/web-novel/source.yaml)及 [模块](nori-source/examples/web-novel/reader.js)：完整在线操作模板。
- [HTML plan](nori-source/examples/html.nori.json)、[JSON API plan](nori-source/examples/json-api.nori.json)、[认证聚合示例](nori-source/examples/aggregate.source.yaml)：虚构服务的进阶参考。
- [分组合集说明](source-collections/README.md)与 [容器 Schema](source-collections/schema.json)。

示例与规范描述的是接口契约。静态可打包、离线可运行、真实网站可读是三项不同结果；发布时按实际完成的检查记录。

# 旧 JSON 网站配置

当前默认使用 JS 源，见 [JS 源说明](js-sources.md)。本文描述继续兼容的声明式 JSON 配置；设置中以 .json 结尾的链接按此格式导入。

配置是 `WebsiteSource` JSON 数组，可放在自己的 HTTPS 地址并从设置导入。同 ID 的导入配置替换当前配置，原有浏览历史保留。

每个配置包含 `id`、`name`、`kind`（`novel` / `comic`）、`homepage`、`parser` 和 `sections`，可增加可选的 `reading` 章节规则。HTML 源的每个栏目用 CSS 选择器定位条目，再提取标题、详情链接、封面、作者和摘要。没有 `reading` 的旧配置仍可导入。

```json
[
  {
    "id": "my-books",
    "name": "我的书站",
    "kind": "novel",
    "homepage": "https://example.com/",
    "parser": "html",
    "sections": [
      {
        "id": "recommended",
        "title": "编辑推荐",
        "tabTitle": "推荐",
        "items": ".book-card",
        "name": { "selector": "a.title" },
        "link": { "selector": "a.title", "attribute": "href" },
        "cover": { "selector": "img", "attribute": "src" },
        "author": { "selector": ".author" }
      }
    ]
  }
]
```

- `selector` 为空时读取条目自身。没有 `attribute` 时读取文本。
- 相对链接以网站响应后的最终 URL 为基准。仅接受 HTTP(S) 详情和封面链接。
- `useHTTPS: true` 仅用于确认支持 HTTPS、但页面仍输出 HTTP 图片地址的网站，当前用于 SF 封面。
- 每个栏目按详情 URL 去重。没有有效条目时返回解析失败，避免把登录页或改版页面视为正常空列表。
- `parser: "fanqie"` 和 `parser: "mox"` 使用已编译的专用解析器，`sections` 设为空数组。新增此类解析器需要更新 App。
- 配置不支持执行 JavaScript、任意文件访问或任意原生 API。

## 在线章节

在单个网站对象中添加 `reading`，即可让详情展示阅读入口。下面是独立目录页的配置示例，实际选择器需按源网站结构填写：

```json
"reading": {
  "catalogLink": { "selector": "a.chapters", "attribute": "href" },
  "chapterItems": ".chapter-list li",
  "chapterTitle": { "selector": "a" },
  "chapterLink": { "selector": "a", "attribute": "href" },
  "lockedSelector": ".vip",
  "content": "#chapter-content",
  "contentTitle": { "selector": "h1.chapter-title" },
  "remove": [".advertisement", ".chapter-navigation"]
}
```

| 字段 | 含义 |
|---|---|
| `catalogLink` | 可选，从详情页提取目录 URL；省略时直接在详情页解析章节 |
| `chapterItems` | 目录条目 CSS 选择器，按页面顺序排列并按 URL 去重 |
| `chapterTitle` / `chapterLink` | 在单个目录条目内提取章节名 / URL，沿用 `HTMLFieldRule` |
| `lockedSelector` | 可选，在条目内命中时标记为需要源网站授权，不加载该章 |
| `content` | 章节页正文容器 CSS 选择器 |
| `contentTitle` | 可选，章节页标题；缺失或文本为空时使用目录标题 |
| `remove` | 可选，从正文容器内移除的元素选择器 |
| `font` | 可选，`embeddedOpenType` 允许读取页面内联样式声明的 HTTPS OTF / TTF 字体 |

解析器保留段落和 `<br>` 换行，移除脚本、样式、iframe 等，再将纯文本转义写入 App 自有阅读文档。正文出现私用区字符时，必须声明字体规则并成功取得字体，否则返回加载错误，避免显示乱码。字体只负责字形显示，不将字符转换为标准汉字。

内置 SF轻小说使用独立目录页和 VIP 标记；番茄小说从详情页取得目录，并加载正文声明的字体。当前只支持单页目录和单页章节正文，不自动处理分页、登录或网站脚本执行后的内容。

网络请求超时 20 秒、资源超时 35 秒，每个 HTML / 字体响应上限 4 MiB，仅读取 UTF-8 页面。登录 Cookie 和网盘凭据不在本版本配置中。

# 随阅 JS 源协议

App全新安装默认没有任何书源，首页进入本地书库；本地文件可直接导入；包括 WebDAV 在内的网盘登录入口需要源声明。进入「设置 → 管理书源」，右上角 + 输入返回JavaScript或配置入口的HTTPS地址，并填写别名。官方合集也需要手动添加；一个源可包含多个网站和网盘适配器，随阅协议不直接兼容TVBox视频接口。

「已添加」区域可保存多个书源，默认只展示当前应用的源；点击当前行或展开箭头可显示其他源，单选切换后重新收起。网站随当前源变化，按与首页一致的分组展示；长按网站可在组内拖动，长按分组标题可调整整组顺序。网站默认全部勾选，轻点切换首页展示，具体阅读网站从首页左上角切换。本地书库始终可选，取消全部网站时首页显示本地书库。各源分别保存网站展示与排序偏好，新增站点按配置顺序补入；首页菜单、搜索源站标签及筛选抽屉共用排序，搜索书籍仍优先按相关性、同分按站点顺序。全源搜索先列当前源的网站，再列其他已添加源的网站；隐藏首页网站不排除搜索或历史读取。

添加时保存原始HTTPS入口地址。刷新会重新读取该地址及配置引用的JS，均禁止缓存。App不硬编码官方源地址，也不按源ID补链接；旧记录未保存地址时首次刷新补填。更新保持源ID一致，验证成功后才替换脚本，别名、设置、当前网站和排序保留，失败继续使用原源，不定时或自动更新。

本仓库根目录的 `index.js` 是完整官方合集，`index.config.js` 是配置入口。添加地址为 `https://raw.githubusercontent.com/qyuja/NoriReader-Sources/main/index.config.js`。配置和执行模块位于 `src/`，运行 `python3 scripts/build_source.py` 生成根目录的单文件源。App 不打包或自动下载官方源；用户添加的脚本、别名、设置及入口地址保存在本机。首次编写请先看[快速开始](quickstart.md)。

App支持 `manifest.apiVersion:1` 和 `2`。协议2增加分页目录回调 `chapters`；旧版App不支持时会拒绝导入，避免只显示第一批目录。没有分页目录的旧源继续使用协议1。远程配置入口的 `sourceConfig.apiVersion` 仍为1，独立于脚本协议。

```js
var source = {
  manifest: {
    apiVersion: 1, id: 'my.reader.sources', name: '我的书源', version: '1.0.0',
    domains: ['books.example.com'],
    sites: [{id:'my.novels',name:'我的小说站',kind:'novel',
      homepage:'https://books.example.com/',capabilities:['home','search','detail','content']}]
  },
  home(input) { /* CatalogSection[] */ },
  search(input) { /* CatalogBook[]; input: {siteID, query, page} */ },
  detail(input) { /* Novel */ },
  content(input) { /* content payload */ }
};
```

函数可同步返回，也可返回 Promise。没有浏览器 DOM、fetch、setTimeout、Node.js 模块或文件 API。HTTP 在后台线程执行。

## 官方合集的声明结构（1.9.0）

完整index.js分为上方配置区和下方执行区，单文件即可导入。仓库中编辑source-definitions.js维护配置，执行方法仍分文件保存；生成器按“完整定义 → source入口 → 执行方法”的顺序拼接，不再逐段push站点、追加能力或覆盖source方法。

| 上方声明 | 作用 |
|---|---|
| websiteGroups | 小说、笔趣阁、漫画分组名称 |
| requestHeaders / catalogTemplates / readingDefaults | 共用请求头、结果字段和阅读解析规则 |
| websiteRules | 每站的ID、域名、能力、首页、完整筛选、请求/结果/分页、详情和阅读规则 |
| driveRules | 网盘登录入口、域名、请求头与API端点；账号Cookie和运行时凭据不写在这里 |
| sourceSettings / sourceDefinitions | 源设置、官方/可选包的站点清单、别名和版本 |
| source | 根据所选源声明一次性创建的最终入口 |

每站 `catalog.library / catalog.search` 分别描述书库和搜索；search为null的站点仍不声明可用搜索。`request.url` 支持 `{homepage}`、`{query}` 和筛选ID占位符；URL参数按UTF-8编码，form字段单独编码。request可写成按顺序匹配when的数组，最后一项为默认路径。`rows.items / rows.fields` 描述结果，pagination指定实际页码格式或下一页方式；JSONP的callback、成功字段和HTML字段在response声明，不执行响应代码。站点专有的数据格式由明确的handler引用现有执行方法。

动态分类写在对应filter的optionsSource，下面是笔趣阁当前使用的结构：

```js
{
  id: 'category', title: '分类', defaultValue: 'all',
  options: [{value: 'all', title: '全部'}],
  optionsSource: {
    request: {url: '{homepage}sort/'},
    items: 'a[href]',
    fields: {title: {selector: ''}, href: {selector: '', attribute: 'href'}},
    valuePattern: /^\/sort\/([a-z]+)\/1\/$/,
    titlePattern: /小说$/,
    initialOptions: [{value: 'all', title: '全部'}],
    minimumOptions: 2
  }
}
```

静态分类、状态、字数、读者和排序继续写完整options及when条件；网站没有的筛选不添加。动态定义由执行器投影为App既有的dynamicFilters能力，并在catalogFilters回调按声明请求、提取、去重。defaultSetting可引用源设置作为筛选默认值。读取网页时的临时结果可在方法内累积，站点注册表和manifest不在执行区追加或补改。

已有使用协议2的App可直接导入1.8.0，不新增源协议。可选小说包1.3.0沿用biquge-info / shuhaige-extra别名，站点 ID 和已有能力保持兼容；当前官方合集包含 11 站与夸克、百度、WebDAV 三类网盘。

## 网站接口

| 方法 | 输入 | 返回 |
|---|---|---|
| home | {siteID} | [{id,title,tabTitle,books:[...]}]，旧接口继续兼容 |
| catalog | {siteID,query?,filters,cursor?} | {books,nextCursor?,title?}，新版筛选/分页接口 |
| catalogFilters | {siteID,query?,filters,settings} | CatalogFilter[]，声明 dynamicFilters 时加载当前作用域的筛选定义 |
| search | {siteID,query,page} | CatalogBook[]，无匹配返回 []，请求失败应抛错 |
| detail | {siteID,book} | {book,chapters:[...],resources?:[...],nextChapterCursor?:string} |
| chapters | {siteID,book,cursor} | {chapters:[...],nextCursor?:string}；协议2分页目录 |
| content | {siteID,chapter} | {title?,paragraphs?:string[],pages?:httpsURL[],images?:[{url,width?,height?}],fontURL?:httpsURL} |

CatalogBook 字段：sourceID、title、author、detailURL、coverURL?、summary、attributes?:[{name,value}]。detail 可返回完整书名、作者、简介、封面和语言 / 大小 / 发布人 / 时间等元数据；网关更新详情字段，保留输入书籍的 sourceID、detailURL 和身份。没有作者 / 摘要时传空字符串。NovelChapter 为 `{title,url,isLocked}`。返回绝对 HTTPS URL。

搜索查询所有已添加源的网站，与首页所选网站无关，最多四站并发。只有键盘提交或点击历史标签才发起查询，编辑文字不发送请求。各站结果逐步合并，按书名与作者相关性排序，同分沿用网站顺序；站点标签只筛选缓存结果。相同网站内按详情 URL 去重，不合并不同网站的同名书。未声明 search 能力、需要登录、需要验证和请求失败分别呈现状态。catalog 源支持继续加载下一页，追加失败保留已有结果；旧源不猜测分页，仍取第一页。

旧 JSON 配置可增加 `search: {url: "https://books.example.com/search?q={query}&page={page}", results: HTMLSectionRule}`。results 沿用 sections 中单个栏目的解析字段；空列表是有效搜索结果。

章节在中间层变成统一 ChapterDocument.blocks。漫画站声明 kind=comic 和 detail / content 能力，按阅读顺序返回 `images:[{url:'https://images.example.com/1.jpg',width:1280,height:1800}]`。尺寸为原图像素，尽量提供以避免加载后改变长图高度；缺省时 App 解码后补齐比例并保持图片位置。仍兼容旧的 pages URL 数组；同时返回时以 images 为准。不返回标题封面、广告或预览缩略图作为正文页。

现有快看、腾讯动漫适配已提供详情、目录和公开话正文。快看从 Nuxt 的完整字面量数据取得有序图片，HTML 只预先呈现前两图；腾讯按公开网页客户端的编码规则解析 DATA。适配器不运行网页脚本或原始 eval，锁定章节与正文权限字段均保留校验。Kmoe 仍只有首页 / 搜索和原站入口。App 按统一的漫画内容模型提供阅读、缩放和进度。

合集中的「笔趣阁」使用 [bqg.info](https://www.bqg.info/)，站点 ID 为 `biquge`。首页提取推荐和最近更新，CSS 的 background-image 转为封面地址；搜索请求 `/search/?searchkey=...`，保留网站返回的书籍顺序。该页面没有分页链接，适配器仅返回 page=1 的结果。搜索页缺少的作者等信息在详情页补全；封面采用实际 img 地址，避免源站 og:image 字段拼接错误。

目录只读取 `dl#newlist`，排除倒序的最新章节摘要和相关阅读。正文读取 `#booktxt`，按 `#linkNext` 合并同一章节的 `_N.html` 网页，再交给阅读器按屏分页；不会把下一章并入当前章。清理站点独立水印与续页提示，不改写正文。一次章节加载最多 12 个网页，与原生请求限额一致；续页缺失、跨章冒充续页或出现循环时抛错。

文件源声明 resources 能力，在 detail 中返回：

```js
// 网站文件直链
{title:'EPUB',kind:'download',filename:'book.epub',url:'https://files.example.com/book.epub'}
// 对应网盘适配器能够解释的账号文件标识
{title:'网盘版本',kind:'driveFile',filename:'book.txt',providerID:'quark',fileID:'opaque-file-id'}
// 公开分享：用户选账号、浏览文件后转存所选文件，再从自己的网盘读取
{title:'夸克分享',kind:'driveShare',filename:'',url:'https://pan.quark.cn/s/SHARE_ID',accessCode:'1234'}
```

driveFile 指账号自身文件；driveShare 指分享链接。目前接受 HTTPS 的 pan.quark.cn/s/、pan.baidu.com/s/1… 和 pan.baidu.com/share/init?surl=…。提取码可放在 accessCode 或链接的 pwd 参数。网关识别服务商，用户选择同平台账号；不跨网盘转存。

download / driveFile 的 filename 必须包含真实扩展名；下载 URL 可以是无扩展名的重定向接口。当前支持 TXT、EPUB、未加密的 MOBI / AZW3、CBZ / 图片 ZIP。详情显示全部版本，开始阅读优先 EPUB、AZW3、MOBI、TXT，其后为漫画包；手动选版会覆盖默认选择，不先弹出选择框。文件转换后保留原站元数据、所有版本与 fileFormat，不同版本使用独立的本地内容地址。

### 分页目录（协议2）

站点一页只返回部分目录时，在 `manifest.apiVersion` 使用2、站点能力声明 `chapters`，并返回下一目录页游标：

```js
detail({siteID, book}) {
  const first = loadDirectory(book.detailURL);
  return {book, chapters:first.chapters, nextChapterCursor:first.nextURL};
},
chapters({siteID, book, cursor}) {
  const page = loadDirectory(cursor);
  return {chapters:page.chapters, nextCursor:page.nextURL};
}
```

`loadDirectory` 是源自己的解析函数。游标可用下一页URL或其他字符串，最后一页返回null或省略。App逐页收齐后交付完整目录，按章节URL去重、保留首次出现顺序。每页是独立VM调用，不受“整份目录最多12次请求”的限制；单次回调仍最多12请求。取消或任一目录页失败时详情加载失败，不把半份目录当作完整结果。目录只有一页的源仍可直接从 `detail` 返回全部章节，不需要实现此回调。

## 编写小说源

[example-novel.js](../example-novel.js) 是可运行的 bqg.info 示例；[example-novel.config.js](../example-novel.config.js) 是对应配置入口。脚本有独立 ID，可与官方合集同时安装。先修改 `SITE`、`manifest.domains`、网站路径和 CSS 选择器，再验证列表、详情与目录、正文。`example-source.js` 保留为虚构网站的通用模板。

```sh
node --check example-novel.js
node scripts/check_sources.mjs
```

语法和元数据检查通过后，在 App 依次验证分类、搜索、列表下一页、详情、完整目录和正文。小说正文返回完整章节的 `paragraphs`；网站一章分多页时，由源合并同一章续页。按屏分页、阅读主题和预加载由 App 完成。每次回调会重新执行脚本，跨次请求使用 App 传入的 `settings / filters / cursor`，不要依赖上一次调用的全局变量。

## 动态筛选

在站点 `catalog` 中增加 `dynamicFilters:true`，并实现 `source.catalogFilters(input)`。静态 `filters` / `searchFilters` 仍可作为初始显示及旧客户端配置；不声明动态能力的旧源维持原行为。

```js
var source = {
  manifest: {
    // 其余必需字段按上面的完整示例声明。
    sites: [{id:'my.novels',name:'我的小说站',kind:'novel',homepage:'https://books.example.com/',
      capabilities:['catalog','search'],catalog:{filters:[],searchFilters:[],dynamicFilters:true}}]
  },
  catalogFilters: loadCatalogFilters
};

function loadCatalogFilters({siteID, query, filters, settings}) {
  if (query) return [];
  const categories = loadCategoriesFromWebsite(filters.audience);
  return [{id:'category',title:'分类',defaultValue:'all',options:[
    {value:'all',title:'全部'}, ...categories
  ]}];
}
```

`loadCategoriesFromWebsite` 是说明用的自定义函数；可运行的 HTML 提取见示例源。回调返回当前作用域的完整定义数组，选项仍用 `{value,title,when?}`。首次 `filters` 可为空，源应自行确定默认频道。切换条件会重新加载定义，App 随后将失效的选择恢复为默认值，再调用 `catalog`；动态配置失败直接报错，不把失败当作空列表。追加下一页复用首屏取得的定义，不重复请求分类。搜索动态配置只在提交搜索或修改已提交搜索的筛选时执行，输入文字不请求。

## 源专属设置

在 `manifest.settings` 声明配置项。App 在「管理书源 → 合集右侧齿轮」生成原生设置页，按源 ID 持久化。所有业务回调的 `input.settings` 都包含已解析的值，包括未更改的默认值。

```js
settings: [
  {id:'defaultStatus',title:'默认书库',type:'select',defaultValue:'all',options:[
    {value:'all',title:'全部'}, {value:'complete',title:'完本'}]},
  {id:'traditional',title:'繁体显示',type:'switch',defaultValue:false},
  {id:'channel',title:'频道参数',type:'input',defaultValue:''}
]
// 回调中：input.settings.defaultStatus 为字符串，traditional 为布尔值。
```

`select / input` 使用字符串值，`switch` 使用布尔值；设置项 ID 唯一。更新同 ID 脚本时保留仍合法的设置，已删除或不再合法的值按新定义处理。修改设置后清除该源列表和章节缓存，首页与搜索在返回时重新读取配置。这里保存普通源参数，账号密码和 Cookie 继续由原生账号层管理。设置不能扩大 `domains` 的请求范围。

官方源 1.4.0 已将笔趣阁分类改为从网站书库导航动态获取，并提供「笔趣阁默认书库」设置。已有安装可在管理书源点击刷新。

## 筛选、分组与分页

在 `manifest.sites[]` 中声明 `group`（首页菜单分组）和 `catalog`。旧源不声明这两个字段仍正常使用。官方1.3.0只更新包内源，不自动覆盖用户已安装脚本；已有安装在「管理书源」点击刷新显式更新。

```js
{
  id: 'my.novels', name: '我的小说站', group: '笔趣阁', kind: 'novel',
  homepage: 'https://books.example.com/',
  capabilities: ['home', 'search', 'catalog', 'detail', 'content'],
  catalog: {
    filters: [
      {id:'audience', title:'读者', defaultValue:'male', options:[
        {value:'male',title:'男频'}, {value:'female',title:'女频'}]},
      {id:'category', title:'分类', defaultValue:'all', options:[
        {value:'all',title:'不限'},
        {value:'fantasy',title:'玄幻',when:{audience:'male'}},
        {value:'romance',title:'言情',when:{audience:'female'}}]},
      {id:'status', title:'状态', defaultValue:'all', options:[
        {value:'all',title:'不限'}, {value:'ongoing',title:'连载'}, {value:'complete',title:'完结'}]},
      {id:'sort', title:'排序', defaultValue:'updated', options:[
        {value:'updated',title:'最新'}, {value:'popular',title:'热门'}]},
      {id:'words', title:'字数', defaultValue:'all', options:[
        {value:'all',title:'不限'}, {value:'short',title:'30万以下'}, {value:'long',title:'100万以上'}]}
    ],
    searchFilters: [
      {id:'field', title:'范围', defaultValue:'title', options:[
        {value:'title',title:'书名'}, {value:'author',title:'作者'}]}
    ]
  }
}
```

- 所有 filter.id 和 option.value 为源自己的非重复字符串；App不解释分类ID或排序值。defaultValue必须对应不带when条件的选项。
- `filters` 用于首页；`searchFilters` 声明搜索请求可用的站点参数及默认值。全源搜索按各站默认参数执行，App 的统一结果抽屉独立处理字数、状态与源站，不把本地结果筛选伪装为站点请求条件。不要把书库支持的条件自动复制到搜索接口。
- `when` 的键必须引用前面已经声明的筛选项，多个条件按“同时满足”判断。切换频道后，当前分类若失效，恢复该项默认值；不留下不可见的旧分类。
- 首页列表上方按条件逐行展示：左侧名称固定，右侧圆角选项独立横向滚动，点击直接单选，选中使用当前主题操作色；行高随字号调整。首页按站点保留本次会话选择，本地书库隐藏筛选；选择条件重查第一页，末尾追加分页。搜索只在回车或搜索图标提交时查询全部已安装站点，聚合并按相关性排序；搜索结果抽屉和源站标签只筛选已返回数据，不重查未提交草稿。

```js
catalog({siteID, query, filters, cursor}) {
  // query存在时为搜索；否则为首页书库。
  // filters始终包含当前作用域内各条件的值。
  // cursor由本源上次返回，可以是页码字符串、下一页URL或JSON文本。
  return {books: [], nextCursor: null};
}
```

搜索列表可以直接返回 `attributes: [{name: "状态", value: "连载中"}, {name: "字数", value: "123.45万字"}]`。App 统一识别连载/完结和字数区间；缺失字段保持未知，不在全源搜索中逐书补抓详情。声明式 HTML 规则在 `rows.fields` 中取值，再在 `rows.attributes` 声明映射，例如 `{name: "状态", field: "status", pattern: /状态[：:]\s*(连载中|完结)/}`；可选 `pattern` 使用第一个捕获组，未匹配不输出该属性。具体站点字段留在 source-definitions.js，执行器只应用规则。

`books` 沿用 CatalogBook；`nextCursor` 缺省/null表示结束。App只原样回传游标，筛选或关键词改变时清空。JS应跟随真实下一页，不能用“本页有书”猜测还有下一页，更不能把当前页URL再次作为下一页返回。可选title仅在需要栏目标题时填写，留空不增加标题行。

可直接导入的 `novels.js` / `novels.config.js` 与官方合集可以共存。可选包使用 `biquge-info`、`shuhaige-extra`，避免与官方站点 ID 冲突。书海阁已接通搜索、详情、目录和正文；其余站点按各自 manifest.capabilities 声明能力，部分仅支持书库与搜索。逐站字段、URL 和验证边界见[站点调查](source-site-audit.md)。

## 原生桥接

| 接口 | 行为 |
|---|---|
| host.request({url,method?,headers?,body?}) | 返回 {status,url,body}；支持 GET / POST / PROPFIND |
| host.browserRequest({pageURL,url}) | App 内临时网页执行正常网站客户端，观察同源 GET 接口；返回 {status,url,body} |
| host.get(url) | GET，并对非 2xx 抛错 |
| host.url(relative,base) | 解析 HTTP(S) 相对地址，非法地址返回 null |
| host.select(html,css,fields) | 返回匹配条目的字段数组 |
| host.content(html,readingRule,base) | 提取段落 / 字体，沿用旧 JSON 的完整 reading 规则结构 |

fields 的值为 `{selector,attribute?,useHTTPS?}`。selector 为空读取条目本身，不填 attribute 读取文字。例如：

```js
const response = host.get('https://books.example.com/');
const rows = host.select(response.body, '.book-card', {
  title: {selector: '.title'},
  link: {selector: 'a', attribute: 'href'}
});
```

domains 约束初始请求和重定向，包含声明域及其子域。网站换域需要更新源。JS 不能设置 Cookie / Authorization / Host，也不接收网盘凭据。

`browserRequest` 的 pageURL 和 url 必须为声明域内的同源 HTTPS 地址。App 使用非持久化 WKWebView 加载 pageURL，允许网站自身的脚本和静态资源正常运行；原生固定观察器取得指定接口的 JSON 响应。主文档导航限制在原始 origin，子资源遵循 WebKit 的网页策略，不复用网盘登录会话，也不注入账号凭据。网站会话在本次 App 运行内复用，不写入磁盘。源不能传入浏览器执行表达式、请求头或任意原生操作。响应不包含 Cookie / 签名响应头，url 始终为源提交的接口 URL，不包含网页自动添加的参数。

番茄搜索使用此接口读取官方搜索结果 ID，再取公开详情页补全标准 Unicode 书名、作者和简介，避免将搜索响应中的字体编码直接显示为乱码。空结果、接口不可用、需要登录与需要验证分别处理。检测到网站验证码后结束当前 VM 调用，搜索结果提供「完成网站验证后继续搜索」入口。用户在独立原生页面手动完成网站验证，成功取得搜索响应后关闭页面并重新执行搜索；首轮直接消费该响应，不为同一关键词再次加载网页。验证窗口最多等待 180 秒，不占用正在运行的源 VM。取消验证保留关键词和其他站点结果。

后台网页等待最多 18 秒，计入单次源的 30 秒总时限；整个浏览器操作计入 12 次请求配额，网页正常加载的内部请求不逐个计数。取消搜索会销毁临时网页。此接口依赖 App 的网页运行环境，普通 Node / HTTP 检查不能替代 App 验收。

## 网盘接口

`manifest.drives` 声明网盘类型、登录页和凭据作用域。管理书源中点击合集右侧齿轮，在「网盘」区域按平台登录；登录后从首页左上角「网盘」分组切换。切换当前源时，只显示该源声明的账号。没有声明网盘的源不显示登录入口，App 不内置默认平台列表。

Cookie 平台：

```js
drives: [{id:'my.drive',name:'我的网盘',root:'0',authentication:{
  kind:'cookie',loginURL:'https://pan.example.com/',domains:['example.com']
}}]
```

WebDAV 由原生层处理连接和文件，无需实现 JS 网盘方法。下方是可独立导入的最小源；`root` 留空时由用户填写服务器，也可写 HTTPS 地址作为预填值。仅原生 WebDAV 的源不发起 JS 网络请求，因此可声明空 domains：

```js
var source = {
  manifest: {
    apiVersion: 1, id: 'personal.webdav', name: '我的书库', version: '1.0.0',
    domains: [], sites: [],
    drives: [{
      id: 'webdav', name: 'WebDAV', root: '',
      authentication: {kind: 'webDAV', domains: []}
    }]
  }
};
```

完整夸克 / 百度 / WebDAV 包见 `cloud-drives.js` 和 `cloud-drives.config.js`，没有网站声明。Cookie 平台可以在 authentication 中增加 `loginSelector`，填写原站登录模块的 CSS selector，例如夸克为 `"[class*='LoginComponent--modal--']"`。App 仅保留该模块与验证码，隐藏页面其他部分，并保留协议链接和原有事件；模块动态插入时仍会应用。未声明时使用通用对话框 / 表单识别，特殊站点需提供实际容器。该字段只控制网页登录的展示，不更改目录 / 下载方法，WebDAV 不使用它。

Cookie 平台实现下列方法，账号凭据不写入源：

- driveList({providerID,folder,cursor}) → {files:[{id,name,isDirectory,size?}],cursor?}。
- driveResolve({providerID,file}) → {url,headers?}，URL 必须 HTTPS。
- driveShareList({providerID,share:{url,accessCode,providerID},folder?,cursor?,context?}) → {files,cursor?,context}。context 是适配器自己的短期上下文，留在内存，不写入普通 JSON。支持目录和分页。
- driveTransfer({providerID,share,file,context,destinationKey}) → {status:'pending',taskID} 或 {status:'completed',file}。
- driveTransferStatus({providerID,taskID}) → 相同状态结构；file 必须是转存后的账号文件标识。
- destinationKey 是原生层按账号、分享和文件生成的稳定标识，合集网盘源将文件保存到 `/随阅/<destinationKey>/`。只转存所选文件；已有同名、同大小文件会复用。没有自动删除转存文件。
- 转存任务由 ReadingGateway 轮询，禁止同一文件并发提交。取消或等待超时后保留本次会话中的任务状态，再次读取继续查询；App 被终止后不能承诺远端任务取消。
- folder、file.id、cursor 对 App 不透明，解析放在 JS 内。
- 需要重新登录时抛出 `new Error('NORI_AUTH_REQUIRED')`，原生层呈现账号处理入口。
- 网页登录页承载 Cookie 登录，WebDAV 使用原生 HTTPS Basic 表单；其他 OAuth / token 方式未实现。
- 原生 HTTP 层为一次 JS 调用保存隔离的临时 Cookie，以完成分享页 → 提取码验证 → 列表；Set-Cookie 不返回 JS。下载签名接口更新的 Cookie 也可原生传给本次下载，仍按域约束。
- 分享错误可抛出 `NORI_CODE_REQUIRED`、`NORI_CODE_INVALID`、`NORI_SHARE_UNAVAILABLE`、`NORI_VERIFICATION_REQUIRED`、`NORI_TRANSFER_FAILED`，App 转为固定错误信息。
- 执行 JS 的网盘账号绑定源 ID 和代码指纹，源代码变化需重新登录；原生 WebDAV 仍使用用户授予的服务器地址和凭据。

百度适配器从平台网页使用的模板接口取得下载签名函数，在受限 VM 中运行。它依赖当前网页接口，尚未用真实账号验收，不承诺网站调整后自动兼容。

## 限额与调试

独立 VM：32 MiB 内存、512 KiB 栈、30 秒总时限、最多 12 次请求。请求超时 20 秒，HTML / 字体响应最大 4 MiB。JS 文件最大 512 KiB，结果最大 4 MiB。

```sh
python3 scripts/build_source.py
node scripts/check_sources.mjs
node --check example-source.js
```

检查工具只执行语法和源元数据检查，不访问网站、不模拟原生 host，也不验证网盘账号。实际首页、搜索、章节和文件读取在 App 分别验证。App 不展示脚本原始异常、Cookie 或私有响应正文。

分享接口参考平台网页行为及 [quark-auto-save](https://github.com/Cp0204/quark-auto-save)、[bdcli 的网页分享实现](https://github.com/Youwillrememberme/bdcli/blob/main/bdcli/webshare.py)。这些网页接口可能变化，离线响应测试不等于真实账号转存验收。

# Nori JSON 源执行契约

配套 [制作指南](../nori-source-authoring.md)、[Schema](schema.json) 与 [sdk.d.ts](sdk.d.ts) 的执行契约。宿主能力清单与预算见 [host.json](host.json)，验证流程见[完整阅读检查](../nori-source-authoring.md#17-逐步验证完整阅读流程)。

## 能力

| 能力 | 用途 |
| --- | --- |
| core-v2 | 包、身份、统一结果、错误和生命周期 |
| plan-v1 / script-v2 | 声明计划 / ES 模块操作 |
| http-v1 | 统一请求、端点、取消和预算 |
| http-insecure-v1 | 按站点开放 HTTP；请求、重定向、资源仍限于精确主机 |
| tls-insecure-v1 | 按站点跳过 HTTPS 证书校验；请求、重定向、资源仍限于精确主机 |
| html-v1 / json-v1 | 响应解析及 DOM / JSON 表示 |
| css-v1 / xpath-v1 / jsonpath-v1 / regex-v1 | CSS 子集、XPath 1.0、RFC 9535 JSONPath、ECMAScript 正则 |
| auth-web-v1 / auth-form-v1 / auth-script-v1 | 命名原生认证会话 |
| state-v1 | 显式、非敏感的跨调用状态 |
| codec-v1 | 明确算法的编解码与摘要 SDK |
| http-extended-v1 / binary-v1 | 扩展 HTTP 方法、原始请求体和 Uint8Array |
| crypto-v1 | 摘要、HMAC、AES、签名与随机字节 |
| crypto-des-v1 | DES-CBC / DES-ECB / PKCS#7；另需 crypto-v1 与 binary-v1 |
| auth-request-v1 | 命名会话的 HTTP 字段 / 资源查询凭据注入 |
| cache-v1 | 隔离、带 TTL、成功后提交的非敏感缓存 |
| zip-v1 / url-v1 / content-v1 | 内存 ZIP、URL 处理、正文块构造 |
| task-v1 / diagnostics-v1 | 可取消等待与结构化数值指标 |

CSS 支持元素名、class、id、属性存在及 `=`、`!=`、`^=`、`$=`、`*=`、`~=` 匹配，后代、子代、相邻 / 通用兄弟、逗号组合，以及结构伪类和 `:not`、`:has`、`:contains`、`:containsOwn`、`:containsData`、`:matches`、`:matchesOwn`、`:eq`、`:lt`、`:gt`。这些选择器由 SwiftSoup 执行；未知伪类和伪元素仍须报 unsupported_feature，不回退成空结果。xpath-v1 固定 XPath 1.0，jsonpath-v1 固定 RFC 9535，regex-v1 固定 ECMAScript 的 i / m / s / u 标记；不得用另一语言的语法近似替代。

能力不表示任意同名库完全兼容。宿主发布能力清单及对应行为样本后才能声明支持。必需能力缺失在请求前报告；共享模块可通过 nori.capabilities.has 查询当前站点已声明且宿主支持的能力。源请求缺少声明的 SDK 能力时同样失败，不能自动申请更宽权限。

## 调用阶段

1. 校验包和静态关系，协商有效能力，建立安装身份。
2. 固定本次包版本、设置、筛选和账号范围，解析 UI 游标。
3. 建立独立的操作上下文、取消信号、请求预算、临时解析资源与状态快照。
4. 执行 plan 或 script；请求始终通过相同的 HTTP / 会话层。
5. 校验结果结构、身份、允许域、资源引用、目录和文档完整性。
6. 成功后提交可缓存结果及本次状态修改，生成 UI 续页游标；释放调用内的所有文档 / 节点引用。

取消与失败均不推进阅读位置、不提交状态修改、不把半章或不完整目录标为完整。已经展示的成功页面可以保留，失败的续页提供真实重试入口。

## Request 的绑定和编码

request.endpoint 必须引用本站 network.endpoints。path 是相对该 baseURL 的根路径，可使用 `{name}` 路径参数；parameters 明确提供每个 name。参数作为一个路径段编码一次，不能插入主机、斜杠层次、query 或 fragment。需要完整路径逻辑时使用 url 或脚本。

url 是完整 HTTP(S) 地址或求得该地址的 Binding；不能同时声明 path。使用 HTTP 时本站必须声明 `http-insecure-v1`。最终地址必须属于所选端点 allowedHosts；每次跳转、资源地址和续页地址都重新检查。allowedHosts 只表示精确主机，不隐式包含子域。baseURL 的主机也必须明确列入，端点别名不改变身份。HTTPS 默认使用系统证书校验；仅显式声明 `tls-insecure-v1` 的站点跳过证书校验，认证挑战的实际主机也必须属于所选端点的 allowedHosts。

`tls-insecure-v1` 同时应用于 plan / script 请求、命名会话的登录与检查、原生封面 / 正文图片、文件下载以及原生网页登录。声明放入 `sites[i].requires`；根 `requires` 中的声明会被所有站点继承。它不开放 HTTP、不降低 TLS 协议版本，也不能修复服务端拒绝连接、403 或 405。对需要该能力的站点，在既有 requires 中追加即可：

```yaml
requires: [script-v2, http-v1, tls-insecure-v1]
network:
  endpoints:
    main:
      baseURL: https://books.example/
      allowedHosts: [books.example]
```

Binding 为 JSON 标量、literal、input、setting、parameter 或 credential。input 使用 JSON Pointer；setting / parameter / credential 使用命名键。引用缺失或 null 时使用显式 default，没有 default 保持 null；不进行 JS 真假转换。query / headers / form 的最终值须为合法标量，null 表示省略；对象值只允许出现在 json 的字段中。复杂或重复键 / 有序签名请求由 script 构造，宿主 SDK 的 query / form 支持显式有序键值数组。

query 使用 UTF-8 百分号编码，form 使用 application/x-www-form-urlencoded，json 使用 JSON 编码；源不能预编码后要求宿主猜测是否再次编码。request.charset 指定响应字符集，response.charset 指定 plan 的响应解码，两者同时提供必须相同；缺省依次采用 HTTP charset、UTF-8。编码不合法须报错，不静默替换乱码。

headers 的默认值来自端点，再由请求同名头按不区分大小写覆盖。Cookie、Authorization、Host 和已绑定的凭据目标头由宿主管理，普通请求不能覆盖。会话绑定到命名端点；敏感头不随跨主机重定向自动转发。静态 URL 上已有 query 与 request.query 同名时拒绝重复；需要同名多值时使用脚本的有序键值表示，不静默覆盖。

请求预算在同一次操作的所有请求之间累计。同站点后续调用继续遵守端点限流；阅读结果的复用由 App 内容缓存管理。连接池以实际会话及凭据隔离需求管理，不能为了复用把不同账号的 Cookie 或授权头混合。

SDK 脚本请求可通过 credentialBindings 将同端点命名会话的凭据注入 query / form / json，编码只支持 plain / base64；不接受重复目标或覆盖现有值。此字段不是 plan 的 Binding，也不开放凭据读回。直接资源及 resolveResource 结果仅允许 query 绑定，真正的地址在原生加载边界生成。返回给脚本的 response.url 去掉所注入的查询字段；跨主机重定向移除这些查询字段和敏感头。完整类型和请求体限制见 [SDK](sdk.md#http-与字节)。

## 响应与提取

HTTP 非 2xx 在 plan.result 前失败；401 / 403 / 429 分别映射 auth_required / access_denied / rate_limited，其他为 network。保留 status 和可解析 Retry-After，不把所有 403 推断为登录失效。HTTP 200 中的业务失败由 checks / script 明确判断。

每个响应有不可变 URL、状态、头和正文，以及按需缓存的 JSON / DOM 表示。CSS / XPath 可各使用自己的解析器，但同一解析器不能按字段重复解析。调用内的文档和节点引用只在相应根资源存活时有效，调用结束全部失效；不暴露为可持久化字符串。

表达式 scope=item 使用 each 当前条目，scope=document 使用根响应；没有 item 时默认根响应。空 CSS 表达式表示当前节点。JSONPath 根据 scope 从当前 JSON 值求值；XPath 基于当前节点或根文档求值，节点、字符串、数字和布尔的结果类型保留。CSS 的 text 取得可读文本，ownText 仅直接文本，html 为 innerHTML；node 只在原生提取过程内有效。attr 与 read 不能同时出现。

all=false 默认取第一项，零匹配 null；all=true 返回有序数组，零匹配 []。JSONPath 返回匹配节点的原 JSON 值，XPath 的字符串 / 数字 / 布尔标量保留自身类型，all 只控制节点集合。each.select 必须产生数组，fields 为每项构造对象；顺序不变。对象构造 fields 省略求值为 null 的键；literal 对象直接保留，不遍历其内部的 null。最终必填字段缺失仍报 value_invalid。裸字符串是常量，不能隐式变成选择器或模板。

steps 依次处理选择器、对象 / 列表构造、文档块、脚本和方言表达式的结果。null 在 steps 中保持 null；其余类型不符报错。toInteger 接受安全范围整数或完整十进制整数字符串，拒绝单位后缀和截断小数。resolveURL 根据最终响应 URL 解析，不因站点 baseURL 省略页面路径；请求阶段按端点基址解析。结果仍检查允许域。

blocks 只用于 Document 结果根 fields.blocks。format=text 按显式换行段落形成文字块；format=html 优先遍历传入 node，保留块顺序及可支持的强调语义，生成图片 Asset；独立 HTML 字符串才创建对应解析表示。宿主将生成的资源统一注入同一结果的 assets；此时 result 不能另行构造 assets，复杂合并使用 script。remove 仅过滤本次内容遍历，不原地删除共享树节点，避免其他字段的结果依赖求值顺序。清理不执行页面代码，不把整段广告猜测或自动文字替换当成通用行为。

checks 使用严格标量相等；条件表达式得到对象 / 数组是 value_invalid，不自动转成 true。字段级 script 接收当前 item（或根响应值）与 ExpressionContext，同步返回 JSON；该上下文只开放输入、响应、DOM / JSON、同步编解码、取消与失败接口，不开放 HTTP 或状态写入。ctx.extract 与 plan 提取阶段都执行这一边界，引用先前 Context 也不能绕过阶段检查。Promise 或额外 I/O 须改用操作级 script，不能暗中突破 plan 的一次业务请求。不能把 NodeHandle / DocumentHandle 返回为源结果；缺少 native DOM 支持时不能把 node 静默转为 HTML 字符串维持表面运行。

## 分页与完整性

plan 的 catalog / search / chapters 必须声明 pagination，其余操作禁止声明。none 生成 next=null；nextURL 求得 HTTP(S) 字符串或 null，使用 HTTP 时仍须声明 `http-insecure-v1`；token 求得非 null JSON 续页值或 null；page.hasMore 必须是真正布尔值。空字符串 token 无效，不能猜测它是结束。

nextURL 只用于 GET，完整续页 URL 替代首屏地址和 query；请求方法、端点、会话及固定头不变。token 给下一次 Input.cursor；page 模式只推进宿主维护的 Input.page。脚本返回相同三种 Continuation；内部游标与 UI opaque 游标分别管理，不重复包装到源自己的 JSON 数据中。

生成 UI 游标时绑定包版本、源站、操作、账号、query、filters、settings 和本次遍历；首次调用 page=1、cursor=null。续页失败保持原 token 可手动重试，成功才提交下一个 token。重复 URL / token 判为循环，page 模式按宿主页码推进，不能以固定字符串伪造下一页。

目录分页按首次出现顺序合并，跨页重复章节保留首个位置，不能丢掉其余未取得页面。detail.chapterPage 与 editionID 共同定义首批目录，消费一次，不能额外抓相同首批。完整目录只在成功取得 next=null 后成立。

content 无分页结果。单章的网页续页必须由脚本或明确的方言执行器完整收齐；失败 / 循环时整章失败。有限并发可由宿主调度，但不能把批量中的失败章节默认为空正文。

## 账号、状态与用户动作

web 会话用原生网页登录，再调用声明的 check 取得 authenticated；仅有 Cookie 不足以证明登录成功。form 会话临时收集 fields，只有认证 request 的 Binding 可使用 credential。普通业务 input / result / state 不接受 credential 引用。token 在认证 response 中提取后写入原生槽；credential 定义目标头、前缀和可选 base64 编码。

script 会话在 AuthenticationContext 内运行 login。ctx.credentials 仅在本次认证存活；ctx.authentication.storeCredential 只写当前会话声明的目标，不提供任意账号库访问。login 完成后仍由 check 确认状态。账号展示名可返回，令牌、密码、Cookie 不写 source result。认证失败保留真实状态，不继续沿用已失效的 authenticated=true。

ctx.state 是 state-v1 的非敏感状态空间，以源站、账号和源版本隔离。操作开始读取快照，成功时提交本次修改，失败 / 取消丢弃。需要读写此空间的同站同账号调用由宿主串行；这是显式状态能力的调度成本，不影响其他站并发。普通操作使用局部变量，源配置使用 settings，阅读记录使用 App 自己的存储。

actions 只描述原生用户可触发动作，read 表示不改变远端账户数据，write 表示有远端副作用。action 操作只从对应用户入口调用；脚本不能获取一个绕过确认的 ctx.performAction。宿主不预取、自动重试或在状态恢复时重放 write 动作。

## 缓存、观测与资源预算

源包与编译缓存绑定代码内容、包版本和引擎版本。数据缓存至少区分源站、内容身份、操作输入、影响结果的 settings / filters 及账号范围；不得按同名书跨站复用。共享公开缓存必须有明确公开语义，不能因登录态丢失就把私有响应放到公共命名空间。

SDK 不隐式缓存 HTTP 响应；需要复用的数据通过显式 cache-v1 管理。取消、解析失败、部分响应和业务失败不写成功缓存。临时解析结果不落盘，完整阅读文档和书籍模型按现有磁盘缓存目标管理，源包不携带缓存目录或缓存内容。

源可请求 policy，宿主对并发 / 时长 / 次数 / 字节上限取更小的值，对 minIntervalMs 取更大的值。当前单站与请求桥串行执行，maxConcurrency 是允许的上限，不承诺最低并发。默认 maxConcurrency=2、timeoutMs=30000、maxRequests=12、maxResponseBytes=4194304、scriptTimeMs=10000、maxMemoryBytes=33554432；minIntervalMs 缺省 0，宿主仍可更严格。timeoutMs 是整个操作墙钟截止时间；单次请求也不能超过剩余时间。scriptTimeMs 是不含宿主等待的脚本执行时间预算，不等于 CPU 或功耗测量。所有预算必须能在取消时中止对应后台任务。

诊断记录 package / site / operation、request / decode / select / map / validate 阶段、JSON Pointer 和稳定错误码。日志可以记录时长、次数、字节和缓存命中，不记录凭据、完整正文或带私密查询的 URL。缺失 capability、未映射旧字段、定义有效和站点可用分别报告。

## 静态引用检查

Schema 之后仍需检查：

- sites、settings、filters、actions、editions 和结果 ID 的唯一性。
- 每个 endpoint、session、module、export 及声明能力的引用；静态工具可从语法树检查显式导出及包内静态依赖，不执行 JS。目标引擎编译、真实可调用类型与行为仍由宿主确认。
- 会话与认证 / 业务请求端点绑定；普通 headers 和 credential 的使用阶段。
- plan 的响应类型与操作结果、分页模式及字段作用域对应。
- Control 默认值属于选项，when 只引用此前字段，多选默认值不重复。
- 文档图片引用存在，Asset.id 与映射键对应，UTF-16 标记不越界，content.chapterID 与输入一致。
- URL 和签名不是身份，缓存或安装记录不把 provenance 当成执行入口。

离线工具与已实现范围见[打包说明](packager.md)。尚未实现的检查不能在报告里记作 passed。完整行为验收、真实网站 / 账号、真机性能和发布继续分别记录。

## 宿主 SDK

二进制、加密、缓存、ZIP、URL、正文构造与观测的完整方法和数据格式见 [sdk.md](sdk.md)。state / cache 一次原子提交；外部转换草案不增加核心宿主方法。

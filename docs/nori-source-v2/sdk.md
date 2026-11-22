# Nori 宿主 SDK 2.1.0

Nori Source v2 的正式接口由 [sdk.d.ts](sdk.d.ts) 定义，App 与作者工具共用[宿主能力清单](host.json)。本页列出的接口有原生实现；本目录只发布正式 SDK，不提供旧客户端的隐藏宿主。

操作函数接收 `(input, nori)`。`nori` 是调用上下文参数，旧示例中的参数名 `ctx` 具有相同含义。没有全局 `java`、`source`、Node 或文件系统。代码在 App 内的 QuickJS 执行，不依赖 Java 环境。

## 接口与能力

| 接口 | 所需能力 | 语义 |
| --- | --- | --- |
| `runtime`、`signal`、`capabilities.has`、`fail` | core-v2 | 版本、预算、取消与结构化失败 |
| `http.request` | http-v1 | 命名端点、GET / POST / HEAD、query / form / JSON |
| 扩展 HTTP | http-extended-v1 + http-v1 | PUT / PATCH / DELETE / OPTIONS、text / bytes 请求体、二进制响应 |
| `dom` | html-v1；查询另需 css-v1 / xpath-v1 | parse、select、selectAll、xpath、text、ownText、html、attr、free |
| `json.query` | json-v1 + jsonpath-v1 | RFC 9535，匹配数组不自动展开 |
| `extract` | 各表达式的对应能力 | 对一个响应运行与 plan 相同的字段提取 |
| `codec` 文本 Base64、digest | codec-v1 | 严格 UTF-8；摘要返回小写 Hex |
| `codec` 字节转换 | codec-v1 + binary-v1 | encode / decode、toBase64 / fromBase64、toHex / fromHex |
| `crypto` | crypto-v1 + binary-v1 | 摘要、HMAC、AES、签名验证与安全随机字节 |
| `crypto` 的 DES | crypto-des-v1 + crypto-v1 + binary-v1 | 对接既有服务的 DES-CBC / DES-ECB / PKCS#7 |
| `http.request.credentialBindings`、资源查询凭据 | auth-request-v1 | 按端点从命名会话原生注入 query / form / JSON；资源只支持 query |
| `state` | state-v1 | 非敏感持久状态，成功后提交 |
| `cache` | cache-v1 | 非敏感临时 JSON，必需 TTL，过期返回 undefined |
| `zip` | zip-v1 + binary-v1 | open、entries、read、close，仅在内存中读取 ZIP |
| `url` | url-v1 | resolve、parse，保留重复查询参数及顺序 |
| `content.blocks` | content-v1；HTML 另需 html-v1，remove 另需 css-v1 | 将文本或 DOM 转成正文块与内容资源 |
| `task.sleep` | task-v1 | 可取消等待，计入操作墙钟，不计入脚本执行预算 |
| `log.event` | diagnostics-v1 | 稳定事件名和数值 / 布尔指标，不接收正文、URL 或凭据字符串 |
| `authentication.storeCredential` | auth-script-v1 | 仅登录阶段可写当前会话的原生凭据槽 |

包根与站点 requires 的并集决定可调用能力。`runtime.capabilities` 是宿主实现清单；`capabilities.has` 同时检查源声明与宿主支持。不要把前者当作已经获得的权限。

## HTTP 与字节

```js
const response = await nori.http.request({
  endpoint: 'api', method: 'POST', path: '/chapters/content',
  session: 'member', json: { id: input.chapter.id }, responseType: 'bytes'
});
const raw = response.bytes(); // Uint8Array，每次返回独立副本
const text = nori.codec.decode(raw, 'utf-8');
```

`form`、`json`、`text`、`bytes` 互斥；GET / HEAD / OPTIONS 不接收请求体。原始 text / bytes 的 Content-Type 由作者在 headers 声明。二进制响应由 `responseType:'bytes'` 指定，不先尝试 UTF-8 解码；body 在第一次访问时严格按 charset 解码。普通文本请求在声明 binary-v1 时也保留原始响应字节。headers、status、url 不可变，json() 只解析一次。

HTTP 非 2xx 抛出对应错误。会话负责 Cookie / token，普通请求不能手工覆盖受管理头。图片、封面、字体和电子书优先返回 Asset，让 App 的原生资源加载器取得内容，不经过 JS 字节来回转换。

服务把 token 放在请求字段中时，声明 `auth-request-v1` 并引用已有命名会话：

```js
const response = await nori.http.request({
  endpoint: 'api', method: 'POST', path: '/content', json: {id: input.chapter.id},
  credentialBindings: [{session: 'member', target: 'json', key: 'key', encoding: 'base64'}]
});
```

绑定的 session 必须属于请求端点并声明凭据槽；每个目标字段只能绑定一次，不得和已有字段重名。最多 16 项，编码为 plain（默认）或 base64。宿主读取令牌并在网络边界注入，源脚本没有读回 API。缺少令牌报 auth_required；form / json 绑定要求相应请求体已经存在。源可见的 response.url 移除注入的 query 字段；HTTP 响应正文仍由源站决定，SDK 不承诺过滤服务端回显。

`Asset.source` 和 `ResolvedResource` 可声明相同结构的 `credentialBindings`，但 target 只能为 query。资源模型只保存绑定声明；原生加载时临时编码令牌，查询编码保留 `+`、`/`、`=` 的原值。跨主机重定向移除这些字段，仍须满足端点允许域。该能力没有把秘密写入 locator、state 或缓存的权限。

## 加密契约

所有二进制输入 / 输出统一使用 Uint8Array，字符串通过 codec 显式转换；不猜测文本是 Hex、Base64 还是原始密钥。

- digest：SHA-256、SHA-512、SHA-1、MD5；crypto.digest 返回字节，codec.digest 接收文本并返回 Hex。
- hmac：SHA-256、SHA-512、SHA-1。
- AES-GCM：16 / 24 / 32 字节密钥，12 字节 IV；结果为 ciphertext 后接 16 字节 tag，IV 单独传入；associatedData 用于附加认证数据。解密认证失败即报错。
- AES-CBC：16 / 24 / 32 字节密钥，16 字节 IV，PKCS#7 填充；不接受 associatedData。
- DES-CBC：8 字节密钥，8 字节 IV，PKCS#7 填充；DES-ECB 使用 8 字节密钥、空 IV 和 PKCS#7 填充。两者都不接受 associatedData，另需 crypto-des-v1。
- Ed25519：签名使用 32 字节原始私钥，验证使用 32 字节公钥。
- RSA-PKCS1-SHA256：密钥使用 PKCS#1 DER，签名为 RSASSA-PKCS1-v1_5 / SHA-256。
- randomBytes：系统安全随机源，每次 1–65536 字节。

SHA-1 / MD5 / CBC 用于对接源站既有协议；SDK 不把这些算法用于 App 自身的凭据保护。账号 token 由原生会话处理，不放在源配置或普通缓存中。

## 状态、缓存与资源生命周期

state 与 cache 均按 package / site / version / account 隔离，值必须是 JSON。cache.set 的 ttlMs 必须是 1–2592000000 的整数；过期只表示需要重新获取，不改变持久状态。state 和 cache 各最多 1 MiB，结果校验和预算校验全部通过后写入同一个原子存储文件；失败 / 取消不提交，读取不重写未变化的数据。旧版 state 文件继续读取。

```js
let value = nori.cache.get('catalog-data');
if (value === undefined) {
  value = (await nori.http.request({endpoint:'api',method:'GET',path:'/catalog'})).json();
  nori.cache.set('catalog-data', value, {ttlMs: 300000});
}
```

DOM / ZIP 句柄仅在本次调用有效，不可写入 JSON、状态、缓存或结果。ZIP 不创建 App 之外的路径，支持读取文件项；关闭后不能继续读取。每个二进制值最多 4 MiB，ZIP 最多 1024 项、单项 4 MiB、一次调用累计解压 16 MiB。大文件直接交给 Asset / file Edition。

## 内容、账号和用户动作

`content.blocks` 接收文本或 DOM，并返回 `{blocks,assets}`。HTML 保留支持的语义和图片顺序，过滤脚本与显式 remove；提供 baseURL 解析相对图片地址。需要登录的图片通过 options.endpoint / options.session 指定原生会话；plan 生成的同端点图片继承原请求会话，其他端点不自动获取该账号凭据。

```js
const extracted = nori.content.blocks(html, {
  format: 'html', baseURL: response.url, endpoint: 'api', session: 'member'
});
return {id: input.chapter.id, chapterID: input.chapter.id, kind: 'novel', ...extracted};
```

web / form / script 登录均由 sessions 声明，已有原生 UI 与 Keychain 接入；网页不是任意业务脚本可打开的 UI。认证上下文仅有本次 credentials 与只写凭据接口，不开放 state / cache。普通操作只看 sessionStatus 并引用 session 名。账号状态由 check 确认，登出由原生账号层处理。

actions 声明标题与 effect，宿主只从用户入口执行。脚本返回 changed，App 刷新相应页面；不允许脚本任意控制 App 导航、主题、购买或阅读进度。

## 调度与调用阶段

操作级函数可以 async；字段函数必须同步、只提取当前响应，不能请求网络或写 state / cache。模块初始化阶段没有 SDK。工具和 App 执行相同的预算、结果模型与能力检查。

当前每个源站串行执行操作，SDK 网络桥也按顺序处理请求；不同源站可以并行。policy.maxConcurrency 是上限，不是最低并发承诺，Promise.all 不保证请求并行。timeoutMs 限制整个操作，scriptTimeMs 排除原生等待。取消中止请求、排队和 task.sleep；不自动重试业务请求或重放写动作。

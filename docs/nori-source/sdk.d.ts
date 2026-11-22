/** Nori JSON source host SDK. All interfaces here have a native implementation; see sdk.md. */
declare namespace Nori {
  type Scalar = string | number | boolean | null;
  type JsonValue = Scalar | JsonObject | readonly JsonValue[];
  interface JsonObject { readonly [key: string]: JsonValue; }
  type ContentKind = 'novel' | 'comic';
  type OperationName = 'catalog' | 'search' | 'filters' | 'detail' | 'chapters' | 'content' | 'resolveResource' | 'action';
  type ControlValue = string | boolean | readonly string[];
  type Selection = Readonly<Record<string, ControlValue>>;
  type MaybePromise<T> = T | Promise<T>;

  interface SessionStatus { readonly authenticated: boolean; readonly displayName?: string; }
  interface Input {
    readonly siteID: string;
    readonly settings: Selection;
    readonly filters: Selection;
    readonly sessionStatus: Readonly<Record<string, SessionStatus>>;
    /** Raw source continuation, decoded by the host from its UI cursor. */
    readonly cursor: JsonValue;
    readonly page: number;
    readonly contentKind?: ContentKind;
    readonly query?: string;
    readonly scope?: 'catalog' | 'search';
    readonly book?: Book;
    readonly edition?: Edition;
    readonly chapter?: Chapter;
    readonly asset?: Asset;
    readonly actionID?: string;
    readonly values?: JsonObject;
  }
  interface SearchInput extends Input { readonly query: string; }
  interface DetailInput extends Input { readonly book: Book; }
  interface ChaptersInput extends DetailInput { readonly edition: ChapterEdition; }
  interface ContentInput extends ChaptersInput { readonly chapter: Chapter; }
  interface ResolveInput extends Input { readonly asset: Asset; }
  interface FiltersInput extends Input { readonly scope: 'catalog' | 'search'; }
  interface ActionInput extends Input { readonly actionID: string; readonly values: JsonObject; }

  interface Book {
    readonly id: string;
    readonly title: string;
    readonly kind: ContentKind;
    readonly authors?: readonly string[];
    readonly summary?: string;
    readonly cover?: Asset;
    readonly metadata?: BookMetadata;
    /** Stable, non-secret source-specific fetching parameters. */
    readonly locator?: JsonObject;
  }
  interface BookMetadata {
    readonly status?: 'ongoing' | 'completed' | 'unknown';
    readonly wordCount?: number;
    readonly chapterCount?: number;
    readonly updatedAt?: string;
    readonly tags?: readonly string[];
    readonly attributes?: readonly { readonly name: string; readonly value: string }[];
  }
  interface ChapterEdition { readonly id: string; readonly title: string; readonly kind: 'chapters'; readonly locator?: JsonObject; }
  interface FileEdition { readonly id: string; readonly title: string; readonly kind: 'file'; readonly resource: Asset; }
  type Edition = ChapterEdition | FileEdition;
  interface Chapter {
    readonly kind: 'chapter';
    readonly id: string;
    readonly title: string;
    readonly locator?: JsonObject;
    readonly access?: { readonly state: 'available' | 'loginRequired' | 'locked' | 'unknown'; readonly reason?: string };
    readonly depth?: number;
    readonly updatedAt?: string;
  }
  interface Section { readonly kind: 'section'; readonly id: string; readonly title: string; readonly depth?: number; }
  type TOCItem = Chapter | Section;
  type Continuation = { readonly kind: 'url'; readonly url: string }
    | { readonly kind: 'token'; readonly value: Exclude<JsonValue, null> }
    | { readonly kind: 'page' };
  interface Page<T> { readonly items: readonly T[]; readonly next: Continuation | null; }
  type BookPage = Page<Book>;
  type ChapterPage = Page<TOCItem>;
  interface DetailResult {
    readonly book: Book;
    readonly editions: readonly Edition[];
    readonly chapterPage?: { readonly editionID: string; readonly page: ChapterPage };
  }
  interface Asset {
    readonly id: string;
    readonly mediaType: string;
    readonly source: { readonly url: string; readonly endpoint: string; readonly session?: string; readonly credentialBindings?: readonly ResourceCredentialBinding[] }
      | { readonly locator: JsonObject };
    readonly role?: 'cover' | 'image' | 'font' | 'publication';
    readonly width?: number;
    readonly height?: number;
    readonly size?: number;
    readonly alt?: string;
  }
  interface ResourceCredentialBinding { readonly session: string; readonly target: 'query'; readonly key: string; readonly encoding?: 'plain' | 'base64'; }
  interface ResolvedResource { readonly url: string; readonly endpoint: string; readonly session?: string; readonly expiresAt?: string; readonly credentialBindings?: readonly ResourceCredentialBinding[]; }
  interface TextMark { readonly kind: 'emphasis' | 'strong' | 'code'; readonly start: number; readonly length: number; }
  interface CommentMetadata { readonly commentCount?: number; readonly comments?: Asset; }
  interface TextBlock extends CommentMetadata {
    readonly kind: 'paragraph' | 'quote' | 'listItem';
    readonly id?: string;
    readonly text: string;
    readonly marks?: readonly TextMark[];
  }
  interface HeadingBlock extends CommentMetadata {
    readonly kind: 'heading'; readonly id?: string; readonly text: string;
    readonly level: 1 | 2 | 3 | 4 | 5 | 6; readonly marks?: readonly TextMark[];
  }
  interface ImageBlock extends CommentMetadata { readonly kind: 'image'; readonly id?: string; readonly asset: string; }
  type Block = TextBlock | HeadingBlock | ImageBlock;
  interface Document {
    readonly id: string;
    readonly chapterID: string;
    readonly kind: ContentKind;
    readonly title?: string;
    readonly revision?: string;
    readonly blocks: readonly Block[];
    readonly assets?: Readonly<Record<string, Asset>>;
  }
  interface ControlOption { readonly value: string; readonly title: string; }
  interface ControlBase { readonly id: string; readonly title: string; readonly when?: Readonly<Record<string, Scalar>>; }
  type Control = (ControlBase & { readonly control: 'text'; readonly defaultValue: string })
    | (ControlBase & { readonly control: 'toggle'; readonly defaultValue: boolean })
    | (ControlBase & { readonly control: 'select'; readonly defaultValue: string; readonly options: readonly ControlOption[] })
    | (ControlBase & { readonly control: 'multiSelect'; readonly defaultValue: readonly string[]; readonly options: readonly ControlOption[] });
  interface FiltersResult { readonly fields: readonly Control[]; }
  interface ActionResult { readonly changed: boolean; }

  interface Entry { readonly module: string; readonly export: string; }
  type Binding = Scalar | { readonly literal: JsonValue }
    | { readonly input: string; readonly default?: JsonValue }
    | { readonly setting: string; readonly default?: JsonValue }
    | { readonly parameter: string; readonly default?: JsonValue }
    | { readonly credential: string; readonly default?: JsonValue };
  type Step = { readonly op: 'trim' | 'emptyToNull' | 'toInteger' | 'resolveURL' }
    | { readonly op: 'split'; readonly separator: string }
    | { readonly op: 'replace'; readonly from: string; readonly to: string };
  interface SelectionOptions { readonly all?: boolean; readonly scope?: 'item' | 'document'; readonly steps?: readonly Step[]; }
  type HTMLRead = { readonly read?: 'text' | 'ownText' | 'html' | 'node'; readonly attr?: never }
    | { readonly attr: string; readonly read?: never };
  type FieldMap = Readonly<Record<string, Expression>>;
  type Expression = Binding
    | (SelectionOptions & HTMLRead & { readonly css: string })
    | (SelectionOptions & HTMLRead & { readonly xpath: string })
    | (SelectionOptions & { readonly jsonpath: string })
    | (SelectionOptions & { readonly regex: { readonly pattern: string; readonly flags?: readonly ('i' | 'm' | 's' | 'u')[]; readonly group?: number } })
    | { readonly fields: FieldMap; readonly steps?: readonly Step[] }
    | { readonly each: { readonly select: Expression; readonly fields: FieldMap }; readonly steps?: readonly Step[] }
    | { readonly blocks: { readonly select: Expression; readonly format: 'html' | 'text'; readonly remove?: readonly string[] }; readonly steps?: readonly Step[] }
    | { readonly script: Entry; readonly steps?: readonly Step[] };

  type QueryValue = Scalar | readonly Scalar[];
  type Query = Readonly<Record<string, QueryValue>> | readonly (readonly [string, Scalar])[];
  interface RequestBase {
    readonly endpoint: string;
    readonly parameters?: Readonly<Record<string, Scalar>>;
    readonly query?: Query;
    readonly headers?: Readonly<Record<string, string>>;
    readonly session?: string;
    readonly charset?: string;
    /** Native injection; credentials never enter source-visible query/JSON/form values. */
    readonly credentialBindings?: readonly { readonly session: string; readonly target: 'query' | 'form' | 'json'; readonly key: string; readonly encoding?: 'plain' | 'base64' }[];
  }
  type RequestTarget = { readonly path: string; readonly url?: never }
    | { readonly url: string; readonly path?: never };
  type RequestBody = { readonly form: Query; readonly json?: never; readonly text?: never; readonly bytes?: never }
    | { readonly json: JsonObject; readonly form?: never; readonly text?: never; readonly bytes?: never }
    | { readonly text: string; readonly form?: never; readonly json?: never; readonly bytes?: never }
    | { readonly bytes: Uint8Array; readonly form?: never; readonly json?: never; readonly text?: never }
    | { readonly form?: never; readonly json?: never; readonly text?: never; readonly bytes?: never };
  type RequestOptions = RequestBase & RequestTarget & { readonly responseType?: 'text' | 'bytes' } & (
    { readonly method: 'GET' | 'HEAD' | 'OPTIONS'; readonly form?: never; readonly json?: never; readonly text?: never; readonly bytes?: never }
    | ({ readonly method: 'POST' | 'PUT' | 'PATCH' | 'DELETE' } & RequestBody)
  );
  interface HTTPResponse {
    readonly status: number;
    readonly url: string;
    readonly headers: Readonly<Record<string, string>>;
    /** Strict charset decoding; binary responses decode on first access. */
    readonly body: string;
    /** A fresh copy of the exact response bytes. Requires binary-v1. */
    bytes(): Uint8Array;
    /** Reuses the host's parsed representation. Invalid JSON raises a source error. */
    json(): JsonValue;
  }
  interface HTTPAPI { request(options: RequestOptions): Promise<HTTPResponse>; }
  interface DocumentHandle { readonly __noriDocument: unique symbol; }
  interface NodeHandle { readonly __noriNode: unique symbol; }
  type DOMHandle = DocumentHandle | NodeHandle;
  interface DOMAPI {
    /** A response reuses its tree; a raw string is owned by the current invocation. */
    parse(input: HTTPResponse | string): DocumentHandle;
    select(root: DOMHandle, selector: string): NodeHandle | null;
    selectAll(root: DOMHandle, selector: string): readonly NodeHandle[];
    text(node: DOMHandle): string;
    ownText(node: DOMHandle): string;
    html(node: DOMHandle): string;
    attr(node: DOMHandle, name: string): string | null;
    /** Releases the root and its borrowed node handles. The host also releases at invocation end. */
    free(document: DocumentHandle): void;
    xpath(root: DOMHandle, expression: string, options?: { readonly all?: boolean } & HTMLRead): JsonValue | DOMHandle | readonly DOMHandle[];
  }
  interface JSONAPI {
    query(value: JsonValue | HTTPResponse, jsonpath: string, options?: { readonly all?: boolean }): JsonValue;
  }
  interface CodecAPI {
    base64Encode(text: string): string;
    base64Decode(text: string): string;
    digest(algorithm: DigestAlgorithm, text: string): Promise<string>;
    encode(text: string, charset?: string): Uint8Array;
    decode(bytes: Uint8Array, charset?: string): string;
    toBase64(bytes: Uint8Array): string;
    fromBase64(text: string): Uint8Array;
    toHex(bytes: Uint8Array): string;
    fromHex(text: string): Uint8Array;
  }
  interface StateAPI {
    /** Non-secret state only; isolated by source, account and package version. */
    get(key: string): JsonValue | undefined;
    /** Committed only after successful validation; state-v1 calls are serialized per source/account. */
    set(key: string, value: JsonValue): void;
    remove(key: string): void;
  }
  type DigestAlgorithm = 'SHA-256' | 'SHA-512' | 'SHA-1' | 'MD5';
  interface CipherOptions {
    readonly algorithm: 'AES-GCM' | 'AES-CBC' | 'DES-CBC' | 'DES-ECB';
    readonly key: Uint8Array;
    readonly iv: Uint8Array;
    readonly data: Uint8Array;
    readonly associatedData?: Uint8Array;
  }
  interface SignatureOptions {
    readonly algorithm: 'Ed25519' | 'RSA-PKCS1-SHA256';
    /** Ed25519 raw 32-byte key, or RSA PKCS#1 DER. */
    readonly key: Uint8Array;
    readonly data: Uint8Array;
  }
  interface CryptoAPI {
    digest(algorithm: DigestAlgorithm, data: Uint8Array): Promise<Uint8Array>;
    hmac(algorithm: 'SHA-256' | 'SHA-512' | 'SHA-1', key: Uint8Array, data: Uint8Array): Promise<Uint8Array>;
    /** AES-GCM returns ciphertext followed by its 16-byte authentication tag. */
    encrypt(options: CipherOptions): Promise<Uint8Array>;
    decrypt(options: CipherOptions): Promise<Uint8Array>;
    sign(options: SignatureOptions): Promise<Uint8Array>;
    verify(options: SignatureOptions & { readonly signature: Uint8Array }): Promise<boolean>;
    randomBytes(length: number): Uint8Array;
  }
  interface CacheAPI {
    get(key: string): JsonValue | undefined;
    set(key: string, value: JsonValue, options: { readonly ttlMs: number }): void;
    remove(key: string): void;
  }
  interface ZipHandle { readonly __noriZip: unique symbol; }
  interface ZipAPI {
    open(bytes: Uint8Array): ZipHandle;
    entries(archive: ZipHandle): readonly { readonly path: string; readonly size: number; readonly kind: 'file' | 'directory' | 'symlink' }[];
    read(archive: ZipHandle, path: string): Uint8Array;
    close(archive: ZipHandle): void;
  }
  interface URLAPI {
    resolve(value: string, base?: string): string;
    parse(value: string, base?: string): {
      readonly url: string; readonly scheme: string; readonly host: string; readonly port: number | null;
      /** Percent-encoded path; query pairs retain ordering and repeated names. */
      readonly path: string; readonly query: readonly (readonly [string, string | null])[]; readonly fragment: string | null;
    };
  }
  interface ContentAPI {
    blocks(value: string | DOMHandle, options: { readonly format: 'html' | 'text'; readonly baseURL?: string; readonly endpoint?: string; readonly session?: string; readonly remove?: readonly string[] }): {
      readonly blocks: readonly Block[]; readonly assets: Readonly<Record<string, Asset>>;
    };
  }
  interface RuntimeInfo {
    readonly sdkVersion: string;
    readonly protocolVersion: 2;
    readonly capabilities: readonly string[];
    readonly limits: Readonly<Record<string, number>>;
  }
  interface CancellationSignal { readonly aborted: boolean; throwIfAborted(): void; }
  type ErrorCode = 'invalid_definition' | 'missing_required' | 'value_invalid' | 'unsupported_feature'
    | 'network' | 'auth_required' | 'verification_required' | 'access_denied' | 'rate_limited'
    | 'timeout' | 'cancelled' | 'source_error';
  interface Context {
    readonly input: Input;
    readonly signal: CancellationSignal;
    readonly capabilities: { has(name: string): boolean };
    readonly runtime: RuntimeInfo;
    readonly http: HTTPAPI;
    readonly dom: DOMAPI;
    readonly json: JSONAPI;
    readonly codec: CodecAPI;
    readonly state: StateAPI;
    readonly cache: CacheAPI;
    readonly crypto: CryptoAPI;
    readonly zip: ZipAPI;
    readonly url: URLAPI;
    readonly content: ContentAPI;
    readonly task: { sleep(milliseconds: number): Promise<void> };
    readonly log: { event(name: string, metrics?: Readonly<Record<string, number | boolean>>): void };
    /** Evaluates fields against one response and returns JSON; generated image assets are attached. */
    extract(response: HTTPResponse, fields: FieldMap): JsonObject;
    fail(code: ErrorCode, message?: string, path?: string): never;
  }
  interface ExpressionContext extends Pick<Context, 'input' | 'signal' | 'capabilities' | 'runtime' | 'dom' | 'json' | 'url' | 'fail'> {
    readonly response: HTTPResponse;
    readonly codec: Omit<CodecAPI, 'digest'>;
  }
  interface AuthenticationContext extends Omit<Context, 'state' | 'cache'> {
    readonly credentials: Readonly<Record<string, string>>;
    readonly authentication: {
      /** Available only when the current session declares a credential target. No readback API. */
      storeCredential(value: string): void;
    };
  }

  type CatalogHandler = (input: Input, ctx: Context) => MaybePromise<BookPage>;
  type SearchHandler = (input: SearchInput, ctx: Context) => MaybePromise<BookPage>;
  type DetailHandler = (input: DetailInput, ctx: Context) => MaybePromise<DetailResult>;
  type ChaptersHandler = (input: ChaptersInput, ctx: Context) => MaybePromise<ChapterPage>;
  type ContentHandler = (input: ContentInput, ctx: Context) => MaybePromise<Document>;
  type ResolveHandler = (input: ResolveInput, ctx: Context) => MaybePromise<ResolvedResource>;
  type FiltersHandler = (input: FiltersInput, ctx: Context) => MaybePromise<FiltersResult>;
  type ActionHandler = (input: ActionInput, ctx: Context) => MaybePromise<ActionResult>;
  type SessionCheckHandler = (input: Input, ctx: Context) => MaybePromise<SessionStatus>;
  type LoginHandler = (input: Input, ctx: AuthenticationContext) => MaybePromise<void>;
  type ExpressionHandler = (value: JsonValue | DOMHandle, ctx: ExpressionContext) => JsonValue;

  interface ReadingAnchorBase { readonly packageID: string; readonly siteID: string; readonly bookID: string; readonly editionID: string; readonly chapterID: string; }
  type ReadingAnchor = (ReadingAnchorBase & { readonly kind: 'text'; readonly blockIndex: number; readonly blockID?: string; readonly utf16Offset: number; readonly quote?: { readonly before?: string; readonly highlight?: string; readonly after?: string } })
    | (ReadingAnchorBase & { readonly kind: 'image'; readonly blockIndex: number; readonly blockID?: string; readonly fraction: number });
}

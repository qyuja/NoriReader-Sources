// Nori JSON 源 draft example. All endpoints and API shapes are fictional.
// This module is also embedded verbatim in script-aggregate.nori.json.

function payload(response, ctx) {
  const value = /** @type {any} */ (response.json());
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    ctx.fail('value_invalid', '接口响应不是对象', '/response');
  }
  if (value.code === 401) ctx.fail('auth_required', '当前源需要登录');
  if (value.code === 403) ctx.fail('access_denied', '当前账号不能读取此内容');
  if (value.code === 429) ctx.fail('rate_limited', '源站要求稍后再试');
  if (value.code !== 0) ctx.fail('source_error', '聚合接口未返回成功状态');
  return value.data;
}

function nextToken(value, ctx) {
  if (value === null) return null;
  if (typeof value !== 'string' || !value.length) {
    ctx.fail('value_invalid', '接口未返回合法续页标识', '/response/data/nextCursor');
  }
  return { kind: 'token', value: value };
}

function sourceCursor(input, ctx) {
  if (input.cursor !== null && typeof input.cursor !== 'string') {
    ctx.fail('value_invalid', '当前接口的续页标识必须是字符串', '/input/cursor');
  }
  return input.cursor;
}

function locatorID(locator, name, ctx) {
  const value = locator && locator[name];
  if (typeof value !== 'string' || !value.length) {
    ctx.fail('value_invalid', '源定位缺少所需标识', '/input/locator');
  }
  return value;
}

function memberSession(input) {
  return input.sessionStatus.member && input.sessionStatus.member.authenticated
    ? 'member' : undefined;
}

function bookModel(book) {
  return {
    id: book.id,
    title: book.title,
    kind: book.kind,
    authors: book.authors,
    summary: book.summary,
    metadata: {
      status: book.status,
      wordCount: book.wordCount,
      attributes: book.attributes
    },
    cover: book.coverURL ? {
      id: 'cover',
      role: 'cover',
      mediaType: book.coverMediaType,
      source: { url: book.coverURL, endpoint: 'files' }
    } : undefined,
    locator: { bookID: book.id, platform: book.platform }
  };
}

/** @param {Nori.SearchInput} input @param {Nori.Context} ctx */
export async function search(input, ctx) {
  // A public digest illustrates computed headers; it is not an account secret.
  const digest = await ctx.codec.digest('SHA-256', input.query);
  const response = await ctx.http.request({
    endpoint: 'api', method: 'GET', path: '/search',
    session: memberSession(input),
    query: {
      q: input.query,
      cursor: sourceCursor(input, ctx),
      mode: input.contentKind || input.settings.mode
    },
    headers: { 'X-Query-Digest': digest }
  });
  const data = payload(response, ctx);
  return { items: data.books.map(bookModel), next: nextToken(data.nextCursor, ctx) };
}

/** @param {Nori.DetailInput} input @param {Nori.Context} ctx */
export async function detail(input, ctx) {
  const response = await ctx.http.request({
    endpoint: 'api', method: 'GET', path: '/books/{id}',
    parameters: { id: locatorID(input.book.locator, 'bookID', ctx) },
    session: memberSession(input)
  });
  const data = payload(response, ctx);
  const book = bookModel(data.book);
  /** @type {Nori.Edition[]} */
  const editions = [{ id: 'online', title: '在线阅读', kind: 'chapters' }];
  if (data.epubFileID) {
    editions.push({
      id: 'epub', title: 'EPUB', kind: 'file',
      resource: {
        id: 'epub', role: 'publication', mediaType: 'application/epub+zip',
        source: { locator: { fileID: data.epubFileID } }
      }
    });
  }
  return { book: book, editions: editions };
}

/** @param {Nori.ChaptersInput} input @param {Nori.Context} ctx */
export async function chapters(input, ctx) {
  const response = await ctx.http.request({
    endpoint: 'api', method: 'GET', path: '/books/{id}/chapters',
    parameters: { id: locatorID(input.book.locator, 'bookID', ctx) },
    query: { cursor: sourceCursor(input, ctx) },
    session: memberSession(input)
  });
  const data = payload(response, ctx);
  const items = data.items.map(function (item) {
    if (item.kind === 'section') {
      return { kind: 'section', id: item.id, title: item.title, depth: item.depth };
    }
    return {
      kind: 'chapter', id: item.id, title: item.title,
      locator: { chapterID: item.id },
      access: { state: item.access || 'unknown' }, depth: item.depth
    };
  });
  return { items: items, next: nextToken(data.nextCursor, ctx) };
}

/** @param {Nori.ContentInput} input @param {Nori.Context} ctx */
export async function content(input, ctx) {
  const response = await ctx.http.request({
    endpoint: 'api', method: 'GET', path: '/chapters/{id}/content',
    parameters: { id: locatorID(input.chapter.locator, 'chapterID', ctx) }, session: 'member'
  });
  const data = payload(response, ctx);
  /** @type {Nori.Block[]} */
  const blocks = [];
  /** @type {Record<string, Nori.Asset>} */
  const assets = {};
  for (const part of data.parts) {
    ctx.signal.throwIfAborted();
    if (part.kind === 'text') {
      blocks.push({ kind: 'paragraph', id: part.id, text: part.text });
    } else if (part.kind === 'image') {
      assets[part.id] = {
        id: part.id, role: 'image', mediaType: part.mediaType,
        source: { url: part.url, endpoint: 'files' },
        width: part.width, height: part.height
      };
      blocks.push({ kind: 'image', id: part.id, asset: part.id });
    } else {
      ctx.fail('unsupported_feature', '聚合接口返回未声明的内容类型', '/response/data/parts');
    }
  }
  return {
    id: input.chapter.id, chapterID: input.chapter.id, kind: input.book.kind,
    title: data.title, revision: data.revision, blocks: blocks, assets: assets
  };
}

/** @param {Nori.ResolveInput} input @param {Nori.Context} ctx */
export async function resolveResource(input, ctx) {
  if (!('locator' in input.asset.source)) {
    ctx.fail('value_invalid', '当前资源不需要调用源站解析');
  }
  const response = await ctx.http.request({
    endpoint: 'api', method: 'POST', path: '/files/resolve',
    session: 'member', json: { fileID: locatorID(input.asset.source.locator, 'fileID', ctx) }
  });
  const data = payload(response, ctx);
  // This address may expire. The persistent Asset retains only fileID.
  return { url: data.url, endpoint: 'files', expiresAt: data.expiresAt };
}

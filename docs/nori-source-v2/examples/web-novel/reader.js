// Fictional HTML contract; see ../../../nori-source-authoring.md.
// List: .book[data-book-id], .title, .author, a.details; a.next is the next page.
// Detail: h1, .author, .intro, img.cover, a.catalog.
// TOC: #chapters a[data-chapter-id], a.toc-next.
// Body: #content; this template assumes a chapter has exactly one HTML page.

const categories = [{ value: 'all', title: '全部' }, { value: 'fantasy', title: '奇幻' }];

function required(value, nori, path) {
  if (typeof value !== 'string' || !value.trim()) nori.fail('value_invalid', '网页缺少必要字段', path);
  return value.trim();
}

function nodeText(root, selector, nori) {
  const node = nori.dom.select(root, selector);
  return node ? nori.dom.text(node).trim() : '';
}

function linkURL(root, selector, baseURL, nori) {
  const node = nori.dom.select(root, selector);
  const href = node ? nori.dom.attr(node, 'href') : null;
  return href && href.trim() ? nori.url.resolve(href.trim(), baseURL) : null;
}

function coverAsset(root, baseURL, id, nori) {
  const node = nori.dom.select(root, 'img.cover');
  const src = node ? (nori.dom.attr(node, 'data-src') || nori.dom.attr(node, 'src')) : null;
  // This example's image endpoint serves JPEG covers.
  return src ? { id: 'cover:' + id, role: 'cover', mediaType: 'image/jpeg',
    source: { url: nori.url.resolve(src, baseURL), endpoint: 'images' } } : undefined;
}

function bookModel(node, baseURL, nori) {
  const id = required(nori.dom.attr(node, 'data-book-id'), nori, '/book/id');
  const url = required(linkURL(node, 'a.details', baseURL, nori), nori, '/book/locator/url');
  const book = { id, kind: 'novel', title: required(nodeText(node, '.title', nori), nori, '/book/title'), locator: { url } };
  const author = nodeText(node, '.author', nori);
  const cover = coverAsset(node, baseURL, id, nori);
  if (author) book.authors = [author];
  if (cover) book.cover = cover;
  return book;
}

async function listPage(input, nori, searching) {
  const request = typeof input.cursor === 'string'
    ? { endpoint: 'web', method: 'GET', url: input.cursor }
    : { endpoint: 'web', method: 'GET', path: searching ? '/search' : '/catalog',
        query: searching ? { q: input.query } : { category: input.filters.category || 'all' } };
  const response = await nori.http.request(request);
  const document = nori.dom.parse(response);
  try {
    const items = nori.dom.selectAll(document, '.book').map(node => bookModel(node, response.url, nori));
    const nextURL = linkURL(document, 'a.next', response.url, nori);
    return { items, next: nextURL ? { kind: 'url', url: nextURL } : null };
  } finally {
    nori.dom.free(document);
  }
}

export function filters(input, nori) {
  return { fields: input.scope === 'search' ? [] : [{ id: 'category', title: '分类', control: 'select', defaultValue: 'all', options: categories }] };
}

export async function search(input, nori) {
  return listPage(input, nori, true);
}

export async function catalog(input, nori) {
  return listPage(input, nori, false);
}

export async function detail(input, nori) {
  const address = required(input.book.locator && input.book.locator.url, nori, '/book/locator/url');
  const response = await nori.http.request({ endpoint: 'web', method: 'GET', url: address });
  const document = nori.dom.parse(response);
  try {
    const book = { ...input.book, title: required(nodeText(document, 'h1', nori), nori, '/book/title') };
    const author = nodeText(document, '.author', nori);
    const summary = nodeText(document, '.intro', nori);
    const cover = coverAsset(document, response.url, book.id, nori);
    if (author) book.authors = [author];
    if (summary) book.summary = summary;
    if (cover) book.cover = cover;
    const catalogURL = required(linkURL(document, 'a.catalog', response.url, nori), nori, '/edition/locator/catalogURL');
    return { book, editions: [{ id: 'online', title: '在线阅读', kind: 'chapters', locator: { catalogURL } }] };
  } finally {
    nori.dom.free(document);
  }
}

export async function chapters(input, nori) {
  const url = typeof input.cursor === 'string' ? input.cursor : input.edition.locator && input.edition.locator.catalogURL;
  const response = await nori.http.request({ endpoint: 'web', method: 'GET', url: required(url, nori, '/edition/locator/catalogURL') });
  const document = nori.dom.parse(response);
  try {
    const items = nori.dom.selectAll(document, '#chapters a').map(node => ({
      kind: 'chapter',
      id: required(nori.dom.attr(node, 'data-chapter-id'), nori, '/chapter/id'),
      title: required(nori.dom.text(node), nori, '/chapter/title'),
      locator: { url: nori.url.resolve(required(nori.dom.attr(node, 'href'), nori, '/chapter/locator/url'), response.url) },
      access: { state: 'unknown' }
    }));
    const nextURL = linkURL(document, 'a.toc-next', response.url, nori);
    return { items, next: nextURL ? { kind: 'url', url: nextURL } : null };
  } finally {
    nori.dom.free(document);
  }
}

export async function content(input, nori) {
  const url = required(input.chapter.locator && input.chapter.locator.url, nori, '/chapter/locator/url');
  const response = await nori.http.request({ endpoint: 'web', method: 'GET', url });
  const document = nori.dom.parse(response);
  try {
    const body = nori.dom.select(document, '#content');
    if (!body) nori.fail('value_invalid', '网页没有小说正文', '/content');
    const extracted = nori.content.blocks(body, { format: 'html', baseURL: response.url, remove: ['.advertisement'] });
    if (!extracted.blocks.length) nori.fail('value_invalid', '小说正文为空', '/content');
    return { id: input.chapter.id, chapterID: input.chapter.id, kind: 'novel', title: input.chapter.title, ...extracted };
  } finally {
    nori.dom.free(document);
  }
}

"use strict";

// 可运行的 HTML 小说源：bqg.info。使用独立 ID，可与官方源同时安装。
// 写新源时先修改站点、域名、请求路径和选择器，再逐个验证下面四个业务回调。
const SITE = {
  id: 'example.biquge', name: '笔趣阁 · 编写示例', group: '笔趣阁',
  kind: 'novel', homepage: 'https://www.bqg.info/'
};
const READING = {
  chapterItems: 'dl#newlist > dd a', chapterTitle: {selector: ''},
  chapterLink: {selector: '', attribute: 'href'},
  content: '#booktxt', contentTitle: {selector: 'h1.readTitle'},
  remove: ['script', 'style', '.ad', '.ads']
};
const filter = (id, title, defaultValue, options) => ({id, title, defaultValue, options});
const statusOptions = [{value: 'all', title: '不限'}, {value: 'complete', title: '完本'}];

function getPage(url) {
  const response = host.request({url});
  if (response.status === 403 || /<title>[^<]*(Just a moment|Attention Required|验证码)/i.test(response.body)) {
    throw new Error('NORI_SITE_VERIFICATION_REQUIRED');
  }
  if (response.status !== 200) throw new Error('HTTP ' + response.status);
  return response;
}

function booksFrom(response, selector, fields) {
  return host.select(response.body, selector, fields).filter(row => row.title && row.link).map(row => ({
    sourceID: SITE.id, title: row.fullTitle || row.title, author: row.author || '', summary: '',
    detailURL: host.url(row.link, response.url)
  }));
}

function nextLink(response, nextPage) {
  const links = host.select(response.body, 'a[href]', {
    title: {selector: ''}, href: {selector: '', attribute: 'href'}
  });
  const next = links.find(a => a.title === String(nextPage) || /^(下一页|下页|Next|›|»|>>)$/i.test(a.title));
  return next ? host.url(next.href, response.url) : null;
}

var source = {
  manifest: {
    apiVersion: 1, id: 'example.novel.source', name: '小说源编写示例', version: '1.0.0',
    domains: ['bqg.info'],
    settings: [{id: 'defaultStatus', title: '默认书库', type: 'select', defaultValue: 'all', options: statusOptions}],
    sites: [{...SITE, capabilities: ['catalog', 'search', 'detail', 'content'],
      catalog: {filters: [filter('category', '分类', 'all', [{value: 'all', title: '全部'}]),
        filter('status', '状态', 'all', statusOptions)], searchFilters: [], dynamicFilters: true}}]
  },

  // 1. 返回当前作用域的筛选定义；query 有值表示搜索，本站搜索不支持书库筛选。
  // settings 是 App 保存的源设置；filters 是用户本次选择，可据此请求不同频道的分类。
  catalogFilters({query, settings}) {
    if (query) return [];
    const response = getPage(SITE.homepage + 'sort/');
    const navigation = host.select(response.body, 'a[href]', {
      title: {selector: ''}, href: {selector: '', attribute: 'href'}
    });
    const categories = [{value: 'all', title: '全部'}];
    for (const link of navigation) {
      const match = link.href.match(/^\/sort\/([a-z]+)\/1\/$/);
      if (match && !categories.some(item => item.value === match[1])) {
        categories.push({value: match[1], title: link.title.replace(/小说$/, '')});
      }
    }
    if (categories.length === 1) throw new Error('网站分类结构已变化');
    return [filter('category', '分类', 'all', categories),
      filter('status', '状态', settings.defaultStatus, statusOptions)];
  },

  // 2. 首页与搜索共用列表回调。cursor 原样使用网站给出的下一页地址。
  catalog({query, filters, cursor}) {
    if (query) {
      const response = getPage(SITE.homepage + 'search/?searchkey=' + encodeURIComponent(query));
      return {books: booksFrom(response, '.body-content .book-coverlist', {
        title: {selector: 'h4 a'}, link: {selector: 'h4 a', attribute: 'href'}, author: {selector: '.caption small'}
      }), nextCursor: null}; // 本站搜索没有下一页，不根据结果数量猜测分页。
    }
    const path = (filters.status === 'complete' ? 'quanben/' : '') + 'sort/'
      + (filters.category === 'all' ? '' : filters.category + '/') + '1/';
    const response = getPage(cursor || SITE.homepage + path);
    const books = booksFrom(response, 'tbody tr', {
      title: {selector: 'td:nth-child(2) a'}, link: {selector: 'td:nth-child(2) a', attribute: 'href'},
      fullTitle: {selector: 'td:nth-child(2) a', attribute: 'title'},
      author: {selector: 'td:nth-child(4)'}
    });
    const page = Number(response.url.match(/\/(\d+)\/$/)?.[1] || 1);
    return {books, nextCursor: nextLink(response, page + 1)};
  },

  // 3. 返回完整详情与按阅读顺序排列的目录。
  detail({book}) {
    const response = getPage(book.detailURL);
    const info = host.select(response.body, 'html', {
      title: {selector: 'h1.bookTitle'}, author: {selector: 'meta[property="og:novel:author"]', attribute: 'content'},
      summary: {selector: '#bookIntro'}, cover: {selector: 'img.img-thumbnail', attribute: 'src'},
      status: {selector: 'meta[property="og:novel:status"]', attribute: 'content'}
    })[0];
    const chapters = host.select(response.body, READING.chapterItems, {
      title: {selector: ''}, href: {selector: '', attribute: 'href'}
    }).map(row => ({title: row.title, url: host.url(row.href, response.url), isLocked: false}));
    return {book: {...book, title: info.title, author: info.author || '', summary: info.summary || '',
      coverURL: info.cover ? host.url(info.cover, response.url) : null,
      attributes: info.status ? [{name: '状态', value: info.status}] : []}, chapters};
  },

  // 4. 返回完整章节段落。App 负责排版、按屏分页与预加载。
  // 本站一章可分多个网页，只有相同章节的 _N.html 才是续页，不能合并下一章。
  content({chapter}) {
    const chapterKey = url => String(url).match(/^(https:\/\/www\.bqg\.info\/read\/\d+\/\d+)(?:_(\d+))?\.html$/);
    const original = chapterKey(chapter.url);
    if (!original) throw new Error('章节地址不符合本站规则');
    const paragraphs = [], visited = new Set();
    let url = chapter.url, title = chapter.title;
    for (let page = 0; page < 12; page++) {
      if (visited.has(url)) throw new Error('章节续页出现循环');
      visited.add(url);
      const response = getPage(url), content = host.content(response.body, READING, response.url);
      if (page === 0 && content.title) title = content.title;
      paragraphs.push(...content.paragraphs.filter(text => text.trim()
        && !/^(?:bqg\.info|\[笔趣阁信息\].*|本章未完，请点击下一页继续阅读|[（(]本章完[）)])$/i.test(text.trim())));
      const link = host.select(response.body, '#linkNext', {href: {selector: '', attribute: 'href'}})[0];
      const next = link?.href ? host.url(link.href, response.url) : null;
      const continuation = chapterKey(next);
      if (!continuation || continuation[1] !== original[1] || !continuation[2]) {
        if (response.body.includes('本章未完，请点击下一页继续阅读')) throw new Error('章节缺少续页');
        return {title, paragraphs};
      }
      url = next;
    }
    throw new Error('章节超过单次请求上限');
  }
};

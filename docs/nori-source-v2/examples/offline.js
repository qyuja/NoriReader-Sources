// A self-contained source for trying the native v2 flow without a website or account.
/** @type {Nori.Book} */
const book = {
  id: 'mountain-notes', title: '山海札记', kind: 'novel', authors: ['随阅'],
  summary: '这是随阅 v2 协议的离线示例。可以搜索、切换阅读版本、查看分卷目录并阅读两章原创示例文字。',
  metadata: { status: 'completed', chapterCount: 2, tags: ['协议示例'] }
};
/** @type {Nori.Chapter} */
const first = { kind: 'chapter', id: 'morning', title: '第一章 · 山间清晨' };
/** @type {Nori.Chapter} */
const second = { kind: 'chapter', id: 'evening', title: '第二章 · 海边傍晚' };

/** @param {Nori.Input} input @param {Nori.Context} ctx @returns {Nori.BookPage} */
export function catalog(input, ctx) {
  return { items: [book], next: null };
}
/** @param {Nori.SearchInput} input @param {Nori.Context} ctx @returns {Nori.BookPage} */
export function search(input, ctx) {
  const query = input.query.trim();
  return { items: !query || book.title.includes(query) || (book.authors || []).some(name => name.includes(query)) ? [book] : [], next: null };
}
/** @param {Nori.DetailInput} input @param {Nori.Context} ctx @returns {Nori.DetailResult} */
export function detail(input, ctx) {
  return {
    book,
    editions: [{ id: 'original', title: '原文版', kind: 'chapters' }, { id: 'annotated', title: '批注版', kind: 'chapters' }],
    chapterPage: { editionID: 'original', page: { items: [{ kind: 'section', id: 'volume', title: '山与海' }, first], next: { kind: 'token', value: 'evening' } } }
  };
}
/** @param {Nori.ChaptersInput} input @param {Nori.Context} ctx @returns {Nori.ChapterPage} */
export function chapters(input, ctx) {
  if (input.cursor === 'evening') return { items: [second], next: null };
  return { items: [first], next: { kind: 'token', value: 'evening' } };
}
/** @param {Nori.ContentInput} input @param {Nori.Context} ctx @returns {Nori.Document} */
export function content(input, ctx) {
  const stored = ctx.state.get('reads');
  const reads = typeof stored === 'number' ? stored : 0;
  ctx.state.set('reads', reads + 1);
  const paragraphs = input.chapter.id === 'morning' ? [
    '天刚亮，山路还浸在一层薄雾里。脚步落在石阶上，远处传来几声鸟鸣。',
    '松枝接住了昨夜的雨，风一吹，水珠就从针叶间落下。',
    '走到山口时，太阳照亮了远处的屋顶。今天的路，从这里开始。'
  ] : [
    '傍晚的海面慢慢变暗，最后一束光沿着波纹铺向岸边。',
    '有人收起小船，有人坐在石头上等潮。风带着盐的气息。',
    '山路与海岸相隔很远，却都让人愿意把脚步放慢。'
  ];
  /** @type {Nori.Block[]} */
  const blocks = [{ kind: 'heading', level: 2, text: input.chapter.title }];
  for (const text of paragraphs) blocks.push({ kind: 'paragraph', text });
  if (input.settings.quote) blocks.push({ kind: 'quote', text: '把脚步放慢，也是一种抵达。' });
  if (input.edition.id === 'annotated') blocks.push({ kind: 'listItem', text: '批注：此版本与原文版的阅读位置分别保存。' });
  return { id: input.edition.id + ':' + input.chapter.id, chapterID: input.chapter.id, kind: 'novel', blocks };
}
/** @param {Nori.ActionInput} input @param {Nori.Context} ctx @returns {Nori.ActionResult} */
export function action(input, ctx) {
  if (input.actionID !== 'reset') ctx.fail('value_invalid', '', '/actionID');
  ctx.state.remove('reads');
  return { changed: true };
}

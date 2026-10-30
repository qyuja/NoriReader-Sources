"use strict";
// Generic template with fictional websites. A runnable novel source is in example-novel.js.
var sites = [
  {id:'example.novels',name:'示例小说',kind:'novel',homepage:'https://books.example.com/'},
  {id:'example.stories',name:'示例故事',kind:'novel',homepage:'https://stories.example.org/'}
];
var reading = {
  chapterItems:'.chapters a',chapterTitle:{selector:''},chapterLink:{selector:'',attribute:'href'},
  content:'#chapter-content',contentTitle:{selector:'h1'},remove:['.advertisement']
};
var source = {
  manifest:{apiVersion:1,id:'example.reader',name:'我的阅读源',version:'1.0.0',
    domains:['example.com','example.org'],sites:sites.map(s=>({...s,group:'小说',capabilities:['home','search','catalog','detail','content'],
      catalog:{filters:[
        {id:'category',title:'分类',defaultValue:'all',options:[{value:'all',title:'全部'},{value:'fantasy',title:'玄幻'}]},
        {id:'status',title:'状态',defaultValue:'all',options:[{value:'all',title:'不限'},{value:'complete',title:'完本'}]}
      ],searchFilters:[{id:'field',title:'范围',defaultValue:'title',options:[{value:'title',title:'书名'},{value:'author',title:'作者'}]}]}}))},
  catalog(input) {
    const site=sites.find(s=>s.id===input.siteID),filters=input.filters;
    const path=input.query?'search?q='+encodeURIComponent(input.query)+'&field='+encodeURIComponent(filters.field)
      :'library?category='+encodeURIComponent(filters.category)+'&status='+encodeURIComponent(filters.status);
    const response=host.get(input.cursor||site.homepage+path);
    const rows=host.select(response.body,'.book-card',{title:{selector:'.title'},link:{selector:'a',attribute:'href'},author:{selector:'.author'},cover:{selector:'img',attribute:'src'}});
    const next=host.select(response.body,'a[rel=next]',{link:{selector:'',attribute:'href'}})[0];
    return {books:rows.map(r=>({sourceID:site.id,title:r.title,author:r.author||'',summary:'',
      detailURL:host.url(r.link,response.url),coverURL:host.url(r.cover,response.url)})),nextCursor:next?host.url(next.link,response.url):null};
  },
  search(input) {
    const site=sites.find(s=>s.id===input.siteID);
    const response=host.get(site.homepage+'search?q='+encodeURIComponent(input.query)+'&page='+input.page);
    return host.select(response.body,'.book-card',{title:{selector:'.title'},link:{selector:'a',attribute:'href'},author:{selector:'.author'},cover:{selector:'img',attribute:'src'}})
      .map(r=>({sourceID:site.id,title:r.title,author:r.author||'',summary:'',detailURL:host.url(r.link,response.url),coverURL:host.url(r.cover,response.url)}));
  },
  home(input) {
    const site=sites.find(s=>s.id===input.siteID);
    if(!site)throw new Error('Unknown site');
    const response=host.get(site.homepage);
    const rows=host.select(response.body,'.book-card',{title:{selector:'.title'},link:{selector:'a',attribute:'href'},author:{selector:'.author'},cover:{selector:'img',attribute:'src'}});
    return [{id:'recommended',title:'推荐',tabTitle:'推荐',books:rows.map(r=>({sourceID:site.id,title:r.title,author:r.author||'',
      summary:'',detailURL:host.url(r.link,response.url),coverURL:host.url(r.cover,response.url)}))}];
  },
  detail(input) {
    const response=host.get(input.book.detailURL);
    const chapters=host.select(response.body,reading.chapterItems,{title:reading.chapterTitle,link:reading.chapterLink})
      .map(r=>({title:r.title,url:host.url(r.link,response.url),isLocked:false}));
    return {book:input.book,chapters};
  },
  content(input) {
    const response=host.get(input.chapter.url);
    return host.content(response.body,reading,response.url);
  }
};

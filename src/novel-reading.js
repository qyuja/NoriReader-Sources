"use strict";

// Execution only. Each website declares its reading and request rules above.
function novelReadingURL(path,base) {
  // These sites publish HTTP links even on their verified HTTPS pages.
  return host.url(String(path||'').replace(/^http:/i,'https:'),base);
}
function novelReadingResponse(siteID,url) {
  const headers=website(siteID).reading.headers;
  return catalogResponse(url,undefined,headers);
}
function novelReadingLinks(response,selector) {
  return host.select(response.body,selector,{title:{selector:''},href:{selector:'',attribute:'href'}})
    .map(row=>({title:row.title,url:novelReadingURL(row.href,response.url)})).filter(row=>row.url);
}
function novelDirectoryChapters(response,rule,detail=false) {
  const seen=new Set();
  const chapters=novelReadingLinks(response,detail?(rule.detailToc||rule.toc):rule.toc)
    .filter(row=>row.title&&!seen.has(row.url)&&seen.add(row.url))
    .map(row=>({title:row.title,url:row.url,isLocked:false}));
  if(!chapters.length)throw new Error('Missing chapter directory');
  return chapters;
}
function novelDirectoryNext(response,rule,detail=false) {
  if(rule.tocPaging==='links') {
    const current=Number(response.url.match(readingDefaults.directoryPagePattern)?.[1]||1);
    const links=novelReadingLinks(response,readingDefaults.directoryLinks);
    return links.find(row=>row.title===String(current+1))?.url||null;
  }
  if(rule.tocPaging!=='select')return null;
  // The same page selector appears above and below the directory.
  const options=Array.from(new Set(host.select(response.body,readingDefaults.directoryOptions.items,readingDefaults.directoryOptions.fields)
    .map(row=>novelReadingURL(row.href,response.url)).filter(Boolean)));
  if(options.length) {
    const current=options.indexOf(response.url);
    if(current<0)throw new Error('Chapter directory page is not in the page selector');
    return options[current+1]||null;
  }
  return detail&&!rule.separateDirectory?novelReadingLinks(response,rule.directoryLink)[0]?.url||null:null;
}
function novelReadingMetadata(book,response,rule) {
  const fields=rule.metadata||readingDefaults.metadata;
  const info=host.select(response.body,fields.items,fields.fields)[0];
  return {...book,title:info.title||info.heading||book.title,author:info.author||info.plainAuthor||book.author,
    summary:info.summary||info.intro||info.description||book.summary,
    coverURL:novelReadingURL(info.cover||info.plainCover,response.url)||book.coverURL,
    attributes:(rule.attributes||readingDefaults.attributes).filter(attribute=>info[attribute.field])
      .map(attribute=>({name:attribute.name,value:info[attribute.field]}))};
}

function novelDetail(input,site) {
  const rule=site.reading;
  const response=novelReadingResponse(input.siteID,input.book.detailURL);
  const book=novelReadingMetadata(input.book,response,rule);
  let directory=response;
  if(rule.separateDirectory) {
    const url=novelReadingLinks(response,rule.directoryLink)[0]?.url;
    if(!url)throw new Error('Missing chapter directory link');
    directory=novelReadingResponse(input.siteID,url);
  }
  return {book,chapters:novelDirectoryChapters(directory,rule,true),
    nextChapterCursor:novelDirectoryNext(directory,rule,true)};
}
function novelChapters(input) {
  const rule=website(input.siteID).reading;
  if(rule?.engine!=='paged')throw new Error('Unsupported chapter directory');
  const response=novelReadingResponse(input.siteID,input.cursor);
  return {chapters:novelDirectoryChapters(response,rule),nextCursor:novelDirectoryNext(response,rule)};
}

function novelBase64Text(value) {
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes=[];let buffer=0,bits=0;
  for(const char of value.replace(/=+$/,'')) {
    const digit=alphabet.indexOf(char);
    if(digit<0)throw new Error('Invalid encoded chapter text');
    buffer=(buffer<<6)|digit;bits+=6;
    if(bits>=8){bits-=8;bytes.push((buffer>>>bits)&255);}
  }
  return decodeURIComponent(bytes.map(byte=>'%'+byte.toString(16).padStart(2,'0')).join(''));
}
function novelDecodedHTML(html) {
  // Only constant qsbs.bb text payloads are decoded. Unrelated scripts, eval and obfuscated code remain inert.
  return html.replace(/<script\b[^>]*>\s*document\.writeln\s*\(\s*qsbs\.bb\(\s*(['"])([A-Za-z0-9+/=]+)\1\s*\)\s*\)\s*;?\s*<\/script\s*>/gi,
    (_,quote,value)=>novelBase64Text(value));
}
function novelNextContent(response,rule) {
  if(rule.nextVariable) {
    const literal=response.body.match(rule.nextVariablePattern||readingDefaults.nextVariablePattern);
    if(!literal)throw new Error('Missing chapter navigation');
    return novelReadingURL(literal[2],response.url);
  }
  const links=novelReadingLinks(response,rule.next);
  return links.find(link=>/下一[页章]/.test(link.title))?.url||null;
}
function novelContent(input,site) {
  const rule=site.reading;
  const pattern=rule.chapterPattern||readingDefaults.chapterPattern;
  const original=input.chapter.url.match(pattern);
  if(!original)throw new Error('Invalid chapter address');
  const visited=new Set(),paragraphs=[];
  let url=input.chapter.url;
  for(let page=0;page<12;page++) {
    if(visited.has(url))throw new Error('Chapter continuation loop');
    visited.add(url);
    const response=novelReadingResponse(input.siteID,url);
    const html=rule.encoded?novelDecodedHTML(response.body):response.body;
    const content=host.content(html,{chapterItems:rule.toc,chapterTitle:{selector:''},chapterLink:{selector:'',attribute:'href'},
      content:rule.content,remove:rule.remove||readingDefaults.remove},response.url);
    paragraphs.push(...content.paragraphs.filter(text=>{
      const value=text.trim().normalize('NFKC');
      return value&&!(rule.ignoredParagraphs||readingDefaults.ignoredParagraphs).some(pattern=>pattern.test(value));
    }));
    const next=novelNextContent(response,rule),continuation=next?.match(pattern);
    if(!continuation||continuation[1]!==original[1]) {
      if(!paragraphs.length)throw new Error('Missing chapter content');
      return {title:input.chapter.title,paragraphs};
    }
    url=next;
  }
  throw new Error('Chapter exceeds the page request limit');
}

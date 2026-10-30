"use strict";

// Execution only. The complete registry is declared before this module.
function createSource(definition) {
  const aliases = Object.fromEntries(Object.entries(definition.aliases || {}).map(([ruleID, siteID]) => [siteID, ruleID]));
  const sites = definition.siteIDs.map(id => {
    const rule = websiteRules[id];
    const catalog = rule.catalog ? {
      filters: rule.catalog.filters.map(publicCatalogFilter),
      searchFilters: rule.catalog.searchFilters.map(publicCatalogFilter),
      ...(rule.catalog.filters.some(filter => filter.optionsSource) ? {dynamicFilters: true} : {})
    } : undefined;
    return {id: definition.aliases?.[id] || id, name: rule.name, kind: rule.kind,
      homepage: rule.homepage, group: websiteGroups[rule.group], capabilities: rule.capabilities, ...(catalog ? {catalog} : {})};
  });
  const drives = definition.driveIDs.map(id => {
    const {name, root, authentication} = driveRules[id];
    return {id, name, root, authentication};
  });
  const domains = Array.from(new Set(definition.siteIDs.flatMap(id => websiteRules[id].domains)
    .concat(drives.flatMap(drive => drive.authentication.domains))));
  function siteInput(input) {
    return aliases[input.siteID] ? {...input, siteID: aliases[input.siteID]} : input;
  }
  return {
    manifest: {apiVersion: definition.apiVersion, id: definition.id, name: definition.name, version: definition.version,
      domains, sites, drives, settings: definition.settings},
    home(input) {return websiteHome(siteInput(input));},
    catalog(input) {return websiteCatalog(siteInput(input));},
    catalogFilters(input) {return websiteCatalogFilters(siteInput(input));},
    search(input) {return websiteSearch(siteInput(input));},
    detail(input) {return websiteDetail(siteInput(input));},
    chapters(input) {return novelChapters(siteInput(input));},
    content(input) {return websiteContent(siteInput(input));},
    driveList(input) {return driveList(input);},
    driveResolve(input) {return driveResolve(input);},
    driveShareList(input) {return driveShareList(input);},
    driveTransfer(input) {return driveTransfer(input);},
    driveTransferStatus(input) {return driveTransferStatus(input);}
  };
}
function website(id) {
  const value = websiteRules[id];
  if (!value) throw new Error('Unknown site');
  return value;
}
function book(site, row, base) {
  const url = host.url(row.detailURL || row.link || '', base);
  if (!row.title || !url) return null;
  return {sourceID:site.id,title:row.title,author:(row.author||'').replace(/^作者：/,''),
    detailURL:url,coverURL:host.url(row.coverURL || row.cover || '',base),summary:row.summary||'',
    ...(row.attributes?.length ? {attributes: row.attributes} : {})};
}
function uniqueBooks(site, rows, base) {
  const seen = new Set();
  return rows.map(row => book(site,row,base)).filter(row => row && !seen.has(row.detailURL) && seen.add(row.detailURL));
}
function initialState(html) {
  const marker = html.indexOf('window.__INITIAL_STATE__');
  if (marker < 0) throw new Error('Missing initial state');
  const start = html.indexOf('{',marker);
  let depth=0,quote='',escape=false;
  for(let i=start;i<html.length;i++) {
    const c=html[i];
    if(quote) { if(escape)escape=false; else if(c==='\\')escape=true; else if(c===quote)quote=''; }
    else if(c==='"'||c==="'")quote=c;
    else if(c==='{')depth++;
    else if(c==='}' && --depth===0)return JSON.parse(html.slice(start,i+1));
  }
  throw new Error('Incomplete initial state');
}

function biqugeDetail(input,site,response,chapters) {
  const fields=host.select(response.body,'html',site.detail.fields)[0];
  if(!fields?.title)throw new Error('Missing book details');
  const attributes=site.detail.attributes.filter(attribute=>fields[attribute.field])
    .map(attribute=>({name:attribute.name,value:fields[attribute.field]}));
  return {book:{...input.book,title:fields.title,author:fields.author,summary:fields.summary,
    coverURL:host.url(fields.cover,response.url),attributes},chapters};
}

function biqugeChapterAddress(url,rule) {
  return String(url).match(rule.chapterPattern);
}

function biqugeContent(input,site) {
  const chapter=biqugeChapterAddress(input.chapter.url,site.reading);
  if(!chapter)throw new Error('Invalid chapter address');
  const seen=new Set(),paragraphs=[];
  let url=input.chapter.url,title=input.chapter.title;
  // A website page is only part of a chapter. Never treat the next chapter as a continuation.
  for(let page=0;page<12;page++) {
    if(seen.has(url))throw new Error('Chapter pagination loop');
    seen.add(url);
    const response=host.get(url),content=host.content(response.body,site.reading,response.url);
    if(page===0 && content.title)title=content.title;
    for(const paragraph of content.paragraphs) {
      const text=paragraph.trim(),normalized=text.normalize('NFKC').replace(/\s+/g,'');
      if(!text || site.reading.ignoredParagraphs.some(pattern=>pattern.test(normalized)))continue;
      paragraphs.push(text);
    }
    const link=host.select(response.body,site.reading.next,{url:{selector:'',attribute:'href'}})[0];
    const next=link?.url?host.url(link.url,response.url):null,continuation=biqugeChapterAddress(next,site.reading);
    if(!continuation || continuation[1]!==chapter[1] || !continuation[2]) {
      if(response.body.includes(site.reading.continuationNotice))throw new Error('Missing chapter continuation');
      if(!paragraphs.length)throw new Error('Missing chapter content');
      return {title,paragraphs};
    }
    url=next;
  }
  throw new Error('Chapter exceeds the page request limit');
}


function websiteHome(input) {
  const site=website(input.siteID),rule=site.home;
  if(rule.type==='catalog') {
    const page=websiteCatalog(input);
    return [{id:rule.id,title:page.title||rule.title,tabTitle:rule.tabTitle,books:page.books}];
  }
  const response=sourceRequest(site,rule.request,catalogParameters(site,input,false));
  if(rule.type==='fanqie') {
    const data=initialState(response.body).home;
    return rule.sections.map(section=>({id:section.id,title:section.title,tabTitle:section.tabTitle,
      books:uniqueBooks(site,(data[section.key]||[]).map(book=>({title:book.bookName,link:sourceTemplate(rule.detailURL,{homepage:site.homepage,bookID:book.bookId}),
        author:book.author,cover:book.thumbUri,summary:book.abstract})),response.url)}));
  }
  if(rule.type==='mox')return [{id:rule.id,title:rule.title,tabTitle:rule.tabTitle,books:moxBooks(site,response)}];
  return rule.sections.map(section=>({id:section.id,title:section.title,tabTitle:section.tabTitle,
    books:catalogBooks(site,response,section.rows)}));
}

function websiteSearch(input) {
  const site=website(input.siteID);
  if(site.search?.handler)return site.search.handler(input,site);
  if(site.search) {
    const parameters=catalogParameters(site,input,true);
    const response=sourceRequest(site,site.search.request,parameters);
    if(site.search.expectedStatus&&response.status!==site.search.expectedStatus)throw new Error(site.search.error);
    return catalogBooks(site,response,site.search.rows);
  }
  if(Number(input.page||1)!==1)return [];
  return websiteCatalog(input).books;
}

function websiteDetail(input) {
  const site=website(input.siteID);
  if(site.detail?.handler)return site.detail.handler(input,site);
  if(site.reading?.engine==='paged')return novelDetail(input,site);
  return htmlNovelDetail(input,site);
}

function websiteContent(input) {
  const site=website(input.siteID);
  if(site.reading?.handler)return site.reading.handler(input,site);
  if(site.reading?.engine==='paged')return novelContent(input,site);
  const response=host.get(input.chapter.url);
  return host.content(response.body,site.reading,response.url);
}
function htmlNovelDetail(input,site) {
  const rule=site.reading;
  if(!rule)throw new Error('No online chapters');
  let response=host.get(input.book.detailURL);
  if(rule.catalogLink) {
    const row=host.select(response.body,'html',{link:rule.catalogLink})[0];
    if(!row || !row.link)throw new Error('Missing chapter directory');
    response=host.get(host.url(row.link,response.url));
  }
  const seen=new Set();
  const chapters=host.select(response.body,rule.chapterItems,{title:rule.chapterTitle,link:rule.chapterLink,
    locked:{selector:rule.lockedSelector||'.nori-none',attribute:'class'}}).map(row=>({title:row.title,
      url:host.url(row.link,response.url),isLocked:!!row.locked})).filter(c=>c.title && c.url && !seen.has(c.url) && seen.add(c.url));
  if(!chapters.length)throw new Error('Missing chapters');
  if(site.parser==='biquge')return biqugeDetail(input,site,response,chapters);
  return {book:input.book,chapters};
}
function literalCalls(html,marker) {
  const calls=[];let offset=0;
  while((offset=html.indexOf(marker,offset))>=0) {
    const start=offset+marker.length;let depth=1,quote='',escaped=false,end=start;
    for(;end<html.length;end++) {
      const c=html[end];
      if(quote) { if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote=''; }
      else if(c==='"'||c==="'")quote=c;
      else if(c==='(')depth++;
      else if(c===')' && --depth===0)break;
    }
    if(depth!==0)break;
    calls.push(html.slice(start,end));offset=end+1;
  }
  return calls;
}


function gutenbergDetail(input,site) {
  const response=host.get(input.book.detailURL),rule=site.detail.resources;
  const rows=host.select(response.body,rule.items,rule.fields);
  if(!rows.length)throw new Error('No supported book file');
  return {book:input.book,chapters:[],resources:[{title:rule.title,kind:'download',filename:rule.filename,
    url:host.url(rows[0].link,response.url)}]};
}
function kgbookDetail(input,site) {
  const response=host.get(input.book.detailURL);
  const fields=host.select(response.body,site.detail.items,site.detail.fields)[0];
  if(!fields?.title)throw new Error('Missing book details');
  const attributes=[];let author='';
  for(const item of host.select(response.body,site.detail.attributes.items,site.detail.attributes.fields)) {
    const colon=item.text.indexOf('：');
    if(colon<0)continue;
    const name=item.text.slice(0,colon).trim();let value=item.text.slice(colon+1).trim();
    if(name==='作者') {author=value;continue;}
    if(name==='星级' && !value) {
      const rating=item.rating.match(/\/(\d)star\./);if(rating)value=rating[1]+' / 5';
    }
    if(value)attributes.push({name,value});
  }
  const title=fields.title,seen=new Set();
  const resources=host.select(response.body,site.detail.resources.items,site.detail.resources.fields)
    .map(row=>{
      const match=row.title.match(/(epub|mobi|azw3|txt|pdf|cbz|zip)/i),url=host.url(row.url,response.url);
      if(!match || !url || seen.has(url))return null;
      seen.add(url);const format=match[1].toLowerCase();
      return {title:format.toUpperCase(),kind:'download',filename:title.replace(/[\\/]/g,'_')+'.'+format,url};
    }).filter(Boolean);
  if(!resources.length)throw new Error('No book files');
  return {book:{...input.book,title,author,summary:fields.summary,coverURL:host.url(fields.cover,response.url),attributes},chapters:[],resources};
}

function fanqieSearch(input,site) {
  const parameters=catalogParameters(site,input,true),rule=site.search;
  const response=host.browserRequest({pageURL:sourceTemplate(rule.pageURL,parameters),
    url:sourceTemplate(rule.request.url,parameters)});
  if(response.status!==200||!response.body.trim())throw new Error('NORI_SEARCH_UNAVAILABLE');
  const result=JSON.parse(response.body);
  if(result.code!==0||!Array.isArray(result.data?.search_book_data_list))throw new Error('NORI_SEARCH_UNAVAILABLE');
  // Search metadata uses per-response font glyphs; public detail HTML provides Unicode.
  const ids=[...new Set(result.data.search_book_data_list.map(book=>String(book.book_id||'')).filter(id=>/^\d+$/.test(id)))].slice(0,rule.limit);
  return uniqueBooks(site,ids.map(id=>{
    const detail=host.get(sourceTemplate(rule.detailURL,{...parameters,bookID:id})),data=initialState(detail.body).page;
    if(!data?.bookName||String(data.bookId)!==id)throw new Error('NORI_SEARCH_UNAVAILABLE');
    return {title:data.bookName,author:data.author,link:sourceTemplate(rule.detailURL,{...parameters,bookID:id}),cover:data.thumbUrl||data.thumbUri,summary:data.abstract||''};
  }),site.homepage);
}

function kuaikanSearch(input,site) {
  const parameters=catalogParameters(site,input,true);
  const response=sourceRequest(site,site.search.request,parameters);
  const result=JSON.parse(response.body),topics=result.data?.topics?.hit;
  if(response.status!==200||result.code!==200||!Array.isArray(topics))throw new Error('NORI_SEARCH_UNAVAILABLE');
  return uniqueBooks(site,topics.map(book=>({title:book.title,author:book.user?.nickname||'',link:sourceTemplate(site.search.detailURL,{...parameters,bookID:book.id}),
    cover:book.vertical_image_url||book.cover_image_url,summary:book.description||''})),site.homepage);
}

function moxBooks(site,response) {
  const rows=[];
  for(const argumentsText of literalCalls(response.body,site.home.literalMarker)) {
    const strings=(argumentsText.match(/"(?:\\.|[^"\\])*"/g)||[]).map(value=>JSON.parse(value));
    if(strings.length>=14&&strings[0]==='div_info_')rows.push({title:strings[10].replace(/<[^>]*>/g,''),
      author:strings[11].replace(/<[^>]*>/g,''),link:strings[2],cover:strings[3]});
  }
  return uniqueBooks(site,rows,response.url);
}

function moxSearch(input,site) {
  const parameters=catalogParameters(site,input,true);
  const response=sourceRequest(site,site.search.request,parameters);
  if(response.url.includes('login')||response.body.includes('ipt_email'))throw new Error('NORI_SITE_LOGIN_REQUIRED');
  return moxBooks(site,response);
}
// Nuxt's hydration payload is a literal object with shared literal parameters.
// Parse that data grammar; never evaluate a website's scripts or function calls.
function literalReader(text,variables=Object.create(null)) {
  let offset=0;
  const identifiers=/[A-Za-z_$][\w$]*/y,numbers=/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  function skip(){while(offset<text.length && text.charCodeAt(offset)<=32)offset++;}
  function expect(token){skip();if(text.slice(offset,offset+token.length)!==token)throw new Error('Invalid serialized data');offset+=token.length;}
  function identifier(){skip();identifiers.lastIndex=offset;const m=identifiers.exec(text);if(!m)throw new Error('Invalid data key');offset+=m[0].length;return m[0];}
  function value(depth=0) {
    if(depth>64)throw new Error('Serialized data is too deep');
    skip();const c=text[offset];
    if(c==='"') {
      const start=offset++;let escaped=false;
      while(offset<text.length){const next=text[offset++];if(escaped)escaped=false;else if(next==='\\')escaped=true;else if(next==='"')return JSON.parse(text.slice(start,offset));}
      throw new Error('Incomplete data string');
    }
    if(c==='{' || c==='[') {
      offset++;const object=c==='{',out=object?Object.create(null):[],end=object?'}':']';skip();
      while(text[offset]!==end) {
        let key;if(object){key=text[offset]==='"'?value(depth+1):identifier();expect(':');}
        const item=value(depth+1);if(object)out[key]=item;else out.push(item);skip();
        if(text[offset]!==',')break;offset++;skip();
      }
      expect(end);return out;
    }
    numbers.lastIndex=offset;const number=numbers.exec(text);
    if(number){offset+=number[0].length;return Number(number[0]);}
    const key=identifier();
    if(key==='true')return true;if(key==='false')return false;if(key==='null')return null;
    if(key==='Array'){expect('(');const length=value(depth+1);expect(')');if(!Number.isInteger(length)||length<0||length>10000)throw new Error('Invalid data array');return Array(length);}
    if(Object.hasOwn(variables,key))return variables[key];
    throw new Error('Unsupported serialized value');
  }
  return {value,expect,identifier,done(){skip();return offset===text.length;}};
}

function kuaikanState(html) {
  const start=html.indexOf('window.__NUXT__=');
  if(start<0)throw new Error('Missing comic data');
  const end=html.indexOf('</script>',start),payload=html.slice(start,end);
  const header=payload.match(/^window\.__NUXT__=\(function\(([^)]*)\)\s*\{/);
  const call=payload.lastIndexOf('}('),returned=payload.indexOf('return ',header?.[0].length);
  if(!header || call<0 || returned<0)throw new Error('Unsupported comic data');
  const argumentsReader=literalReader(payload.slice(call+1).replace(/\)\);?\s*$/,'')),variables=Object.create(null);
  argumentsReader.expect('(');
  const names=header[1].split(',');
  for(let index=0;index<names.length;index++) {if(index)argumentsReader.expect(',');variables[names[index]]=argumentsReader.value();}
  if(!argumentsReader.done())throw new Error('Invalid comic arguments');
  const assignments=payload.slice(header[0].length,returned).trim();
  for(const assignment of assignments.split(';').filter(s=>s.trim())) {
    const match=assignment.trim().match(/^([\w$]+)(?:\.([\w$]+)|\[(\d+)\])=(.*)$/s);
    if(!match || !variables[match[1]] || typeof variables[match[1]]!=='object')throw new Error('Unsupported shared data');
    if(match[3] && Number(match[3])>=10000)throw new Error('Invalid shared index');
    const reader=literalReader(match[4],variables);variables[match[1]][match[2]??match[3]]=reader.value();
    if(!reader.done())throw new Error('Invalid shared data');
  }
  return literalReader(payload.slice(returned+7,call),variables).value();
}

function kuaikanDetail(input,site) {
  const state=kuaikanState(host.get(input.book.detailURL).body),data=state.data?.[0];
  const topic=data?.res?.data?.topic_info||data?.topicInfo;
  const rows=topic?.comics||data?.comics;
  if(!topic?.title || !rows?.length)throw new Error('Missing comic catalog');
  const seen=new Set(),chapters=rows.map(chapter=>({title:chapter.title,url:sourceTemplate(site.reading.chapterURL,{homepage:site.homepage,chapterID:chapter.id}),
    isLocked:!!(chapter.locked || chapter.need_vip || chapter.is_vip_exclusive || (chapter.is_pay_comic && !chapter.is_free && !chapter.has_bought))}))
    .filter(c=>c.title && !seen.has(c.url) && seen.add(c.url));
  return {book:{...input.book,title:topic.title,author:topic.user?.nickname||input.book.author,summary:topic.description||'',
    coverURL:topic.vertical_image_url||topic.cover_image_url,attributes:[{name:'话数',value:String(chapters.length)}]},chapters};
}

function kuaikanContent(input) {
  if(input.chapter.isLocked)throw new Error('Authorization required');
  const data=kuaikanState(host.get(input.chapter.url).body).data?.[0];
  const body=data?.res?.data,info=body?.comic_info||data?.comicInfo;
  if(!info || info.locked || info.need_vip || info.is_vip_exclusive || (info.is_pay_comic && !info.is_free && !info.has_bought))throw new Error('Authorization required');
  // The server renders only the first two <img> tags. The full ordered list is in res.data.
  const rows=info.comic_images||body?.comic_images||body?.images;
  if(!rows?.length)throw new Error('Missing comic images');
  return {title:info.title||input.chapter.title,images:rows.map(image=>({url:image.url1280||image.url,
    width:image.width1280||image.width,height:image.height}))};
}

function qqComicDetail(input,site) {
  const response=host.get(input.book.detailURL),html=response.body;
  const fields=host.select(html,'html',site.detail.fields)[0];
  const seen=new Set(),chapters=host.select(html,site.detail.chapters.items,site.detail.chapters.fields)
    .map(row=>({title:row.title,url:host.url(row.link,response.url),isLocked:!row.free}))
    .filter(c=>c.title && c.url && !seen.has(c.url) && seen.add(c.url));
  if(!fields?.title || !chapters.length)throw new Error('Missing comic catalog');
  return {book:{...input.book,title:fields.title,author:fields.author.replace(/^作者[:：]\s*/,''),summary:fields.summary,
    coverURL:host.url(fields.cover,response.url),attributes:[{name:'话数',value:String(chapters.length)}]},chapters};
}

function comicArithmetic(text) {
  text=text.replace(/document\.getElementsByTagName\(['"]html['"]\)/g,'1')
    .replace(/document\.children|window\.Array/g,'1')
    .replace(/(['"])([0-9A-Za-z])\1\.charCodeAt\(\s*(?:0)?\s*\)/g,(_,quote,c)=>String(c.charCodeAt(0)))
    .replace(/Math\.pow/g,'P').replace(/Math\.round/g,'R').replace(/Math\.floor/g,'F').replace(/parseInt/g,'I');
  if(text.length>64 || !/^[\d\s!~&+*/().,PRFI-]+$/.test(text))throw new Error('Invalid numeric data');
  let at=0;function skip(){while(at<text.length && text.charCodeAt(at)<=32)at++;}
  function unary(){skip();if('PRFI'.includes(text[at]||' ')){const fn=text[at++];if(text[at++]!=='(')throw new Error('Invalid numeric function');const a=bitwise();
      if(fn!=='P'){if(text[at++]!==')')throw new Error('Invalid numeric function');return fn==='R'?Math.round(a):fn==='F'?Math.floor(a):Math.trunc(a);}
      if(text[at++]!==',')throw new Error('Invalid numeric power');const b=bitwise();if(text[at++]!==')'||Math.abs(a)>10000||Math.abs(b)>16)throw new Error('Invalid numeric power');return Math.pow(a,b);}
    if(text[at]==='~'){at++;return ~unary();}
    if(text[at]==='!'){at++;return Number(!unary());}if(text[at]==='+'){at++;return unary();}
    if(text[at]==='-'){at++;return -unary();}if(text[at]==='('){at++;const v=bitwise();skip();if(text[at++]!==')')throw new Error('Invalid numeric group');return v;}
    const m=text.slice(at).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);if(!m)throw new Error('Invalid number');at+=m[0].length;return Number(m[0]);}
  function product(){let v=unary();skip();while(text[at]==='*'||text[at]==='/'){const op=text[at++],r=unary();v=op==='*'?v*r:v/r;skip();}return v;}
  function sum(){let v=product();skip();while(text[at]==='+'||text[at]==='-'){const op=text[at++],r=product();v=op==='+'?v+r:v-r;skip();}return v;}
  function bitwise(){let v=sum();skip();while(text[at]==='&'){at++;v=v&sum();skip();}return v;}
  const value=bitwise();skip();if(at!==text.length||!Number.isFinite(value))throw new Error('Invalid numeric expression');return value;
}

function comicBase64(text) {
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',bytes=[];
  if(!/^[A-Za-z0-9+/]*={0,2}$/.test(text))throw new Error('Invalid image payload');
  let buffer=0,bits=0;
  for(const c of text.replace(/=+$/,'')){buffer=(buffer<<6)|alphabet.indexOf(c);bits+=6;if(bits>=8){bits-=8;bytes.push((buffer>>bits)&255);}}
  return decodeURIComponent(bytes.map(b=>'%'+b.toString(16).padStart(2,'0')).join(''));
}

function qqComicContent(input) {
  if(input.chapter.isLocked)throw new Error('Authorization required');
  const html=host.get(input.chapter.url).body,encoded=html.match(/var\s+DATA\s*=\s*'([^']+)'/);
  const assignments=Array.from(html.matchAll(/window\s*\[\s*((?:["'][a-z]+["']\s*\+?\s*)+)\]\s*=\s*([^;]+);/g))
    .filter(match=>Array.from(match[1].matchAll(/["']([a-z]+)["']/g)).map(piece=>piece[1]).join('')==='nonce');
  if(!encoded || !assignments.length)throw new Error('Missing comic payload');
  let expression=assignments[assignments.length-1][2].replace(/\(\+eval\("([^"]+)"\)\)\.toString\(\)/g,(_,math)=>JSON.stringify(String(comicArithmetic(math))));
  const pieces=expression.split(/\s*\+\s*/).map(piece=>{const literal=piece.trim().match(/^(['"])([a-zA-Z0-9]*)\1$/);if(!literal)throw new Error('Unsupported image data key');return literal[2];});
  const offsets=pieces.join('').match(/\d+[a-zA-Z]+/g),chars=encoded[1].split('');
  if(!offsets?.length)throw new Error('Invalid image data key');
  for(const segment of offsets.reverse())chars.splice(parseInt(segment,10)&255,segment.replace(/\d+/g,'').length);
  const data=JSON.parse(comicBase64(chars.join('')));
  if(!data.chapter?.canRead || Number(data.chapter.vipStatus)===2)throw new Error('Authorization required');
  if(!data.picture?.length)throw new Error('Missing comic images');
  return {title:data.chapter.cTitle||input.chapter.title,images:data.picture.map(image=>({url:host.url(image.url,input.chapter.url),width:image.width,height:image.height}))};
}

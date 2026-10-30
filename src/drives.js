"use strict";

// Execution only. Provider endpoints and account metadata are declared above.
function driveList(input) {
  if(input.providerID==='baidu')return baiduList(input);
  if(input.providerID!=='quark')throw new Error('Unsupported drive');
  const page=Number(input.cursor||'1');
  const rule=driveRules.quark;
  const url=rule.apiBase+rule.routes.list+'?'+queryString({...rule.parameters,pdir_fid:input.folder||rule.root,
    _page:page,_size:100,_fetch_total:1,_sort:'file_type:asc,file_name:asc'});
  const response=host.request({url,headers:rule.headers});
  if(response.status===401 || response.status===403)throw new Error('NORI_AUTH_REQUIRED');
  const result=JSON.parse(response.body);
  if([31001,32001].includes(result.code))throw new Error('NORI_AUTH_REQUIRED');
  if(result.code!==0 || !result.data || !Array.isArray(result.data.list))throw new Error('Drive login or response invalid');
  return {files:result.data.list.map(f=>({id:f.fid,name:f.file_name,isDirectory:!f.file,size:f.size||null})),
    cursor:page*100<(result.metadata?._total||0)?String(page+1):null};
}

function driveResolve(input) {
  if(input.providerID==='baidu')return baiduResolve(input);
  const rule=driveRules.quark;
  const response=host.request({url:rule.apiBase+rule.routes.download+'?'+queryString(rule.parameters),
    method:'POST',headers:{...rule.headers,'Content-Type':'application/json'},body:JSON.stringify({fids:[input.file.id]})});
  if(response.status===401 || response.status===403)throw new Error('NORI_AUTH_REQUIRED');
  const result=JSON.parse(response.body);
  const file=result.data?.[0];
  if(result.code!==0 || !file?.download_url)throw new Error('File download unavailable');
  return {url:file.download_url,headers:{Referer:rule.headers.Referer}};
}

function baiduGet(path) {
  const response=host.request({url:driveRules.baidu.webBase+path,headers:driveRules.baidu.headers});
  if(response.status===401 || response.status===403)throw new Error('NORI_AUTH_REQUIRED');
  const result=JSON.parse(response.body);
  if([-6,-9,111,112].includes(result.errno))throw new Error('NORI_AUTH_REQUIRED');
  if(result.errno!==0)throw new Error('Baidu request failed');
  return result;
}
function baiduList(input) {
  const page=Number(input.cursor||'1');
  const folder=input.folder?.startsWith('{')?JSON.parse(input.folder).path:(input.folder||'/');
  const result=baiduGet(driveRules.baidu.routes.list+'?web=1&app_id='+driveRules.baidu.appID+'&order=name&desc=0&num=100&page='+page+'&dir='+encodeURIComponent(folder));
  const list=result.list||[];
  return {files:list.map(f=>({id:JSON.stringify({id:f.fs_id,path:f.path}),name:f.server_filename,isDirectory:f.isdir===1,size:f.size||null})),
    cursor:list.length===100?String(page+1):null};
}
function base64Binary(text) {
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';let out='';
  for(let i=0;i<text.length;i+=3){
    const a=text.charCodeAt(i)&255,b=text.charCodeAt(i+1)&255,c=text.charCodeAt(i+2)&255;
    out+=alphabet[a>>2]+alphabet[((a&3)<<4)|(b>>4)]+(i+1<text.length?alphabet[((b&15)<<2)|(c>>6)]:'=')+(i+2<text.length?alphabet[c&63]:'=');
  }
  return out;
}
function baiduResolve(input) {
  const file=JSON.parse(input.file.id);
  const fields=encodeURIComponent(JSON.stringify(['sign1','sign2','sign3','timestamp']));
  const result=baiduGet(driveRules.baidu.routes.variables+'?web=1&app_id='+driveRules.baidu.appID+'&fields='+fields).result;
  if(!result || typeof result.sign2!=='string')throw new Error('Missing download signature');
  // The provider supplies this signer to its own web client. It runs in this bounded VM.
  const signer=Function('"use strict"; return ('+result.sign2+');')();
  if(typeof signer!=='function')throw new Error('Invalid download signature');
  const sign=base64Binary(signer(result.sign3,result.sign1));
  const download=baiduGet(driveRules.baidu.routes.download+'?type=dlink&web=1&app_id='+driveRules.baidu.appID+'&fidlist='+encodeURIComponent(JSON.stringify([file.id]))
    +'&sign='+encodeURIComponent(sign)+'&timestamp='+encodeURIComponent(result.timestamp));
  const url=download.dlink?.[0]?.dlink;
  if(!url)throw new Error('File download unavailable');
  return {url,headers:driveRules.baidu.downloadHeaders};
}

// Sharing and account-file access are separate provider operations.
function queryString(values) {
  return Object.keys(values).filter(k=>values[k]!==null && values[k]!==undefined).map(k=>encodeURIComponent(k)+'='+encodeURIComponent(values[k])).join('&');
}
function quarkAPI(path, body, stage) {
  const response=host.request({url:driveRules.quark.apiBase+path+(path.includes('?')?'&':'?')+queryString(driveRules.quark.parameters),
    method:body?'POST':'GET',headers:{...driveRules.quark.headers,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  if([401,403].includes(response.status))throw new Error('NORI_AUTH_REQUIRED');
  const result=JSON.parse(response.body);
  if([31001,32001].includes(result.code))throw new Error('NORI_AUTH_REQUIRED');
  if(result.code!==0) {
    const message=result.message||'';
    if(/captcha|验证/i.test(message))throw new Error('NORI_VERIFICATION_REQUIRED');
    if((stage==='code'||stage==='needCode') && /提取|密码|passcode/i.test(message))throw new Error(stage==='needCode'?'NORI_CODE_REQUIRED':'NORI_CODE_INVALID');
    throw new Error(['share','code','needCode'].includes(stage)?'NORI_SHARE_UNAVAILABLE':'NORI_TRANSFER_FAILED');
  }
  return result;
}
function ownQuarkFile(f) {return {id:String(f.fid),name:f.file_name,isDirectory:!f.file,size:f.size||null};}
function ownBaiduFile(f) {return {id:JSON.stringify({id:f.fs_id,path:f.path}),name:f.server_filename,isDirectory:f.isdir===1,size:f.size||null};}
function quarkShareList(input) {
  let ctx=input.context?JSON.parse(input.context):null;
  const pwdID=input.share.url.split('/s/')[1];
  if(!ctx || ctx.pwdID!==pwdID) {
    const result=quarkAPI(driveRules.quark.routes.shareToken,{pwd_id:pwdID,passcode:input.share.accessCode||''},input.share.accessCode?'code':'needCode');
    if(!result.data?.stoken)throw new Error(input.share.accessCode?'NORI_CODE_INVALID':'NORI_CODE_REQUIRED');
    ctx={pwdID,stoken:result.data.stoken,tokens:{}};
  }
  const page=Number(input.cursor||1);
  const result=quarkAPI(driveRules.quark.routes.shareDetail+'?'+queryString({pwd_id:ctx.pwdID,stoken:ctx.stoken,pdir_fid:input.folder||'0',
    _page:page,_size:100,_fetch_total:1,_fetch_share:0,force:0,_sort:'file_type:asc,file_name:asc'}),null,'share');
  if(!Array.isArray(result.data?.list))throw new Error('NORI_SHARE_UNAVAILABLE');
  const files=result.data.list.map(f=>{ctx.tokens[String(f.fid)]=f.share_fid_token;return ownQuarkFile(f);});
  return {files,cursor:page*100<(result.metadata?._total||0)?String(page+1):null,context:JSON.stringify(ctx)};
}
function baiduShareRequest(path,body) {
  const response=host.request({url:driveRules.baidu.webBase+path,method:body?'POST':'GET',
    headers:driveRules.baidu.shareHeaders,
    body:body?queryString(body):undefined});
  if([401,403].includes(response.status))throw new Error('NORI_AUTH_REQUIRED');
  const result=JSON.parse(response.body);
  if(result.errno===-6)throw new Error('NORI_AUTH_REQUIRED');
  if([4,20,62].includes(result.errno))throw new Error('NORI_VERIFICATION_REQUIRED');
  return result;
}
function baiduShareList(input) {
  let ctx=input.context?JSON.parse(input.context):null;
  const surl=input.share.url.split('/s/1')[1];
  if(!ctx || ctx.surl!==surl) {
    let response=host.get(input.share.url), sekey='';
    if(input.share.accessCode) {
      const verified=baiduShareRequest(driveRules.baidu.routes.verify+'?'+queryString({surl,channel:'chunlei',clienttype:0,web:1,app_id:driveRules.baidu.appID}),
        {pwd:input.share.accessCode,vcode:'',vcode_str:''});
      if(verified.errno===-9)throw new Error('NORI_CODE_INVALID');
      if(verified.errno!==0 || !verified.randsk)throw new Error('NORI_SHARE_UNAVAILABLE');
      sekey=decodeURIComponent(verified.randsk);
      response=host.get(input.share.url);
    }
    const shareID=response.body.match(/["']?shareid["']?\s*[:=]\s*["']?(\d+)/i);
    const uk=response.body.match(/["']?(?:share_uk|shareuk)["']?\s*[:=]\s*["']?(\d+)/i);
    if(!shareID || !uk) {
      if(!input.share.accessCode && /提取码|access-code|share\/init/.test(response.body+response.url))throw new Error('NORI_CODE_REQUIRED');
      throw new Error('NORI_SHARE_UNAVAILABLE');
    }
    ctx={surl,shareID:shareID[1],uk:uk[1],sekey};
  }
  const page=Number(input.cursor||1),folder=input.folder?JSON.parse(input.folder).path:null;
  const result=baiduShareRequest(driveRules.baidu.routes.shareList+'?'+queryString({shareid:ctx.shareID,uk:ctx.uk,sekey:ctx.sekey,type:0,root:folder?0:1,
    dir:folder,page,num:100,order:'name',desc:0,channel:'chunlei',web:1,clienttype:0,app_id:driveRules.baidu.appID}));
  if(result.errno===-9)throw new Error(input.share.accessCode?'NORI_CODE_INVALID':'NORI_CODE_REQUIRED');
  if(result.errno!==0 || !Array.isArray(result.list))throw new Error('NORI_SHARE_UNAVAILABLE');
  return {files:result.list.map(ownBaiduFile),cursor:result.list.length===100?String(page+1):null,context:JSON.stringify(ctx)};
}
function driveShareList(input) {
  if(input.providerID==='quark')return quarkShareList(input);
  if(input.providerID==='baidu')return baiduShareList(input);
  throw new Error('Unsupported share provider');
}
function completed(file) {return {status:'completed',file,taskID:null};}
function pending(job) {return {status:'pending',file:null,taskID:JSON.stringify(job)};}
function quarkTransfer(input) {
  const ctx=JSON.parse(input.context),path='/随阅/'+input.destinationKey;
  const found=quarkAPI(driveRules.quark.routes.pathInfo,{file_path:[path],namespace:'0'});
  let folder=found.data?.[0]?.fid;
  if(!folder)folder=quarkAPI(driveRules.quark.routes.create,{pdir_fid:'0',file_name:'',dir_path:path,dir_init_lock:false}).data?.fid;
  if(!folder)throw new Error('NORI_TRANSFER_FAILED');
  const existing=quarkAPI(driveRules.quark.routes.list+'?'+queryString({pdir_fid:folder,_page:1,_size:100,_sort:'file_name:asc'})).data?.list||[];
  const cached=existing.find(f=>f.file && f.file_name===input.file.name && (!input.file.size || Number(f.size)===input.file.size));
  if(cached)return completed(ownQuarkFile(cached));
  const token=ctx.tokens[input.file.id];
  if(!token)throw new Error('NORI_SHARE_UNAVAILABLE');
  const result=quarkAPI(driveRules.quark.routes.save,{fid_list:[input.file.id],fid_token_list:[token],to_pdir_fid:String(folder),
    pwd_id:ctx.pwdID,stoken:ctx.stoken,pdir_fid:'0',scene:'link'});
  if(!result.data?.task_id)throw new Error('NORI_TRANSFER_FAILED');
  return pending({providerID:'quark',id:result.data.task_id,name:input.file.name,size:input.file.size});
}
function baiduToken() {
  const fields=encodeURIComponent(JSON.stringify(['bdstoken']));
  const result=baiduGet(driveRules.baidu.routes.variables+'?web=1&app_id='+driveRules.baidu.appID+'&fields='+fields);
  if(!result.result?.bdstoken)throw new Error('NORI_AUTH_REQUIRED');
  return result.result.bdstoken;
}
function baiduEnsureFolder(parent,name,token) {
  const existing=baiduGet(driveRules.baidu.routes.list+'?'+queryString({dir:parent,num:100,page:1,order:'name',web:1,app_id:driveRules.baidu.appID})).list||[];
  const folder=existing.find(f=>f.isdir===1 && f.server_filename===name);
  if(folder)return folder.path;
  const path=parent.replace(/\/$/,'')+'/'+name;
  const result=baiduShareRequest(driveRules.baidu.routes.create+'?'+queryString({a:'commit',web:1,app_id:driveRules.baidu.appID,bdstoken:token}),
    {path,isdir:1,block_list:'[]',rtype:0});
  if(result.errno!==0 && result.errno!==-8)throw new Error('NORI_TRANSFER_FAILED');
  return path;
}
function baiduTransfer(input) {
  const ctx=JSON.parse(input.context), token=baiduToken();
  const root=baiduEnsureFolder('/','随阅',token),folder=baiduEnsureFolder(root,input.destinationKey,token);
  const existing=baiduGet(driveRules.baidu.routes.list+'?'+queryString({dir:folder,num:100,page:1,web:1,app_id:driveRules.baidu.appID})).list||[];
  const cached=existing.find(f=>f.isdir===0 && f.server_filename===input.file.name && (!input.file.size || Number(f.size)===input.file.size));
  if(cached)return completed(ownBaiduFile(cached));
  const file=JSON.parse(input.file.id);
  const result=baiduShareRequest(driveRules.baidu.routes.transfer+'?'+queryString({shareid:ctx.shareID,from:ctx.uk,sekey:ctx.sekey,bdstoken:token,
    channel:'chunlei',clienttype:0,web:1,app_id:driveRules.baidu.appID}),{path:folder,async:2,fsidlist:JSON.stringify([file.id]),type:0,ondup:'fail'});
  if(result.errno!==0)throw new Error('NORI_TRANSFER_FAILED');
  return pending({providerID:'baidu',id:result.taskid||null,folder,name:input.file.name,size:input.file.size});
}
function driveTransfer(input) {
  if(input.providerID==='quark')return quarkTransfer(input);
  if(input.providerID==='baidu')return baiduTransfer(input);
  throw new Error('Unsupported share provider');
}
function driveTransferStatus(input) {
  const job=JSON.parse(input.taskID);
  if(input.providerID!==job.providerID)throw new Error('NORI_TRANSFER_FAILED');
  if(job.providerID==='quark') {
    const result=quarkAPI(driveRules.quark.routes.task+'?'+queryString({task_id:job.id,retry_index:0}));
    if(result.data?.status===2) {
      const fid=result.data.save_as?.save_as_top_fids?.[0];
      if(!fid)throw new Error('NORI_TRANSFER_FAILED');
      return completed({id:String(fid),name:job.name,isDirectory:false,size:job.size});
    }
    if(result.data?.status===3 || result.data?.status===4)throw new Error('NORI_TRANSFER_FAILED');
    return pending(job);
  }
  const result=baiduGet(driveRules.baidu.routes.list+'?'+queryString({dir:job.folder,num:100,page:1,web:1,app_id:driveRules.baidu.appID}));
  const file=(result.list||[]).find(f=>f.isdir===0 && f.server_filename===job.name && (!job.size || Number(f.size)===job.size));
  return file?completed(ownBaiduFile(file)):pending(job);
}

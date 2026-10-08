const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const dir=path.join(__dirname,'../extension');
const C=require(path.join(dir,'core.js'));
const P={artist:'Artist_1',id:'1700000000000000001',url:'https://x.com/Artist_1/status/1700000000000000001'};
const attachment=(n,artist=P.artist,id=P.id)=>`<a href="/${artist}/status/${id}/photo/${n}"><img src="https://pbs.twimg.com/media/Test_${n}?format=jpg&amp;name=small"></a>`;
const IG={artist:'instagram:artist.one',id:'Abc_123',url:'https://www.instagram.com/p/Abc_123/'};
const igURL=n=>`https://scontent.test.cdninstagram.com/v/t51/${n}_large.jpg?signature=keep-me`;
const igImage=n=>`<img width="600" alt="Artwork" src="${igURL(n)}" srcset="${igURL(n).replace('large','small')} 300w, ${igURL(n)} 1080w">`;
const igFixture=(body=igImage(1),date='2026-10-08T12:00:00Z',author='artist.one')=>`<main><article><header><a href="/${author}/"><img width="200" src="${igURL('avatar')}">${author}</a></header><div id="slides">${body}</div><a href="/p/${IG.id}/"><time datetime="${date}"></time></a><a href="/commenter/"><img width="200" src="${igURL('comment')}"></a></article><article>${igImage('suggestion')}</article><button aria-label="Next" id="outside">Other post</button></main>`;
const fixture=()=>`<main><article><a href="/${P.artist}/status/${P.id}"><time>date</time></a>${[1,2,3,4].map(n=>attachment(n)).join('')}${attachment(5,'OtherArtist')}<img src="https://pbs.twimg.com/profile_images/abc.jpg"></article><article>${attachment(6,P.artist,'1700000000000000002')}</article></main>`;

test('extracts all four source attachments, excluding avatars, quotes and other posts',()=>{
  const doc=new JSDOM(fixture()).window.document;
  const rows=C.postMedia(doc,P);
  assert.equal(rows.length,4);
  assert(rows.every(r=>new URL(r.url).searchParams.get('name')==='orig'));
  assert.equal(C.galleryPosts(doc,P.artist).length,2);
});
test('only accepts artist media pages and trusted original-image URLs',()=>{
  assert.equal(C.pageArtist('https://x.com/Artist_1/media?filter=photo'),'Artist_1');
  assert.equal(C.pageArtist('https://x.com/home'),null);
  assert.equal(C.pageArtist('https://x.com/Artist_1/likes'),null);
  assert.equal(C.pageArtist('https://evil.test/Artist_1/media'),null);
  assert.equal(C.media('https://pbs.twimg.com.evil.test/media/A?format=jpg',P),null);
  assert.equal(C.media('https://pbs.twimg.com/media/A?format=html',P),null);
  assert.throws(()=>C.filename({...P,postId:P.id,mediaId:'../escape',ext:'jpg'}));
  assert(C.filename(C.media('https://pbs.twimg.com/media/A?format=png&name=small',P)).startsWith('to be deleted folder/Artist_1/'));
});

function event(){const listeners=[];return {listeners,addListener:f=>listeners.push(f)};}
function harness(seed){
  let stored=structuredClone(seed?.stored||{}),nextTab=100,nextDownload=1;
  const tabs=new Map(seed?.tabs||[[1,{id:1,url:'https://x.com/Artist_1/media'}]]);
  const downloads=new Map(seed?.downloads||[]),calls=[];
  const chrome={
    storage:{local:{get:async()=>structuredClone(stored),set:async v=>{stored=structuredClone(v);}}},
    runtime:{onMessage:event(),onInstalled:event(),onStartup:event()},
    tabs:{onRemoved:event(),get:async id=>{if(!tabs.has(id))throw Error('missing');return tabs.get(id);},
      create:async opts=>{if(seed?.owl && opts.active !== true)throw Error('Owl extension-created tabs must be active.');if(seed?.owl && !opts.url.startsWith('https://x.com/'))throw Error('Owl requires public HTTPS source');const t={...opts,id:nextTab++};tabs.set(t.id,t);return t;},
      update:async(id,opts)=>{Object.assign(tabs.get(id),opts);return tabs.get(id);},
      remove:async id=>{tabs.delete(id);},sendMessage:async()=>({ok:true})},
    downloads:{onChanged:event(),download:async opts=>{const id=nextDownload++;calls.push(opts);downloads.set(id,{...opts,id,state:'in_progress'});return id;},
      search:async({id})=>downloads.has(id)?[downloads.get(id)]:[]},
    alarms:{onAlarm:event(),create:async()=>{}}
  };
  const ctx=vm.createContext({chrome,console,URL,Date,Set,Map,Promise,BigInt,AbortSignal,fetch:seed?.fetch,setTimeout:fn=>setImmediate(fn)});ctx.self=ctx;
  ctx.importScripts=(...names)=>names.forEach(n=>vm.runInContext(n==='exclusions.js'?'const ArtExclusions={media:[],posts:[]};':fs.readFileSync(path.join(dir,n),'utf8'),ctx));
  vm.runInContext(fs.readFileSync(path.join(dir,'background.js'),'utf8'),ctx);
  if(seed?.folder)ctx.ArtFolder=seed.folder;
  const message=(m,tabId,tabUrl)=>new Promise(resolve=>chrome.runtime.onMessage.listeners[0]({...m,runId:m.runId === undefined ? stored.state?.runId : m.runId},tabId?{tab:{id:tabId,url:tabUrl}}:{},resolve));
  const change=async(id,state,error)=>{Object.assign(downloads.get(id),{state,error});await chrome.downloads.onChanged.listeners[0]({id,state:{current:state},error:{current:error}});};
  return {message,change,chrome,calls,downloads,tabs,stored:()=>structuredClone(stored)};
}
async function queuePost(h){
  assert.equal((await h.message({type:'START',tabId:1})).active,true);
  await h.message({type:'FOUND',posts:[P,P,{url:'https://x.com/Other/status/1700000000000000003'}]},1);
  const worker=h.stored().state.workerTab;
  assert.equal((await h.message({type:'ASSIGNMENT'},worker)).post.id,P.id);
  assert.equal((await h.message({type:'ASSIGNMENT'},1)).post,undefined);
  return worker;
}
test('queue downloads all post pages, limits concurrency, and counts completion only after browser confirmation',async()=>{
  const h=harness();const worker=await queuePost(h);
  const rows=C.postMedia(new JSDOM(fixture()).window.document,P);
  await h.message({type:'POST_RESULT',id:P.id,images:rows},worker);
  assert.equal(h.calls.length,2);
  assert.equal((await h.message({type:'STATUS'})).done,0);
  await h.change(1,'complete');assert.equal(h.calls.length,3);
  await h.change(2,'complete');assert.equal(h.calls.length,4);
  await h.change(3,'complete');await h.change(4,'complete');
  await h.message({type:'SCAN_END',reason:'no_more_loaded'},1);
  const s=await h.message({type:'STATUS'});assert.equal(s.done,4);assert.equal(s.active,false);assert.equal(s.posts,1);
  await h.message({type:'START',tabId:1});await h.message({type:'FOUND',posts:[P]},1);
  assert.equal(h.calls.length,4,'completed media must not be downloaded twice');
});
test('stop leaves pending audits resumable and refuses unrelated tab messages',async()=>{
  const h=harness();await queuePost(h);
  assert.equal((await h.message({type:'FOUND',posts:[P]},999)).active,false);
  await h.message({type:'STOP'});
  const st=h.stored().state;assert.equal(st.active,false);assert.equal(st.workerTab,null);
  assert.equal(Object.values(st.posts)[0].status,'pending');
  await h.message({type:'START',tabId:1});assert.notEqual(h.stored().state.workerTab,null);
});
test('network failures retry at most three attempts and remain visible',async()=>{
  const h=harness();const worker=await queuePost(h);
  await h.message({type:'POST_RESULT',id:P.id,images:[C.media('https://pbs.twimg.com/media/A?format=jpg&name=small',P)]},worker);
  await h.change(1,'interrupted','NETWORK_FAILED');
  await h.change(2,'interrupted','NETWORK_FAILED');
  await h.change(3,'interrupted','NETWORK_FAILED');
  assert.equal(h.calls.length,3);assert.equal((await h.message({type:'STATUS'})).errors,1);
});
test('service worker restart recovers browser-completed downloads from durable state',async()=>{
  const h=harness();const worker=await queuePost(h);
  await h.message({type:'POST_RESULT',id:P.id,images:[C.media('https://pbs.twimg.com/media/A?format=png',P)]},worker);
  h.downloads.get(1).state='complete';
  const reboot=harness({stored:h.stored(),tabs:[...h.tabs],downloads:[...h.downloads]});
  assert.equal((await reboot.message({type:'STATUS'})).done,1);
  assert.equal(reboot.calls.length,0);
});
test('stale scan messages cannot finish a newer run and source-page reload can recover its assignment',async()=>{
  const h=harness();await h.message({type:'START',tabId:1});
  const old=h.stored().state.runId;
  await h.message({type:'STOP'});await h.message({type:'START',tabId:1});
  assert.notEqual(h.stored().state.runId,old);
  await h.message({type:'SCAN_END',reason:'stopped',runId:old},1);
  assert.equal(h.stored().state.scanning,true);
  assert.equal((await h.message({type:'ASSIGNMENT'},1)).scan.runId,h.stored().state.runId);
});
test('non-image HTTP response is not counted as a completed picture',async()=>{
  const h=harness();const worker=await queuePost(h);
  await h.message({type:'POST_RESULT',id:P.id,images:[C.media('https://pbs.twimg.com/media/A?format=jpg',P)]},worker);
  h.downloads.get(1).mime='text/html';await h.change(1,'complete');
  const s=await h.message({type:'STATUS'});assert.equal(s.done,0);assert.equal(s.errors,1);
});
test('popup renders progress and allows start/stop without an external service',async()=>{
  const dom=new JSDOM(fs.readFileSync(path.join(dir,'popup.html'),'utf8'),{runScripts:'outside-only',url:'chrome-extension://test/popup.html'});
  dom.window.setInterval=()=>0;
  for(const script of [path.join(__dirname,'preview-mock.js'),path.join(dir,'core.js'),path.join(dir,'popup.js')])dom.window.eval(fs.readFileSync(script,'utf8'));
  await new Promise(setImmediate);
  const doc=dom.window.document;
  assert.equal(doc.getElementById('done').textContent,'64');
  assert.equal(doc.getElementById('start').disabled,false);
  doc.getElementById('start').click();await new Promise(setImmediate);
  assert.equal(doc.getElementById('stop').disabled,false);
  doc.getElementById('stop').click();await new Promise(setImmediate);
  assert.equal(doc.getElementById('start').disabled,false);dom.window.close();
});
test('content post inspector waits for stable rendered attachment list and reports all pages',async()=>{
  const dom=new JSDOM(fixture().replace('<main>','<main><div role="progressbar" style="visibility:hidden"></div>'),{url:P.url,runScripts:'outside-only'});
  const messages=[];let done;
  const finished=new Promise(resolve=>done=resolve);
  dom.window.setTimeout=(fn)=>setImmediate(fn);
  dom.window.chrome={runtime:{onMessage:event(),sendMessage:async m=>{
    messages.push(m);if(m.type==='ASSIGNMENT')return {post:P};if(m.type==='POST_RESULT'){done(m);return {ok:true};}return {};
  }}};
  dom.window.eval(fs.readFileSync(path.join(dir,'core.js'),'utf8'));
  dom.window.eval(fs.readFileSync(path.join(dir,'content.js'),'utf8'));
  const result=await finished;assert.equal(result.images.length,4);assert(messages.filter(m=>m.type==='ASSIGNMENT').length>=3);dom.window.close();
});
test('scanner retains discovered posts across virtualized DOM replacements and stops on no new results',async()=>{
  const dom=new JSDOM(`<main>${attachment(1)}</main>`,{url:'https://x.com/Artist_1/media',runScripts:'outside-only'});
  const messages=[];let done,scrolls=0;
  const finished=new Promise(resolve=>done=resolve);
  dom.window.setTimeout=fn=>setImmediate(fn);
  dom.window.scrollBy=()=>{if(scrolls++===0)dom.window.document.querySelector('main').innerHTML=attachment(2,P.artist,'1700000000000000002');};
  const onMessage=event();
  dom.window.chrome={runtime:{onMessage,sendMessage:async m=>{messages.push(m);if(m.type==='FOUND')return {active:true};if(m.type==='SCAN_END')done(m);return {};}}};
  dom.window.eval(fs.readFileSync(path.join(dir,'core.js'),'utf8'));
  dom.window.eval(fs.readFileSync(path.join(dir,'content.js'),'utf8'));
  onMessage.listeners[0]({type:'START_SCAN',artist:P.artist},{},()=>{});
  const end=await finished;
  assert.equal(end.reason,'no_more_loaded');
  assert.equal(messages.filter(m=>m.type==='FOUND').flatMap(m=>m.posts).length,2);
  dom.window.close();
});


test('revoked folder permission rejects start and retry before scanning or opening posts',async()=>{
  let granted=true,fetches=0;
  const h=harness({folder:{directory:async()=>({name:'Drawing',queryPermission:async()=>granted?'granted':'prompt'}),write:async()=>{}},fetch:async()=>{fetches++;throw Error('must not fetch');}});
  await h.message({type:'SET_FOLDER'});granted=false;
  const result=await h.message({type:'START',tabId:1,options:{maxImages:10}});
  assert.match(result.error,/資料夾/);assert.equal(h.stored().state.active,false);
  assert.equal(h.stored().state.scanning,false);assert.equal(h.stored().state.workerTab,null);
  assert.match((await h.message({type:'RETRY'})).error,/資料夾/);assert.equal(fetches,0);
});

test('folder write failure stops scanning and preserves remaining queued posts',async()=>{
  const h=harness({folder:{directory:async()=>({name:'Drawing',queryPermission:async()=> 'granted'}),write:async()=>{throw Error('Permission revoked');}},fetch:async url=>({ok:true,url,headers:{get:()=> 'image/jpeg'},blob:async()=>({size:123})})});
  await h.message({type:'SET_FOLDER'});await h.message({type:'START',tabId:1,options:{maxImages:10}});
  const second={...P,id:'1700000000000000002',url:'https://x.com/Artist_1/status/1700000000000000002'};
  await h.message({type:'FOUND',posts:[P,second]},1);
  await h.message({type:'POST_RESULT',id:P.id,images:[C.media('https://pbs.twimg.com/media/A?format=jpg',P)]},h.stored().state.workerTab);
  const s=await h.message({type:'STATUS'});
  assert.equal(s.active,false);assert.equal(s.scanning,false);assert.equal(s.runDone,0);
  assert.equal(h.stored().state.workerTab,null);assert.equal(s.postPending,1);
});

test('cap reserves pending images and in-flight downloads before opening additional posts',async()=>{
  const h=harness();await h.message({type:'START',tabId:1,options:{maxImages:2}});
  const second={...P,id:'1700000000000000002',url:'https://x.com/Artist_1/status/1700000000000000002'};
  const found=await h.message({type:'FOUND',posts:[P,second]},1);
  assert.equal(found.wait,true,'scanner should wait while known posts are being read');
  await h.message({type:'POST_RESULT',id:P.id,images:C.postMedia(new JSDOM(fixture()).window.document,P)},h.stored().state.workerTab);
  assert.equal(h.stored().state.workerTab,null,'two in-flight downloads already cover cap');
  await h.change(1,'complete');assert.equal(h.stored().state.workerTab,null);
  await h.change(2,'complete');assert.equal((await h.message({type:'STATUS'})).active,false);
});

test('scanner waits for downloads without scrolling and resumes when queue drains',async()=>{
  const dom=new JSDOM(`<main>${attachment(1)}</main>`,{url:'https://x.com/Artist_1/media',runScripts:'outside-only'});
  let polls=0,scrolls=0,finish;
  const finished=new Promise(resolve=>finish=resolve);
  dom.window.setTimeout=fn=>setImmediate(fn);
  dom.window.scrollBy=()=>scrolls++;
  const onMessage=event();
  dom.window.chrome={runtime:{onMessage,sendMessage:async m=>{
    if(m.type==='FOUND'){
      polls++;
      if(polls<=3){assert.equal(scrolls,0);return {active:true,wait:true};}
      if(polls===4)return {active:true,wait:false};
      return {active:false};
    }
    if(m.type==='SCAN_END')finish();return {};
  }}};
  dom.window.eval(fs.readFileSync(path.join(dir,'core.js'),'utf8'));
  dom.window.eval(fs.readFileSync(path.join(dir,'content.js'),'utf8'));
  onMessage.listeners[0]({type:'START_SCAN',artist:P.artist},{},()=>{});
  await finished;assert.equal(scrolls,1);dom.window.close();
});

test('ten-image run with no date bounds saves exactly ten and leaves excess posts unopened',async()=>{
  const saved=[];
  const h=harness({folder:{directory:async()=>({name:'Drawing',queryPermission:async()=> 'granted'}),write:async(d,p)=>{saved.push(p);return p;}},fetch:async url=>({ok:true,url,headers:{get:()=> 'image/jpeg'},blob:async()=>({size:123})})});
  await h.message({type:'SET_FOLDER'});
  await h.message({type:'START',tabId:1,options:{maxImages:10,from:'',to:''}});
  const posts=Array.from({length:20},(_,i)=>{const id=String(BigInt(P.id)+BigInt(i));return {...P,id,url:'https://x.com/Artist_1/status/'+id};});
  await h.message({type:'FOUND',posts},1);
  let inspected=0;
  for(let i=0;i<30&&h.stored().state.active;i++){
    const st=h.stored().state;
    if(st.working){const p=st.posts[st.working];inspected++;
      await h.message({type:'POST_RESULT',id:p.id,images:Array.from({length:4},(_,n)=>C.media('https://pbs.twimg.com/media/M'+p.id+'_'+n+'?format=jpg',p))},st.workerTab);
    }
    await h.message({type:'STATUS'});
  }
  const s=await h.message({type:'STATUS'});
  assert.equal(saved.length,10);assert.equal(s.runDone,10);assert.equal(s.active,false);
  assert.equal(inspected,3);assert.equal(s.postPending,17);assert.equal(s.scanning,false);
});

test('date bounds are inclusive and blank defaults are unlimited',()=>{
  assert.deepEqual(C.options(),{from:'',to:'',maxImages:null});
  const day=C.postDate(P.id);
  assert.equal(C.inRange(P.id,{from:day,to:day}),true);
  assert.equal(C.inRange(P.id,{from:'2099-01-01'}),false);
  assert.equal(C.inRange(P.id,{to:'2010-01-01'}),false);
  assert.equal(C.inRange(P.id,{}),true);
  assert.throws(()=>C.options({from:'2026-02-30'}));
  assert.throws(()=>C.options({from:'2026-09-25',to:'2026-09-24'}));
  for(const maxImages of [0,-1,1.5,'abc'])assert.throws(()=>C.options({maxImages}));
});
test('image cap never overshoots a four-image post; old downloads do not consume the next run budget',async()=>{
  const h=harness();
  await h.message({type:'START',tabId:1,options:{maxImages:2}});
  await h.message({type:'FOUND',posts:[P]},1);
  const worker=h.stored().state.workerTab;
  await h.message({type:'POST_RESULT',id:P.id,images:C.postMedia(new JSDOM(fixture()).window.document,P)},worker);
  assert.equal(h.calls.length,2);
  await h.change(1,'complete');assert.equal(h.calls.length,2);
  await h.change(2,'complete');
  let s=await h.message({type:'STATUS'});assert.equal(s.runDone,2);assert.equal(s.active,false);assert.equal(s.scanReason,'limit_reached');
  await h.message({type:'START',tabId:1,options:{maxImages:1}});
  assert.equal(h.calls.length,3);await h.change(3,'complete');
  s=await h.message({type:'STATUS'});assert.equal(s.runDone,1);assert.equal(s.done,3);assert.equal(h.calls.length,3);
});
test('date range excludes previously queued out-of-range posts',async()=>{
  const h=harness();await queuePost(h);await h.message({type:'STOP'});
  await h.message({type:'START',tabId:1,options:{from:'2099-01-01'}});
  await h.message({type:'FOUND',posts:[P]},1);
  assert.equal(h.stored().state.workerTab,null);assert.equal(h.calls.length,0);
  assert.equal((await h.message({type:'STATUS'})).posts,0);
});

test('Owl creates post reader as an active tab instead of rejecting all audits',async()=>{
  const h=harness({owl:true});await h.message({type:'START',tabId:1});await h.message({type:'FOUND',posts:[P]},1);
  assert.notEqual(h.stored().state.workerTab,null);assert.equal((await h.message({type:'STATUS'})).errors,0);
});

test('local reload preserves progress and settings and refuses to interrupt active work',async()=>{
  const h=harness();let reloads=0;h.chrome.runtime.reload=()=>reloads++;
  await h.message({type:'START',tabId:1,options:{maxImages:2,from:'2026-09-21'}});
  assert.match((await h.message({type:'RELOAD_EXTENSION'})).error,/先停止/);
  await h.message({type:'STOP'});
  assert.equal((await h.message({type:'RELOAD_EXTENSION'})).ok,true);
  await new Promise(setImmediate);assert.equal(reloads,1);
  assert.equal(h.stored().state.options.maxImages,2);
  assert.equal(h.stored().state.options.from,'2026-09-21');
});

test('direct folder writes preserve the quantity cap and stop after confirmed file writes',async()=>{
  const saved=[];
  const h=harness({folder:{directory:async()=>({name:'Drawing',queryPermission:async()=> 'granted'}),write:async(d,p,b)=>{saved.push(p);return p;}},fetch:async url=>({ok:true,url,headers:{get:()=> 'image/jpeg'},blob:async()=>({size:123})})});
  assert((await h.message({type:'SET_FOLDER'},1)).error,'website cannot choose extension storage');
  assert.equal((await h.message({type:'SET_FOLDER'})).ok,true);
  await h.message({type:'START',tabId:1,options:{maxImages:2}});
  await h.message({type:'FOUND',posts:[P]},1);
  await h.message({type:'POST_RESULT',id:P.id,images:C.postMedia(new JSDOM(fixture()).window.document,P)},h.stored().state.workerTab);
  const s=await h.message({type:'STATUS'});
  assert.equal(saved.length,2);assert.equal(s.runDone,2);assert.equal(s.active,false);
  assert.equal(h.calls.length,0);assert(saved.every(p=>p.startsWith('to be deleted folder/Artist_1/')));
});

test('failed direct writes and non-image responses are never counted as completed files',async()=>{
  let writes=0;
  const h=harness({folder:{directory:async()=>({name:'Drawing',queryPermission:async()=> 'granted'}),write:async()=>{writes++;throw Error('Disk full');}},fetch:async url=>({ok:true,url,headers:{get:()=> 'image/jpeg'},blob:async()=>({size:123})})});
  await h.message({type:'SET_FOLDER'});const worker=await queuePost(h);
  await h.message({type:'POST_RESULT',id:P.id,images:[C.media('https://pbs.twimg.com/media/A?format=jpg',P)]},worker);
  const s=await h.message({type:'STATUS'});assert.equal(s.done,0);assert.equal(s.errors,1);assert.equal(writes,1);
  const bad=harness({folder:{directory:async()=>({name:'Drawing',queryPermission:async()=> 'granted'}),write:async()=>{throw Error('must not write');}},fetch:async url=>({ok:true,url,headers:{get:()=> 'text/html'}})});
  await bad.message({type:'SET_FOLDER'});const w=await queuePost(bad);
  await bad.message({type:'POST_RESULT',id:P.id,images:[C.media('https://pbs.twimg.com/media/A?format=jpg',P)]},w);
  assert.match((await bad.message({type:'STATUS'})).recentErrors[0],/未回傳圖片/);
});

test('a failed reader lookup preserves the live job until its bounded timeout',async()=>{
  const h=harness();const worker=await queuePost(h);
  const get=h.chrome.tabs.get;
  h.chrome.tabs.get=async id=>{if(id===worker)throw Error('lookup temporarily unavailable');return get(id);};
  const s=await h.message({type:'STATUS'});
  assert.equal(s.errors,0);assert.equal(s.postPending,1);
  assert(s.diagnostics.some(d=>d.event==='reader_lookup_failed'));
  const rows=C.postMedia(new JSDOM(fixture()).window.document,P);
  await h.message({type:'POST_RESULT',id:P.id,images:rows},worker);
  assert.equal(h.calls.length,2);
});

test('reader reconnects only through a browser-reported URL matching the current original post',async()=>{
  const h=harness();const created=await queuePost(h);
  assert.equal((await h.message({type:'ASSIGNMENT'},999,'https://x.com/Other/status/'+P.id)).post,undefined);
  assert.equal(h.stored().state.workerTab,created);
  const job=await h.message({type:'ASSIGNMENT'},998,P.url);
  assert.equal(job.post.id,P.id);assert.equal(h.stored().state.workerTab,998);
  assert.equal((await h.message({type:'ASSIGNMENT'},998,P.url)).post.id,P.id);
  await h.message({type:'POST_RESULT',id:P.id,images:C.postMedia(new JSDOM(fixture()).window.document,P)},998);
  assert.equal(h.calls.length,2);
});

test('a missing reader eventually times out and retains the actual lookup error',async()=>{
  const h=harness();await queuePost(h);
  const stored=h.stored();stored.state.posts[P.artist.toLowerCase()+'/'+P.id].started=Date.now()-61000;
  delete stored.state.posts[P.artist.toLowerCase()+'/'+P.id].lastSeen;
  const reboot=harness({stored});
  const s=await reboot.message({type:'STATUS'});
  assert.equal(s.errors,1);assert.match(s.recentErrors[0],/讀取逾時：missing/);
});

test('embedded X control panel starts the real message workflow with quantity and date options',async()=>{
  const dom=new JSDOM('<main></main>',{url:'https://x.com/Artist_1/media',runScripts:'outside-only'});
  dom.window.setInterval=()=>0;
  const sent=[];
  dom.window.chrome={runtime:{getURL:p=>'https://extension.test/'+p,sendMessage:async m=>{
    sent.push(m);
    if(m.type==='CONTEXT')return {tabId:1,artist:P.artist};
    return {active:false,artist:P.artist,posts:0,images:0,done:0,pending:0,postPending:0,errors:0,recentErrors:[],note:'ready'};
  }}};
  dom.window.fetch=async url=>({ok:true,text:async()=>fs.readFileSync(path.join(dir,new URL(url).pathname),'utf8')});
  for(const name of ['core.js','popup.js','panel.js'])dom.window.eval(fs.readFileSync(path.join(dir,name),'utf8'));
  const root=dom.window.document.getElementById('x-art-download-controls').shadowRoot;
  root.querySelector('button').click();await new Promise(setImmediate);
  assert(root.getElementById('limit'));
  root.getElementById('limit').value='1';root.getElementById('from').value='2024-01-01';
  root.getElementById('start').click();await new Promise(setImmediate);
  const start=sent.find(m=>m.type==='START');assert.equal(start.tabId,1);assert.equal(start.options.maxImages,1);assert.equal(start.options.from,'2024-01-01');
  dom.window.close();
});

test('Instagram profile and post routing excludes reels, reserved pages and cross-site links',()=>{
  assert.equal(C.pageArtist('https://www.instagram.com/Artist.One/?hl=en'),IG.artist);
  assert.equal(C.pageArtist('https://instagram.com/artist_1/'),'instagram:artist_1');
  for(const url of ['https://www.instagram.com/explore/','https://www.instagram.com/accounts/','https://www.instagram.com/artist.one/reels/','https://instagram.com.evil.test/artist.one/','http://instagram.com/artist.one/'])assert.equal(C.pageArtist(url),null);
  assert.equal(C.postLink('/artist.one/p/Abc_123/',IG.artist).id,IG.id);
  assert.equal(C.postLink('/other/p/Abc_123/',IG.artist),null);
  assert.equal(C.postLink('/reel/Abc_123/',IG.artist),null);
  assert.equal(C.postLink('https://evil.test/p/Abc_123/',IG.artist),null);
  const doc=new JSDOM('<main><a href="/p/Abc_123/"><img></a><a href="/p/Abc_123/"><img></a><a href="/reel/Video/"><img></a></main>').window.document;
  assert.equal(C.galleryPosts(doc,IG.artist).length,1);
});

test('Instagram largest supplied image keeps signatures and excludes avatars and recommendations',()=>{
  const doc=new JSDOM(igFixture()).window.document;
  const details=C.instagramDetails(doc,IG);
  assert.equal(details.images.length,1);assert.equal(details.images[0].url,igURL(1));
  assert.equal(details.next,undefined,'must not click navigation outside the source article');
  assert.equal(details.date,'2026-10-08');
  assert.equal(C.instagramDetails(new JSDOM(igFixture(undefined,undefined,'someone.else')).window.document,IG),null);
  for(const url of ['https://cdninstagram.com.evil.test/a.jpg','https://evilfbcdn.net/a.jpg','https://pbs.twimg.com/media/A?format=jpg','http://cdninstagram.com/a.jpg','https://cdninstagram.com:123/a.jpg'])assert.equal(C.media(url,IG),null);
  const saved=C.filename(details.images[0]);assert.match(saved,/^to be deleted folder\/Instagram\/artist.one\/2026-10-08_Abc_123_/);
  assert.throws(()=>C.filename({...details.images[0],artist:'instagram:../oops'}));
  assert.notEqual(C.media(igURL(1),{...IG,artist:'instagram:artist_1'}).key,C.media('https://pbs.twimg.com/media/1_large?format=jpg',P).key);
});

test('Instagram current div-based desktop layout finds exact post and excludes role-link avatars',()=>{
  const html=`<main><div><div>${igImage(1)}<button aria-label="下一步"></button></div><div><span role="link"><img width="150" src="${igURL('avatar')}"></span><a href="/artist.one/">artist.one</a><time datetime="2026-10-09T12:00:00Z"></time><a href="/p/Abc_123/c/123/"><time datetime="2026-10-09T12:00:00Z"></time></a><a href="/artist.one/p/Abc_123/"><time datetime="2026-10-08T12:00:00Z"></time></a></div></div><div><a href="/artist.one/p/Other/">${igImage('recommendation')}</a></div></main>`;
  const details=C.instagramDetails(new JSDOM(html).window.document,IG);
  assert.equal(details.images.length,1);assert.equal(details.date,'2026-10-08');assert(details.next);
});

async function igInspect(html,onDOM=()=>{}) {
  const dom=new JSDOM(html,{url:IG.url,runScripts:'outside-only'}),messages=[];
  let resolve;const finished=new Promise(r=>resolve=r);
  dom.window.chrome={runtime:{onMessage:event(),sendMessage:async m=>{
    messages.push(m);if(m.type==='ASSIGNMENT')return {post:IG};
    if(m.type==='POST_RESULT')resolve(m);return {};
  }}};
  dom.window.setTimeout=fn=>setImmediate(fn);
  onDOM(dom.window.document);
  for(const file of ['core.js','content.js'])dom.window.eval(fs.readFileSync(path.join(dir,file),'utf8'));
  try{return await finished;}finally{dom.window.close();}
}

test('Instagram inspector advances an image/video/image carousel and excludes video posters',async()=>{
  let clicks=0;
  const result=await igInspect(igFixture(`${igImage(1)}<button aria-label="Next" id="next"></button>`),doc=>{
    const slides=doc.getElementById('slides');
    const next=doc.getElementById('next');
    next.onclick=()=>{
      clicks++;
      slides.innerHTML=clicks===1?`<video src="https://video.example/clip.mp4"></video><img width="600" src="${igURL('poster')}">`:igImage(3);
      if(clicks<2)slides.append(next);
    };
    doc.getElementById('outside').onclick=()=>{throw Error('unrelated navigation');};
  });
  assert.equal(result.error,undefined);assert.equal(clicks,2);assert.equal(result.images.length,2);
  assert(result.images.every(m=>!m.mediaId.includes('poster')));
});

test('Instagram carousel that fails to advance reports an error rather than partial completion',async()=>{
  const result=await igInspect(igFixture(`${igImage(1)}<button aria-label="下一張"></button>`));
  assert.match(result.error,/待重試/);assert.equal(result.images,undefined);
});

async function igQueue(options={}) {
  const h=harness({tabs:[[1,{id:1,url:'https://www.instagram.com/artist.one/'}]]});
  assert.equal((await h.message({type:'START',tabId:1,options})).active,true);
  await h.message({type:'FOUND',posts:[IG]},1);
  return h;
}
test('Instagram unknown post dates are inspected, inclusive dates govern downloads, missing dates fail closed',async()=>{
  for(const date of ['2026-10-07','2026-10-08','2026-10-09','']) {
    const h=await igQueue({from:'2026-10-08',to:'2026-10-08'});
    assert.notEqual(h.stored().state.workerTab,null);
    await h.message({type:'POST_RESULT',id:IG.id,date,images:[C.media(igURL(1),IG)]},h.stored().state.workerTab);
    assert.equal(h.calls.length,date==='2026-10-08'?1:0);
    if(!date)assert.match((await h.message({type:'STATUS'})).recentErrors[0],/日期/);
  }
});

test('Instagram quantity limit stops exactly and pending carousel images resume without duplicate downloads',async()=>{
  const h=await igQueue({maxImages:2});
  await h.message({type:'POST_RESULT',id:IG.id,date:'2026-10-08',images:[1,2,3].map(n=>C.media(igURL(n),IG))},h.stored().state.workerTab);
  assert.equal(h.calls.length,2);await h.change(1,'complete');await h.change(2,'complete');
  assert.equal((await h.message({type:'STATUS'})).active,false);
  await h.message({type:'START',tabId:1,options:{maxImages:1}});
  assert.equal(h.calls.length,3);await h.change(3,'complete');
  assert.equal((await h.message({type:'STATUS'})).done,3);
});

test('Instagram signed URL failures re-inspect the source on retry and refresh expired links',async()=>{
  const h=await igQueue({maxImages:1});
  await h.message({type:'POST_RESULT',id:IG.id,date:'2026-10-08',images:[C.media(igURL(1),IG)]},h.stored().state.workerTab);
  await h.change(1,'interrupted','SERVER_FORBIDDEN');await h.message({type:'STOP'});
  await h.message({type:'RETRY'});assert.equal(h.calls.length,1);
  const worker=h.stored().state.workerTab;assert.notEqual(worker,null);
  const fresh=igURL(1).replace('keep-me','refreshed');
  await h.message({type:'POST_RESULT',id:IG.id,date:'2026-10-08',images:[C.media(fresh,IG)]},worker);
  assert.equal(h.calls.length,2);assert.equal(h.calls[1].url,fresh);
});

test('Instagram direct folder saves verified images with the same cap',async()=>{
  const saved=[];
  const h=harness({tabs:[[1,{id:1,url:'https://www.instagram.com/artist.one/'}]],folder:{directory:async()=>({name:'Drawing',queryPermission:async()=> 'granted'}),write:async(d,p)=>{saved.push(p);return p;}},fetch:async url=>({ok:true,url,headers:{get:()=> 'image/jpeg'},blob:async()=>({size:123})})});
  await h.message({type:'SET_FOLDER'});await h.message({type:'START',tabId:1,options:{maxImages:1}});
  await h.message({type:'FOUND',posts:[IG]},1);
  await h.message({type:'POST_RESULT',id:IG.id,date:'2026-10-08',images:[1,2].map(n=>C.media(igURL(n),IG))},h.stored().state.workerTab);
  const s=await h.message({type:'STATUS'});assert.equal(s.runDone,1);assert.equal(s.active,false);
  assert.equal(saved.length,1);assert.match(saved[0],/\/Instagram\/artist.one\//);
});

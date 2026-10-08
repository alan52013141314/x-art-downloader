importScripts('core.js', 'exclusions.js', 'folder.js');
const C = ArtCore;
const excludedMedia = new Set(ArtExclusions.media || []);
const excludedPosts = new Set(ArtExclusions.posts || []);
let chain = Promise.resolve();
let state;
const empty = () => ({active:false, scanning:false, artist:null, sourceTab:null, workerTab:null,
  working:null, posts:{}, media:{}, scanReason:'', note:'開啟畫師的 X 媒體頁或 Instagram 個人頁，再按開始。'});
function serial(fn) {
  const next = chain.then(async()=>{
    state ||= (await chrome.storage.local.get('state')).state || empty();
    return fn();
  });
  chain = next.catch(()=>{});
  return next;
}
const save = () => chrome.storage.local.set({state});
function trace(event, detail) {
  state.diagnostics ||= [];
  state.diagnostics.push({time:new Date().toISOString(),event,detail});
  state.diagnostics=state.diagnostics.slice(-25);
}
const postKey = p => `${p.artist.toLowerCase()}/${p.id}`;
const eligible = p => p.artist.toLowerCase()===state.artist?.toLowerCase() && C.recordInRange(p,state.options||{});
const runDone = () => Object.values(state.media).filter(m=>m.status==='done'&&m.runId===state.runId).length;
const queuedImages = () => Object.values(state.media).filter(m=>eligible(m)&&['pending','downloading'].includes(m.status)).length;
const waitForQueue = () => !!state.options?.maxImages && (queuedImages()>0 || Object.values(state.posts).some(p=>eligible(p)&&['pending','working'].includes(p.status)));
async function folderReady() {
  if(!state.folderName)return null;
  try {
    const dir=await ArtFolder.directory();
    if(dir&&await dir.queryPermission({mode:'readwrite'})==='granted')return dir;
  } catch {}
  throw Error('請點工具列插件圖示，重新選擇儲存資料夾並授予寫入權限，再重試未完成項目。');
}
async function haltForStorage(error) {
  state.active=false;state.scanning=false;state.scanReason='storage_error';
  state.note='儲存失敗，已停止捲動及開圖：'+error;
  if(state.working&&state.posts[state.working]?.status==='working')state.posts[state.working].status='pending';
  await closeWorker();
  if(state.sourceTab!=null)await chrome.tabs.sendMessage(state.sourceTab,{type:'STOP_SCAN'}).catch(()=>{});
  await save();
}
function allowedImage(m) {
  return !excludedMedia.has(m.mediaId);
}
function allowedPost(p) {
  return !excludedPosts.has(p.id);
}
async function closeWorker() {
  const id = state.workerTab;
  state.workerTab=null; state.working=null;
  await save();
  if (id != null) await chrome.tabs.remove(id).catch(e=>trace('close_failed',e.message));
}
async function reconcile() {
  if(state.scanning) {
    const source=await chrome.tabs.get(state.sourceTab).catch(()=>null);
    if(!source || C.pageArtist(source.url)?.toLowerCase()!==state.artist.toLowerCase() || Date.now()-(state.lastScan||0)>180000) {
      state.scanning=false;state.scanReason='source_unavailable';state.note='畫師頁面已改變或停止回應；歷史收集未完成。';
    }
  }
  for (const m of Object.values(state.media).filter(m=>m.status==='downloading')) {
    const [d] = await chrome.downloads.search({id:m.downloadId});
    if (d?.state === 'complete') {
      m.status=d.mime && !d.mime.startsWith('image/')?'error':'done';
      if(m.status==='error')m.error='伺服器未回傳圖片檔案';
    }
    else if (!d || d.state === 'interrupted') {
      m.error=d?.error || '下載記錄遺失';
      m.status='error';
    }
  }
  if (state.working) {
    const p=state.posts[state.working];
    // A failed lookup is not evidence of closure. Let the page handshake or
    // onRemoved establish that, with a bounded timeout for a missing reader.
    try { await chrome.tabs.get(state.workerTab); }
    catch(e) { if(p.lookupError!==e.message){p.lookupError=e.message;trace('reader_lookup_failed',e.message);} }
    if (Date.now()-(p.lastSeen||p.started)>60000) {
      p.status='error'; p.error='原貼文讀取逾時'+(p.lookupError?'：'+p.lookupError:'');
      await closeWorker();
    }
  }
}
async function pump() {
  if (!state.active) return;
  const cap=state.options?.maxImages;
  if(cap&&runDone()>=cap) {
    state.active=false;state.scanning=false;state.scanReason='limit_reached';state.note=`已達本次 ${cap} 張上限，其餘連結已保留。`;
    if(state.working)state.posts[state.working].status='pending';
    await closeWorker();
    if(state.sourceTab!=null)await chrome.tabs.sendMessage(state.sourceTab,{type:'STOP_SCAN'}).catch(()=>{});
    await save();return;
  }
  let inFlight=Object.values(state.media).filter(m=>m.status==='downloading').length;
  let runFlight=Object.values(state.media).filter(m=>m.status==='downloading'&&m.runId===state.runId).length;
  let folderWrites=0;
  for (const m of Object.values(state.media)) {
    if (inFlight>=2 || folderWrites>=1 || (cap&&runDone()+runFlight>=cap)) break;
    if (m.status!=='pending'||!eligible(m)) continue;
    m.attempts=(m.attempts||0)+1;
    try {
      if(state.folderName){
        folderWrites++;
        const dir=await folderReady();
        const response=await fetch(m.url,{credentials:'omit',signal:AbortSignal.timeout(30000)});
        if(!response.ok)throw Error('圖片伺服器回應 '+response.status);
        if(!C.mediaHost(response.url,m.artist)||!response.headers.get('content-type')?.startsWith('image/'))throw Error('伺服器未回傳圖片檔案');
        const blob=await response.blob();if(!blob.size)throw Error('圖片檔案是空的');
        m.savedFile=await ArtFolder.write(dir,C.filename(m),blob);m.bytes=blob.size;
        m.status='done';m.runId=state.runId;
        trace('folder_saved',{file:m.savedFile,bytes:m.bytes});await save();continue;
      }
      m.downloadId=await chrome.downloads.download({url:m.url,filename:C.filename(m),saveAs:false,conflictAction:'uniquify'});
      trace('download_started',{id:m.downloadId,file:C.filename(m)});
      m.status='downloading';m.runId=state.runId; inFlight++;runFlight++;
    } catch(e) {
      m.status='error';m.error=e.message;trace('download_failed',e.message);
      if(state.folderName){await haltForStorage(e.message);return;}
    }
    await save();
  }
  if(cap&&runDone()>=cap)return pump();
  if (!state.working && !(cap&&runDone()+queuedImages()>=cap)) {
    const p=Object.values(state.posts).find(p=>p.status==='pending'&&eligible(p));
    if (p) {
      try {
        const tab=await chrome.tabs.create({url:p.url,active:true});
        state.workerTab=tab.id; state.working=postKey(p); p.status='working'; p.started=Date.now();
        delete p.lastSeen;delete p.lookupError;
        trace('reader_created',{id:tab.id,url:tab.url,post:p.id});
        await save();
      } catch(e) {p.status='error';p.error=e.message;await closeWorker();}
    }
  }
  const work=Object.values(state.posts).some(p=>eligible(p)&&['pending','working'].includes(p.status)) ||
    Object.values(state.media).some(m=>eligible(m)&&['pending','downloading'].includes(m.status));
  if (!state.scanning && !work) {
    state.active=false;
    state.note=['page_error','source_unavailable','loading_timeout','connection_lost'].includes(state.scanReason)?'來源頁面收集未完成；已找到的項目已處理，請恢復頁面後接續。':'這批已處理完畢。歷史完整度仍受網站載入範圍影響。';
  }
  await save();
}
function summary() {
  const posts=Object.values(state.posts).filter(eligible), media=Object.values(state.media).filter(eligible);
  return {active:state.active,scanning:state.scanning,artist:state.artist,note:state.note,scanReason:state.scanReason,
    folderName:state.folderName||'',diagnostics:state.diagnostics||[],options:state.options||C.options(),runDone:runDone(),posts:posts.length,images:media.length,done:media.filter(m=>m.status==='done').length,
    pending:media.filter(m=>m.status==='pending'||m.status==='downloading').length,
    postPending:posts.filter(p=>p.status==='pending'||p.status==='working').length,
    errors:media.filter(m=>m.status==='error').length+posts.filter(p=>p.status==='error').length,
    recentErrors:[...posts,...media].filter(r=>r.status==='error').slice(-3).map(r=>`${r.artist}：${r.error}`)};
}
async function handle(message,sender) {
  if(message.type==='SET_FOLDER'){
    if(sender.tab)return {error:'請使用工具列插件視窗選擇資料夾。'};
    if(state.active)return {error:'請先停止收集。'};
    const dir=await ArtFolder.directory();
    if(!dir||await dir.queryPermission({mode:'readwrite'})!=='granted')return {error:'資料夾尚未授予寫入權限。'};
    state.folderName=dir.name;await save();return {ok:true};
  }
  if(message.type==='RELOAD_EXTENSION') {
    if(state.active||Object.values(state.media).some(m=>m.status==='downloading'))return {error:'請先停止收集並等待正在下載的圖片完成，再重新載入。'};
    if(typeof chrome.runtime.reload!=='function')return {error:'此瀏覽器未提供原地重新載入功能，請在擴充功能管理頁重新載入。'};
    state.note='插件已重新載入；按開始可接續。';await save();
    setTimeout(()=>chrome.runtime.reload(),250);return {ok:true};
  }
  if(message.type==='CONTEXT'){const tab=sender.tab;return {tabId:tab?.id,artist:C.pageArtist(tab?.url||'')};}
  if (message.type==='STATUS') {await reconcile();await pump();return summary();}
  if (message.type==='START') {
    if (state.active) return {error:'已有工作執行中，請先停止。'};
    try {await folderReady();}catch(e){state.note=e.message;await save();return {error:e.message};}
    const tab=await chrome.tabs.get(message.tabId);
    const artist=C.pageArtist(tab.url);
    if (!artist) return {error:'請先開啟畫師的 X「媒體」頁或 Instagram 個人頁；排除帳號不會收集。'};
    state.options=C.options(message.options);
    state.active=true;state.scanning=true;state.artist=artist;state.sourceTab=tab.id;state.scanReason='';
    state.runGeneration=(state.runGeneration||0)+1;state.runId=String(state.runGeneration);state.lastScan=Date.now();
    state.note='正在捲動收集，並讀取原貼文的所有圖片。請保留畫師頁面。';
    // A manual restart retries unfinished post audits; completed media stay deduplicated.
    for(const p of Object.values(state.posts)) if(p.status==='working'||(p.status==='error'&&/Owl extension-created tabs must be active/.test(p.error||'')))p.status='pending';
    await closeWorker();
    await save();
    try {await chrome.tabs.sendMessage(tab.id,{type:'START_SCAN',artist,runId:state.runId});}
    catch {state.active=false;state.scanning=false;state.note='請重新整理 來源頁面後再開始。';await save();return {error:state.note};}
    await pump();return summary();
  }
  if (message.type==='STOP') {
    state.active=false;state.scanning=false;state.note='已停止。已開始的圖片下載會由瀏覽器完成。';
    if(state.working)state.posts[state.working].status='pending';
    await closeWorker();
    if(state.sourceTab!=null)await chrome.tabs.sendMessage(state.sourceTab,{type:'STOP_SCAN'}).catch(()=>{});
    await save();return summary();
  }
  if (message.type==='RETRY') {
    if(state.active)return {error:'請先停止目前工作再重試。'};
    try {await folderReady();}catch(e){state.note=e.message;await save();return {error:e.message};}
    if(!state.artist)return {error:'請先在畫師媒體頁開始收集。'};
    state.options=C.options(message.options||state.options);
    state.runGeneration=(state.runGeneration||0)+1;state.runId=String(state.runGeneration);
    for(const p of Object.values(state.posts))if(p.status==='error'&&eligible(p))p.status='pending';
    for(const m of Object.values(state.media))if(m.status==='error'&&eligible(m)){
      if(C.isInstagram(m.artist)) {
        // Instagram CDN links expire. Re-open the source to refresh the URL.
        const post=state.posts[`${m.artist.toLowerCase()}/${m.postId}`];
        if(post)post.status='pending';
      } else m.status='pending';
      m.attempts=0;
    }
    state.active=true;state.note='正在重試未完成項目。';await save();await pump();return summary();
  }
  if (message.type==='EXPORT') return {state};
  if (message.type==='ASSIGNMENT') {
    if(sender.tab?.id===state.sourceTab&&state.active&&state.scanning)return {scan:{artist:state.artist,runId:state.runId}};
    const p=state.active&&state.working?state.posts[state.working]:null;
    const actual=C.postLink(sender.tab?.url||'',state.artist||'');
    if(p && sender.tab?.id!=null && (sender.tab.id===state.workerTab || (actual?.id===p.id && sender.tab.id!==state.sourceTab))) {
      if(state.workerTab!==sender.tab.id)trace('reader_reconnected',{createdId:state.workerTab,pageId:sender.tab.id,post:p.id});
      state.workerTab=sender.tab.id;p.lastSeen=Date.now();await save();return {post:p};
    }
    if(p) {trace('reader_unassigned',{id:sender.tab?.id,url:sender.tab?.url});await save();}
    return {};
  }
  if (message.type==='FOUND') {
    if (!state.active||!state.scanning||sender.tab?.id!==state.sourceTab||message.runId!==state.runId) return {active:false};
    state.lastScan=Date.now();
    for(const raw of (message.posts||[]).slice(0,100)) {
      const p=C.postLink(raw.url,state.artist);
      if(p&&eligible(p)&&allowedPost(p)&&!state.posts[postKey(p)])state.posts[postKey(p)]={...p,status:'pending'};
    }
    await save();await pump();return {active:state.active,wait:waitForQueue()};
  }
  if (message.type==='SCAN_END'&&state.scanning&&sender.tab?.id===state.sourceTab&&message.runId===state.runId) {
    state.scanning=false;state.scanReason=message.reason;
    state.note=message.reason==='no_more_loaded'?'頁面暫時沒有更多圖片，正在完成已找到的貼文。':'收集已停止，正在處理已找到的圖片。';
    if(message.reason==='page_error')state.note='來源頁面載入失敗；歷史收集未完成。';
    await save();await pump();return {ok:true};
  }
  if (message.type==='POST_RESULT'&&sender.tab?.id===state.workerTab&&state.working) {
    const p=state.posts[state.working];
    if(p.id!==message.id)return {error:'Wrong post'};
    trace('post_result',{post:p.id,images:message.images?.length||0,error:message.error});
    if(C.isInstagram(p.artist)) {
      p.date=C.validDay(message.date)?message.date:'';
      if(!p.date&&(state.options?.from||state.options?.to)&&!message.error)message.error='無法確認 Instagram 發文日期，未下載；請重試。';
    }
    let added=0;
    if(!message.error)for(const raw of (message.images||[]).slice(0,20)) {
      const m=C.media(raw.observedUrl,p);
      if(m&&allowedImage(m)){
        added++;
        const existing=state.media[m.key];
        if(!existing)state.media[m.key]={...m,status:'pending',attempts:0};
        else if(C.isInstagram(p.artist)&&existing.status!=='done'&&existing.status!=='downloading')Object.assign(existing,m,{status:'pending'});
      }
    }
    p.status=message.error?'error':'done';p.error=message.error||'';p.images=added;
    // Hand downloads to the browser while the originating reader still exists.
    // Embedded browsers may cancel a download initiated after its tab closes.
    await pump();
    await closeWorker();await pump();return {ok:true};
  }
  return {error:'Unknown request'};
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  serial(()=>handle(message,sender)).then(respond,e=>respond({error:e.message}));return true;
});
chrome.downloads.onChanged.addListener(delta=>serial(async()=>{
  const m=Object.values(state.media).find(m=>m.downloadId===delta.id);
  if(!m)return;
  if(delta.state?.current==='complete') {
    const [d]=await chrome.downloads.search({id:delta.id});
    trace('download_complete',{id:delta.id,file:d?.filename,mime:d?.mime});
    m.status=d?.mime && !d.mime.startsWith('image/')?'error':'done';
    if(m.status==='error')m.error='伺服器未回傳圖片檔案';
  }
  if(delta.state?.current==='interrupted') {
    m.error=delta.error?.current||'下載中斷';
    const retry=/^(NETWORK_|SERVER_FAILED|SERVER_BAD_CONTENT)/.test(m.error);
    m.status=retry&&m.attempts<3?'pending':'error';
  }
  await save();await pump();
}));
chrome.tabs.onRemoved.addListener(id=>serial(async()=>{
  if(id===state.sourceTab){state.scanning=false;state.scanReason='tab_closed';await save();}
  if(id===state.workerTab&&state.working){state.posts[state.working].status='error';state.posts[state.working].error='背景貼文分頁被關閉';state.workerTab=null;state.working=null;await save();}
  await pump();
}));
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name==='queue')serial(async()=>{await reconcile();await pump();});});
chrome.runtime.onInstalled.addListener(()=>chrome.alarms.create('queue',{periodInMinutes:.5}));
chrome.runtime.onStartup.addListener(()=>serial(async()=>{
  state.active=false;state.scanning=false;state.note='瀏覽器已重新啟動。按開始可接續收集。';
  if(state.working)state.posts[state.working].status='pending';
  await closeWorker();await reconcile();await save();await chrome.alarms.create('queue',{periodInMinutes:.5});
}));

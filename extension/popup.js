function initArtUI(root=document, embedded=false) {
const $ = id => root.getElementById(id);
const send = message => chrome.runtime.sendMessage(message);
let tabId, currentArtist;
let optionsLoaded=false,lastError='';
async function refresh() {
  try {
    if(embedded){const context=await send({type:'CONTEXT'});tabId=context.tabId;currentArtist=context.artist;}
    else {const [tab]=await chrome.tabs.query({active:true,currentWindow:true});tabId=tab?.id;currentArtist=ArtCore.pageArtist(tab?.url||'');}
    const s=await send({type:'STATUS'});
    if(s.error)throw Error(s.error);
    $('artist').textContent=currentArtist?ArtCore.artistLabel(currentArtist):'請開啟畫師的 X 媒體頁或 Instagram 個人頁';
    $('badge').textContent=s.active?'進行中':'已停止';
    $('note').textContent=lastError||s.note;
    if(!optionsLoaded){const o=s.options||{};$('limit').value=o.maxImages||'';$('from').value=o.from||'';$('to').value=o.to||'';optionsLoaded=true;}
    for(const id of ['limit','from','to'])$(id).disabled=s.active;
    for(const key of ['posts','images','done','errors'])$(key).textContent=s[key].toLocaleString();
    $('pending').textContent=`進度 ${ArtCore.artistLabel(s.artist||currentArtist||'—')}：本次新增 ${s.runDone||0} 張${s.options?.maxImages?'／上限 '+s.options.maxImages+' 張':''} · 待讀取 ${s.postPending} 篇（上方為範圍內累計）`;
    $('detail').textContent=s.recentErrors.join('\n');
    $('diagnostics').textContent=(s.diagnostics||[]).map(d=>`${d.time} ${d.event} ${JSON.stringify(d.detail)}`).join('\n');
    $('start').disabled=s.active||!currentArtist;
    $('stop').disabled=!s.active;
    $('retry').disabled=!s.errors||s.active;
    $('reload').disabled=s.active;
    $('folder').disabled=s.active||embedded;
    $('folder-note').textContent=s.folderName?'直接儲存至：'+s.folderName:(embedded?'如下載遭取消，請點工具列插件圖示，選擇儲存資料夾。':'內建瀏覽器下載遭取消時，可改為直接儲存圖片。');
  }catch(e){$('note').textContent='無法連接插件：'+e.message;}
}
async function action(type) {
  lastError='';
  let options;
  try{options=ArtCore.options({maxImages:$('limit').value,from:$('from').value,to:$('to').value});}
  catch(e){lastError=e.message;$('note').textContent=lastError;return;}
  $('start').disabled=true;$('stop').disabled=true;$('retry').disabled=true;
  try {
    const result=await send({type,tabId,options});
    if(result.error){lastError=result.error;$('note').textContent=result.error;return;}
    await refresh();
  }catch(e){$('note').textContent=e.message;}
}
$('start').addEventListener('click',()=>action('START'));
$('stop').addEventListener('click',()=>action('STOP'));
$('retry').addEventListener('click',()=>action('RETRY'));
$('reload').addEventListener('click',async()=>{
  $('reload').disabled=true;
  try{
    const result=await send({type:'RELOAD_EXTENSION'});
    if(result.error)throw Error(result.error);
    $('note').textContent='正在重新載入本機更新…';
    if(embedded)setTimeout(()=>location.reload(),1200);
  }catch(e){$('note').textContent=e.message;$('reload').disabled=false;}
});
$('folder').addEventListener('click',async()=>{
  try{
    if(typeof showDirectoryPicker!=='function')throw Error('此瀏覽器不支援直接儲存資料夾。');
    const dir=await showDirectoryPicker({id:'art-output',mode:'readwrite'});
    await ArtFolder.directory(dir);
    const result=await send({type:'SET_FOLDER'});if(result.error)throw Error(result.error);
    await refresh();
  }catch(e){$('note').textContent=e.name==='AbortError'?'已取消選擇資料夾。':e.message;}
});
for(const id of ['limit','from','to'])$(id).addEventListener('input',()=>{lastError='';});
$('export').addEventListener('click',async()=>{
  const {state}=await send({type:'EXPORT'});
  const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='圖片來源清單.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
});
refresh();setInterval(refresh,1500);

}
if(location.protocol === "chrome-extension:") initArtUI();

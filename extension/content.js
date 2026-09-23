(() => {
  const C = ArtCore;
  let scanning = false;
  let generation = 0;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const send = message => chrome.runtime.sendMessage(message);
  const visiblyLoading = () => [...document.querySelectorAll('main [role="progressbar"]')].some(e=>{
    for(let node=e;node;node=node.parentElement){
      const css=getComputedStyle(node);
      if(node.hidden||css.display==='none'||css.visibility==='hidden'||css.visibility==='collapse'||css.opacity==='0')return false;
    }
    return true;
  });
  const pageError = () => /發生錯誤|超過速率限制|Something went wrong|Rate limit exceeded|These posts are protected|這些貼文受到保護/.test(document.querySelector('main')?.innerText || '');

  async function scan(artist, runId) {
    if (scanning) return;
    const run = ++generation;
    scanning = true;
    const seen = new Set();
    let idle = 0;
    let lastNew = Date.now();
    let reason = 'stopped';
    try {
      while (scanning && run === generation) {
        if (C.pageArtist(location.href)?.toLowerCase() !== artist.toLowerCase()) { reason = 'page_changed'; break; }
        if (pageError()) { reason = 'page_error'; break; }
        const items = C.galleryPosts(document, artist).filter(p => !seen.has(p.id));
        const reply = await send({type:'FOUND', artist, posts:items, runId});
        if (!reply?.active || !scanning || run !== generation) break;
        items.forEach(p => seen.add(p.id));
        // Known work covers the next batch. Wait without scrolling or counting
        // download time as a stalled X page; resume when the queue needs more.
        if(reply.wait){lastNew=Date.now();idle=0;await sleep(1800);continue;}
        if (items.length) lastNew = Date.now();
        if (Date.now()-lastNew > 120000) {reason='loading_timeout';break;}
        const loading = visiblyLoading();
        idle = items.length || loading ? 0 : idle + 1;
        if (idle >= 10) { reason = 'no_more_loaded'; break; }
        window.scrollBy(0, Math.max(550, window.innerHeight * .8));
        await sleep(1800);
      }
    } catch { reason = 'connection_lost'; }
    if (run !== generation) return;
    scanning = false;
    await send({type:'SCAN_END', reason, runId}).catch(() => {});
  }

  async function inspect(post) {
    let signature = '', stable = 0;
    for (let attempt=0; attempt<35; attempt++) {
      const assignment = await send({type:'ASSIGNMENT'});
      if (!assignment?.post || assignment.post.id !== post.id) return;
      if (pageError()) { await send({type:'POST_RESULT', id:post.id, error:'頁面受限或載入失敗'}); return; }
      const rows = C.postMedia(document, post);
      const next = rows.map(r=>r.key).sort().join('|');
      stable = next && next === signature ? stable + 1 : 0;
      signature = next;
      if (rows.length && stable >= 2 && !visiblyLoading()) {
        await send({type:'POST_RESULT', id:post.id, images:rows}); return;
      }
      await sleep(800);
    }
    await send({type:'POST_RESULT', id:post.id, error:'未能讀取原貼文圖片，保留為待重試'});
  }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message.type === 'START_SCAN') { scan(message.artist,message.runId); respond({ok:true}); }
    else if (message.type === 'STOP_SCAN') { scanning=false;generation++; respond({ok:true}); }
    else if (message.type === 'PAGE_INFO') respond({artist:C.pageArtist(location.href)});
  });
  // A newly opened background post tab obtains only its own assignment.
  (async () => {
    for (let i=0; i<3; i++) {
      const job = await send({type:'ASSIGNMENT'}).catch(()=>null);
      if (job?.post) { await inspect(job.post); return; }
      if (job?.scan && C.pageArtist(location.href)) { scan(job.scan.artist,job.scan.runId);return; }
      if (!/\/status\/\d+/.test(location.pathname)) return;
      await sleep(700);
    }
  })();
})();

// A visible control surface for browsers whose extension toolbar is not exposed to page automation.
(() => {
  if(document.getElementById('x-art-download-controls'))return;
  const host=document.createElement('div');host.id='x-art-download-controls';
  const root=host.attachShadow({mode:'open'});
  const button=document.createElement('button');button.textContent='圖片收藏 v1.1.0';
  button.setAttribute('aria-label','開啟圖片收藏 v1.1.0');
  button.style.cssText='font:13px sans-serif;padding:11px 16px;border:1px solid #afc3ad;border-radius:9px;background:#285642;color:white;cursor:pointer';
  host.style.cssText='position:fixed;right:18px;bottom:18px;z-index:2147483647';
  root.append(button);document.documentElement.append(host);
  let shell;
  button.addEventListener('click',async()=>{
    if(shell){shell.hidden=!shell.hidden;return;}
    try {
      const [html,css]=await Promise.all(['popup.html','popup.css'].map(async p=>{
        const response=await fetch(chrome.runtime.getURL(p));if(!response.ok)throw Error('介面載入失敗');return response.text();
      }));
      const parsed=new DOMParser().parseFromString(html,'text/html');
      parsed.querySelectorAll('script').forEach(e=>e.remove());
      const style=document.createElement('style');
      style.textContent=css.replaceAll(':root',':host').replaceAll('body','.art-shell')+'\n.art-shell{position:absolute;bottom:48px;right:0;background:#f4f5f0;border-radius:12px;box-shadow:0 10px 40px #0005;max-height:calc(100vh - 90px);overflow:auto}.art-shell[hidden]{display:none}';
      shell=document.createElement('div');shell.className='art-shell';shell.setAttribute('role','region');shell.setAttribute('aria-label','圖片收藏控制面板');
      shell.append(...parsed.body.childNodes);root.prepend(style,shell);initArtUI(root,true);
    }catch(e){button.textContent=e.message;}
  });
})();

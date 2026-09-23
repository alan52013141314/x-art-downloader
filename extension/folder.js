(function(root){
  function database(){return new Promise((resolve,reject)=>{
    const req=indexedDB.open('art-output-directory',1);
    req.onupgradeneeded=()=>req.result.createObjectStore('handles');
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });}
  async function directory(value){
    const db=await database();
    try{return await new Promise((resolve,reject)=>{
      const tx=db.transaction('handles',value?'readwrite':'readonly');
      const req=value?tx.objectStore('handles').put(value,'output'):tx.objectStore('handles').get('output');
      let result;req.onsuccess=()=>{result=req.result;};
      tx.oncomplete=()=>resolve(value||result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('資料夾設定未能儲存'));
    });}finally{db.close();}
  }
  async function write(handle,path,blob){
    if(await handle.queryPermission({mode:'readwrite'})!=='granted')throw Error('請在插件圖示內重新選擇儲存資料夾，授予寫入權限。');
    const parts=path.split('/');
    if(parts.some(p=>!p||p==='.'||p==='..'||/[\\:]/.test(p)))throw Error('Invalid output path');
    let parent=handle;
    for(const p of parts.slice(0,-1))parent=await parent.getDirectoryHandle(p,{create:true});
    const base=parts.at(-1);let name=base;
    for(let i=0;;i++){
      name=i?base.replace(/(\.[^.]+)$/,` (${i})$1`):base;
      try{await parent.getFileHandle(name);}catch(e){if(e.name==='NotFoundError')break;throw e;}
    }
    const file=await parent.getFileHandle(name,{create:true});
    const stream=await file.createWritable();
    try{await stream.write(blob);await stream.close();}catch(e){await stream.abort().catch(()=>{});throw e;}
    return parts.slice(0,-1).concat(name).join('/');
  }
  root.ArtFolder={directory,write};
})(typeof self!=='undefined'?self:globalThis);

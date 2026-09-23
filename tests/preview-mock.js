// Local UI preview only. No downloads and no network requests.
const sample={active:false,scanning:false,artist:'Artist_1',posts:48,images:76,done:64,pending:12,postPending:0,errors:0,recentErrors:[],note:'介面預覽（示例資料）。按鈕不會下載圖片。'};
window.chrome={tabs:{query:async()=>[{id:1,url:'https://x.com/Artist_1/media'}]},runtime:{sendMessage:async m=>{
  if(m.type==='START'){sample.active=true;sample.note='示例：正在收集原貼文與所有圖片附件。';}
  if(m.type==='STOP'){sample.active=false;sample.note='示例：已停止，可按開始接續。';}
  if(m.type==='EXPORT')return {state:sample};return sample;
}}};

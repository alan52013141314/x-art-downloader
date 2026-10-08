(function (root) {
  'use strict';
  const excluded = new Set([]);
  const handleOK = h => /^[a-zA-Z0-9_]{1,15}$/.test(h) && !excluded.has(h.toLowerCase());
  const isInstagram = artist => typeof artist === 'string' && artist.startsWith('instagram:');
  const igHandleOK = h => /^(?!\.)(?!.*\.\.)(?!.*\.$)[a-zA-Z0-9_.]{1,30}$/.test(h);
  const igHost = u => u.protocol === 'https:' && !u.port && !u.username && !u.password && ['instagram.com','www.instagram.com'].includes(u.hostname);
  const artistLabel = artist => isInstagram(artist) ? 'Instagram @'+artist.slice(10) : '@'+artist;
  function validDay(day) {
    return typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && !isNaN(Date.parse(day)) && new Date(day).toISOString().slice(0,10) === day;
  }
  function mediaHost(url, artist) {
    try {
      const u = new URL(url);
      if(u.protocol !== 'https:' || u.port || u.username || u.password)return false;
      return isInstagram(artist) ? /(^|\.)(cdninstagram\.com|fbcdn\.net)$/.test(u.hostname) : u.hostname === 'pbs.twimg.com';
    } catch { return false; }
  }
  function pageArtist(url) {
    try {
      const u = new URL(url);
      if (igHost(u)) {
        const m=u.pathname.match(/^\/([^/]+)\/?$/);
        const reserved=new Set(['p','reel','reels','stories','explore','direct','accounts','about','developer','legal','privacy','web','challenge']);
        return m && igHandleOK(m[1]) && !reserved.has(m[1].toLowerCase()) ? 'instagram:'+m[1].toLowerCase() : null;
      }
      if (!['x.com', 'twitter.com'].includes(u.hostname)) return null;
      const m = u.pathname.match(/^\/([\w]+)\/media\/?$/);
      return m && handleOK(m[1]) ? m[1] : null;
    } catch { return null; }
  }
  function postLink(href, artist) {
    try {
      const u = new URL(href, isInstagram(artist) ? 'https://www.instagram.com' : 'https://x.com');
      if(isInstagram(artist)) {
        if(!igHost(u)||!igHandleOK(artist.slice(10)))return null;
        const m=u.pathname.match(/^\/(?:(?<owner>[\w.]+)\/)?p\/(?<id>[\w-]+)\/?$/);
        if(!m || (m.groups.owner && m.groups.owner.toLowerCase()!==artist.slice(10).toLowerCase()))return null;
        return {artist,id:m.groups.id,url:`https://www.instagram.com/p/${m.groups.id}/`};
      }
      if (!['x.com', 'twitter.com'].includes(u.hostname)) return null;
      const m = u.pathname.match(/^\/(\w+)\/status\/(\d+)(?:\/photo\/\d+)?$/);
      if (!m || !handleOK(m[1]) || m[1].toLowerCase() !== artist.toLowerCase()) return null;
      return {artist, id: m[2], url: `https://x.com/${artist}/status/${m[2]}`};
    } catch { return null; }
  }
  function media(url, post) {
    try {
      const u = new URL(url);
      if(isInstagram(post.artist)) {
        const match=u.pathname.match(/\/([\w-]+)\.(jpg|jpeg|png|webp)\/?$/i);
        if(!mediaHost(url,post.artist)||!match||postLink(post.url,post.artist)?.id!==post.id||!/^[-\w]+$/.test(post.id))return null;
        const mediaId=match[1], ext=match[2].toLowerCase().replace('jpeg','jpg');
        return {key:`${post.artist.toLowerCase()}/${post.id}/${mediaId}`,artist:post.artist,postId:post.id,
          mediaId,source:post.url,observedUrl:u.href,url:u.href,ext,date:validDay(post.date)?post.date:''};
      }
      const m = u.pathname.match(/^\/media\/([\w-]+)(?:\.(jpg|jpeg|png|webp|gif))?$/);
      const ext = (u.searchParams.get('format') || m?.[2] || '').toLowerCase();
      if (u.protocol !== 'https:' || u.hostname !== 'pbs.twimg.com' || !m || !['jpg','jpeg','png','webp','gif'].includes(ext)) return null;
      const original = new URL(u); original.searchParams.set('name', 'orig');
      return {key: `${post.artist.toLowerCase()}/${m[1]}`, artist: post.artist, postId: post.id,
        mediaId: m[1], source: post.url, observedUrl: u.href, url: original.href, ext: ext === 'jpeg' ? 'jpg' : ext};
    } catch { return null; }
  }
  function filename(m) {
    if(isInstagram(m.artist)) {
      if(!igHandleOK(m.artist.slice(10))||!/^[-\w]+$/.test(m.postId)||!/^[-\w]+$/.test(m.mediaId)||!/^(jpg|png|webp)$/.test(m.ext))throw Error('Invalid Instagram media record');
      return `to be deleted folder/Instagram/${m.artist.slice(10)}/${validDay(m.date)?m.date:'unknown-date'}_${m.postId}_${m.mediaId}.${m.ext}`;
    }
    if (!handleOK(m.artist) || !/^\d+$/.test(m.postId) || !/^[\w-]+$/.test(m.mediaId) || !/^(jpg|png|webp|gif)$/.test(m.ext)) throw Error('Invalid media record');
    const date = postDate(m.postId);
    return `to be deleted folder/${m.artist}/${date}_${m.postId}_${m.mediaId}.${m.ext}`;
  }
  function postDate(id) {
    const d=new Date(Number((BigInt(id)>>22n)+1288834974657n));
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function options(raw={}) {
    const from=raw.from||'',to=raw.to||'';
    const validDate=s=>!s||(/^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s);
    if(!validDate(from)||!validDate(to))throw Error('請輸入有效的起訖日期。');
    if(from&&to&&from>to)throw Error('起日不能晚於迄日。');
    const maxImages=raw.maxImages===''||raw.maxImages==null?null:Number(raw.maxImages);
    if(maxImages!==null&&(!Number.isSafeInteger(maxImages)||maxImages<1))throw Error('張數上限必須是正整數，或留空表示不限。');
    return {from,to,maxImages};
  }
  function inRange(id,opt={}) {
    const day=postDate(id);
    return (!opt.from||day>=opt.from)&&(!opt.to||day<=opt.to);
  }
  function recordInRange(record,opt={}) {
    if(!isInstagram(record.artist))return inRange(record.postId||record.id,opt);
    if(!opt.from&&!opt.to)return true;
    // Unknown post dates must be inspected; unknown media dates must not download.
    if(!validDay(record.date))return !record.postId;
    return (!opt.from||record.date>=opt.from)&&(!opt.to||record.date<=opt.to);
  }
  function galleryPosts(doc, artist) {
    const posts = new Map();
    if(isInstagram(artist)) {
      for(const a of doc.querySelectorAll('main a[href*="/p/"]')) {
        if(!a.querySelector('img'))continue;
        const p=postLink(a.getAttribute('href'),artist);
        if(p)posts.set(p.id,p);
      }
      return [...posts.values()];
    }
    for (const a of doc.querySelectorAll('main a[href*="/photo/"]')) {
      if (!a.querySelector('img[src*="pbs.twimg.com/media/"]')) continue;
      const p = postLink(a.getAttribute('href'), artist);
      if (p) posts.set(p.id, p);
    }
    return [...posts.values()];
  }
  function postMedia(doc, post) {
    if(isInstagram(post.artist))return instagramDetails(doc,post)?.images||[];
    const output = new Map();
    for (const a of doc.querySelectorAll('main article a[href*="/photo/"]')) {
      const p = postLink(a.getAttribute('href'), post.artist);
      if (!p || p.id !== post.id) continue;
      for (const img of a.querySelectorAll('img')) {
        const m = media(img.getAttribute('src'), post);
        if (m) output.set(m.key, m);
      }
    }
    return [...output.values()];
  }
  function displayed(node) {
    const win=node.ownerDocument.defaultView;
    for(let p=node;p;p=p.parentElement) {
      const css=win.getComputedStyle(p);
      if(p.hidden||p.getAttribute('aria-hidden')==='true'||css.display==='none'||css.visibility==='hidden'||css.opacity==='0')return false;
    }
    const rect=node.getBoundingClientRect();
    if(!rect.width)return true; // DOM-only test environments have no layout.
    if(rect.right<=0||rect.left>=win.innerWidth)return false;
    for(let p=node.parentElement;p;p=p.parentElement) {
      if(/hidden|clip|scroll|auto/.test(win.getComputedStyle(p).overflowX)) {
        const bounds=p.getBoundingClientRect();
        if(bounds.width && (rect.right<=bounds.left||rect.left>=bounds.right))return false;
      }
    }
    return true;
  }
  function instagramDetails(doc,post) {
    let article;
    const candidates=[...doc.querySelectorAll('article')];
    // Current desktop Instagram uses divs. Start at the exact post permalink
    // and climb only to the first container holding an unlinked attachment.
    for(const a of doc.querySelectorAll('main a[href]')) {
      if(!a.querySelector('time')||postLink(a.getAttribute('href'),post.artist)?.id!==post.id)continue;
      for(let p=a.parentElement;p && p!==doc.body;p=p.parentElement) {
        if([...p.querySelectorAll('img')].some(img=>!img.closest('a,[role="link"]')&&attachmentWidth(img)>=150)||p.querySelector('video')) {
          candidates.push(p);break;
        }
      }
    }
    for(const candidate of candidates) {
      const matchingTime=[...candidate.querySelectorAll('a[href]')].some(a=>postLink(a.getAttribute('href'),post.artist)?.id===post.id && a.querySelector('time'));
      if(!matchingTime)continue;
      const authorLinks=[...candidate.querySelectorAll('header a[href], h2 a[href]')];
      // Some layouts omit a semantic header. The leading profile link is the byline.
      if(!authorLinks.length) {
        const first=[...candidate.querySelectorAll('a[href]')].find(a=>{
          try{return pageArtist(new URL(a.getAttribute('href'),'https://www.instagram.com').href);}catch{return false;}
        });
        if(first)authorLinks.push(first);
      }
      const owns=authorLinks.some(a=>{
        try{return pageArtist(new URL(a.getAttribute('href'),'https://www.instagram.com').href)===post.artist.toLowerCase();}catch{return false;}
      });
      if(owns){article=candidate;break;}
    }
    if(!article)return null;
    const time=[...article.querySelectorAll('a[href]')].find(a=>postLink(a.getAttribute('href'),post.artist)?.id===post.id && a.querySelector('time'))?.querySelector('time');
    const datetime=time?.getAttribute('datetime'), parsed=datetime?new Date(datetime):null;
    const date=parsed&&!isNaN(parsed)?`${parsed.getFullYear()}-${String(parsed.getMonth()+1).padStart(2,'0')}-${String(parsed.getDate()).padStart(2,'0')}`:'';
    const images=new Map(), videos=[];
    for(const video of article.querySelectorAll('video'))if(displayed(video))videos.push(video.currentSrc||video.getAttribute('src')||video.getAttribute('poster')||'video');
    for(const img of article.querySelectorAll('img')) {
      if(!displayed(img)||img.closest('header'))continue;
      const link=img.closest('a,[role="link"]');
      if(link)continue; // Profile/comment avatars and linked recommendations are not attachments.
      if(attachmentWidth(img)<150)continue;
      const slide=img.closest('li')||img.parentElement;
      if(slide.querySelector('video'))continue;
      const candidates=(img.getAttribute('srcset')||'').split(',').map(s=>s.trim().split(/\s+/)).filter(p=>/^\d+(?:\.\d+)?[wx]$/.test(p[1]||''));
      candidates.sort((a,b)=>parseFloat(b[1])-parseFloat(a[1]));
      const url=candidates.map(p=>p[0]).find(u=>media(u,post))||img.currentSrc||img.getAttribute('src');
      const m=media(url,{...post,date});if(m)images.set(m.key,m);
    }
    const next=[...article.querySelectorAll('button,[role="button"]')].find(b=>{
      const label=b.getAttribute('aria-label')||b.querySelector('[aria-label]')?.getAttribute('aria-label')||b.textContent.trim();
      return /^(Next|下一步|下一張|下一张|下一個|下一页|次へ|次へ進む)$/i.test(label)&&!b.disabled&&b.getAttribute('aria-disabled')!=='true'&&displayed(b);
    });
    return {date,images:[...images.values()],next,signature:[...images.keys(),...videos].join('|'),hasVideo:videos.length>0};
  }
  function attachmentWidth(img) {
    return img.getBoundingClientRect().width || Number(img.getAttribute('width')) || img.naturalWidth || 0;
  }
  root.ArtCore = {excluded, handleOK, pageArtist, postLink, media, filename, galleryPosts, postMedia,postDate,options,inRange,
    isInstagram,artistLabel,mediaHost,validDay,recordInRange,instagramDetails};
  if (typeof module !== 'undefined') module.exports = root.ArtCore;
})(typeof self !== 'undefined' ? self : globalThis);

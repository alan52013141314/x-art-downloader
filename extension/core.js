(function (root) {
  'use strict';
  const excluded = new Set([]);
  const handleOK = h => /^[a-zA-Z0-9_]{1,15}$/.test(h) && !excluded.has(h.toLowerCase());
  function pageArtist(url) {
    try {
      const u = new URL(url);
      if (!['x.com', 'twitter.com'].includes(u.hostname)) return null;
      const m = u.pathname.match(/^\/([\w]+)\/media\/?$/);
      return m && handleOK(m[1]) ? m[1] : null;
    } catch { return null; }
  }
  function postLink(href, artist) {
    try {
      const u = new URL(href, 'https://x.com');
      if (!['x.com', 'twitter.com'].includes(u.hostname)) return null;
      const m = u.pathname.match(/^\/(\w+)\/status\/(\d+)(?:\/photo\/\d+)?$/);
      if (!m || !handleOK(m[1]) || m[1].toLowerCase() !== artist.toLowerCase()) return null;
      return {artist, id: m[2], url: `https://x.com/${artist}/status/${m[2]}`};
    } catch { return null; }
  }
  function media(url, post) {
    try {
      const u = new URL(url);
      const m = u.pathname.match(/^\/media\/([\w-]+)(?:\.(jpg|jpeg|png|webp|gif))?$/);
      const ext = (u.searchParams.get('format') || m?.[2] || '').toLowerCase();
      if (u.protocol !== 'https:' || u.hostname !== 'pbs.twimg.com' || !m || !['jpg','jpeg','png','webp','gif'].includes(ext)) return null;
      const original = new URL(u); original.searchParams.set('name', 'orig');
      return {key: `${post.artist.toLowerCase()}/${m[1]}`, artist: post.artist, postId: post.id,
        mediaId: m[1], source: post.url, observedUrl: u.href, url: original.href, ext: ext === 'jpeg' ? 'jpg' : ext};
    } catch { return null; }
  }
  function filename(m) {
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
  function galleryPosts(doc, artist) {
    const posts = new Map();
    for (const a of doc.querySelectorAll('main a[href*="/photo/"]')) {
      if (!a.querySelector('img[src*="pbs.twimg.com/media/"]')) continue;
      const p = postLink(a.getAttribute('href'), artist);
      if (p) posts.set(p.id, p);
    }
    return [...posts.values()];
  }
  function postMedia(doc, post) {
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
  root.ArtCore = {excluded, handleOK, pageArtist, postLink, media, filename, galleryPosts, postMedia,postDate,options,inRange};
  if (typeof module !== 'undefined') module.exports = root.ArtCore;
})(typeof self !== 'undefined' ? self : globalThis);

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const publicRoot = path.join(root, 'public');
const expected = ['index.html','site.html','base.css','redesign.css','site.js','scroll-design.js','logo.webp','hero-bg-cricket.webp','gallery-local-1.webp','gallery-local-2.webp','assets/ball-scroll.mp4','assets/ball-poster.jpg','assets/batter.png'];
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(item => item.isDirectory()
    ? files(path.join(dir,item.name)).map(p=>item.name+'/'+p) : [item.name]);
}
assert.deepEqual(files(publicRoot).sort(), expected.sort(), 'Only approved public assets may be published');
const html = fs.readFileSync(path.join(publicRoot,'index.html'),'utf8');
const pitch = html.split('id="pitch"')[1].split('</section>')[0];
assert.doesNotMatch(pitch, /<(?:video|img|picture)\b/);
assert.match(html, /id="hero-film"/);
assert.doesNotMatch(html, /<video[^>]*autoplay/);
const temp = fs.mkdtempSync(path.join(os.tmpdir(),'hcc-release-'));
Object.assign(process.env, { NODE_ENV:'test', VERCEL:'1', HCC_DATA_DIR:temp,
  SUPABASE_URL:'', SUPABASE_SERVICE_ROLE_KEY:'', SUPABASE_AUTH_ENABLED:'false',
  ALLOW_LOCAL_ADMIN:'false', ADMIN_PASSWORD:'', PUBLIC_ORIGIN:'', FORMSPREE_ENDPOINT:'' });
(async()=>{
  const { default: handler } = await import(pathToFileURL(path.join(root,'api/index.mjs')));
  const server = http.createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const call=(pathname,options={})=>fetch(origin+'/api/index?path='+encodeURIComponent(pathname),{redirect:'manual',...options});
    assert.equal((await call('/health')).status,200);
    assert.equal((await call('/api/content')).status,200);
    const homepage = await call('/index.html');
    assert.equal(homepage.status,200);
    assert.match(await homepage.text(),/id="hero-film"/);
    assert.equal((await call('/admin')).status,302);
    assert.equal((await call('/admin/index.html')).status,302);
    const protectedScript = await call('/admin.js');
    assert.equal(protectedScript.status,302);
    assert.equal(protectedScript.headers.get('location'),'/login');
    assert.equal((await call('/admin-panel/server.js')).status,404);
    assert.equal((await call('/data/content.json')).status,404);
    assert.equal((await call('/archive/old-website/site.html')).status,404);
    assert.equal((await call('/api/form-submit',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:'{}'})).status,400);
    const video = fs.readFileSync(path.join(root,'assets/ball-scroll.mp4'));
    const range = await call('/assets/ball-scroll.mp4',{headers:{Range:'bytes=0-1023'}});
    assert.equal(range.status,206);
    assert.deepEqual(Buffer.from(await range.arrayBuffer()),video.subarray(0,1024));
    assert.equal((await call('/assets/ball-scroll.mp4',{headers:{Range:'bytes=-0'}})).status,416);
    const head = await call('/assets/ball-scroll.mp4',{method:'HEAD'});
    assert.equal(head.status,200);
    assert.equal(Number(head.headers.get('content-length')),video.length);
    assert.equal((await head.arrayBuffer()).byteLength,0);
    console.log('Release checks passed: public output, adapter routes, protected admin/data, validation, media ranges and text-only pitch.');
  } finally {
    await new Promise(resolve=>server.close(resolve));
    fs.rmSync(temp,{recursive:true,force:true});
  }
})().catch(error=>{ console.error(error);process.exitCode=1; });

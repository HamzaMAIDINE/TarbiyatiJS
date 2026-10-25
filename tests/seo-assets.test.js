'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {createPublicSite}=require('../backend/seo');const catalog=require('../backend/catalog');
test('every indexable document has real preview assets, local fonts and valid canonical structured data',()=>{
 const root=path.resolve(__dirname,'..');const site=createPublicSite({catalog,publicOrigin:'https://example.test'});
 for(const route of site.publicPaths){let html;const response={setHeader(){},writeHead(){},end(data){html=Buffer.from(data).toString('utf8');}};assert(site.handle({method:'GET',headers:{}},response,new URL(route,'https://example.test')));
  assert(!/fonts\.(googleapis|gstatic)\.com/.test(html),route);assert.equal((html.match(/<h1\b/g)||[]).length,1,route);
  assert(html.includes('rel="canonical" href="https://example.test'+route+'"'),route);
  const graph=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];assert.equal(graph.find(x=>x['@type']==='Organization').logo.url,'https://example.test/assets/branding/logo.png');
 }
 for(const [name,width,height]of [['social-card.png',1200,630],['logo.png',1024,1024]]){const png=fs.readFileSync(path.join(root,'assets/branding',name));assert.equal(png.readUInt32BE(16),width);assert.equal(png.readUInt32BE(20),height);}
 for(const name of ['Cairo.woff2','NotoSansArabic-Regular.woff2','NotoSansArabic-Bold.woff2'])assert.equal(fs.readFileSync(path.join(root,'assets/fonts',name)).subarray(0,4).toString(),'wOF2');
});

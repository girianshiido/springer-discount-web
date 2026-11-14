import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseBook, parseSeries, money, springerUrl } from '../src/collector/parse.js';
import { Store } from '../src/server/store.js';
import { Engine } from '../src/collector/engine.js';
import { createApi } from '../src/server/api.js';
import { DEFAULT_FILTERS, results, richCatalogue } from '../src/shared/model.js';
import { createUrlPdf } from '../src/shared/pdf.js';
const control='https://link.springer.com/book/10.1007/978-3-642-56468-0';
const fixture=readFileSync(new URL('./fixtures/convex-fr.html',import.meta.url),'utf8');
const seriesFixture=readFileSync(new URL('./fixtures/series-714.html',import.meta.url),'utf8');
test('real France excerpt: 17.71 softcover and 17.99 ebook, no hardcover inference',()=>{
 const b=parseBook(fixture,control,['714']);
 assert.equal(b.title,'Fundamentals of Convex Analysis');
 assert.deepEqual(b.offers.map(o=>[o.format,o.current,o.original,o.status]),[['Softcover',1771,7384,'discounted'],['Hardcover',undefined,undefined,'unknown'],['eBook',1799,5349,'discounted']]);
 assert.equal(b.offers[0]?.isbn,'9783540422051');assert.match(b.offers[0]!.tax,/France/);
 assert.equal(results([b],{...DEFAULT_FILTERS,threshold:17.71},'title').length,1);
 assert.equal(results([b],{...DEFAULT_FILTERS,formats:['eBook'],threshold:17.71},'title').length,0);
});
test('no cross-format transfer, no advertised percentage without a struck-through price',()=>{
 const html='<meta name="doi" content="10.1007/example"><h1>Example</h1><div class="buying-options"><div class="buying-option"><div class="buying-option-price"><span class="dt">Hardcover Book</span><span class="price-amount">EUR 100.00</span></div><span class="discount-info">Save 90%</span></div><div class="buying-option"><div class="buying-option-price"><span class="dt">eBook</span><span class="price-amount">EUR 10.00<s>EUR 100.00</s></span></div></div></div>';
 const b=parseBook(html,control,[]);assert.equal(b.offers.find(o=>o.format==='Hardcover')?.status,'unknown');assert.equal(b.offers.find(o=>o.format==='eBook')?.status,'discounted');
});
test('contradictory duplicate blocks stay unknown; non EUR not converted',()=>{
 const altered=fixture.replace('EUR&nbsp;17.71','EUR&nbsp;18.71').replace('EUR 17.71','EUR 18.71');
 assert.equal(parseBook(altered,control,[]).offers[0]?.status,'unknown');
 const ch=parseBook(fixture.replaceAll('EUR','CHF').replaceAll('France','Switzerland'),control,[]);
 assert.equal(results([ch],DEFAULT_FILTERS,'title').length,0);
});
test('currency and decimal parsing is conservative',()=>{
 assert.deepEqual(money('EUR 1.234,56'),{cents:123456,currency:'EUR'});assert.deepEqual(money('17,71 €'),{cents:1771,currency:'EUR'});
 assert.equal(money('USD 17.71 EUR 50.00'),undefined);assert.equal(money('EUR 1,234'),undefined);assert.equal(money('EUR 20.00 / month'),undefined);
});
test('real series fixture uses next-page link and ten book entries',()=>{
 const p=parseSeries(seriesFixture,'https://link.springer.com/series/714/books');assert.equal(p.books.length,10);assert.equal(p.next,'https://link.springer.com/series/714/books?page=2');
});
test('URLs cannot be used as an arbitrary proxy',()=>{
 for(const url of ['http://link.springer.com/book/1','https://example.org/book/1','https://link.springer.com:9000/book/1','https://user:secret@link.springer.com/book/1','https://link.springer.com/book/../../admin'])assert.throws(()=>springerUrl(url));
});
test('checkpoint, restart, dedup history, changed format prices, and block recovery',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'springer-test-'));let store=new Store(dir);
 try{
  const fetcher=async(url:string)=>url.includes('/series/')?`<h3><a href="${control}">Book</a></h3>`:fixture;
  let engine=new Engine(store,fetcher,true,1);const j=engine.create(['714']);await engine.waitIdle();assert.equal(j.status,'paused');assert.equal(j.queue.length,1);store.close();
  store=new Store(dir);engine=new Engine(store,fetcher,true);engine.resume(j.id);await engine.waitIdle();assert.equal(store.state.jobs[0]?.status,'completed');assert.equal(Object.keys(store.state.books).length,1);assert.equal(store.state.history.length,3);
  engine.create([], [control]);await engine.waitIdle();assert.equal(store.state.history.length,3);
  engine=new Engine(store,async()=>fixture.replaceAll('17.71','16.71'),true);engine.create([], [control]);await engine.waitIdle();assert.equal(store.state.history.length,4);
  engine=new Engine(store,async()=>{throw new Error('HTTP 429 Retry-After 60');},true);const blocked=engine.create([], [control]);await engine.waitIdle();assert.equal(blocked.status,'blocked');assert.equal(blocked.queue.length,1);assert.equal(results(Object.values(store.state.books),DEFAULT_FILTERS,'title').length,0);
  engine=new Engine(store,fetcher,true);engine.resume(blocked.id);await engine.waitIdle();assert.equal(blocked.status,'completed');assert.equal(store.state.history.length,4);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test('pause waits for in-flight price before persisting it',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'springer-pause-'));const store=new Store(dir);
 try{let release!:(s:string)=>void;const engine=new Engine(store,()=>new Promise<string>(r=>release=r),true);const j=engine.create([], [control]);engine.pause(j.id);release(fixture);await engine.waitIdle();assert.equal(j.status,'paused');assert.equal(Object.keys(store.state.books).length,1);assert.equal(j.queue.length,0);}finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test('catalogue is autonomous, escapes HTML, and sorts original prices',()=>{
 const b=parseBook(fixture,control,['714']);b.title='<script>alert(1)</script>';const html=richCatalogue([b],{...DEFAULT_FILTERS,formats:['Softcover','eBook']},[{id:'714',name:'Series A'}],{group:true,sort:'original-desc'});
 assert.ok(!html.includes('<h3><a href="'+control+'" target="_blank" rel="noopener noreferrer"><script>'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.indexOf('Softcover')<html.indexOf('<span class="format">eBook'));assert.ok(html.includes('Series A'));assert.ok(!html.includes('<script src='));
});
test('API protects commands and restricts CORS; checkpoint paths stay private',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'springer-api-'));const store=new Store(dir);const engine=new Engine(store,async()=>fixture,true);const server=createApi(engine,'a'.repeat(40),'https://owner.github.io');
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address() as {port:number};const base=`http://127.0.0.1:${address.port}`;
 try{
  assert.equal((await fetch(base+'/api/jobs',{method:'POST',body:'{}'})).status,401);
  assert.equal((await fetch(base+'/api/snapshot',{headers:{Origin:'https://evil.example'}})).status,403);
  const res=await fetch(base+'/api/snapshot',{headers:{Origin:'https://owner.github.io'}});assert.equal(res.headers.get('access-control-allow-origin'),'https://owner.github.io');assert.equal((await res.json()).jobs.length,0);
  const preflight=await fetch(base+'/api/jobs',{method:'OPTIONS',headers:{Origin:'https://owner.github.io'}});assert.equal(preflight.status,204);
  const job=await fetch(base+'/api/jobs',{method:'POST',headers:{Authorization:'Bearer '+'a'.repeat(40),'Content-Type':'application/json'},body:JSON.stringify({seriesIds:[],urls:[control]})});assert.equal(job.status,201);await engine.waitIdle();
  const data=await (await fetch(base+'/api/snapshot')).json();assert.equal(data.books['10.1007/978-3-642-56468-0'].offers[0].current,1771);assert.equal(data.jobs[0].queue,undefined);assert.ok(data.discoveredUrls.includes(control));
 }finally{await new Promise<void>(r=>server.close(()=>r()));store.close();rmSync(dir,{recursive:true,force:true});}
});
test('PDF paginates and deduplicates 500 complete URLs',()=>{
 const urls=Array.from({length:500},(_,i)=>`https://link.springer.com/book/10.1007/example-${i}`);const doc=createUrlPdf([...urls,...urls]);assert.ok(doc.getNumberOfPages()>10);assert.ok(doc.output('arraybuffer').byteLength>10000);
});

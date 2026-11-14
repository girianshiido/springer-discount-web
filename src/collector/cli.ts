import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Store } from '../server/store.js';
import { Engine, makeFetcher } from './engine.js';
import { DEFAULT_FILTERS, richCatalogue, type Snapshot } from '../shared/model.js';
const dir=process.env.DATA_DIR ?? './data'; const store=new Store(dir);
const maxPages=Number(process.env.MAX_PAGES ?? 40);
if (!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>500) throw new Error('MAX_PAGES entre 1 et 500');
const engine=new Engine(store,makeFetcher(process.env.COLLECTOR_USER_AGENT ?? 'SpringerDiscountFinder/0.1'),process.env.SPRINGER_COLLECTION_ENABLED==='true',maxPages);
try {
  if (process.argv.includes('--run')) {
    const existing=store.state.jobs.at(-1);
    if (existing?.status==='blocked') console.log('Recherche bloquée : inspecter les résultats avant reprise explicite avec --resume-blocked.');
    if (existing && (existing.status==='paused'||existing.status==='blocked'&&process.argv.includes('--resume-blocked'))) engine.resume(existing.id);
    else if (!existing||existing.status==='completed') {
      const ids=process.env.SERIES_IDS?.split(',').filter(Boolean) ?? store.state.series.map(s=>s.id);
      engine.create(ids);
    }
    await engine.waitIdle();
  }
  const {jobs,...rest}=store.state;
  const snapshot:Snapshot={...rest,jobs:jobs.map(({queue,visited,...j})=>j),discoveredUrls:[...new Set([...Object.values(rest.books).map(b=>b.url),...jobs.flatMap(j=>[...j.visited,...j.queue.map(t=>t.url)]).filter(u=>new URL(u).pathname.startsWith('/book/'))])],collectionEnabled:false};
  const output=process.env.EXPORT_DIR ?? './public';mkdirSync(output,{recursive:true});
  writeFileSync(join(output,'snapshot.json'),JSON.stringify(snapshot,null,2));
  writeFileSync(join(output,'catalogue.html'),richCatalogue(Object.values(store.state.books),DEFAULT_FILTERS,store.state.series,{group:true,sort:'title'}));
  console.log(JSON.stringify({books:Object.keys(rest.books).length,job:jobs.at(-1)?.status,output}));
} finally {store.close();}

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import type { Engine } from '../collector/engine.js';
import { type Series, type Snapshot } from '../shared/model.js';
export function createApi(engine: Engine, token: string, allowedOrigin: string) {
  if (token.length<32) throw new Error('ADMIN_TOKEN doit contenir au moins 32 caractères');
  const expected=Buffer.from('Bearer '+token); const allowed=new URL(allowedOrigin).origin;
  function auth(req: IncomingMessage) { const actual=Buffer.from(req.headers.authorization ?? ''); return actual.length===expected.length && timingSafeEqual(actual,expected); }
  async function body(req: IncomingMessage) {
    let input=''; for await (const c of req) { input+=c; if (Buffer.byteLength(input)>150_000) throw new Error('Requête trop volumineuse'); } return JSON.parse(input || '{}');
  }
  const rate=new Map<string,{count:number;until:number}>();
  return createServer(async (req: IncomingMessage,res: ServerResponse) => {
    res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Cache-Control','no-store');
    const origin=req.headers.origin;
    if (origin && origin!==allowed) { res.writeHead(403); res.end('Origine non autorisée'); return; }
    if (origin) { res.setHeader('Access-Control-Allow-Origin',allowed); res.setHeader('Vary','Origin'); }
    if (req.method==='OPTIONS') { res.setHeader('Access-Control-Allow-Methods','GET, POST, PUT, OPTIONS'); res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type'); res.writeHead(204); res.end(); return; }
    const send=(status:number,value:unknown)=>{ res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(value)); };
    try {
      const url=new URL(req.url ?? '/', 'http://localhost');
      if (req.method==='GET' && url.pathname==='/health') return send(200,{ok:true});
      if (req.method==='GET' && url.pathname==='/api/snapshot') {
        const { jobs,...rest }=engine.store.state;
        const snapshot:Snapshot={...rest,jobs:jobs.map(({queue,visited,...j})=>({...j,pending:queue.length})),discoveredUrls:[...new Set([...Object.values(rest.books).map(b=>b.url),...jobs.flatMap(j=>[...j.visited,...j.queue.map(t=>t.url)]).filter(u=>new URL(u).pathname.startsWith('/book/'))])],collectionEnabled:engine.enabled};
        return send(200,snapshot);
      }
      if (!auth(req)) return send(401,{error:'Clé administrateur requise'});
      const ip=req.socket.remoteAddress ?? 'unknown'; const now=Date.now();
      if (rate.size>1000) rate.clear();
      const counter=rate.get(ip); const limit=counter && counter.until>now ? counter : {count:0,until:now+60000}; rate.set(ip,limit);
      if (++limit.count>30) return send(429,{error:'Trop de commandes. Réessayer dans une minute.'});
      if (req.method==='POST' && url.pathname==='/api/jobs') {
        const data=await body(req);
        if (!Array.isArray(data.seriesIds) || !data.seriesIds.every((s:unknown)=>typeof s==='string') || (data.urls && (!Array.isArray(data.urls)||!data.urls.every((s:unknown)=>typeof s==='string')))) throw new Error('Sources invalides');
        return send(201,{id:engine.create(data.seriesIds,data.urls ?? []).id});
      }
      const action=/^\/api\/jobs\/([\w-]+)\/(pause|resume|skip)$/.exec(url.pathname);
      if (req.method==='POST' && action) { const method=action[2] as 'pause'|'resume'|'skip'; engine[method](action[1]!); return send(200,{ok:true}); }
      if (req.method==='PUT' && url.pathname==='/api/series') {
        const data=await body(req); const series=data.series as Series[];
        if (!Array.isArray(series) || !series.length || series.length>100 || !series.every(s=>s && /^\d+$/.test(s.id) && typeof s.name==='string' && s.name.trim().length>0 && s.name.length<200) || new Set(series.map(s=>s.id)).size!==series.length) throw new Error('Liste de séries invalide');
        engine.store.state.series=series; engine.store.save(); return send(200,{ok:true});
      }
      return send(404,{error:'Route inconnue'});
    } catch(e) { return send(400,{error:(e as Error).message}); }
  });
}

import { randomUUID, createHash } from 'node:crypto';
import robotsParser from 'robots-parser';
import type { Store } from '../server/store.js';
import { FORMATS, type Book, type Job, type Task } from '../shared/model.js';
import { parseBook, parseSeries, springerUrl } from './parse.js';
export type FetchHtml = (url: string) => Promise<string>;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
export function makeFetcher(userAgent: string): FetchHtml {
  const robots = new Map<string, ReturnType<typeof robotsParser>>();
  let lastRequest = 0;
  async function request(url: string): Promise<Response> {
    for (let redirects = 0; redirects < 9; redirects++) {
      const u = new URL(url);
      if (u.protocol !== 'https:' || !['link.springer.com','link.springernature.com','idp.springer.com'].includes(u.hostname) || u.username || u.password || u.port) throw new Error('Redirection hors des domaines Springer autorisés');
      await sleep(Math.max(0, 2000 - (Date.now() - lastRequest))); lastRequest = Date.now();
      const res = await fetch(u, { redirect: 'manual', headers: { 'User-Agent': userAgent, 'Accept': 'text/html,text/plain', 'Accept-Language': 'en' }, signal: AbortSignal.timeout(30000) });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { url = new URL(res.headers.get('location')!, u).href; await res.body?.cancel(); continue; }
      if (!res.ok) { await res.body?.cancel(); throw new Error(`Springer HTTP ${res.status}${res.headers.get('retry-after') ? ` ; Retry-After : ${res.headers.get('retry-after')}` : ''}. Collecte arrêtée, tâche conservée.`); }
      return res;
    }
    throw new Error('Trop de redirections Springer');
  }
  async function readBounded(res: Response): Promise<string> {
    if (!res.body) throw new Error('Réponse vide');
    const reader = res.body.getReader(); const parts: Uint8Array[] = []; let size = 0;
    const timeout = setTimeout(() => { void reader.cancel(); }, 30000);
    try {
      while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length;
        if (size > 5_000_000) { await reader.cancel(); throw new Error('Réponse trop volumineuse'); } parts.push(value); }
    } finally { clearTimeout(timeout); }
    return Buffer.concat(parts).toString('utf8');
  }
  return async raw => {
    const url = springerUrl(raw); const origin = new URL(url).origin;
    if (!robots.has(origin)) {
      const robotsUrl = origin + '/robots.txt'; const res = await request(robotsUrl);
      robots.set(origin, robotsParser(robotsUrl, await readBounded(res)));
    }
    if (robots.get(origin)!.isAllowed(url, userAgent) !== true) throw new Error('robots.txt ne permet pas cette URL pour cet agent. Collecte arrêtée.');
    const res = await request(url);
    if (!res.headers.get('content-type')?.includes('text/html')) { await res.body?.cancel(); throw new Error('Réponse Springer non HTML'); }
    const html = await readBounded(res);
    if (/captcha|verify you are human|access denied|unusual traffic/i.test(html.slice(0, 16000))) throw new Error('Protection anti-robot détectée ; aucune tentative de contournement.');
    return html;
  };
}
export class Engine {
  private working = false;
  private idle: Promise<void> = Promise.resolve();
  constructor(readonly store: Store, private fetchHtml: FetchHtml, readonly enabled: boolean, private maxPages = Infinity) {}
  create(seriesIds: string[], urls: string[] = []): Job {
    if (!this.enabled) throw new Error('Collecte désactivée : configurer les droits et SPRINGER_COLLECTION_ENABLED sur le serveur.');
    if (this.store.state.jobs.some(j => j.status === 'running')) throw new Error('Une recherche est déjà en cours');
    const selected = this.store.state.series.filter(s => seriesIds.includes(s.id));
    if (selected.length !== new Set(seriesIds).size) throw new Error('Série inconnue');
    const queue: Task[] = selected.map(s => ({kind:'series', url:`https://link.springer.com/series/${s.id}/books`, seriesIds:[s.id]}));
    queue.push(...urls.map(url => ({kind:'book' as const, url: springerUrl(url), seriesIds:[]})));
    if (!queue.length || queue.length > 100) throw new Error('Choisir entre 1 et 100 sources');
    if (queue.some(t => t.kind === 'book' && !new URL(t.url).pathname.startsWith('/book/'))) throw new Error('URL de livre attendue');
    const now = new Date().toISOString();
    const job: Job = {id:randomUUID(), status:'running', createdAt:now, updatedAt:now, queue, visited:[], processed:0, discovered:0, errors:0, message:'Recherche démarrée'};
    this.store.state.jobs.push(job); this.store.save(); this.kick(); return job;
  }
  pause(id: string) { const j = this.job(id); if (j.status === 'running') { j.status='paused'; j.message='Arrêt demandé. La requête en cours sera enregistrée.'; this.store.save(); } }
  resume(id: string) {
    if (!this.enabled) throw new Error('Collecte désactivée');
    const j = this.job(id);
    if (!['paused','blocked'].includes(j.status)) throw new Error('Cette recherche ne peut pas être reprise');
    if (this.store.state.jobs.some(o => o.id !== id && o.status === 'running')) throw new Error('Une autre recherche est en cours');
    j.status='running'; j.message='Reprise en cours'; this.store.save(); this.kick();
  }
  skip(id: string) {
    const j = this.job(id); if (j.status !== 'blocked' || this.working) throw new Error('Seule une tâche bloquée au repos peut être ignorée');
    const t = j.queue.shift(); if (t) { j.visited.push(t.url); j.errors++; }
    j.status='paused'; j.message='Tâche ignorée explicitement. Reprendre pour continuer.'; this.store.save();
  }
  private job(id: string) { const j = this.store.state.jobs.find(j => j.id === id); if (!j) throw new Error('Recherche inconnue'); return j; }
  async waitIdle() { await this.idle; }
  private kick() { if (!this.working) { this.working=true; this.idle=this.run().finally(() => { this.working=false; }); } }
  private record(book: Book) {
    const old = this.store.state.books[book.id];
    book.seriesIds = [...new Set([...(old?.seriesIds ?? []), ...book.seriesIds])];
    this.store.state.books[book.id]=book;
    for (const offer of book.offers) {
      // A stable fingerprint deduplicates repeated observations, never different formats/regions/prices.
      const key=createHash('sha256').update(JSON.stringify([book.id,offer])).digest('hex');
      if (!this.store.state.history.some(h => h.key===key)) this.store.state.history.push({ key, bookId:book.id, title:book.title, url:book.url, observedAt:book.checkedAt, offer });
    }
  }
  private async run() {
    let processedThisRun=0;
    while (true) {
      const j = this.store.state.jobs.find(j => j.status==='running'); if (!j) return;
      const t=j.queue[0];
      if (!t) { j.status='completed'; j.message='Recherche terminée'; j.updatedAt=new Date().toISOString(); this.store.save(); continue; }
      try {
        const html=await this.fetchHtml(t.url);
        if (t.kind==='series') {
          const listing=parseSeries(html,t.url);
          for (const url of listing.books) {
            const queued=j.queue.find(q => q.url===url);
            if (queued) queued.seriesIds=[...new Set([...queued.seriesIds,...t.seriesIds])];
            else if (!j.visited.includes(url)) { j.queue.push({kind:'book',url,seriesIds:t.seriesIds}); j.discovered++; }
            // Already fetched through another series in the same run: preserve both memberships.
            else for (const b of Object.values(this.store.state.books)) if (b.url===url) b.seriesIds=[...new Set([...b.seriesIds,...t.seriesIds])];
          }
          if (listing.next) {
            if (j.visited.includes(listing.next) || j.queue.some(q=>q.url===listing.next)) throw new Error('Pagination cyclique détectée');
            j.queue.push({kind:'series',url:listing.next,seriesIds:t.seriesIds});
          }
        } else {
          const b=parseBook(html,t.url,t.seriesIds); this.record(b);
          // Remember aliases so ISBN and DOI URLs do not lose cross-series membership.
          if (!j.visited.includes(b.url)) j.visited.push(b.url);
        }
        j.queue.shift(); j.visited.push(t.url); j.processed++; j.message=`${j.processed} pages vérifiées ; ${j.queue.length} en attente`;
      } catch(e) {
        const reason=(e as Error).message; j.status='blocked'; j.message=reason;
        // Old observations remain explicitly old; do not invent a new negative price.
        const old=Object.values(this.store.state.books).find(b=>b.url===t.url);
        if (old) old.error=reason;
      }
      if (++processedThisRun>=this.maxPages && j.status==='running') { j.status='paused'; j.message='Limite du lot atteinte. Reprise disponible.'; }
      j.updatedAt=new Date().toISOString(); this.store.save();
    }
  }
}

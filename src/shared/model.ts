export const FORMATS = ['Softcover', 'Hardcover', 'eBook'] as const;
export type Format = typeof FORMATS[number];
export type Series = { id: string; name: string };
export type Offer = {
  format: Format; isbn?: string; currency?: string; current?: number; original?: number;
  status: 'discounted' | 'regular' | 'unknown' | 'unavailable';
  tax: string; reason?: string; evidence?: string;
};
export type Book = {
  id: string; url: string; title: string; seriesIds: string[]; checkedAt: string;
  offers: Offer[]; error?: string;
};
export type Filters = { formats: Format[]; mode: 'price' | 'amount' | 'percent'; threshold: number; currency: string; query: string; seriesIds: string[] };
export const DEFAULT_FILTERS: Filters = { formats: ['Softcover', 'Hardcover'], mode: 'price', threshold: 20, currency: 'EUR', query: '', seriesIds: ['*'] };
export type Task = { kind: 'series' | 'book'; url: string; seriesIds: string[] };
export type Job = {
  id: string; status: 'running' | 'paused' | 'blocked' | 'completed'; createdAt: string; updatedAt: string;
  queue: Task[]; visited: string[]; processed: number; discovered: number; errors: number; message: string;
};
export type HistoryEntry = { key: string; bookId: string; title: string; url: string; observedAt: string; offer: Offer };
export type State = { version: 1; series: Series[]; books: Record<string, Book>; jobs: Job[]; history: HistoryEntry[] };
export type Snapshot = Omit<State, 'jobs'> & { jobs: Omit<Job, 'queue' | 'visited'>[]; collectionEnabled: boolean; discoveredUrls: string[] };
export function discount(o: Offer) {
  if (o.status !== 'discounted' || o.current === undefined || o.original === undefined || o.original <= o.current) return undefined;
  return { amount: (o.original - o.current) / 100, percent: (o.original - o.current) * 100 / o.original };
}
export function matches(book: Book, offer: Offer, f: Filters): boolean {
  const d = discount(offer);
  return !!d && f.formats.includes(offer.format) && offer.currency === f.currency &&
    (!f.query || book.title.toLocaleLowerCase().includes(f.query.toLocaleLowerCase())) &&
    (!book.seriesIds.length || f.seriesIds.includes('*') || f.seriesIds.some(id => book.seriesIds.includes(id))) &&
    (f.mode === 'price' ? offer.current! <= Math.round(f.threshold * 100) : f.mode === 'amount' ? d.amount >= f.threshold : d.percent + 1e-9 >= f.threshold);
}
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
}
export type SortOrder = 'title' | 'original-asc' | 'original-desc';
export type ViewOptions = { group: boolean; sort: SortOrder };
export type Result = { book: Book; offer: Offer };
export function results(books: Book[], filters: Filters, sort: SortOrder): Result[] {
  return books.flatMap(book => book.error ? [] : book.offers.filter(o => matches(book, o, filters)).map(offer => ({book,offer}))).sort((a,b) =>
    (sort === 'title' ? a.book.title.localeCompare(b.book.title, 'fr') : (a.offer.original! - b.offer.original!) * (sort === 'original-desc' ? -1 : 1)) || a.book.title.localeCompare(b.book.title,'fr') || a.offer.format.localeCompare(b.offer.format));
}
export function groups(rows: Result[], series: Series[], group: boolean): {name:string; id:string; rows:Result[]}[] {
  if (!group) return [{name:'Tous les résultats',id:'all',rows}];
  const ids=[...new Set(rows.flatMap(r => r.book.seriesIds.length ? r.book.seriesIds : ['direct']))];
  return ids.map(id => ({ id, name:series.find(s=>s.id===id)?.name ?? (id==='direct' ? 'Liens directs' : `Série ${id}`), rows:rows.filter(r=>id==='direct' ? !r.book.seriesIds.length : r.book.seriesIds.includes(id)) })).sort((a,b)=>a.name.localeCompare(b.name,'fr'));
}
export function prettyMoney(cents: number, currency='EUR') { return new Intl.NumberFormat('fr-FR',{style:'currency',currency}).format(cents/100); }
export function resultCard({book:b,offer:o}: Result): string {
  const e=escapeHtml; const d=discount(o)!;
  return `<article class="book" data-title="${e(b.title)}" data-price="${o.original}"><div class="book-top"><span class="format">${o.format}</span><span class="reduction">−${d.percent.toLocaleString('fr-FR',{maximumFractionDigits:1})} %</span></div><h3><a href="${e(b.url)}" target="_blank" rel="noopener noreferrer">${e(b.title)}</a></h3><div class="prices"><strong>${e(prettyMoney(o.current!,o.currency))}</strong> <s>${e(prettyMoney(o.original!,o.currency))}</s></div><p class="saving">Économie : ${e(prettyMoney(o.original!-o.current!,o.currency))}</p><div class="details">ISBN ${e(o.isbn ?? 'non exposé')}<br>${e(o.tax)}<br>Relevé : ${e(new Date(b.checkedAt).toLocaleString('fr-FR'))}</div><a class="visit" href="${e(b.url)}" target="_blank" rel="noopener noreferrer">Voir chez Springer ↗</a></article>`;
}
export const CATALOGUE_CSS = `*{box-sizing:border-box}body{margin:0;background:#f6f4ed;color:#193c35;font-family:system-ui,sans-serif;line-height:1.6}header,main{max-width:1200px;margin:auto;padding:32px 24px}header{border-bottom:1px solid #cdd5ce}h1{font:clamp(2rem,5vw,3.5rem) Georgia,serif;margin:12px 0}h2{font:1.7rem Georgia,serif;margin-top:42px}h3{font:1.35rem Georgia,serif;line-height:1.4;margin:22px 0;flex:1}a{color:inherit;text-decoration:none}a:hover{text-decoration:underline}small,.details{color:#52665f;font-size:.8rem}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,290px),1fr));gap:20px}.book{padding:24px;background:#fff;border:1px solid #d8dfd8;border-radius:6px;display:flex;flex-direction:column}.book-top{display:flex;justify-content:space-between;font-size:.78rem}.format{border:1px solid #d6ded6;border-radius:20px;padding:2px 10px}.reduction{color:#24674a;font-weight:700}.prices strong{font-size:1.7rem;letter-spacing:-.03em}.prices s{color:#78837a;font-size:.9rem;margin-left:6px}.saving{font-size:.85rem;color:#267050;margin:0 0 16px}.details{border-top:1px solid #edf0ec;padding-top:16px}.visit{font-size:.85rem;margin-top:18px;font-weight:700}select,button{padding:10px;font:inherit;border:1px solid #b5c5bb;border-radius:6px;background:#fff;color:inherit}.empty{padding:36px;border:1px dashed #b5c5bb}.muted{color:#5a6d63}.eyebrow{font-size:.75rem;letter-spacing:.16em;text-transform:uppercase}`;
export function richCatalogue(books: Book[], filters: Filters, series: Series[], options: ViewOptions): string {
  const e=escapeHtml; const rows=results(books,filters,options.sort);
  const modeLabel=filters.mode==='price' ? `Prix remisé ≤ ${filters.threshold} ${filters.currency}` : filters.mode==='amount' ? `Économie ≥ ${filters.threshold} ${filters.currency}` : `Remise ≥ ${filters.threshold} %`;
  const seriesLabel=filters.seriesIds.includes('*') ? 'Toutes les collections' : filters.seriesIds.length ? filters.seriesIds.map(id=>series.find(s=>s.id===id)?.name ?? `Série ${id}`).join(', ') : 'Liens directs';
  const content=groups(rows,series,options.group).map(g=>`<section><h2>${e(g.name)} <small>(${g.rows.length})</small></h2><div class="grid">${g.rows.map(resultCard).join('')}</div></section>`).join('');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Catalogue Springer · ${e(modeLabel)}</title><style>${CATALOGUE_CSS}</style></head><body><header><span class="eyebrow">Bibliothèque mathématique · Catalogue autonome</span><h1>Les belles trouvailles.</h1><p>${rows.length} offres · ${e(filters.formats.join(', '))} · ${e(modeLabel)}</p><p>Collections : ${e(seriesLabel)}</p><p class="muted">Export du ${e(new Date().toLocaleString('fr-FR'))}. Prix relevés depuis le pays indiqué sur chaque fiche, à revérifier avant achat. Un livre peut figurer dans plusieurs séries. Ce fichier fonctionne hors ligne ; les liens ouvrent Springer.</p><label>Trier dans chaque groupe <select id="sort"><option value="title" ${options.sort==='title'?'selected':''}>Titre A → Z</option><option value="original-asc" ${options.sort==='original-asc'?'selected':''}>Prix d’origine croissant</option><option value="original-desc" ${options.sort==='original-desc'?'selected':''}>Prix d’origine décroissant</option></select></label></header><main>${content || '<p class="empty">Aucune offre vérifiée correspondant aux filtres.</p>'}</main><script>document.getElementById('sort').onchange=function(){const mode=this.value;document.querySelectorAll('.grid').forEach(grid=>{[...grid.children].sort((a,b)=>(mode==='title'?a.dataset.title.localeCompare(b.dataset.title,'fr'):(Number(a.dataset.price)-Number(b.dataset.price))*(mode==='original-desc'?-1:1))||a.dataset.title.localeCompare(b.dataset.title,'fr')).forEach(card=>grid.append(card));});};</script></body></html>`;
}

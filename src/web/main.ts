import { FORMATS, DEFAULT_FILTERS, CATALOGUE_CSS, escapeHtml as e, results, groups, resultCard, richCatalogue, type Filters, type Series, type Snapshot, type ViewOptions, type Book } from '../shared/model.js';
import { createUrlPdf } from '../shared/pdf.js';
import initialSeries from '../../config/series.json';
import './catalogue.css';
import './style.css';
const root=document.querySelector<HTMLDivElement>('#app')!;
let snapshot: Snapshot | undefined = { version:1, series:initialSeries, books:{}, jobs:[], history:[], collectionEnabled:false, discoveredUrls:[] };
let books: Book[]=[];
let filters:Filters=structuredClone(DEFAULT_FILTERS);
let view:ViewOptions={group:true,sort:'title'};
let selectedSeries:string[]=[];
let api=import.meta.env.VITE_API_URL?.replace(/\/$/,'') ?? '';
let admin=''; let busy=false; let mode:'api'|'file'|'none'=api?'api':'none';
try { filters={...filters,...JSON.parse(localStorage.getItem('springer-filters') ?? '{}')}; } catch {}
if (!Array.isArray(filters.formats)||!FORMATS.some(f=>filters.formats.includes(f))||!['price','amount','percent'].includes(filters.mode)||!Number.isFinite(filters.threshold)||filters.threshold<0) filters=structuredClone(DEFAULT_FILTERS);
root.innerHTML=`<header class="masthead"><a class="brand" href="./"><span class="brand-mark">S∑</span><span>LES BELLES TROUVAILLES<small>Livres de mathématiques · Springer</small></span></a><span id="connection" class="connection">Connexion à configurer</span></header><main><div class="intro"><div><span class="eyebrow">Une bibliothèque, à votre mesure</span><h1>Les maths méritent<br>une belle place.</h1><p>Explorez les offres par collection et par format.<br>Gardez vos découvertes dans un catalogue à feuilleter.</p></div><div class="intro-note"><span>01 — CHOISIR</span><p>Vos séries.<br>Vos formats.<br>Votre budget.</p><small>Prix et remises vérifiés séparément<br>pour chaque format.</small></div></div><div id="message" role="status" aria-live="polite"></div><div class="workspace"><aside><form id="filters"><div class="panel-title"><h2>Votre recherche</h2><span>01</span></div><fieldset><legend>Formats</legend><div class="format-choices">${FORMATS.map(f=>`<label class="check"><input type="checkbox" name="format" value="${f}" ${filters.formats.includes(f)?'checked':''}><span>${f}</span></label>`).join('')}</div></fieldset><label for="mode">Critère de sélection</label><select id="mode"><option value="price">Prix remisé maximum</option><option value="amount">Économie minimale</option><option value="percent">Remise minimale (%)</option></select><div class="threshold"><input id="threshold" type="number" min="0" step="0.01" required aria-label="Seuil" value="${e(filters.threshold)}"><select id="currency" aria-label="Devise"><option>EUR</option><option>CHF</option><option>USD</option><option>GBP</option></select></div><p id="explanation" class="hint"></p><label for="search">Titre du livre</label><input id="search" placeholder="Analyse, algèbre…" value="${e(filters.query)}"><fieldset><legend>Séries à explorer</legend><div class="small-actions"><button type="button" id="all-series">Tout sélectionner</button><button type="button" id="no-series">Aucune</button></div><div id="series-list" class="series-list"><p class="hint">Connectez une API ou importez un relevé.</p></div></fieldset><label for="direct">Un livre précis (facultatif)</label><input id="direct" type="url" placeholder="https://link.springer.com/book/…"><button class="primary full" type="submit" id="start">Lancer la collecte ↗</button><p class="hint">Les filtres s’appliquent immédiatement aux relevés. La collecte vérifie tous les formats des séries cochées.</p></form></aside><section class="results-panel"><section class="progress-panel"><div class="panel-title"><h2>Suivi de la collecte</h2><span id="job-badge">Au repos</span></div><p id="progress-text" class="hint">Aucune recherche en cours.</p><div class="small-actions" id="job-actions"></div></section><div class="results-toolbar"><div><span class="eyebrow">Votre sélection</span><h2 id="count">Les découvertes</h2></div><div class="view-controls"><label for="sort">Classement<select id="sort"><option value="title">Titre A → Z</option><option value="original-asc">Prix d’origine ↗</option><option value="original-desc">Prix d’origine ↘</option></select></label><label class="check"><input type="checkbox" id="group" checked><span>Par série</span></label></div></div><div class="export-bar"><span id="coverage" class="hint">Aucun relevé chargé</span><div><button id="export">Exporter en HTML</button><button id="export-separate">Un HTML par série</button><button id="save-json">Sauvegarde JSON</button><button id="pdf-filtered">PDF : URL des résultats</button><button id="pdf-all">PDF : toutes les URL découvertes</button></div></div><div id="results"><p class="empty">Connectez le collecteur pour lancer une recherche, ou ouvrez un relevé JSON existant ci-dessous.</p></div><details class="diagnostics"><summary>Formats non vérifiables et erreurs</summary><div id="diagnostics"></div></details></section></div><details class="settings" open><summary>Connexion et données</summary><div class="settings-grid"><section><h2>Collecteur en ligne</h2><p class="hint">L’interface GitHub Pages lit les résultats de votre API. Aucun appel direct à Springer depuis cette page.</p><label for="api">Adresse de l’API</label><input id="api" type="url" placeholder="https://votre-api.example" value="${e(api)}"><label for="admin">Clé administrateur</label><input id="admin" type="password" autocomplete="off" placeholder="Pour lancer, arrêter ou modifier les séries"><p class="hint">Clé gardée seulement en mémoire dans cet onglet. Lecture des relevés publique.</p><button id="connect" class="primary">Connecter</button></section><section><h2>Relevés et collections</h2><label class="file-label">Ouvrir un relevé / une sauvegarde JSON<input id="import" type="file" accept="application/json,.json"></label><p class="hint">Lecture locale : aucun envoi du fichier. Les fichiers de l’ancien programme Python nécessitent une migration adaptée à leur structure.</p><label for="series-json">Liste des séries (JSON)</label><textarea id="series-json" rows="5" placeholder='[{"id":"714","name":"Problem Books in Mathematics"}]'></textarea><button id="save-series">Enregistrer les séries sur le serveur</button></section></div></details></main><footer>Un outil indépendant de Springer Nature. Prix relevés, TVA et pays indiqués par la source ; le montant final est à confirmer chez Springer.</footer>`;
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
el<HTMLSelectElement>('mode').value=filters.mode;
el<HTMLSelectElement>('currency').value=filters.currency;
function message(s:string,error=false) { el('message').textContent=s; el('message').className=s ? `notice${error?' error':''}` : ''; }
function persist() { try { localStorage.setItem('springer-filters',JSON.stringify(filters)); } catch {} }
function readFilters() {
  const threshold=Number(el<HTMLInputElement>('threshold').value);
  if (!Number.isFinite(threshold)||threshold<0 || (el<HTMLSelectElement>('mode').value==='percent'&&threshold>100)) { message('Le seuil doit être positif ou nul ; un taux de remise doit rester entre 0 et 100 %.',true); return false; }
  filters={...filters, formats:[...document.querySelectorAll<HTMLInputElement>('input[name="format"]:checked')].map(n=>n.value as typeof FORMATS[number]),mode:el<HTMLSelectElement>('mode').value as Filters['mode'],threshold,currency:el<HTMLSelectElement>('currency').value,query:el<HTMLInputElement>('search').value.trim(),seriesIds:selectedSeries};
  persist(); return true;
}
function renderSeries() {
  const series=snapshot?.series ?? [];
  el('series-list').innerHTML=series.map(s=>`<label class="series-check"><input type="checkbox" name="series" value="${e(s.id)}" ${selectedSeries.includes(s.id)?'checked':''}><span>${e(s.name)}</span></label>`).join('');
  document.querySelectorAll<HTMLInputElement>('input[name="series"]').forEach(n=>n.onchange=()=>{selectedSeries=[...document.querySelectorAll<HTMLInputElement>('input[name="series"]:checked')].map(n=>n.value);readFilters();renderResults();});
  el<HTMLTextAreaElement>('series-json').value=JSON.stringify(series,null,2);
}
function renderResults() {
  const rows=results(books,filters,view.sort);
  const unit=filters.mode==='percent'?'%':filters.currency;
  el('explanation').textContent=filters.mode==='price' ? `Prix actuel ≤ ${filters.threshold} ${unit}, uniquement si une remise est prouvée.` : filters.mode==='amount' ? `Prix barré − prix actuel ≥ ${filters.threshold} ${unit}.` : `100 × (prix barré − prix actuel) / prix barré ≥ ${filters.threshold} %.`;
  el<HTMLInputElement>('threshold').max=filters.mode==='percent'?'100':'';
  el('currency').hidden=false;
  el('count').textContent=`${rows.length} offre${rows.length>1?'s':''} à découvrir`;
  el('coverage').textContent=`${books.length} livres relevés · ${snapshot?.history.length ?? 0} observations distinctes`;
  const grouped=groups(rows,snapshot?.series ?? [],view.group);
  el('results').innerHTML=rows.length ? grouped.map(g=>`<section class="result-group"><h2>${e(g.name)} <small>${g.rows.length}</small></h2><div class="grid">${g.rows.map(resultCard).join('')}</div></section>`).join('') : `<div class="empty"><h3>${books.length?'Aucune offre dans cette sélection':'Votre catalogue attend ses premières pages.'}</h3><p>${books.length?'Modifiez les formats, le seuil ou les séries. Les formats non vérifiables sont détaillés ci-dessous.':'Choisissez vos collections puis lancez la collecte avec une API connectée.'}</p></div>`;
  el('diagnostics').innerHTML=books.map(b=>{const unknown=b.offers.filter(o=>o.status==='unknown'||o.status==='unavailable');return b.error || unknown.length ? `<p><strong>${e(b.title)}</strong> — ${e(b.error ?? unknown.map(o=>`${o.format} : ${o.reason}`).join(' ; '))}</p>`:'';}).join('')||'<p>Aucune anomalie relevée.</p>';
}
async function request(path:string,method='GET',data?:unknown) {
  const base=new URL(api); if (!['http:','https:'].includes(base.protocol) || (location.protocol==='https:'&&base.protocol!=='https:')) throw new Error('Utiliser une API HTTPS depuis le site en ligne.');
  const res=await fetch(api+path,{method,headers:{...(method!=='GET'?{'Content-Type':'application/json','Authorization':'Bearer '+admin}:{})},body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(15000)});
  const body=await res.json(); if (!res.ok) throw new Error(body.error ?? `Erreur HTTP ${res.status}`); return body;
}
function validateSnapshot(data:unknown): asserts data is Snapshot {
  const s=data as Snapshot;
  if (!s || s.version!==1 || !Array.isArray(s.series)||!Array.isArray(s.history)||!s.books||!Array.isArray(s.jobs)) throw new Error('Relevé JSON non reconnu (schéma version 1 requis).');
  for (const b of Object.values(s.books)) {
    const u=new URL(b.url); if (!['link.springer.com','link.springernature.com'].includes(u.hostname)||u.protocol!=='https:'||!Array.isArray(b.offers)||typeof b.title!=='string'||!Array.isArray(b.seriesIds)||!Number.isFinite(Date.parse(b.checkedAt))) throw new Error('Livre invalide dans le relevé');
    if (b.offers.some(o=>!FORMATS.includes(o.format)||(o.currency&&!['EUR','CHF','USD','GBP'].includes(o.currency))||(o.current!==undefined&&(!Number.isSafeInteger(o.current)||o.current<0))||(o.original!==undefined&&(!Number.isSafeInteger(o.original)||o.original<0))|| (o.status==='discounted' && !(o.original!>o.current!)))) throw new Error('Prix ou format invalide dans le relevé');
  }
}
function renderProgress() {
  const j=snapshot?.jobs.at(-1); const labels={running:'En cours',paused:'En pause',blocked:'À vérifier',completed:'Terminée'};
  el('job-badge').textContent=j?labels[j.status]:'Au repos';
  el('progress-text').textContent=j?`${j.message} · ${j.processed} pages traitées · ${j.discovered} livres découverts · ${j.errors} tâches ignorées`:(mode==='none'?'Interface prête. Connectez le collecteur pour lancer une recherche, ou ouvrez un relevé JSON existant.':'Aucune recherche en cours.');
  el('job-actions').innerHTML=mode==='api'&&j ? (j.status==='running'?'<button data-action="pause">Arrêter après la page en cours</button>':['paused','blocked'].includes(j.status)?`<button data-action="resume">Reprendre</button>${j.status==='blocked'?'<button data-action="skip">Ignorer la page bloquée</button>':''}`:''):'';
  document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(n=>n.onclick=()=>command(`/api/jobs/${j!.id}/${n.dataset.action}`,{}));
  el<HTMLButtonElement>('save-series').disabled=mode!=='api';
  el<HTMLButtonElement>('start').disabled=mode!=='api'||!snapshot?.collectionEnabled||busy||j?.status==='running';
}
async function refresh(initial=false) {
  if (mode!=='api'||busy) return;
  try { const next=await request('/api/snapshot');validateSnapshot(next);snapshot=next;books=Object.values(snapshot.books);
    if (initial) { selectedSeries=snapshot.series.filter(s=>!filters.seriesIds.length||filters.seriesIds.includes('*')||filters.seriesIds.includes(s.id)).map(s=>s.id);renderSeries();readFilters(); }
    el('connection').textContent=snapshot.collectionEnabled?'Collecteur connecté':'Connecté · collecte désactivée';renderProgress();renderResults();
  } catch(err) {el('connection').textContent='Collecteur inaccessible';message((err as Error).message,true);}
}
async function command(path:string,data:unknown,method='POST') {
  if (busy) return; busy=true;renderProgress();
  try {await request(path,method,data);message('Commande enregistrée.');}catch(err){message((err as Error).message,true);}finally{busy=false;await refresh(path==='/api/series');}
}
el<HTMLFormElement>('filters').onsubmit=ev=>{ev.preventDefault();if(!readFilters())return;const direct=el<HTMLInputElement>('direct').value.trim();if(!selectedSeries.length&&!direct){message('Choisissez au moins une série ou indiquez un livre.',true);return;} void command('/api/jobs',{seriesIds:selectedSeries,urls:direct?[direct]:[]});};
['mode','threshold','currency','search'].forEach(id=>el(id).addEventListener('input',()=>{if(readFilters())renderResults();}));
document.querySelectorAll('input[name="format"]').forEach(n=>n.addEventListener('change',()=>{readFilters();renderResults();}));
el('all-series').onclick=()=>{selectedSeries=snapshot?.series.map(s=>s.id)??[];renderSeries();readFilters();renderResults();};
el('no-series').onclick=()=>{selectedSeries=[];renderSeries();readFilters();renderResults();};
el('sort').onchange=()=>{view.sort=el<HTMLSelectElement>('sort').value as ViewOptions['sort'];renderResults();};
el('group').onchange=()=>{view.group=el<HTMLInputElement>('group').checked;renderResults();};
el('connect').onclick=()=>{api=el<HTMLInputElement>('api').value.trim().replace(/\/$/,'');admin=el<HTMLInputElement>('admin').value;mode='api';void refresh(true);};
el('save-series').onclick=()=>{try{const series=JSON.parse(el<HTMLTextAreaElement>('series-json').value);void command('/api/series',{series},'PUT');}catch{message('Liste JSON invalide.',true);}};
function download(filename:string,content:string,type:string) {const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
el('export').onclick=()=>{if(readFilters())download('catalogue-springer.html',richCatalogue(books,filters,snapshot?.series??[],view),'text/html;charset=utf-8');};
el('export-separate').onclick=()=>{
  const gs=groups(results(books,filters,view.sort),snapshot?.series??[],true);
  if(!gs.length){message('Aucun résultat à exporter.',true);return;}
  const dialog=document.createElement('dialog');dialog.innerHTML=`<h2>Un catalogue par série</h2><p>Chaque lien télécharge un fichier HTML autonome.</p><div class="download-list"></div><button>Fermer</button>`;
  const urls:string[]=[];
  for(const g of gs){const content=richCatalogue(g.rows.map(r=>r.book).filter((b,i,arr)=>arr.findIndex(o=>o.id===b.id)===i),{...filters,seriesIds:g.id==='direct'?[]:[g.id]},snapshot?.series??[],{...view,group:false});const url=URL.createObjectURL(new Blob([content],{type:'text/html;charset=utf-8'}));urls.push(url);const a=document.createElement('a');a.href=url;a.download=`springer-serie-${g.id}.html`;a.textContent=`${g.name} (${g.rows.length} offres)`;dialog.querySelector('.download-list')!.append(a);}
  dialog.querySelector('button')!.onclick=()=>dialog.close();dialog.onclose=()=>{urls.forEach(URL.revokeObjectURL);dialog.remove();};document.body.append(dialog);dialog.showModal();
};
el('save-json').onclick=()=>{if(snapshot)download('springer-releves.json',JSON.stringify(snapshot,null,2),'application/json');};
el<HTMLInputElement>('import').onchange=async ev=>{try{const f=(ev.target as HTMLInputElement).files?.[0];if(!f)return;if(f.size>30_000_000)throw new Error('Fichier trop volumineux');const data=JSON.parse(await f.text());validateSnapshot(data);snapshot=data;mode='file';books=Object.values(data.books);selectedSeries=data.series.map(s=>s.id);renderSeries();readFilters();renderResults();renderProgress();el('connection').textContent='Relevé local · hors ligne';message('Relevé ouvert localement. Reconnectez l’API pour lancer une collecte.');}catch(err){message((err as Error).message,true);}};
selectedSeries=initialSeries.filter(s=>!filters.seriesIds.length||filters.seriesIds.includes('*')||filters.seriesIds.includes(s.id)).map(s=>s.id);
renderSeries();readFilters();renderResults();renderProgress();
if(api)void refresh(true);else el('connection').textContent='Interface en ligne · collecteur à connecter';
setInterval(()=>void refresh(),5000);

function exportPdf(all:boolean) {
  const urls=all ? [...(snapshot?.discoveredUrls ?? []),...books.map(b=>b.url)] : results(books,filters,view.sort).map(r=>r.book.url);
  if(!urls.length){message('Aucune adresse à exporter.',true);return;}
  createUrlPdf(urls,all?'Toutes les URL de livres découvertes':'URL des résultats filtrés').save(all?'springer-toutes-les-url.pdf':'springer-selection-url.pdf');
}
el('pdf-all').onclick=()=>exportPdf(true);el('pdf-filtered').onclick=()=>exportPdf(false);

async function loadPublishedSnapshot() {
  if(mode!=='none')return;
  try {const res=await fetch('./snapshot.json',{cache:'no-store'});if(!res.ok)return;const data=await res.json();validateSnapshot(data);snapshot=data;books=Object.values(data.books);selectedSeries=data.series.map(s=>s.id);mode='file';renderSeries();readFilters();renderProgress();renderResults();el('connection').textContent='Relevé publié · lecture seule';}catch{}
}
void loadPublishedSnapshot();

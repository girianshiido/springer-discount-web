import { load } from 'cheerio';
import { FORMATS, type Book, type Format, type Offer } from '../shared/model.js';
export function springerUrl(raw: string, base = 'https://link.springer.com'): string {
  const u = new URL(raw, base);
  if (u.protocol !== 'https:' || !['link.springer.com', 'link.springernature.com'].includes(u.hostname) || u.port || u.username || u.password || !/^\/(book\/[\w.\-/%]+|series\/\d+\/books)$/.test(u.pathname)) throw new Error('URL Springer de livre ou de série attendue');
  u.hostname = 'link.springer.com'; u.hash = '';
  const page = u.searchParams.get('page'); u.search = '';
  if (page && /^\d+$/.test(page) && Number(page) > 1) u.searchParams.set('page', page);
  return u.href;
}
export function money(text: string, inheritedCurrency?: string): { cents: number; currency: string } | undefined {
  const s = text.replace(/[\s\u00a0\u202f]/g, '').trim();
  const currencies = [...new Set((s.match(/EUR|CHF|USD|GBP|€|£|\$/g) ?? []).map(c => ({'€':'EUR','£':'GBP','$':'USD'}[c] ?? c)))];
  if (currencies.length > 1) return;
  const currency = currencies[0] ?? inheritedCurrency;
  if (!currency) return;
  let n = s.replace(/EUR|CHF|USD|GBP|€|£|\$/g, '');
  if (!/^\d[\d.,]*$/.test(n)) return;
  if (n.includes('.') && n.includes(',')) {
    const decimal = n.lastIndexOf('.') > n.lastIndexOf(',') ? '.' : ',';
    const group = decimal === '.' ? ',' : '.';
    if (!new RegExp(`^\\d{1,3}(\\${group}\\d{3})*\\${decimal}\\d{2}$`).test(n)) return;
    n = n.split(group).join('').replace(decimal, '.');
  } else if (/[.,]/.test(n)) {
    // A lone three-digit suffix is ambiguous (1,234): never guess.
    if (!/^\d+[.,]\d{2}$/.test(n)) return;
    n = n.replace(',', '.');
  }
  const cents = Math.round(Number(n) * 100);
  if (!Number.isSafeInteger(cents) || cents < 0) return;
  return { cents, currency };
}
function format(label: string): Format | undefined {
  const s = label.trim().toLowerCase().replace(/\s+/g, ' ');
  if (/^(soft\s?cover|paperback)( book)?$/.test(s)) return 'Softcover';
  if (/^(hard\s?cover|hardback)( book)?$/.test(s)) return 'Hardcover';
  if (/^e-?book$/.test(s)) return 'eBook';
}
export function parseBook(html: string, url: string, seriesIds: string[], now = new Date().toISOString()): Book {
  const $ = load(html);
  const title = $('h1').first().text().trim();
  const doi = $('meta[name="doi"]').attr('content')?.trim().toLowerCase();
  if (!title || !doi?.startsWith('10.') || !$('.buying-options').length) throw new Error('Structure livre/prix non reconnue : page à vérifier, aucun résultat négatif déduit.');
  const candidates = new Map<Format, Offer[]>();
  $('.buying-options > .buying-option').each((_, el) => {
    const box = $(el);
    const f = format(box.find('.buying-option-price .dt').text());
    if (!f) return;
    const offer: Offer = { format: f, status: 'unknown', tax: box.find('.vat-info').text().trim() || 'Pays / TVA non précisés' };
    offer.isbn = box.find('input[name="isxn"]').attr('value')?.replace(/[^\dX]/gi, '');
    const amounts = box.find('.buying-option-price .price-amount');
    const oldNodes = amounts.find('s, del');
    const currentNode = amounts.clone(); currentNode.find('.price-discount, s, del').remove();
    const current = amounts.length === 1 ? money(currentNode.text()) : undefined;
    const original = oldNodes.length === 1 ? money(oldNodes.text(), current?.currency) : undefined;
    const unavailable = /out of stock|not available|unavailable/i.test(box.find('.buying-option-form').text()) || box.find('button[disabled]').length > 0;
    if (unavailable) { offer.status = 'unavailable'; offer.reason = 'Achat indiqué indisponible'; }
    else if (current) {
      offer.current = current.cents; offer.currency = current.currency;
      if (original && current.currency === original.currency && original.cents > current.cents) {
        offer.original = original.cents; offer.status = 'discounted';
        offer.evidence = `${currentNode.text().trim()} / prix barré ${oldNodes.text().trim()}`;
      } else if (!oldNodes.length && !box.find('.discount-info').length) {
        offer.status = 'regular'; offer.reason = 'Prix lisible, aucune remise explicite dans ce bloc';
      } else { offer.reason = 'Remise ambiguë ou prix barré inexploitable'; }
    } else offer.reason = 'Prix absent ou ambigu';
    candidates.set(f, [...(candidates.get(f) ?? []), offer]);
  });
  const offers = FORMATS.map(f => {
    const list = candidates.get(f) ?? [];
    const unique = [...new Map(list.map(o => [JSON.stringify(o), o])).values()];
    return unique.length === 1 ? unique[0]! : { format: f, status: 'unknown' as const, tax: 'Pays / TVA non précisés', reason: unique.length ? 'Blocs de prix contradictoires pour ce format' : 'Format non exposé dans les options reçues' };
  });
  return { id: doi!, url: `https://link.springer.com/book/${doi}`, title, seriesIds, checkedAt: now, offers };
}
export function parseSeries(html: string, url: string): { books: string[]; next?: string } {
  const $ = load(html);
  const books = [...new Set($('a[data-test="book-title"], .c-card__title a, h3 a[href*="/book/"]').toArray().map(a => $(a).attr('href')).filter((s): s is string => !!s).map(s => springerUrl(s, url)))];
  if (!books.length) throw new Error('Liste de série vide ou non reconnue ; reprise conservée.');
  const nextHref = $('a[rel="next"]').attr('href');
  const next = nextHref ? springerUrl(nextHref, url) : undefined;
  if (next && new URL(next).pathname !== new URL(url).pathname) throw new Error('Pagination sortant de la série');
  return { books, next };
}

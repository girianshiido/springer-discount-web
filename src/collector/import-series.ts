import { readFileSync, writeFileSync } from 'node:fs';
// Reads the old script as text. Never imports or executes Python code.
const file=process.argv[2]; if (!file) throw new Error('Usage : npm run migrate:series -- chemin/vers/fixed9.py');
const source=readFileSync(file,'utf8');
const entries=new Map<string,{id:string;name:string}>();
for (const match of source.matchAll(/["']([^"'\n]+)["']\s*[:,]\s*["']https:\/\/link\.springer\.com\/series\/(\d+)(?:\/books)?[^"']*["']/g)) entries.set(match[2]!,{id:match[2]!,name:match[1]!});
if (!entries.size) throw new Error('Aucune association nom/URL reconnue. Fournir la liste JSON après inspection manuelle ; aucun fichier écrasé.');
const dest=process.argv[3] ?? 'config/series.imported.json'; writeFileSync(dest,JSON.stringify([...entries.values()],null,2)+'\n',{flag:'wx'});
console.log(`${entries.size} séries extraites dans ${dest}. Vérifier la liste avant de la charger dans l’interface.`);

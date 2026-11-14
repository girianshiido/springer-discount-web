import { mkdirSync, readFileSync, writeFileSync, renameSync, openSync, closeSync, unlinkSync, fsyncSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { State, Series } from '../shared/model.js';
export class Store {
  state: State;
  readonly file: string;
  private lock: string;
  constructor(dir: string) {
    mkdirSync(dir, { recursive: true }); this.file = join(resolve(dir), 'state.json'); this.lock = join(resolve(dir), '.writer.lock');
    try { closeSync(openSync(this.lock, 'wx')); } catch { throw new Error('Données déjà ouvertes, ou verrou après arrêt brutal. Vérifier qu’aucun serveur ne tourne avant de supprimer .writer.lock.'); }
    try {
      try { this.state = JSON.parse(readFileSync(this.file, 'utf8')); }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
        const series = JSON.parse(readFileSync(new URL('../../config/series.json', import.meta.url), 'utf8')) as Series[];
        this.state = { version: 1, series, books: {}, jobs: [], history: [] };
      }
      if (this.state.version !== 1 || !Array.isArray(this.state.jobs) || !this.state.books || !Array.isArray(this.state.history)) throw new Error('État incompatible : sauvegarder le fichier avant migration');
      for (const job of this.state.jobs) if (job.status === 'running') { job.status = 'paused'; job.message = 'Serveur redémarré. Reprise explicite disponible.'; }
      this.save();
    } catch (e) { unlinkSync(this.lock); throw e; }
  }
  save() {
    const temp = this.file + '.tmp'; const fd = openSync(temp, 'w', 0o600);
    try { writeFileSync(fd, JSON.stringify(this.state, null, 2)); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(temp, this.file);
  }
  close() { this.save(); unlinkSync(this.lock); }
}

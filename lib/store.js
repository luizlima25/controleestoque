// Persistência em arquivo JSON (escrita atômica). Suficiente para uso pessoal.
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

export class Store {
  constructor(file) {
    this.file = file;
    this.data = { watches: [], alerts: [] };
    if (existsSync(file)) {
      try { this.data = { watches: [], alerts: [], ...JSON.parse(readFileSync(file, 'utf8')) }; }
      catch (e) { console.error('db.json ilegível, começando vazio:', e.message); }
    }
  }
  save() {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    renameSync(tmp, this.file);
  }
}

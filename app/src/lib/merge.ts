// LOGICA PURA DI MERGE per la sync tra dispositivi (nessun DOM/rete: facile da testare, vedi merge.test.ts).
// E' usata da lib/cloud.svelte.ts nella funzione run(): (1) detectLocal rileva le modifiche locali, (2) mergeRemote fonde i file degli altri dispositivi,
// (3) purgeTombstones elimina le cancellazioni vecchie. Le funzioni hash/stable arrivano da lib/crypto.ts.
// Strategia: 'last writer wins' per singolo record, con ordine totale (tempo t, poi id dispositivo).

// Pure merge logic for the cloud sync (no DOM, easy to test).
//
// Every record is identified by "table:id". Each device keeps `base`: the last known winning version
// of every record ({hash of content, time t, device id `by`, tombstone flag}). On sync:
//   1. local edits are detected by hash comparison and get a new time t
//   2. each other device's file is merged in: the highest (t, by) wins, per record
//   3. winners that came from elsewhere are applied locally
// Deletions are tombstones, kept 90 days.

import { hash, stable } from './crypto'

// Stato locale noto di un record ('base'): hash del contenuto, tempo t, dispositivo autore e flag di cancellazione. Salvato in IndexedDB sotto la chiave 'x:base' da cloud.svelte.ts.
export interface BaseEnt { h: string; t: number; by: string; del?: boolean }
// Versione di un record dentro il file di un dispositivo: tempo, autore, e il dato 'd' (assente se cancellato).
export interface Ent { t: number; by: string; del?: boolean; d?: unknown }
// Contenuto (decifrato) del file 'dev-<id>.enc' di un dispositivo su Drive: tutti i suoi record piu' gli 'extras' condivisi (es. l'id del calendario Google).
export interface FileState {
  v: 1
  device: string
  extras: Record<string, { v: unknown; t: number }>
  ents: Record<string, Ent>
}

// Per quanto tempo si conservano le 'lapidi' (cancellazioni), cosi' i dispositivi rimasti offline le ricevono: 90 giorni.
export const TOMBSTONE_MS = 90 * 24 * 3600 * 1000

// Confronto tra due versioni: vince il tempo piu' alto, a parita' l'id dispositivo piu' alto. Usato da mergeRemote.
export const cmp = (a: { t: number; by: string }, b: { t: number; by: string }) =>
  a.t - b.t || (a.by < b.by ? -1 : a.by > b.by ? 1 : 0)

// Calcola l'hash (su JSON stabile) di ogni record locale. Il risultato e' l'input di detectLocal. Chiamata da cloud.run().
export async function hashAll(local: Record<string, unknown>): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  await Promise.all(Object.entries(local).map(async ([k, v]) => (out[k] = await hash(stable(v)))))
  return out
}

// Confronta gli hash attuali con 'base': i record nuovi/modificati ricevono tempo 'now' e autore 'me', quelli spariti diventano lapidi. Modifica 'base' e dice se qualcosa e' cambiato.
/** Mark records edited/deleted locally since the last sync. Mutates `base`; returns true if anything changed. */
export function detectLocal(base: Record<string, BaseEnt>, hashes: Record<string, string>, me: string, now: number): boolean {
  let changed = false
  for (const [k, h] of Object.entries(hashes)) {
    const b = base[k]
    if (!b || b.del || b.h !== h) {
      base[k] = { h, t: now, by: me }
      changed = true
    }
  }
  for (const [k, b] of Object.entries(base)) {
    if (!(k in hashes) && !b.del) {
      base[k] = { h: '', t: now, by: me, del: true }
      changed = true
    }
  }
  return changed
}

// Fonde i file degli altri dispositivi in 'base': per ogni record vince la versione piu' recente. Restituisce le modifiche da applicare in locale (null = cancella), che cloud.run() passa a store.applySync().
/** Merge other devices' files into `base`. Returns what must be written locally (null = delete). */
export async function mergeRemote(base: Record<string, BaseEnt>, remotes: FileState[]): Promise<Map<string, unknown | null>> {
  const pending = new Map<string, unknown | null>()
  for (const r of remotes) {
    for (const [k, e] of Object.entries(r.ents)) {
      const b = base[k]
      if (b && cmp(e, b) <= 0) continue
      base[k] = { h: e.del ? '' : await hash(stable(e.d)), t: e.t, by: e.by, del: e.del }
      pending.set(k, e.del ? null : e.d)
    }
  }
  return pending
}

// Rimuove da 'base' le lapidi piu' vecchie di TOMBSTONE_MS. Chiamata da cloud.run() prima di caricare il proprio file.
export function purgeTombstones(base: Record<string, BaseEnt>, now: number) {
  for (const [k, b] of Object.entries(base)) if (b.del && now - b.t > TOMBSTONE_MS) delete base[k]
}

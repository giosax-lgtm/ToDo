// Pure merge logic for the cloud sync (no DOM, easy to test).
//
// Every record is identified by "table:id". Each device keeps `base`: the last known winning version
// of every record ({hash of content, time t, device id `by`, tombstone flag}). On sync:
//   1. local edits are detected by hash comparison and get a new time t
//   2. each other device's file is merged in: the highest (t, by) wins, per record
//   3. winners that came from elsewhere are applied locally
// Deletions are tombstones, kept 90 days.

import { hash, stable } from './crypto'

export interface BaseEnt { h: string; t: number; by: string; del?: boolean }
export interface Ent { t: number; by: string; del?: boolean; d?: unknown }
export interface FileState {
  v: 1
  device: string
  extras: Record<string, { v: unknown; t: number }>
  ents: Record<string, Ent>
}

export const TOMBSTONE_MS = 90 * 24 * 3600 * 1000

export const cmp = (a: { t: number; by: string }, b: { t: number; by: string }) =>
  a.t - b.t || (a.by < b.by ? -1 : a.by > b.by ? 1 : 0)

export async function hashAll(local: Record<string, unknown>): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  await Promise.all(Object.entries(local).map(async ([k, v]) => (out[k] = await hash(stable(v)))))
  return out
}

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

export function purgeTombstones(base: Record<string, BaseEnt>, now: number) {
  for (const [k, b] of Object.entries(base)) if (b.del && now - b.t > TOMBSTONE_MS) delete base[k]
}

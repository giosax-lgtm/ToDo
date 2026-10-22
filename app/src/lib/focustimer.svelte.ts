// TIMER POMODORO (singleton reattivo). Vive fuori dal componente cosi' il conto alla rovescia continua anche se si cambia tool o lista.
// Il tempo e' calcolato sull'orario di fine (endAt), non contando i tick: resta corretto anche se il browser rallenta i timer della scheda in background.
// Configurazione (minuti) e conteggio giornaliero sono preferenze di store.svelte.ts; usato da Pomodoro.svelte.

import { store, today } from './store.svelte'

export type Phase = 'work' | 'short' | 'long'
export interface PomoCfg { work: number; short: number; long: number; rounds: number }
export const POMO_DEFAULT: PomoCfg = { work: 25, short: 5, long: 15, rounds: 4 }
export const PHASE_LABEL: Record<Phase, string> = { work: 'Focus', short: 'Short break', long: 'Long break' }

class Pomodoro {
  phase = $state<Phase>('work')
  running = $state(false)
  round = $state(1) // quale pomodoro del ciclo (1..rounds)
  private secs = $state<number | null>(null) // null = fase non iniziata: vale la durata configurata
  private endAt = 0
  private h: ReturnType<typeof setInterval> | null = null

  get cfg(): PomoCfg { return { ...POMO_DEFAULT, ...store.pref<Partial<PomoCfg>>('pomoCfg', {}) } }
  setCfg(patch: Partial<PomoCfg>) { store.setPref('pomoCfg', { ...this.cfg, ...patch }) }

  length(p: Phase) { return Math.max(1, this.cfg[p]) * 60 }
  get remaining() { return this.secs ?? this.length(this.phase) }
  get progress() { return 1 - this.remaining / this.length(this.phase) }
  get text() { const s = this.remaining; return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0') }

  // Pomodoro di focus completati oggi (si azzera da solo al cambio giorno).
  get doneToday() { const d = store.pref<{ date: string; n: number }>('pomoDone', { date: '', n: 0 }); return d.date === today() ? d.n : 0 }

  start() {
    if (this.running) return
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission()
    this.endAt = Date.now() + this.remaining * 1000
    this.running = true
    this.h = setInterval(() => this.tick(), 500)
    this.tick()
  }
  pause() {
    if (!this.running) return
    this.secs = Math.max(1, Math.ceil((this.endAt - Date.now()) / 1000))
    this.stopTimer()
  }
  // Riporta la fase corrente alla durata piena.
  reset() { this.stopTimer(); this.secs = null }
  // Passa subito alla fase successiva (senza contare il pomodoro come completato).
  skip() { this.next(false) }
  // Riparte da zero: primo pomodoro, fase di focus.
  restart() { this.stopTimer(); this.phase = 'work'; this.round = 1; this.secs = null }

  private stopTimer() {
    if (this.h) clearInterval(this.h)
    this.h = null
    this.running = false
    document.title = BASE_TITLE
  }
  private tick() {
    const s = Math.max(0, Math.ceil((this.endAt - Date.now()) / 1000))
    this.secs = s
    document.title = `${this.text} · ${PHASE_LABEL[this.phase]}`
    if (s <= 0) this.next(true)
  }
  // Fine fase: dopo il focus viene una pausa (lunga ogni 'rounds' pomodori), dopo la pausa torna il focus. Non riparte da sola: serve un click.
  private next(completed: boolean) {
    const wasWork = this.phase === 'work'
    this.stopTimer()
    if (wasWork) {
      if (completed) store.setPref('pomoDone', { date: today(), n: this.doneToday + 1 })
      this.phase = this.round >= this.cfg.rounds ? 'long' : 'short'
    } else {
      this.round = this.phase === 'long' ? 1 : this.round + 1
      this.phase = 'work'
    }
    this.secs = null
    if (completed) this.alert()
  }
  private alert() {
    try {
      const ctx = new AudioContext()
      for (let i = 0; i < 3; i++) {
        const o = ctx.createOscillator(), g = ctx.createGain()
        o.frequency.value = 880
        g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.35)
        g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.35 + 0.02)
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.35 + 0.28)
        o.connect(g).connect(ctx.destination)
        o.start(ctx.currentTime + i * 0.35)
        o.stop(ctx.currentTime + i * 0.35 + 0.3)
      }
    } catch { /* audio non disponibile */ }
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try { new Notification(this.phase === 'work' ? 'Break over — time to focus' : 'Focus done — take a break', { body: `${PHASE_LABEL[this.phase]} · ${this.text}` }) } catch { /* notifiche non supportate */ }
    }
  }
}

const BASE_TITLE = document.title
export const pomodoro = new Pomodoro()

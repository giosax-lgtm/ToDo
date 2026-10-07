<!--
  FINESTRA NOTE (quaderno stile OneNote) legata alla lista corrente. E' una finestra flottante non modale: si trascina dalla barra del titolo,
  si ridimensiona dai bordi/angoli, si riduce a barra del titolo, si ingrandisce e si chiude; posizione, dimensione e stato sono ricordati (store.notesWin).
  Struttura: schede delle SEZIONI in alto, elenco delle PAGINE a sinistra, titolo + tela a destra. Ogni lista ha il suo quaderno.
  Le immagini si ridimensionano con la maniglia che compare cliccandole; il pulsante matita apre un riquadro per disegnare a mano libera (il disegno diventa un'immagine PNG).
  La pagina e' una TELA con caselle di testo libere (come OneNote): un click su un punto vuoto crea una casella, che si trascina dalla maniglia in alto e si allarga dal bordo destro.
  Ogni casella e' un contenteditable; la barra strumenti agisce su quella attiva (grassetto, corsivo, font, dimensione, colori, titoli, elenchi, allineamento, link, tabella, immagini...).
  Le immagini (incolla, trascina, pulsante) vengono ridotte e salvate come data URI dentro la casella. La finestra puo' essere agganciata al bordo destro (pannello a tutta altezza).
  Il contenuto passa SEMPRE da sanitizeHtml() (lib/notehtml.ts) quando viene incollato e quando viene salvato.
  Il menu Export scarica la pagina/sezione/lista in docx, pdf (stampa), html, markdown o txt (lib/noteexport.ts).
  Dati: store.notes / store.noteSections (lib/store.svelte.ts), sincronizzati e salvati nei backup come gli altri record. Montata da App.svelte; stili in app.css (.notes-*).
-->

<script lang="ts">
  import { store } from './store.svelte'
  import { tick } from 'svelte'
  import { sanitizeHtml, escapeHtml, pageHtml } from './notehtml'
  import { resizer } from './resizer'
  import type { NoteBox, NotePage } from './types'
  import { download, printPdf, safeName, toDocx, toHtmlDoc, toMarkdown, toText } from './noteexport'

  // Dimensioni minime della finestra e dimensioni attuali dello schermo (per tenere la finestra visibile).
  const MIN_W = 340
  const MIN_H = 240
  let vw = $state(window.innerWidth)
  let vh = $state(window.innerHeight)

  // Stato finestra salvato, e geometria "viva" usata solo durante trascinamento/ridimensionamento (si salva al rilascio).
  const win = $derived(store.notesWin)
  let live = $state<{ x: number; y: number; w: number; h: number } | null>(null)
  const geo = $derived.by(() => {
    const g = live ?? win
    const w = Math.min(Math.max(g.w, MIN_W), vw)
    const h = Math.min(Math.max(g.h, MIN_H), vh)
    return { w, h, x: Math.min(Math.max(g.x, 0), Math.max(0, vw - 120)), y: Math.min(Math.max(g.y, 0), Math.max(0, vh - 40)) }
  })

  // Sezioni e pagine della lista corrente; la selezione ricade sulla prima se quella scelta non esiste piu' (es. cambiata lista o cancellata altrove).
  const sections = $derived(store.projectSections)
  let secId = $state<string | null>(null)
  let pageId = $state<string | null>(null)
  const section = $derived(sections.find((s) => s.id === secId) ?? sections[0])
  const pages = $derived(section ? store.sectionPages(section.id) : [])
  const page = $derived(pages.find((p) => p.id === pageId) ?? pages[0])

  let exportOpen = $state(false)
  let scope = $state<'page' | 'section' | 'list'>('page')

  // ---------- finestra: trascinamento, ridimensionamento, stato ----------

  // Trascina la finestra dalla barra del titolo (ignora i click sui pulsanti). A finestra ingrandita non fa nulla.
  function dragStart(e: PointerEvent) {
    if (win.max || win.docked || (e.target as HTMLElement).closest('button')) return
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const sx = e.clientX, sy = e.clientY, g0 = { ...geo }
    const move = (ev: PointerEvent) => (live = { ...g0, x: g0.x + ev.clientX - sx, y: g0.y + ev.clientY - sy })
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      if (live) store.setNotesWin({ ...live })
      live = null
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }

  // Ridimensiona dai bordi/angoli: 'dir' contiene n/s/e/w. Spostando i lati nord/ovest cambia anche la posizione.
  function resizeStart(e: PointerEvent, dir: string) {
    e.preventDefault()
    e.stopPropagation()
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const sx = e.clientX, sy = e.clientY, g0 = { ...geo }
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy
      let { x, y, w, h } = g0
      if (dir.includes('e')) w = Math.max(MIN_W, g0.w + dx)
      if (dir.includes('s')) h = Math.max(MIN_H, g0.h + dy)
      if (dir.includes('w')) { w = Math.max(MIN_W, g0.w - dx); x = g0.x + g0.w - w }
      if (dir.includes('n')) { h = Math.max(MIN_H, g0.h - dy); y = g0.y + g0.h - h }
      live = { x, y, w, h }
    }
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      if (live) store.setNotesWin({ ...live })
      live = null
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }

  // Chiude la finestra salvando prima il testo in corso.
  function close() {
    flush()
    exportOpen = false
    store.setNotesWin({ open: false })
  }

  // ---------- quaderno: sezioni e pagine ----------

  // Seleziona una sezione/pagina, salvando prima il contenuto della pagina che si lascia.
  function pickSection(id: string) { flush(); secId = id; pageId = null }
  function pickPage(id: string) { flush(); pageId = id }

  // Crea una sezione (chiede il nome) e la seleziona.
  async function newSection() {
    const n = prompt('New section name', 'Section ' + (sections.length + 1))?.trim()
    if (!n) return
    flush()
    const s = await store.addSection(store.currentProjectId, n)
    secId = s.id
    pageId = null
  }
  // Rinomina / elimina la sezione corrente.
  function renameSection() {
    if (!section) return
    const n = prompt('Rename section', section.name)
    if (n) store.renameSection(section.id, n)
  }
  function deleteSection() {
    if (!section || !confirm(`Delete section "${section.name}" and all its pages?`)) return
    flush()
    store.deleteSection(section.id)
    secId = null
    pageId = null
  }
  // Aggiunge una pagina alla sezione corrente e la seleziona (con il titolo pronto da scrivere).
  async function newPage() {
    if (!section) return
    flush()
    const p = await store.addPage(section.id)
    pageId = p.id
    setTimeout(() => (document.querySelector('.notes-title') as HTMLInputElement | null)?.focus(), 0)
  }
  // Elimina la pagina corrente.
  function deletePage() {
    if (!page || !confirm(`Delete page "${page.title || 'Untitled'}"?`)) return
    pageId = null
    loadedId = null
    store.deletePage(page.id)
  }

  // ---------- editor: caricamento e salvataggio ----------

  // ---------- caselle di testo libere ----------

  // Copia di lavoro delle caselle della pagina mostrata; 'rev' cambia quando vanno ricostruite da zero (cambio pagina, modifica arrivata dalla sync).
  let canvas = $state<HTMLElement>()
  let boxes = $state<NoteBox[]>([])
  let rev = $state(0)
  let activeId = $state<string | null>(null) // ultima casella in cui si e' scritto (resta anche se il focus passa alla barra strumenti)
  let activeBody: HTMLElement | undefined
  // Pagina caricata, firma dell'ultimo contenuto salvato e timer del salvataggio (non reattivi: servono solo a decidere quando ricaricare/salvare).
  let loadedId: string | null = null
  let lastSig = ''
  let timer: ReturnType<typeof setTimeout> | undefined
  const BOX_W = 320

  // Caselle di una pagina; il vecchio formato a testo unico ('html') diventa una casella.
  const boxesOf = (p: NotePage): NoteBox[] => p.boxes ?? (p.html ? [{ id: 'b-' + p.id, x: 16, y: 16, w: 640, html: p.html }] : [])
  const sigOf = (b: NoteBox[]) => JSON.stringify(b)
  // Una casella e' "vuota" se non ha testo, immagini, tabelle o righe.
  const hasContent = (html: string) => /<(img|table|hr)/i.test(html) || html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() !== ''

  // Effetto: carica le caselle della pagina selezionata; ricarica anche quando arriva dalla sync una versione diversa, ma solo se l'utente non sta scrivendo.
  $effect(() => {
    const p = page
    const sig = p ? sigOf(boxesOf(p)) : ''
    const editing = !!canvas?.contains(document.activeElement)
    if (!p) { boxes = []; loadedId = null; lastSig = ''; return }
    if (p.id !== loadedId || (sig !== lastSig && !editing)) {
      loadedId = p.id
      lastSig = sig
      activeId = null
      activeBody = undefined
      boxes = boxesOf(p).map((b) => ({ ...b }))
      selImg = null
      selRect = null
      rev++
    }
  })

  // Salva subito (se cambiato) le caselle della pagina caricata, leggendo il testo dagli elementi. Le caselle vuote vengono scartate, tranne quella attiva.
  // Chiamata prima di cambiare pagina/sezione, alla chiusura, dopo il debounce, a fine trascinamento/ridimensionamento.
  function flush() {
    clearTimeout(timer)
    const p = page
    if (!p || !canvas || p.id !== loadedId) return
    const out: NoteBox[] = []
    for (const b of boxes) {
      const el = canvas.querySelector<HTMLElement>(`[data-box="${b.id}"] .nb-body`)
      const html = el ? sanitizeHtml(el.innerHTML) : b.html
      if (!hasContent(html) && b.id !== activeId) continue
      out.push({ id: b.id, x: b.x, y: b.y, w: b.w, html })
    }
    const sig = sigOf(out)
    if (sig === lastSig) return
    lastSig = sig
    boxes = out
    void store.updatePage(p.id, { boxes: out, html: '' })
  }
  // A ogni modifica: salva dopo mezzo secondo di quiete.
  function onInput() {
    if (selImg) updateSel()
    clearTimeout(timer)
    timer = setTimeout(flush, 500)
  }
  // Azione: scrive il contenuto iniziale in una casella appena creata (poi il testo lo gestisce il browser, non Svelte).
  function boxInit(node: HTMLElement, html: string) { node.innerHTML = sanitizeHtml(html) }

  // Crea una casella vuota nel punto dato (px sulla tela), la attiva e vi mette il cursore. Scarta le caselle vuote rimaste.
  async function newBox(x: number, y: number) {
    const b: NoteBox = { id: crypto.randomUUID(), x: Math.max(0, Math.round(x)), y: Math.max(16, Math.round(y)), w: BOX_W, html: '' }
    boxes.push(b)
    activeId = b.id
    flush()
    await tick()
    canvas?.querySelector<HTMLElement>(`[data-box="${b.id}"] .nb-body`)?.focus()
    return b
  }
  // Click su un punto vuoto della tela = nuova casella li' (un click durante una selezione di testo non conta).
  function canvasClick(e: MouseEvent) {
    const t = e.target as HTMLElement
    selImg = null
    selRect = null
    if (!t.classList.contains('notes-canvas') && !t.classList.contains('notes-sizer')) return
    if (getSelection()?.toString()) return
    const r = (canvas!.firstElementChild as HTMLElement).getBoundingClientRect()
    void newBox(e.clientX - r.left - 6, e.clientY - r.top - 10)
  }
  // Punto sotto tutte le caselle (per inserire una casella senza sovrapporla).
  function nextY() {
    let y = 16
    for (const b of boxes) {
      const el = canvas?.querySelector<HTMLElement>(`[data-box="${b.id}"]`)
      y = Math.max(y, b.y + (el?.offsetHeight ?? 60) + 16)
    }
    return y
  }
  // Trascina una casella dalla maniglia in alto (il pulsante ✕ elimina la casella).
  function boxDrag(e: PointerEvent, b: NoteBox) {
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const sx = e.clientX, sy = e.clientY, x0 = b.x, y0 = b.y
    const move = (ev: PointerEvent) => {
      b.x = Math.max(0, Math.round(x0 + ev.clientX - sx))
      b.y = Math.max(16, Math.round(y0 + ev.clientY - sy))
    }
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      flush()
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }
  // Allarga/restringe una casella dal bordo destro.
  function boxResize(e: PointerEvent, b: NoteBox) {
    e.preventDefault()
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const sx = e.clientX, w0 = b.w
    const move = (ev: PointerEvent) => (b.w = Math.max(100, Math.round(w0 + ev.clientX - sx)))
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      flush()
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }
  // Elimina una casella (con il suo contenuto).
  function removeBox(id: string) {
    boxes = boxes.filter((b) => b.id !== id)
    if (activeId === id) { activeId = null; activeBody = undefined }
    flush()
  }

  // Se la finestra viene smontata con testo non ancora salvato, lo salva.
  $effect(() => () => flush())

  // Cambio titolo pagina (salvato subito).
  function setTitle(v: string) {
    if (page) void store.updatePage(page.id, { title: v })
  }

  // ---------- editor: comandi di formattazione ----------

  // Ultima selezione fatta DENTRO l'editor: serve perche' menu e selettori colore rubano il focus; prima di ogni comando la si ripristina.
  let saved: Range | null = null
  let active = $state<Record<string, boolean>>({})
  const STATE_CMDS = ['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList']
  // Memorizza la selezione e aggiorna lo stato dei pulsanti (grassetto attivo ecc.). Chiamata a ogni 'selectionchange' del documento.
  function onSel() {
    const s = getSelection()
    const node = s?.anchorNode
    const body = ((node?.nodeType === 1 ? node : node?.parentElement) as HTMLElement | null | undefined)?.closest<HTMLElement>('.nb-body')
    if (!canvas || !s?.rangeCount || !body || !canvas.contains(body)) return
    activeBody = body
    activeId = (body.closest('[data-box]') as HTMLElement | null)?.dataset.box ?? activeId
    saved = s.getRangeAt(0).cloneRange()
    const a: Record<string, boolean> = {}
    for (const c of STATE_CMDS) a[c] = document.queryCommandState(c)
    active = a
  }
  $effect(() => {
    document.addEventListener('selectionchange', onSel)
    return () => document.removeEventListener('selectionchange', onSel)
  })

  // Rimette il focus nell'editor e ripristina l'ultima selezione.
  function restore() {
    if (!activeBody?.isConnected) return false
    activeBody.focus()
    if (saved && activeBody.contains(saved.startContainer)) {
      const s = getSelection()!
      s.removeAllRanges()
      s.addRange(saved)
    }
    return true
  }
  // Comandi che producono stile CSS (span con style) invece di tag semantici (b, i, ...).
  const CSS_CMDS = new Set(['foreColor', 'hiliteColor', 'fontName'])
  // Esegue un comando dell'editor (document.execCommand) sulla selezione.
  function exec(cmd: string, val?: string) {
    if (!restore()) return
    document.execCommand('defaultParagraphSeparator', false, 'p')
    document.execCommand('styleWithCSS', false, CSS_CMDS.has(cmd) ? 'true' : 'false')
    document.execCommand(cmd, false, val)
    onSel()
    onInput()
  }
  // Imposta la dimensione in pt: il browser conosce solo 7 misure, quindi si applica la 7 e si riscrive come font-size reale.
  function setSize(pt: number) {
    if (!restore()) return
    document.execCommand('styleWithCSS', false, 'false')
    document.execCommand('fontSize', false, '7')
    const spans: HTMLElement[] = []
    activeBody!.querySelectorAll('font[size="7"]').forEach((f) => {
      const sp = document.createElement('span')
      sp.style.fontSize = Math.round(((pt * 4) / 3) * 10) / 10 + 'px'
      while (f.firstChild) sp.appendChild(f.firstChild)
      sp.querySelectorAll<HTMLElement>('[style*="font-size"]').forEach((x) => (x.style.fontSize = ''))
      f.replaceWith(sp)
      spans.push(sp)
    })
    if (spans.length) {
      const r = document.createRange()
      r.setStartBefore(spans[0])
      r.setEndAfter(spans[spans.length - 1])
      const s = getSelection()!
      s.removeAllRanges()
      s.addRange(r)
    }
    onSel()
    onInput()
  }
  // Aggiunge un link al testo selezionato (chiede l'indirizzo).
  function link() {
    if (!restore()) return
    const url = prompt('Link address (https://…)', 'https://')
    if (url && /^(https?:|mailto:)/i.test(url.trim())) exec('createLink', url.trim())
  }
  // Inserisce una tabella 3x3.
  function table() {
    const cell = '<td><br></td>'
    const row = `<tr>${cell.repeat(3)}</tr>`
    exec('insertHTML', `<table><tbody>${row.repeat(3)}</tbody></table><p><br></p>`)
  }
  // Usa il valore di un <select> come comando e lo riporta alla voce iniziale.
  function pick(e: Event, fn: (v: string) => void) {
    const el = e.currentTarget as HTMLSelectElement
    if (el.value) fn(el.value)
    el.value = ''
  }

  const FONTS = ['Arial', 'Calibri', 'Verdana', 'Tahoma', 'Georgia', 'Times New Roman', 'Courier New', 'Consolas', 'Comic Sans MS']
  const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48]

  // Inserisce HTML gia' pulito alla posizione del cursore (incolla/rilascia).
  function insertClean(html: string) {
    document.execCommand('insertHTML', false, html)
    onInput()
  }
  // Testo semplice -> HTML (a-capo come <br>, doppio a-capo come nuovo paragrafo).
  const textToHtml = (t: string) =>
    t.split(/\r?\n\r?\n/).map((p) => `<p>${escapeHtml(p).replace(/\r?\n/g, '<br>')}</p>`).join('')

  // Riduce un'immagine (max 1600 px, png o jpeg) e la restituisce come <img> con data URI e dimensioni di visualizzazione (max 560 px di larghezza).
  async function imageHtml(f: Blob): Promise<string> {
    const bmp = await createImageBitmap(f)
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
    const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k))
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')!
    const jpeg = f.type === 'image/jpeg'
    if (jpeg) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h) }
    ctx.drawImage(bmp, 0, 0, w, h)
    bmp.close()
    const src = c.toDataURL(jpeg ? 'image/jpeg' : 'image/png', 0.85)
    const dw = Math.min(w, 560)
    return `<img src="${src}" width="${dw}" height="${Math.round((h * dw) / w)}">`
  }
  // Inserisce immagini nella casella attiva (se non ce n'e' una, ne crea una sotto le altre).
  async function insertImages(files: Blob[]) {
    for (const f of files) {
      let html: string
      try { html = await imageHtml(f) } catch { alert('This image could not be read.'); continue }
      await placeImage(html)
    }
  }
  // Inserisce un <img> nella casella attiva (se non ce n'e' una, ne crea una sotto le altre).
  async function placeImage(html: string) {
    if (!activeBody?.isConnected) await newBox(16, nextY())
    restore()
    insertClean(html)
  }

  // ---------- ridimensionamento delle immagini ----------

  // Immagine selezionata e suo rettangolo (px nella tela): sopra l'immagine compare un contorno con la maniglia in basso a destra.
  let selImg = $state<HTMLImageElement | null>(null)
  let selRect = $state<{ x: number; y: number; w: number; h: number } | null>(null)
  // Ricalcola il rettangolo dell'immagine selezionata rispetto alla tela.
  function updateSel() {
    if (!selImg?.isConnected || !canvas) { selImg = null; selRect = null; return }
    const r = selImg.getBoundingClientRect()
    const o = (canvas.firstElementChild as HTMLElement).getBoundingClientRect()
    selRect = { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height }
  }
  // Seleziona un'immagine (anche nel testo, cosi' Canc la elimina) e mostra la maniglia.
  function selectImage(img: HTMLImageElement) {
    const r = document.createRange()
    r.selectNode(img)
    const sel = getSelection()!
    sel.removeAllRanges()
    sel.addRange(r)
    selImg = img
    updateSel()
  }
  // Trascina la maniglia: cambia larghezza e altezza dell'immagine mantenendo le proporzioni (salvataggio a fine trascinamento).
  function imgResize(e: PointerEvent) {
    const img = selImg
    if (!img) return
    e.preventDefault()
    e.stopPropagation()
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const sx = e.clientX
    const w0 = img.getBoundingClientRect().width
    const ratio = img.getBoundingClientRect().height / w0
    const move = (ev: PointerEvent) => {
      const w = Math.min(1600, Math.max(24, Math.round(w0 + ev.clientX - sx)))
      img.setAttribute('width', String(w))
      img.setAttribute('height', String(Math.round(w * ratio)))
      updateSel()
    }
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      onInput()
      flush()
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }

  // ---------- disegno a mano libera ----------

  // Riquadro di disegno: tela PAD_W x PAD_H (trasparente), penna (colore, spessore, gomma) e riquadro che racchiude cio' che e' stato disegnato (per ritagliare).
  const PAD_W = 1000
  const PAD_H = 600
  let drawing = $state(false)
  let pad = $state<HTMLCanvasElement>()
  let pen = $state({ color: '#1d1c1d', size: 3, erase: false })
  let bounds: { x0: number; y0: number; x1: number; y1: number } | null = null
  // Apre il riquadro (vuoto).
  function openDraw() {
    bounds = null
    drawing = true
  }
  // Coordinate del puntatore sulla tela di disegno.
  function padPoint(e: PointerEvent) {
    const r = pad!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) * PAD_W) / r.width, y: ((e.clientY - r.top) * PAD_H) / r.height }
  }
  // Disegna mentre il mouse/penna/dito e' premuto.
  function padDown(e: PointerEvent) {
    e.preventDefault()
    const c = pad!
    c.setPointerCapture(e.pointerId)
    const ctx = c.getContext('2d')!
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = pen.erase ? pen.size * 4 : pen.size
    ctx.strokeStyle = pen.color
    ctx.globalCompositeOperation = pen.erase ? 'destination-out' : 'source-over'
    let p = padPoint(e)
    const mark = (q: { x: number; y: number }) => {
      if (pen.erase) return
      const m = pen.size + 2
      bounds = bounds
        ? { x0: Math.min(bounds.x0, q.x - m), y0: Math.min(bounds.y0, q.y - m), x1: Math.max(bounds.x1, q.x + m), y1: Math.max(bounds.y1, q.y + m) }
        : { x0: q.x - m, y0: q.y - m, x1: q.x + m, y1: q.y + m }
    }
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.lineTo(p.x + 0.01, p.y)
    ctx.stroke()
    mark(p)
    const move = (ev: PointerEvent) => {
      const q = padPoint(ev)
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(q.x, q.y)
      ctx.stroke()
      mark(q)
      p = q
    }
    const up = () => {
      c.removeEventListener('pointermove', move)
      c.removeEventListener('pointerup', up)
    }
    c.addEventListener('pointermove', move)
    c.addEventListener('pointerup', up)
  }
  // Svuota il disegno.
  function padClear() {
    pad?.getContext('2d')?.clearRect(0, 0, PAD_W, PAD_H)
    bounds = null
  }
  // Ritaglia il disegno attorno a cio' che e' stato tracciato e lo inserisce nella nota come immagine PNG.
  async function padInsert() {
    const c = pad
    const b = bounds
    drawing = false
    if (!c || !b) return
    const x0 = Math.max(0, Math.floor(b.x0)), y0 = Math.max(0, Math.floor(b.y0))
    const w = Math.min(PAD_W, Math.ceil(b.x1)) - x0, h = Math.min(PAD_H, Math.ceil(b.y1)) - y0
    if (w < 2 || h < 2) return
    const out = document.createElement('canvas')
    out.width = w
    out.height = h
    out.getContext('2d')!.drawImage(c, x0, y0, w, h, 0, 0, w, h)
    const dw = Math.min(w, 560)
    await placeImage(`<img src="${out.toDataURL('image/png')}" width="${dw}" height="${Math.round((h * dw) / w)}">`)
  }
  // Pulsante "inserisci immagine": apre il selettore file.
  let fileIn = $state<HTMLInputElement>()
  function pickImages(e: Event) {
    const el = e.currentTarget as HTMLInputElement
    const files = Array.from(el.files ?? [])
    el.value = ''
    if (files.length) void insertImages(files)
  }

  // Contenuto portato da incolla o trascinamento: immagini (se non c'e' testo), HTML formattato (sanitizzato) o testo semplice.
  function acceptData(dt: DataTransfer | null) {
    const html = dt?.getData('text/html')
    const text = dt?.getData('text/plain') ?? ''
    const images = Array.from(dt?.files ?? []).filter((f) => f.type.startsWith('image/'))
    if (images.length && !text.trim()) void insertImages(images)
    else if (html) insertClean(sanitizeHtml(html))
    else if (text) insertClean(textToHtml(text))
  }
  // Incolla (da Word, web, altri editor, schermate): tutto passa da acceptData, quindi mai HTML non pulito.
  function onPaste(e: ClipboardEvent) {
    e.preventDefault()
    acceptData(e.clipboardData)
  }
  // Rilascio di testo/immagini trascinati dentro una casella.
  function onDrop(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    acceptData(e.dataTransfer)
  }
  // Rilascio su un punto vuoto della tela: crea una casella li' e ci mette il contenuto.
  async function canvasDrop(e: DragEvent) {
    const t = e.target as HTMLElement
    if (!t.classList.contains('notes-canvas') && !t.classList.contains('notes-sizer')) return
    e.preventDefault()
    const r = (canvas!.firstElementChild as HTMLElement).getBoundingClientRect()
    await newBox(e.clientX - r.left, e.clientY - r.top)
    acceptData(e.dataTransfer)
  }
  // Tab/Maiusc+Tab dentro un elenco = aumenta/diminuisce il livello. Ctrl+clic su un link lo apre.
  function onKey(e: KeyboardEvent) {
    if (e.key !== 'Tab') return
    if (document.queryCommandState('insertUnorderedList') || document.queryCommandState('insertOrderedList')) {
      e.preventDefault()
      exec(e.shiftKey ? 'outdent' : 'indent')
    }
  }
  function onClick(e: MouseEvent) {
    const t = e.target as HTMLElement
    if (t.tagName === 'IMG') selectImage(t as HTMLImageElement)
    else { selImg = null; selRect = null }
    const a = (e.target as HTMLElement).closest('a')
    if (a && (e.ctrlKey || e.metaKey) && a.getAttribute('href')) window.open(a.getAttribute('href')!, '_blank', 'noopener,noreferrer')
  }

  // ---------- esportazione ----------

  // Formati offerti dal menu Export.
  type ExportFormat = 'docx' | 'pdf' | 'html' | 'md' | 'txt'
  // Esegue l'esportazione: 'name' e' il nome del file (senza estensione) e il titolo del documento.
  function exportPages(fmt: ExportFormat, name: string, list: { title: string; html: string }[]) {
    const file = safeName(name)
    if (fmt === 'docx') download(toDocx(list), file + '.docx')
    else if (fmt === 'pdf') printPdf(file, list)
    else if (fmt === 'html') download(new Blob([toHtmlDoc(file, list)], { type: 'text/html;charset=utf-8' }), file + '.html')
    else if (fmt === 'md') download(new Blob([toMarkdown(list)], { type: 'text/markdown;charset=utf-8' }), file + '.md')
    else download(new Blob([toText(list)], { type: 'text/plain;charset=utf-8' }), file + '.txt')
  }

  // Esporta nel formato scelto secondo l'ambito (pagina, sezione o intera lista). Salva prima il testo in corso.
  function doExport(fmt: ExportFormat) {
    flush()
    const project = store.currentProject?.name ?? 'Notes'
    const ex = (p: NotePage) => ({ title: p.title, html: pageHtml(p) })
    let list: { title: string; html: string }[] = []
    let name = project
    if (scope === 'page' && page) {
      list = [ex(page)]
      name = page.title || project
    } else if (scope === 'section' && section) {
      list = pages.map(ex)
      name = `${project} - ${section.name}`
    } else {
      list = sections.flatMap((s) => store.sectionPages(s.id).map((p) => ({ title: `${s.name} / ${p.title || 'Untitled'}`, html: pageHtml(p) })))
    }
    if (!list.length) return
    exportPages(fmt, name, list)
    exportOpen = false
  }
</script>

<svelte:window bind:innerWidth={vw} bind:innerHeight={vh} />

{#if win.open}
  <div
    class="notes-win"
    class:min={win.min && !win.docked}
    class:max={win.max && !win.docked}
    class:docked={win.docked}
    style:left={win.docked ? undefined : geo.x + 'px'}
    style:top={win.docked ? undefined : geo.y + 'px'}
    style:width={win.docked ? store.width('notesDock', 440) + 'px' : geo.w + 'px'}
    style:height={win.docked ? undefined : win.min ? 'auto' : geo.h + 'px'}
    role="dialog"
    aria-label="Notes"
  >
    <!-- agganciata a destra: maniglia per cambiare la larghezza del pannello -->
    {#if win.docked}
      <div class="resizer" role="separator" aria-orientation="vertical" use:resizer={{ key: 'notesDock', dir: -1, min: 320, max: 1000, fallback: 440 }}></div>
    {/if}
    <!-- barra del titolo: trascinabile, doppio click = ingrandisci/ripristina -->
    <div class="notes-head" role="presentation" onpointerdown={dragStart} ondblclick={() => !win.docked && store.setNotesWin({ max: !win.max, min: false })}>
      <button class="icon light" title="Show/hide pages" onclick={() => store.setNotesWin({ list: !win.list, min: false })}>☰</button>
      <strong class="notes-name">📝 Notes — {store.currentProject?.name}</strong>
      <span class="spacer"></span>
      <div class="fwrap">
        <button class="icon light" title="Export" onclick={() => (exportOpen = !exportOpen)}>⇩</button>
        {#if exportOpen}
          <div class="backdrop" role="presentation" onclick={() => (exportOpen = false)}></div>
          <div class="popover notes-export">
            <div class="notes-scope">
              <label><input type="radio" bind:group={scope} value="page" /> This page</label>
              <label><input type="radio" bind:group={scope} value="section" /> All pages of this section</label>
              <label><input type="radio" bind:group={scope} value="list" /> Whole list</label>
            </div>
            <button disabled={!page} onclick={() => doExport('docx')}>Word (.docx)</button>
            <button disabled={!page} onclick={() => doExport('pdf')}>PDF (print dialog)</button>
            <button disabled={!page} onclick={() => doExport('html')}>HTML</button>
            <button disabled={!page} onclick={() => doExport('md')}>Markdown (.md)</button>
            <button disabled={!page} onclick={() => doExport('txt')}>Plain text (.txt)</button>
          </div>
        {/if}
      </div>
      <button class="icon light" title={win.docked ? 'Float the window' : 'Dock to the right side'} onclick={() => store.setNotesWin({ docked: !win.docked, min: false, max: false })}>{win.docked ? '⧉' : '⇥'}</button>
      {#if !win.docked}
        <button class="icon light" title={win.min ? 'Expand' : 'Collapse'} onclick={() => store.setNotesWin({ min: !win.min })}>{win.min ? '▭' : '–'}</button>
        <button class="icon light" title={win.max ? 'Restore' : 'Maximize'} onclick={() => store.setNotesWin({ max: !win.max, min: false })}>{win.max ? '❐' : '▢'}</button>
      {/if}
      <button class="icon light" title="Close" onclick={close}>✕</button>
    </div>

    <div class="notes-body" hidden={win.min && !win.docked}>
      <!-- schede delle sezioni -->
      <div class="notes-tabs">
        {#each sections as s (s.id)}
          <button class="notes-tab" class:active={s.id === section?.id} ondblclick={renameSection} onclick={() => pickSection(s.id)}>{s.name}</button>
        {/each}
        <button class="icon" title="New section" onclick={newSection}>+</button>
        {#if section}
          <span class="spacer"></span>
          <button class="icon" title="Rename section" onclick={renameSection}>✎</button>
          <button class="icon" title="Delete section" onclick={deleteSection}>🗑</button>
        {/if}
      </div>

      {#if !section}
        <div class="notes-empty">
          <p>No notes for this list yet.</p>
          <button class="chip primary" onclick={newSection}>+ New section</button>
        </div>
      {:else}
        <div class="notes-main">
          <!-- elenco delle pagine -->
          {#if win.list}
            <div class="notes-pages">
              <button class="chip" onclick={newPage}>+ New page</button>
              {#each pages as p (p.id)}
                <button class="notes-page" class:active={p.id === page?.id} onclick={() => pickPage(p.id)}>{p.title || 'Untitled'}</button>
              {/each}
            </div>
          {/if}

          <div class="notes-doc">
            {#if !page}
              <div class="notes-empty">
                <p>This section has no pages.</p>
                <button class="chip primary" onclick={newPage}>+ New page</button>
              </div>
            {:else}
              <div class="notes-titlebar">
                <input class="notes-title" placeholder="Page title" value={page.title} oninput={(e) => setTitle(e.currentTarget.value)} />
                <button class="icon" title="Move page up" onclick={() => store.movePage(page.id, -1)}>▲</button>
                <button class="icon" title="Move page down" onclick={() => store.movePage(page.id, 1)}>▼</button>
                <button class="icon" title="Delete page" onclick={deletePage}>🗑</button>
              </div>

              <!-- barra strumenti: onmousedown preventDefault = il click non toglie la selezione dall'editor -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="notes-tools" onmousedown={(e) => { if (!(e.target as HTMLElement).closest('select,input')) e.preventDefault() }}>
                <select title="Paragraph style" onchange={(e) => pick(e, (v) => exec('formatBlock', v))}>
                  <option value="">Style</option>
                  <option value="<p>">Paragraph</option>
                  <option value="<h1>">Heading 1</option>
                  <option value="<h2>">Heading 2</option>
                  <option value="<h3>">Heading 3</option>
                  <option value="<blockquote>">Quote</option>
                  <option value="<pre>">Code</option>
                </select>
                <select title="Font" onchange={(e) => pick(e, (v) => exec('fontName', v))}>
                  <option value="">Font</option>
                  {#each FONTS as f}<option value={f} style:font-family={f}>{f}</option>{/each}
                </select>
                <select title="Size (pt)" onchange={(e) => pick(e, (v) => setSize(Number(v)))}>
                  <option value="">Size</option>
                  {#each SIZES as s}<option value={s}>{s}</option>{/each}
                </select>
                <span class="sep"></span>
                <button class="tb" class:on={active.bold} title="Bold (Ctrl+B)" onclick={() => exec('bold')}><b>B</b></button>
                <button class="tb" class:on={active.italic} title="Italic (Ctrl+I)" onclick={() => exec('italic')}><i>I</i></button>
                <button class="tb" class:on={active.underline} title="Underline (Ctrl+U)" onclick={() => exec('underline')}><u>U</u></button>
                <button class="tb" class:on={active.strikeThrough} title="Strikethrough" onclick={() => exec('strikeThrough')}><s>S</s></button>
                <label class="tb color" title="Text color">A<input type="color" value="#c0392b" oninput={(e) => exec('foreColor', e.currentTarget.value)} /></label>
                <label class="tb color hl" title="Highlight">▮<input type="color" value="#ffe14d" oninput={(e) => exec('hiliteColor', e.currentTarget.value)} /></label>
                <span class="sep"></span>
                <button class="tb" class:on={active.insertUnorderedList} title="Bulleted list" onclick={() => exec('insertUnorderedList')}>• ≡</button>
                <button class="tb" class:on={active.insertOrderedList} title="Numbered list" onclick={() => exec('insertOrderedList')}>1. ≡</button>
                <button class="tb" title="Decrease indent" onclick={() => exec('outdent')}>⇤</button>
                <button class="tb" title="Increase indent" onclick={() => exec('indent')}>⇥</button>
                <span class="sep"></span>
                <button class="tb" title="Align left" onclick={() => exec('justifyLeft')}>⬅</button>
                <button class="tb" title="Center" onclick={() => exec('justifyCenter')}>↔</button>
                <button class="tb" title="Align right" onclick={() => exec('justifyRight')}>➡</button>
                <span class="sep"></span>
                <button class="tb" title="Link (Ctrl+click opens it)" onclick={link}>🔗</button>
                <button class="tb" title="Insert table" onclick={table}>▦</button>
                <button class="tb" title="Insert image (you can also paste or drop images)" onclick={() => fileIn?.click()}>🖼</button>
                <input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/bmp" multiple hidden bind:this={fileIn} onchange={pickImages} />
                <button class="tb" title="Draw freehand" onclick={openDraw}>✏</button>
                <button class="tb" title="Horizontal line" onclick={() => exec('insertHorizontalRule')}>―</button>
                <button class="tb" title="Clear formatting" onclick={() => exec('removeFormat')}>Tx</button>
                <span class="sep"></span>
                <button class="tb" title="Undo (Ctrl+Z)" onclick={() => exec('undo')}>↶</button>
                <button class="tb" title="Redo (Ctrl+Y)" onclick={() => exec('redo')}>↷</button>
              </div>

              <!-- tela: click su un punto vuoto = nuova casella; ogni casella ha la sua maniglia (in alto), il bordo destro per la larghezza -->
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="notes-canvas" bind:this={canvas} onclick={canvasClick} ondragover={(e) => e.preventDefault()} ondrop={canvasDrop}>
                <div class="notes-sizer">
                  {#each boxes as b (b.id + ':' + rev)}
                    <div class="nb" class:on={b.id === activeId} data-box={b.id} style:left="{b.x}px" style:top="{b.y}px" style:width="{b.w}px">
                      <div class="nb-grip" role="presentation" title="Drag to move" onpointerdown={(e) => boxDrag(e, b)}>
                        <span>⋯</span>
                        <button class="nb-x" title="Delete this box" onclick={() => removeBox(b.id)}>✕</button>
                      </div>
                      <div
                        class="nb-body"
                        contenteditable="true"
                        role="textbox"
                        tabindex="0"
                        aria-multiline="true"
                        spellcheck="true"
                        use:boxInit={b.html}
                        oninput={onInput}
                        onfocus={(e) => { activeBody = e.currentTarget; activeId = b.id }}
                        onblur={flush}
                        onpaste={onPaste}
                        ondrop={onDrop}
                        onkeydown={onKey}
                        onclick={onClick}
                      ></div>
                      <div class="nb-rz" role="presentation" onpointerdown={(e) => boxResize(e, b)}></div>
                    </div>
                  {/each}
                  {#if selRect}
                    <div class="img-sel" style:left="{selRect.x}px" style:top="{selRect.y}px" style:width="{selRect.w}px" style:height="{selRect.h}px">
                      <div class="img-h" role="presentation" title="Drag to resize" onpointerdown={imgResize}></div>
                    </div>
                  {/if}
                </div>
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>

    <!-- riquadro di disegno a mano libera -->
    {#if drawing}
      <div class="draw-ov" role="presentation">
        <div class="draw-box">
          <div class="draw-tools">
            <label class="tb color" title="Pen color"><input type="color" bind:value={pen.color} onchange={() => (pen.erase = false)} /></label>
            <select title="Pen size" bind:value={pen.size}>
              {#each [1, 2, 3, 5, 8, 14] as n}<option value={n}>{n} px</option>{/each}
            </select>
            <button class="chip" class:active={!pen.erase} onclick={() => (pen.erase = false)}>✏ Pen</button>
            <button class="chip" class:active={pen.erase} onclick={() => (pen.erase = true)}>⌫ Eraser</button>
            <button class="chip" onclick={padClear}>Clear</button>
            <span class="spacer"></span>
            <button class="chip" onclick={() => (drawing = false)}>Cancel</button>
            <button class="chip primary" onclick={padInsert}>Insert</button>
          </div>
          <canvas class="draw-pad" width={PAD_W} height={PAD_H} bind:this={pad} onpointerdown={padDown}></canvas>
        </div>
      </div>
    {/if}

    <!-- maniglie di ridimensionamento (nascoste se ingrandita o ridotta) -->
    {#if !win.max && !win.min && !win.docked}
      {#each ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as d}
        <div class="notes-rz {d}" role="presentation" onpointerdown={(e) => resizeStart(e, d)}></div>
      {/each}
    {/if}
  </div>
{/if}

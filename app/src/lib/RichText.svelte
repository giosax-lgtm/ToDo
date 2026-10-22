<!--
  Piccolo editor di testo formattato per la descrizione di un task: grassetto, corsivo, sottolineato, barrato, link, elenco numerato e puntato,
  citazione, codice in linea e blocco di codice. E' un contenteditable; il contenuto passa SEMPRE da toStored() (lib/desc.ts -> sanitizeHtml) prima di essere salvato.
  Immagini: si possono incollare, trascinare o aggiungere con il pulsante. Usato da CardDetail.svelte.
-->

<script lang="ts">
  import { descHtml, toStored } from './desc'
  import { sanitizeHtml, escapeHtml } from './notehtml'

  let { value, onsave }: { value: string; onsave: (v: string) => void } = $props()

  let el: HTMLDivElement | undefined
  let fileInput: HTMLInputElement | undefined
  let linkOpen = $state(false)
  let linkUrl = $state('')
  let linkInput: HTMLInputElement | undefined
  let savedRange: Range | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let active = $state<Record<string, boolean>>({})

  // Allinea l'editor al valore salvato, ma solo quando non si sta scrivendo (altrimenti il cursore salterebbe).
  $effect(() => {
    const html = descHtml(value)
    if (el && document.activeElement !== el && el.innerHTML !== html) el.innerHTML = html
  })

  function save() {
    clearTimeout(timer)
    if (!el) return
    const next = toStored(el.innerHTML)
    if (next !== value) onsave(next)
  }
  function onInput() {
    clearTimeout(timer)
    timer = setTimeout(save, 700)
    refreshState()
  }

  // Stato dei pulsanti (grassetto attivo ecc.) in base alla posizione del cursore.
  function refreshState() {
    const sel = getSelection()
    const inside = (tag: string) => {
      let n: Node | null = sel?.anchorNode ?? null
      while (n && n !== el) {
        if (n.nodeType === 1 && (n as HTMLElement).tagName.toLowerCase() === tag) return true
        n = n.parentNode
      }
      return false
    }
    if (!el || !sel || !el.contains(sel.anchorNode)) { active = {}; return }
    active = {
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      strikeThrough: document.queryCommandState('strikeThrough'),
      ol: inside('ol'), ul: inside('ul'), quote: inside('blockquote'), code: inside('code'), pre: inside('pre'), link: inside('a'),
    }
  }

  function cmd(name: string, arg?: string) {
    el?.focus()
    document.execCommand('styleWithCSS', false, 'false')
    document.execCommand(name, false, arg)
    onInput()
  }

  // Citazione e blocco di codice: premere di nuovo torna al paragrafo normale.
  function block(tag: 'blockquote' | 'pre') {
    cmd('formatBlock', active[tag === 'pre' ? 'pre' : 'quote'] ? 'div' : tag)
  }

  // Codice in linea: avvolge la selezione in <code>, o la toglie se il cursore e' gia' in un <code>.
  function inlineCode() {
    el?.focus()
    const sel = getSelection()
    if (!sel || !sel.rangeCount) return
    if (active.code) {
      let n: Node | null = sel.anchorNode
      while (n && n !== el && !(n.nodeType === 1 && (n as HTMLElement).tagName === 'CODE')) n = n.parentNode
      if (n && n !== el) { (n as HTMLElement).replaceWith(...Array.from(n.childNodes)); onInput() }
      return
    }
    if (sel.isCollapsed) return
    document.execCommand('insertHTML', false, `<code>${escapeHtml(sel.toString())}</code>`)
    onInput()
  }

  function openLink() {
    const sel = getSelection()
    if (!el || !sel || !sel.rangeCount || !el.contains(sel.anchorNode)) { el?.focus(); return }
    savedRange = sel.getRangeAt(0).cloneRange()
    if (active.link) { cmd('unlink'); return }
    linkUrl = 'https://'
    linkOpen = true
    queueMicrotask(() => { linkInput?.focus(); linkInput?.select() })
  }
  function applyLink() {
    const url = linkUrl.trim()
    linkOpen = false
    if (!url || !savedRange) return
    el?.focus()
    const sel = getSelection()
    sel?.removeAllRanges()
    sel?.addRange(savedRange)
    const href = /^(https?:|mailto:)/i.test(url) ? url : `https://${url}`
    if (savedRange.collapsed) document.execCommand('insertHTML', false, `<a href="${escapeHtml(href)}">${escapeHtml(url)}</a>`)
    else document.execCommand('createLink', false, href)
    onInput()
  }

  function readDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const fr = new FileReader()
      fr.onload = () => resolve(String(fr.result ?? ''))
      fr.onerror = () => reject(new Error('Could not read image'))
      fr.readAsDataURL(file)
    })
  }
  async function attachImages(files: FileList | File[] | null | undefined) {
    const images = Array.from(files ?? []).filter((f) => f.type.startsWith('image/'))
    if (!images.length) return
    const urls = await Promise.all(images.map(readDataUrl))
    el?.focus()
    for (const u of urls) document.execCommand('insertImage', false, u)
    if (fileInput) fileInput.value = ''
    onInput()
    save()
  }

  function onPaste(e: ClipboardEvent) {
    const files = e.clipboardData?.files
    if (files && Array.from(files).some((f) => f.type.startsWith('image/'))) {
      e.preventDefault()
      void attachImages(files)
      return
    }
    e.preventDefault()
    const html = e.clipboardData?.getData('text/html')
    if (html) document.execCommand('insertHTML', false, sanitizeHtml(html))
    else document.execCommand('insertText', false, e.clipboardData?.getData('text/plain') ?? '')
    onInput()
  }
  function onDrop(e: DragEvent) {
    const files = e.dataTransfer?.files
    if (files && Array.from(files).some((f) => f.type.startsWith('image/'))) {
      e.preventDefault()
      void attachImages(files)
    }
  }

  // Ctrl/Cmd + click apre il link (un click semplice serve a posizionare il cursore).
  function onClick(e: MouseEvent) {
    const a = (e.target as HTMLElement).closest('a')
    if (a && (e.ctrlKey || e.metaKey)) { e.preventDefault(); window.open(a.getAttribute('href') ?? '', '_blank', 'noopener,noreferrer') }
  }

  function onKey(e: KeyboardEvent) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return
    const k = e.key.toLowerCase()
    if (k === 'k') { e.preventDefault(); openLink() }
  }
</script>

<svelte:document onselectionchange={() => { if (el && document.activeElement === el) refreshState() }} />

<div class="rt">
  <div class="rt-bar" role="toolbar" aria-label="Formatting">
    <button type="button" class:on={active.bold} title="Bold (Ctrl+B)" aria-label="Bold" onmousedown={(e) => e.preventDefault()} onclick={() => cmd('bold')}><b>B</b></button>
    <button type="button" class:on={active.italic} title="Italic (Ctrl+I)" aria-label="Italic" onmousedown={(e) => e.preventDefault()} onclick={() => cmd('italic')}><i>I</i></button>
    <button type="button" class:on={active.underline} title="Underline (Ctrl+U)" aria-label="Underline" onmousedown={(e) => e.preventDefault()} onclick={() => cmd('underline')}><u>U</u></button>
    <button type="button" class:on={active.strikeThrough} title="Strikethrough" aria-label="Strikethrough" onmousedown={(e) => e.preventDefault()} onclick={() => cmd('strikeThrough')}><s>S</s></button>
    <span class="sep"></span>
    <button type="button" class:on={active.link} title="Link (Ctrl+K)" aria-label="Link" onmousedown={(e) => e.preventDefault()} onclick={openLink}>🔗</button>
    <span class="sep"></span>
    <button type="button" class:on={active.ol} title="Numbered list" aria-label="Numbered list" onmousedown={(e) => e.preventDefault()} onclick={() => cmd('insertOrderedList')}>1.</button>
    <button type="button" class:on={active.ul} title="Bulleted list" aria-label="Bulleted list" onmousedown={(e) => e.preventDefault()} onclick={() => cmd('insertUnorderedList')}>•</button>
    <span class="sep"></span>
    <button type="button" class:on={active.quote} title="Quote" aria-label="Quote" onmousedown={(e) => e.preventDefault()} onclick={() => block('blockquote')}>❝</button>
    <button type="button" class:on={active.code} title="Inline code" aria-label="Inline code" onmousedown={(e) => e.preventDefault()} onclick={inlineCode}>&lt;/&gt;</button>
    <button type="button" class:on={active.pre} title="Code block" aria-label="Code block" onmousedown={(e) => e.preventDefault()} onclick={() => block('pre')}>{'{ }'}</button>
    <span class="sep"></span>
    <button type="button" title="Add image" aria-label="Add image" onmousedown={(e) => e.preventDefault()} onclick={() => fileInput?.click()}>📎</button>
  </div>
  {#if linkOpen}
    <div class="rt-link">
      <input bind:this={linkInput} bind:value={linkUrl} placeholder="https://…" onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyLink() } else if (e.key === 'Escape') { e.stopPropagation(); linkOpen = false } }} />
      <button type="button" onclick={applyLink}>Apply</button>
      <button type="button" onclick={() => (linkOpen = false)}>Cancel</button>
    </div>
  {/if}
  <input type="file" accept="image/*" multiple hidden bind:this={fileInput} onchange={(e) => void attachImages((e.currentTarget as HTMLInputElement).files)} />
  <div class="rt-body" bind:this={el} contenteditable="true" role="textbox" aria-multiline="true" aria-label="Description" tabindex="0"
    oninput={onInput} onblur={save} onpaste={onPaste} ondrop={onDrop} onclick={onClick} onkeydown={onKey}></div>
</div>

<style>
  .rt { border: 1px solid var(--border); border-radius: 0.5714rem; background: var(--surface); overflow: hidden; }
  .rt:focus-within { border-color: var(--accent); }
  .rt-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 0.15rem; padding: 0.3rem 0.4rem; border-bottom: 1px solid var(--border); background: var(--surface-2); }
  .rt-bar button { min-width: 1.9rem; height: 1.9rem; padding: 0 0.35rem; border: 0; border-radius: 0.35rem; background: transparent; color: var(--text); cursor: pointer; }
  .rt-bar button:hover { background: var(--hover); }
  .rt-bar button.on { background: var(--sel-bg); color: var(--side-active); }
  .sep { width: 1px; height: 1.2rem; margin: 0 0.25rem; background: var(--border); }
  .rt-link { display: flex; gap: 0.3rem; padding: 0.4rem; border-bottom: 1px solid var(--border); }
  .rt-link input { flex: 1; min-width: 0; padding: 0.3rem 0.5rem; border: 1px solid var(--border); border-radius: 0.4rem; background: var(--surface); }
  .rt-link button { padding: 0.2rem 0.6rem; border: 1px solid var(--border); border-radius: 0.4rem; background: var(--surface); cursor: pointer; }
  .rt-body { min-height: 5.5rem; max-height: 60vh; overflow: auto; padding: 0.5rem 0.65rem; outline: none; overflow-wrap: anywhere; }
  .rt-body :global(a) { color: var(--side-active); text-decoration: underline; }
  .rt-body :global(ul), .rt-body :global(ol) { margin: 0.25rem 0; padding-left: 1.5rem; }
  .rt-body :global(blockquote) { margin: 0.35rem 0; padding: 0.1rem 0 0.1rem 0.75rem; border-left: 3px solid var(--border); color: var(--muted); }
  .rt-body :global(code) { padding: 0.05rem 0.3rem; border-radius: 0.3rem; background: var(--surface-3); font-family: ui-monospace, Consolas, monospace; font-size: 0.9em; }
  .rt-body :global(pre) { margin: 0.35rem 0; padding: 0.5rem 0.65rem; border-radius: 0.4rem; background: var(--surface-3); font-family: ui-monospace, Consolas, monospace; font-size: 0.9em; white-space: pre-wrap; }
  .rt-body :global(pre code) { padding: 0; background: none; }
  .rt-body :global(img) { display: block; max-width: 100%; height: auto; margin: 0.4rem 0; border-radius: 0.5rem; }
  @media (max-width: 700px) { .rt-body { font-size: max(16px, 1em); } }
</style>

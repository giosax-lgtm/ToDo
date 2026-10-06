// PALETTE COLORI. Unica fonte dei colori di colonne, tag e pill: bg (sfondo pill), fg (testo), col (sfondo colonna).
// Le chiavi ('gray', 'purple'...) sono quelle salvate nei dati (Column.color, FieldOption.color).
// Usato da Pill.svelte, Column.svelte, TagPicker.svelte, TableView.svelte e da store.svelte.ts (colore automatico dei nuovi tag).

// Mappa chiave colore -> tinte. Se una chiave non esiste, i componenti ripiegano su COLORS.gray.
// Slack-like pastel palette: bg for pills/columns, fg for text
export const COLORS: Record<string, { bg: string; fg: string; col: string }> = {
  gray: { bg: '#e8e8e8', fg: '#3b3b3b', col: '#efefef' },
  purple: { bg: '#e6d4f0', fg: '#5b2a86', col: '#ecdcf5' },
  red: { bg: '#f8d3d8', fg: '#a1202f', col: '#f6d6da' },
  blue: { bg: '#cfe6f3', fg: '#115a80', col: '#cde6f2' },
  yellow: { bg: '#f8e3a1', fg: '#6b4e00', col: '#f8e8ae' },
  green: { bg: '#cdeccb', fg: '#1d6a2a', col: '#d3efd1' },
  lime: { bg: '#e0ecb0', fg: '#4d5c0d', col: '#e4efbd' },
  brown: { bg: '#e6d8c3', fg: '#6b4a1f', col: '#eadfce' },
  indigo: { bg: '#d6d8f5', fg: '#2f3a8f', col: '#dcdef7' },
  pink: { bg: '#f9d4e8', fg: '#9a1f66', col: '#f9dbeb' },
}

// Elenco ordinato delle chiavi: usato per le palette di selezione (Column, TagPicker) e per assegnare un colore ciclico ai nuovi tag (store.addOption).
export const COLOR_KEYS = Object.keys(COLORS)

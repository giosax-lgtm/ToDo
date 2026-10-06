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

export const COLOR_KEYS = Object.keys(COLORS)

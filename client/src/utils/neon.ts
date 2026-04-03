/** Helpers for neon lighting: derive glow RGBA and dimmed accent from a hex color. */

export function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16),
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Darken a hex color by mixing toward black (0–1). */
export function darkenHex(hex: string, t: number): string {
  const p = parseHex(hex);
  if (!p) return hex;
  const r = p.r * (1 - t);
  const g = p.g * (1 - t);
  const b = p.b * (1 - t);
  return rgbToHex(r, g, b);
}

export function applyNeonCssVars(root: HTMLElement, hex: string): void {
  const p = parseHex(hex);
  if (!p) return;
  const { r, g, b } = p;
  const dim = darkenHex(hex, 0.18);
  root.style.setProperty('--neon-color', hex);
  root.style.setProperty('--neon-color-dim', dim);
  root.style.setProperty('--neon-glow', `rgba(${r}, ${g}, ${b}, 0.55)`);
  root.style.setProperty('--neon-glow-soft', `rgba(${r}, ${g}, ${b}, 0.22)`);
  root.style.setProperty('--neon-glow-faint', `rgba(${r}, ${g}, ${b}, 0.18)`);
  root.style.setProperty('--accent', hex);
  root.style.setProperty('--accent-hover', dim);
}

export function clearNeonCssVars(root: HTMLElement): void {
  ['--neon-color', '--neon-color-dim', '--neon-glow', '--neon-glow-soft', '--neon-glow-faint'].forEach((k) => {
    root.style.removeProperty(k);
  });
}

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');

function vars(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)) out[m[1]] = m[2].toLowerCase();
  return out;
}
const light = vars(css.slice(css.indexOf('@theme'), css.indexOf('@media (prefers-color-scheme: dark)')));
const darkStart = css.indexOf('@media (prefers-color-scheme: dark)');
const dark = vars(css.slice(darkStart, css.indexOf('html {', darkStart)));

function lum(hex: string) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a: string, b: string) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// [testo, sfondo]: le coppie usate dai componenti
const PAIRS: [string, string][] = [
  ['ink', 'cream'], ['ink', 'paper'], ['ink', 'lilac-soft'], ['ink', 'field'],
  ['muted', 'cream'], ['muted', 'paper'], ['muted', 'lilac-soft'],
  ['title', 'cream'], ['title', 'paper'], ['title', 'lilac-soft'],
  ['danger', 'cream'], ['danger', 'paper'], ['danger', 'lilac-soft'],
  ['#ffffff', 'plum'], ['#ffffff', 'plum-2'], ['#ffffff', 'blue'], ['#ffffff', 'ok'], ['#ffffff', 'ko'],
  ['gold', 'plum'], ['on-gold', 'gold'],
];

describe.each([['chiaro', light], ['scuro', dark]] as const)('tema %s', (_n, t) => {
  it.each(PAIRS)('%s su %s >= 4.5', (fg, bg) => {
    const f = fg.startsWith('#') ? fg : t[fg];
    expect(f, fg).toBeDefined();
    expect(t[bg], bg).toBeDefined();
    expect(ratio(f, t[bg])).toBeGreaterThanOrEqual(4.5);
  });
});

it('il tema scuro ridefinisce ogni variabile del tema chiaro', () => {
  expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
});

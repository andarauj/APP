/**
 * Guards navigation reachability.
 *
 * Twice now a screen has shipped with no way to open it: the balance, 1RM
 * and favourites screens were added without any entry point, and hiding the
 * exercises tab once left the whole library unreachable. Neither showed up
 * in typecheck, lint or any other test — the code was correct, the app was
 * broken.
 *
 * These tests read the router.push targets out of the source and check that
 * a matching file exists under app/, which is how expo-router resolves them.
 */

import fs from 'fs';
import path from 'path';

const APP_DIR = path.join(__dirname, '..', '..', 'app');

/** Turns a router path into the file expo-router would resolve it to. */
function routeExists(route: string): boolean {
  const clean = route.split('?')[0].replace(/^\//, '');
  // Group segments like (tabs) are real directories on disk.
  const candidates = [
    path.join(APP_DIR, `${clean}.tsx`),
    path.join(APP_DIR, clean, 'index.tsx'),
  ];
  return candidates.some(p => fs.existsSync(p));
}

/** Every static router.push('/...') target in a file. */
function pushTargets(file: string): string[] {
  const src = fs.readFileSync(file, 'utf8');
  const found = new Set<string>();
  const re = /router\.push\(\s*['"](\/[^'"]*)['"]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) found.add(m[1]);
  return [...found];
}

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return e.name.endsWith('.tsx') ? [full] : [];
  });
}

describe('navigation reachability', () => {
  it('resolves every static router.push target to a screen file', () => {
    const broken: string[] = [];
    for (const file of walk(APP_DIR)) {
      for (const route of pushTargets(file)) {
        if (!routeExists(route)) {
          broken.push(`${path.relative(APP_DIR, file)} → ${route}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it('gives every analysis screen at least one way in', () => {
    // The screens that have gone missing before. Each must be the target of
    // a push from somewhere other than itself.
    const mustBeReachable = [
      '/progress',
      '/progress/balance',
      '/progress/onerm',
      '/progress/favorites',
      '/fatigue-radar',
      '/achievements',
      '/monthly-recap',
      '/photo-compare',
    ];

    const allTargets = new Set(
      walk(APP_DIR).flatMap(file =>
        pushTargets(file).map(route => `${file}::${route.split('?')[0]}`)
      )
    );

    const orphans = mustBeReachable.filter(route => {
      for (const entry of allTargets) {
        const [file, target] = entry.split('::');
        if (target !== route) continue;
        // A screen linking to itself does not count as an entry point.
        const self = path.join(APP_DIR, route.replace(/^\//, ''));
        if (file === `${self}.tsx` || file === path.join(self, 'index.tsx')) continue;
        return false;
      }
      return true;
    });

    expect(orphans).toEqual([]);
  });

  it('keeps the exercise library on the tab bar', () => {
    // Hiding this tab once made the entire library unreachable, because
    // nothing else linked to it.
    const layout = fs.readFileSync(path.join(APP_DIR, '(tabs)', '_layout.tsx'), 'utf8');
    const block = layout.slice(layout.indexOf('name="exercises"'));
    const nextScreen = block.indexOf('<Tabs.Screen');
    const ownOptions = nextScreen === -1 ? block : block.slice(0, nextScreen);
    expect(ownOptions).not.toContain('href: null');
  });
});

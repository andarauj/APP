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

/** Every static router.push('/...') or pathname: '/...' target in a file. */
function pushTargets(file: string): string[] {
  const src = fs.readFileSync(file, 'utf8');
  const found = new Set<string>();
  const rePush = /router\.push\(\s*['"](\/[^'"]*)['"]\s*\)/g;
  const rePath = /pathname:\s*['"](\/[^'"]*)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = rePush.exec(src)) !== null) found.add(m[1]);
  while ((m = rePath.exec(src)) !== null) {
    // Skip bare "/" — used as "go home" / tabs root, not a screen file.
    if (m[1] !== '/') found.add(m[1]);
  }
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
      '/plan/home',
      '/plan/531',
      '/exercise/progress',
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

  it('keeps the exercise library reachable from Treinos', () => {
    // Library lives as the "Biblioteca de Exercícios" hub segment inside
    // Treinos (embedded ExercisesScreen) — still reachable without a tab-bar
    // icon. Also keep a deep-link path via the exercises route file.
    const plans = fs.readFileSync(path.join(APP_DIR, '(tabs)', 'plans.tsx'), 'utf8');
    expect(plans).toMatch(/Biblioteca de Exercícios/);
    expect(plans).toMatch(/ExercisesScreen/);
    expect(fs.existsSync(path.join(APP_DIR, '(tabs)', 'exercises.tsx'))).toBe(true);
  });

  it('opens on Workout with exactly four bottom tabs', () => {
    const workout = fs.readFileSync(path.join(APP_DIR, '(tabs)', 'index.tsx'), 'utf8');
    expect(workout).toMatch(/Planeador/);
    expect(workout).toMatch(/Geral/);
    expect(workout).toMatch(/Treino Rápido/);
    expect(workout).toMatch(/Overview/);
    expect(workout).toMatch(/Day Details/);
    expect(workout).toMatch(/Build for Me/);
    expect(workout).toMatch(/Add Exercise/);

    const layout = fs.readFileSync(path.join(APP_DIR, '(tabs)', '_layout.tsx'), 'utf8');
    expect(layout).toMatch(/initialRouteName: 'index'/);
    expect(layout).toMatch(/title: 'Workout'/);
    expect(layout).toMatch(/title: 'Discover'/);
    expect(layout).toMatch(/title: 'Exercises'/);
    expect(layout).toMatch(/title: 'Progress'/);
    expect(layout).toMatch(/name="plans"/);
    expect(layout).toMatch(/name="profile"/);
    expect(layout).toMatch(/name="history"/);
    expect(layout).toMatch(/href:\s*null/);
  });

  it('keeps Histórico reachable off the tab bar', () => {
    const layout = fs.readFileSync(path.join(APP_DIR, '(tabs)', '_layout.tsx'), 'utf8');
    expect(layout).toMatch(/name="history"/);
    expect(layout).toMatch(/href:\s*null/);

    const progress = fs.readFileSync(path.join(APP_DIR, '(tabs)', 'progress.tsx'), 'utf8');
    expect(progress).toMatch(/\/\(tabs\)\/history/);

    const profile = fs.readFileSync(path.join(APP_DIR, '(tabs)', 'profile.tsx'), 'utf8');
    expect(profile).toMatch(/\/\(tabs\)\/history/);

    const plans = fs.readFileSync(path.join(APP_DIR, '(tabs)', 'plans.tsx'), 'utf8');
    expect(plans).toMatch(/\/\(tabs\)\/history/);

    expect(fs.existsSync(path.join(APP_DIR, '(tabs)', 'history.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(APP_DIR, '(tabs)', 'discover.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(APP_DIR, '(tabs)', 'exercises.tsx'))).toBe(true);
  });

  it('exposes Treino em Casa and 5/3/1 from the Treinos hub', () => {
    const plans = fs.readFileSync(path.join(APP_DIR, '(tabs)', 'plans.tsx'), 'utf8');
    expect(plans).toMatch(/\/plan\/home/);
    expect(plans).toMatch(/\/plan\/531/);
  });

  it('uses ScreenHeader on Histórico, Descobrir and Exercícios', () => {
    for (const file of ['history.tsx', 'discover.tsx', 'exercises.tsx']) {
      const src = fs.readFileSync(path.join(APP_DIR, '(tabs)', file), 'utf8');
      expect(src).toMatch(/ScreenHeader/);
    }
  });
});

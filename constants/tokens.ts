/**
 * "Volt & Ink" — the structural (non-color) counterpart to
 * constants/colors.ts. This formalizes values already established across
 * the app's shared primitives (Card, Chip, Button) rather than introducing
 * a new visual identity: same blue-on-near-white palette, now with a single
 * source of truth for radius, touch targets, motion and the type scale so
 * new screens don't each pick their own 8/10/11/13/24 assortment.
 */

export const RADIUS = {
  /** Cards, sheets, standalone content containers. */
  card: 16,
  /** Text inputs, textareas. */
  input: 12,
  /** Chips, pills, filter tags, small circular badges — a value this large
   *  relative to any realistic chip height always renders as a full pill;
   *  RN clamps borderRadius to half the shorter side automatically. */
  pill: 999,
} as const;

/** Every primary/full-width button's height — Button.tsx's 'medium' size. */
export const BUTTON_HEIGHT = 48;

/** Minimum interactive area for a small icon-only control (WCAG 2.5.5 /
 *  Material touch target guidance) — apply via `hitSlop`, not by resizing
 *  the visual glyph itself. */
export const TOUCH_TARGET_MIN = 44;

/** react-native-reanimated withSpring target for a pressed control —
 *  already what Button.tsx's own press-in animation uses. */
export const PRESS_SCALE = 0.96;
export const PRESS_SPRING_IN = { damping: 15, stiffness: 400 } as const;
export const PRESS_SPRING_OUT = { damping: 12, stiffness: 300 } as const;

/**
 * Three text levels — title/body/caption — covering in-content typography
 * (card headings, row text, labels). Screen-level headers (the big 28sp
 * extrabold title at the top of every tab) are a distinct, deliberately
 * larger "display" size used consistently app-wide and are NOT one of
 * these three levels; collapsing it down to 18-20sp would flatten an
 * already-consistent hierarchy, not simplify it.
 *
 * 'Inter-Medium' isn't among the weights app/_layout.tsx loads (Regular
 * 400 / SemiBold 600 / Bold 700 / ExtraBold 800 / Black 900) — Caption
 * uses SemiBold, matching the weight already used for labels/captions
 * throughout the app rather than pulling in a new font weight.
 */
export const TYPE = {
  title: { fontFamily: 'Inter-Bold', fontSize: 19, lineHeight: 24 },
  body: { fontFamily: 'Inter-Regular', fontSize: 15, lineHeight: 20 },
  caption: { fontFamily: 'Inter-SemiBold', fontSize: 12, lineHeight: 16 },
} as const;

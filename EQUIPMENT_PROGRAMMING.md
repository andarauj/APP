# Equipment Programming — machines + free weights

Grounding for `utils/equipmentProgramming.ts` and the mixed-slot path in
`utils/planGenerator.ts`. Same confidence ratings as
`HYPERTROPHY_PROGRAMMING.md`. This file only covers rules that appear in
code — not a literature review. Volume, RIR and rest stay equipment-agnostic
(see that file). There are **no** Gymleco-brand trials; Gymleco is treated as
a generic guided/selectorized machine.

**Confidence key**
- **Well-established** — meta-analysis or replicated experimental evidence.
- **Reasonable-but-debated** — peer-reviewed, directionally consistent, contested or thin.
- **Heuristic / practitioner consensus** — useful default; do not present as "the science says X."

---

## Equipment classes

| Class     | Tags                                              |
|-----------|---------------------------------------------------|
| `free`    | barbell, dumbbell, ez_bar, trap_bar, kettlebell   |
| `machine` | gymleco, machine, cable, smith                    |
| `body`    | bodyweight, band                                  |

Slots run **only** when a muscle's filtered pool contains both `free` and
`machine`. Exclusive prefs (`gymleco`, `free_weights`, `home_dumbbell`) and
single-class checklists never mix and never leak the other class.
`gymleco` may add generic `machine` (same class), not because the seed is
empty.

## Hypertrophy (and endurance)

Machine and free-weight training produce similar hypertrophy when volume and
effort are matched.

Sources: Haugen et al. 2023, *BMC Sports Sci Med Rehabil* (SMD −0.055);
Heidel et al. 2022 (ES −0.01); Schwanbeck et al. 2020; Hernández-Belmonte
et al. 2023.
Confidence: **Well-established** for *no superiority*. Hypertrophy cells are
still few — UI copy must not say machines or free weights "win".

Code (heuristic combination, not an RCT of slots): when both classes exist,
intermediate/advanced days take a **free compound** first and a **machine
isolation** of another movement family next. Haugen speculates a mix may
help (stable near-failure sets + free-weight loadability).
Confidence: **Heuristic.**

## Strength

Strength gains are **modality-specific**: free-weight tests favour
free-weight training; machine tests favour machines; neutral/isometric tests
do not differ.

Sources: Haugen et al. 2023 (free-weight tests SMD −0.210); Heidel et al.
2022 (ES 0.66 / −0.78).
Confidence: **Well-established.**

Code: strength primary slot prefers a **free compound** when one exists.

## Beginners

Heisel et al. 2020 (novice RCT): machines-only, free-weights-only, or
machine → free after 5 weeks all worked. The studied practice is starting
on a fixed path.
Confidence: **Reasonable-but-debated.**

Code: non-strength **beginner** primary prefers a **machine compound** when
one exists. Strength beginners still follow the free-compound rule
(specificity).

## Exercise order

Nunes et al. 2020: hypertrophy is similar MJ→SJ vs SJ→MJ; the exercise done
**first** gains more strength. ACSM: include both, emphasise multi-joint.
Confidence: hypertrophy **well-established**; putting the compound first is
**heuristic** (useful for strength on that lift).

Code: `orderByMuscleGroup` sorts compound before isolation inside a muscle,
not by barbell-over-machine equipment rank.

## What usage history may not do

A logged staple must not steal the primary or first complementary slot on a
mixed pool. Usage still ranks exclusive (single-class) pools and breaks ties
after the first two mixed slots.

## Load increment

Gymleco 300-series stacks start at **2.5 kg** steps. `loadIncrement` treats
`gymleco` like `machine` / cable / smith (2.5 kg). Not a brand rule.
Confidence: **Heuristic** (manufacturer spec, not a training outcome study).

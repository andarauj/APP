# Inter-Set Rest Intervals — Research Reference

Compiled research grounding for `restSecondsFor()` in `utils/planGenerator.ts`, replacing
a single flat rest value per plan goal with one that also accounts for whether the
exercise is a compound (multi-joint) or isolation (single-joint) movement. Same
confidence-rating convention as `PERIODIZATION_RESEARCH.md`.

**Confidence key**
- **Well-established** — direct experimental evidence, meta-analysis, or long-standing
  consensus across independent research groups.
- **Reasonable-but-debated** — peer-reviewed, plausible, but contested, underpowered, or
  a small number of studies.
- **Heuristic / practitioner consensus** — no direct controlled evidence for the specific
  number; expert opinion or a defensible simplification.

---

## 1. Baseline ranges by training goal

**ACSM Position Stand** — American College of Sports Medicine, "Progression Models in
Resistance Training for Healthy Adults," *Medicine & Science in Sports & Exercise*,
41(3): 687-708, 2009. The most citable primary source:
- **Strength (1-6RM, heavy loading, advanced):** 3-5 min for core/multi-joint exercises.
  **Well-established.**
- **Hypertrophy (6-12RM):** 1-2 min. **Well-established.**
- **Muscular endurance (>15 reps, 40-60% 1RM):** short rest, <90s. **Well-established.**

Crucially, ACSM's advanced-strength-phase guidance **already splits by exercise role**,
independent of rep range: 2-3 min for core (multi-joint) lifts vs. 1-2 min for
assistance/single-joint work at the *same* training phase. This is the direct source for
splitting every goal by compound vs. isolation below, not an extrapolation.

NSCA's *Essentials of Strength Training and Conditioning* gives a closely aligned but not
identical hypertrophy range (30-90s) — the two flagship US bodies don't fully agree,
which is itself informative: there is no single "correct" number, only a defensible
range. **Well-established, with genuine spread between sources.**

## 2. Compound vs. isolation, independent of goal

- **ACSM (2009)** itself differentiates by exercise role, not just rep range (see above).
  **Well-established** — the one top-tier source baking exercise type directly into rest
  guidance.
- **Dourado et al., "Different time course recovery of muscle edema within the
  quadriceps femoris and functional performance after single- vs multi-joint exercises,"
  *Biology of Sport*, 2023** (PMC10286608): multi-joint leg press produced slower
  recovery of functional performance and muscle edema than single-joint knee extension
  at matched volume/load. Evidence that compound movements induce more prolonged fatigue
  — supports the general principle, though this is a between-session (24-96h) finding,
  not a between-set (seconds) one. **Reasonable-but-debated** for direct inter-set
  extrapolation.
- No meta-analysis was found manipulating compound-vs-isolation as its own variable at
  matched rep range/load/goal. The compound-needs-more-rest rule rests on ACSM's own
  explicit split plus mechanistic inference (more muscle mass + joints + systemic/neural
  demand → more fatigue), not a dedicated comparative RCT.

## 3. Hypertrophy: the shift away from "short rest is fine"

- **Schoenfeld, B.J., Pope, Z.K., Benik, F.M., et al., "Longer Interset Rest Periods
  Enhance Muscle Strength and Hypertrophy in Resistance-Trained Men," *Journal of
  Strength and Conditioning Research*, 30(7): 1805-1812, 2016.** RCT, 21 trained men, 8
  weeks, 1-min vs. 3-min rest, 3x8-12RM. **3-min group gained significantly more strength
  and quadriceps thickness**; arm-muscle gains were similar between groups. Directly
  overturned the old "short rest is fine/necessary for hypertrophy" belief, at least for
  lower-body/higher-fatigue musculature. **Well-established** (single RCT, but
  well-designed with a direct hypertrophy outcome).
- **Grgic, J., et al., "The effects of short versus long inter-set rest intervals... on
  measures of muscle hypertrophy," *European Journal of Sport Science*, 2017**: both
  short and long rest work for untrained lifters, but **longer rest may be advantageous
  for trained individuals**. **Reasonable-but-debated.**
- **Singer et al., "Give it a rest: a systematic review with Bayesian meta-analysis...,"
  *Frontiers in Sports and Active Living*, 2024** (PMC11349676): small favorable effect
  of >60s rest on arm/thigh hypertrophy, with no extra benefit found past ~90s.
  **Reasonable-but-debated** — direction agrees with the 2016 RCT, magnitude is small and
  imprecise.

**Bottom line: the app's previous flat 30s hypertrophy default was below every source
reviewed here** (ACSM's own floor is 60s; even the "short" arm of the 2016 RCT was 60s,
not 30s). This is the number this change corrects most.

## 4. Strength: the ATP-PCr rationale for 3-5 min

- **Harris, R.C., Edwards, R.H.T., Hultman, E., et al., "The time course of
  phosphorylcreatine resynthesis during recovery of the quadriceps muscle in man,"
  *Pflügers Archiv*, 1976** (PubMed 1034909): PCr resynthesis is biphasic — a fast
  component (~21-22s half-life) and a much slower one (half-life >170s), entirely
  blood-flow dependent. The classic source behind "PCr takes minutes, not seconds, to
  substantially replenish." **Well-established.**
- Willardson, J.M. & Burkett, L.N. (2006, 2008, *JSCR*): progressively smaller rep/volume
  decrements across repeated heavy sets as rest increases from 1→5 min — direct
  performance evidence consistent with incomplete PCr recovery driving decline at
  shorter rests. **Well-established.**

## 5. Endurance: short rest, but for a specific reason

**de Salles, B.F. et al., "Rest Interval between Sets in Strength Training," *Sports
Medicine*, 39(9): 765-777, 2009**: short rest (20s-1min) produces the lactate/metabolic
environment endurance-oriented adaptations are trained under — not simply "the inverse of
the strength number." **Reasonable-but-debated** — the acute-response evidence is solid;
long-term proof that short rest specifically builds superior muscular endurance is
thinner than the strength/hypertrophy evidence above.

## 6. Exercise-specific / upper vs. lower body scaling

**Willardson & Burkett (2006, 2008, *JSCR*)** directly compared squat and bench press
under identical rest protocols: squat volume/rep maintenance was more rest-sensitive than
bench at matched rest, attributed to greater muscle mass and metabolic cost. **This
change does not implement a separate upper/lower multiplier** — it's a real but narrowly
tested finding (squat vs. bench specifically, not deadlift/row/OHP), and adding a second
axis on top of compound/isolation would outrun what's actually tested. Flagged here for a
future, more targeted change if warranted.

---

## What the app actually implements

`restSecondsFor(planType, isCompound)` in `utils/planGenerator.ts`:

| Goal | Compound | Isolation | Source |
|---|---|---|---|
| strength | 240s (4 min) | 90s | ACSM 2009: 3-5min core / 1-2min assistance, advanced strength phase |
| hypertrophy | 120s (2 min) | 75s | ACSM 1-2min baseline + Schoenfeld 2016 RCT/Singer 2024 meta-analysis favoring the upper half of that range, esp. for compound/lower-body work |
| endurance | 45s | 30s | ACSM <90s for >15 reps; de Salles 2009 acute-metabolic rationale |
| cardio / mobility | 30s | 30s | Unchanged — these goals aren't about compound/isolation strength work |

`isCompoundMovement()` (`utils/movementClassify.ts`) classifies by a small, enumerated
isolation-keyword vocabulary (curl, extension, raise, fly, crossover, pushdown, kickback,
shrug, preacher, concentration) — everything else typed 'strength' defaults to compound,
since most distinctly-named exercises in this dataset (presses, rows, pulls, squats,
lunges, cleans...) genuinely are multi-joint.

**What's a defensible simplification, not settled science:** the exact seconds in each
cell (there is no single "correct" number — ACSM and NSCA don't even agree with each
other), and using one isolation-keyword classifier rather than a per-exercise-evidence
lookup. What's well-grounded: the *direction and rough magnitude* of every value, and
splitting by compound/isolation at all (ACSM's own advanced-strength guidance already
does this).

---

*Compiled via web research (WebSearch/WebFetch) on 2026-09-12.*

# Hypertrophy Programming — what the dose engine uses

Grounding for `utils/trainingDose.ts`, the volume-first generator path in
`utils/planGenerator.ts`, and the accumulation set-ramp in `utils/adaptivePlan.ts`.
Same confidence ratings as `PERIODIZATION_RESEARCH.md`. This file only covers
numbers and rules that appear in code — not a literature review.

**Confidence key**
- **Well-established** — meta-analysis or replicated experimental evidence.
- **Reasonable-but-debated** — peer-reviewed, directionally consistent, contested or thin.
- **Heuristic / practitioner consensus** — useful default; do not present as "the science says X."

---

## Volume unit

Weekly **hard sets** (non-warmup, ≥1 working set) on the **primary** muscle,
in roughly the **6–20+** rep range, taken near failure.

Source: Baz-Valle, Fontes-Villalba & Santos-Concejero (2018), PubMed 30063555.
Confidence: **Reasonable-but-debated.** Secondary-muscle sets are **not** counted
in v1 (would inflate volume). Sets of 4–6 sit at/below this validated range —
that is why non-strength intensification stays at 6–10, not 4–6.

## Dose–response (floor)

More weekly sets → more hypertrophy in the range actually studied. The clearest
categorical jump in the pooled data is **≥10 sets/muscle/week** vs &lt;5.

Source: Schoenfeld, Ogborn & Krieger (2017), *Journal of Sports Sciences*.
Confidence: **Well-established** for *direction*. Most included cells were ≤10
sets/week; do **not** treat 12–20 as a validated optimum (Baz-Valle et al. 2022
is mostly null). UI copy: "estimativa habitual", never "a ciência diz 12–20".

Code landmarks (heuristic start / cap by experience):

| Plan type   | Start (beg / mid / adv) | Cap (beg / mid / adv) | Min (audit floor) |
|-------------|-------------------------|------------------------|-------------------|
| Hypertrophy | 8 / 10 / 12             | 16 / 18 / 20           | 6 / 8 / 10        |
| Endurance   | same as hypertrophy     | same                   | same              |
| Strength    | 6 / 8 / 10              | 12 / 14 / 16           | 4 / 6 / 8         |

Start ≈ an MEV-ish opening (Israetel / Helms practitioner texts). Cap is a
planning ceiling, not MRV. Focus muscles get **+2** to start, never above cap.
Confidence: **Heuristic.**

## Frequency

Default splits hit each large muscle **~2×/week** so the weekly set budget
fits without 8-set days. Schoenfeld et al. (2016, *Sports Medicine*) favoured
≥2× when volume was *not* always equated; Grgic et al. (2018) found no
frequency effect when volume *was* equated.

Confidence: **Reasonable-but-debated.** Code uses 2× as a **scheduling default**,
not a hypertrophy-superiority claim. The 5-day template is Upper / Lower / Push /
Pull / Legs (`ul_ppl`), not a bro split.

## Proximity to failure (RIR)

Hypertrophy increases as sets finish closer to failure; strength does not
show the same RIR gradient.

Source: Robinson, Pelland et al. (2024), *Sports Medicine* (PubMed 38970765).
RIR ↔ RPE: RPE ≈ 10 − RIR (Zourdos et al. 2016; Helms et al. 2016).
Confidence: **Well-established** for the scale; **reasonable-but-debated** for
the exact RIR target. Defaults: hypertrophy 1–3 (phase-tilted), strength
compounds 2–4, endurance 1–2. Logged effort stays **RPE** — RIR is a
prescription, not a required log field.

## Mesocycle set ramp

Week-to-week **added sets** are the best-supported hypertrophy progression
lever inside a block (Israetel, Feather, Faleiro & Juneau 2020, *SCJ*).
Confidence: **Reasonable-but-debated** (commentary + published response).

Code: each extra accumulation week adds **+1 set per exercise**, capped at 6
sets/exercise and the muscle cap. Magnitude is a heuristic (+1–3 / muscle / week
is RP public material, not the peer-reviewed paper).

Non-strength intensification: **6–10 reps @ ~80% e1RM**, volume ~0.95× base
(load up, stay inside the 6–20+ set-count range). Strength keeps 3–5 @ ~88%.

## Rest (hypertrophy compounds)

Schoenfeld et al. (2016, *JSCR*): 3 min > 1 min for trained men (quads +
strength). ACSM 2009 hypertrophy band is 1–2 min. Code uses **150s** compounds /
**75s** isolation — a midpoint, not a constant. See `REST_INTERVAL_RESEARCH.md`.

## Deload

Unchanged: **0.50×** volume (Bell et al. 2025 moderate-recovery midpoint).

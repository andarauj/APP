# Resistance Training Periodization — Research Reference

Compiled research grounding for the adaptive periodization feature (`utils/adaptive*.ts`,
`NSPI_ENGINE.md`). Pure research — no implementation decisions are made here. Each
section states the key claims, the specific source, and an explicit confidence rating so
the numbers can be defended (or cut) in code comments and user-facing copy.

**Confidence key**
- **Well-established** — direct experimental evidence, meta-analysis, or long-standing
  consensus across independent research groups.
- **Reasonable-but-debated** — peer-reviewed, plausible, but contested, underpowered, or
  contradicted by some studies.
- **Heuristic / practitioner consensus** — no direct controlled evidence for the specific
  number; it is expert opinion, survey data, or an industry convention. Fine to use as a
  default, wrong to present as "the science says X."

---

## 1. Block periodization vs. undulating periodization

### What each model controls

- **Block periodization** sequences training into consecutive mesocycle-blocks, each
  concentrating on a minimal number of targeted abilities rather than developing
  everything at once. The classical block sequence is **accumulation** (build general
  work capacity/base — higher volume, lower intensity), **transmutation** (convert that
  base into event-specific qualities — lower volume, higher intensity/specificity), and
  **realization** (taper/peak — sharply reduced volume, retained intensity, so
  previously-built fitness "shows up" once fatigue is stripped away).
  Source: **Issurin, V.B. (2010). "New Horizons for the Methodology and Physiology of
  Training Periodization." *Sports Medicine*, 40(3), 189–206.**
  Confidence: **Reasonable-but-debated** — Issurin's synthesis is widely cited and used as
  the standard description of block structure, but a companion critique published in the
  same venue argued the claim that block periodization is empirically superior to
  traditional periodization is "premature and unsupported" (see the linked commentary in
  the same *Sports Medicine* issue). The **descriptive structure** (accumulation →
  transmutation → realization, with volume/intensity trading off) is well-established as
  a coaching model; the claim that it **outperforms other models** is contested.

- **Undulating (daily/weekly) periodization (DUP)** varies volume and intensity more
  frequently — often session-to-session rather than block-to-block — while still working
  toward a long-term goal.
  - **Hypertrophy:** A systematic review/meta-analysis (13 studies) found linear and DUP
    produce **similar hypertrophy outcomes**, and that periodizing volume/intensity at all
    (vs. not) doesn't clearly change hypertrophy when total volume is matched.
    Source: PMC5571788, *"Effects of linear and daily undulating periodized resistance
    training programs on measures of muscle hypertrophy: a systematic review and
    meta-analysis"* (2017).
  - **Strength:** DUP shows a small advantage over linear periodization for **trained**
    lifters specifically, not novices.
    Source: Comparative meta-analyses collected via **Grgic et al., "Effects of
    Periodization on Strength and Muscle Hypertrophy in Volume-Equated Resistance
    Training Programs: A Systematic Review and Meta-analysis"** (2022, PubMed
    35044672) and the earlier "Traditional vs. Undulating Periodization in the Context
    of Muscular Strength and Hypertrophy: A Meta-Analysis."
  Confidence: **Reasonable-but-debated.** Direction of effect (DUP ≥ linear for strength
  in trained lifters) recurs across meta-analyses, but effect sizes are small and studies
  are short (weeks, not years) and heterogeneous.

### The 4-phase block structure (on-ramp → accumulation → intensification → deload)

No single peer-reviewed source maps this exact 4-phase label set 1:1, but it is a direct
composite of two well-established frameworks:

1. **Bompa's 6-phase periodization model** — *anatomical adaptation* → hypertrophy →
   maximum strength → conversion → maintenance → peaking. "Anatomical adaptation" is
   explicitly a **general work-capacity/tissue-preparation phase** (moderate everything,
   emphasis on connective tissue and movement-pattern readiness before loading climbs).
   Source: **Bompa, T.O. & Buzzichelli, C., *Periodization of Strength Training for
   Sports* / *Periodization Training for Sports*** (Human Kinetics; multiple editions).
   Confidence: **Heuristic / practitioner consensus** — this is a foundational coaching
   textbook, not a controlled trial; the phase sequence reflects decades of applied
   practice and Selye-based reasoning (see below), not an RCT comparing phase orders.

2. **Classic linear/block progression**: volume high→low, intensity low→high across
   phases, with a deload/unloading week appended.
   Source: **Lorenz, D. & Morrison, S. (2015). "Current Concepts in Periodization of
   Strength and Conditioning for the Sports Physical Therapist." *International Journal
   of Sports Physical Therapy*, 10(6), 734–747.** This paper explicitly states repetition
   and loading schemes become "progressively heavier" while "volume decreases
   systematically" across phases, and describes a deload/reduced-loading week
   specifically positioned **after** the highest-intensity (realization) block "to allow
   recovery due to the high intensities."
   Confidence: **Well-established as descriptive practice**, i.e., this is how the
   field structures periodized programs; it is not a controlled-outcome claim.

### Why this order (build capacity → test intensity limits → recover)

The standard rationale invoked in the literature is **Selye's General Adaptation
Syndrome (GAS)**: a stressor triggers alarm → resistance (adaptation) → and, if
unmanaged, exhaustion. Applied to training: an early higher-volume, moderate-intensity
phase builds the tissue/work-capacity base ("resistance" adaptation) that lets the
athlete tolerate a later high-intensity phase without breaking down, and a
subsequent deload prevents the "exhaustion" stage from prolonged high-stress exposure.
Source: **Cunanan, A.J., DeWeese, B.H., Wagle, J.P., et al. (2018). "The General
Adaptation Syndrome: A Foundation for the Concept of Periodization." *Sports Medicine*,
48(4), 787–797.**
Confidence: **Reasonable-but-debated.** This paper is a direct rebuttal to prior critiques
that GAS is too simplistic/outdated to justify periodization; it generated published
counter-commentary in the same journal in 2018 (a "Comment on..." and the authors'
reply). Treat GAS as **the traditional explanatory framework the field uses**, not as
settled mechanistic proof. The practical claim — "don't test intensity limits before
building tolerance, and recover before repeating" — is essentially universal coaching
consensus (Bompa; Lorenz & Morrison; Issurin) even where the underlying GAS mechanism is
debated academically.

---

## 2. Volume landmarks — MEV, MAV, MRV, MV

### Definitions

| Landmark | Definition | Primary source |
|---|---|---|
| **MV** (Maintenance Volume) | Minimum weekly sets/muscle needed to *preserve* current muscle size — commonly cited around 4–8 (some sources ~6) sets/week for most muscles in trained lifters | Israetel et al., RP Strength materials (heuristic) |
| **MEV** (Minimum Effective Volume) | The lowest weekly volume that still produces a growth stimulus; below this you maintain but don't progress | Israetel et al. (heuristic) |
| **MAV** (Maximum Adaptive Volume) | The volume *range* between MEV and MRV where the best rate of adaptation occurs | Israetel et al. (heuristic) |
| **MRV** (Maximum Recoverable Volume) | The upper ceiling of volume the trainee can still recover from before further sets stop helping or start hurting | Israetel et al. (heuristic) |

Source for the terminology as a system: **Israetel, M., Hoffmann, J., Davis, M., &
Feather, J., *Scientific Principles of Hypertrophy Training* (Renaissance Periodization,
Book 1)** — a self-published practitioner text, not a peer-reviewed paper — plus
RP Strength's own public articles (e.g., "Training Volume Landmarks for Muscle Growth,"
rpstrength.com).

**Confidence: Heuristic / practitioner consensus — explicitly so.** RP's own public
material states these are "starting points, not gospel" and does not cite primary
literature for the specific numeric thresholds; this is important for how you present
them to users. The general **existence of a dose–response relationship** (more sets →
more growth, up to a point) is well-established (see below); the **specific
MV/MEV/MAV/MRV numeric boundaries per muscle group** are not derived from controlled
studies isolating those exact thresholds — they are Israetel et al.'s clinical/coaching
synthesis of the dose-response literature, popularized starting ~2017–2019.

### What the literature actually supports numerically

- **Dose–response direction is well-established**: weekly set volume and hypertrophy are
  positively, roughly linearly related up to the volumes studied, with an estimated
  **~0.37% increase in muscle size per additional weekly set** (small effect per set, but
  cumulative), based on a meta-regression of 34 treatment groups from 15 studies.
  Source: **Schoenfeld, B.J., Ogborn, D., & Krieger, J.W. (2017). "Dose–response
  relationship between weekly resistance training volume and increases in muscle mass: A
  systematic review and meta-analysis." *Journal of Sports Sciences* (also PubMed
  27433992).**
  Confidence: **Well-established** for the *direction* of the relationship; the studies
  included mostly tested ≤10 sets/week, so extrapolating a clean linear relationship out
  to 20+ sets/week is **not** directly supported by this dataset — a genuine limitation
  worth flagging in-app.

- **Total number of hard sets is a defensible volume-quantification unit**, valid
  specifically for rep ranges of roughly **6–20+ reps**, per set performed to or near
  failure.
  Source: **Baz-Valle, E., Fontes-Villalba, M., & Santos-Concejero, J. (2018). "Total
  Number of Sets as a Training Volume Quantification Method for Muscle Hypertrophy: A
  Systematic Review." *[journal — J Strength Cond Res family / sports science
  journal]*, PubMed 30063555.**
  Confidence: **Reasonable-but-debated.** Important nuance for your app: this
  validated range (6–20+ reps) does **not** cleanly cover the 4–6 rep intensification
  zone — see the flag under "Context" below.

- **A specific numeric volume band ("12–20 sets/week") is proposed, but on weak
  statistical footing.** A follow-up systematic review comparing "moderate" (12–20
  sets/week) vs. "high" (>20 sets/week) volume found **no significant difference** for
  quadriceps (p=0.19) or biceps brachii (p=0.59), and a significant advantage for high
  volume only in triceps brachii (p=0.01) — i.e., mostly a **null result** that the
  authors nonetheless summarized as "12–20 sets/week may be an optimum standard
  recommendation."
  Source: **Baz-Valle, E., Balsalobre-Fernández, C., Alix-Fages, C., & Santos-Concejero,
  J. (2022). "A Systematic Review of the Effects of Different Resistance Training
  Volumes on Muscle Hypertrophy."**
  Confidence: **Heuristic dressed as a number** — flag clearly. The "12–20" figure is
  a reasonable midpoint summary of thin, mostly-null data, not a tight, well-replicated
  finding. **Do not present "12–20 sets/week" to end users as a precise scientific
  fact** — present it as a commonly-used estimate with wide individual variance.

### Estimating a starting weekly set count by training age

No controlled trial directly answers "how many sets should a beginner vs. advanced
lifter start with." The closest sourced guidance:
- **ACSM (2009) position stand** ties **rep range**, not set count, to training status:
  novices use an 8–12RM range; intermediate/advanced widen toward 1–12RM in a periodized
  fashion. It does not prescribe a clean sets/week number by experience level.
  Source: **American College of Sports Medicine (2009). "Progression Models in
  Resistance Training for Healthy Adults" [Position Stand]. *Medicine & Science in
  Sports & Exercise*, 41(3), 687–708.**
  Confidence: **Well-established** for rep-range-by-status and the associated load
  progression rule (below); **silent** on precise weekly set counts.
- Practitioner sources (Helms et al., *The Muscle and Strength Pyramid: Training*, and
  RP Strength) suggest starting closer to **MEV** and progressing upward within a
  mesocycle, with beginners tolerating (and needing) less volume than advanced trainees
  because their MEV/MRV gap is wider and their recoverable ceiling is lower.
  Confidence: **Heuristic / practitioner consensus** — plausible, widely used, not
  directly tested as a controlled starting-volume prescription.

### Week-to-week volume progression across a mesocycle

The best-available peer-reviewed treatment of *how* to progress volume/intensity across
a mesocycle (rather than just "add sets") is:

**Israetel, M., Feather, J., Faleiro, T.V., & Juneau, C.-E. (2020). "Mesocycle
Progression in Hypertrophy: Volume Versus Intensity." *Strength and Conditioning
Journal*, 42(5), 2–13.**

Key claim: across the three usual progression levers — adding load, adding reps, adding
sets — **"progression in set numbers is probably the most well supported"** approach for
week-to-week mesocycle progression toward hypertrophy, i.e., ramping sets/week upward
(MEV → MAV → MRV) is the recommended default lever, with load/rep progression as
secondary/complementary tools.
Confidence: **Reasonable-but-debated.** This is a peer-reviewed *Strength and
Conditioning Journal* piece (published-ahead commentary format, with a published
response/rebuttal letter — "RE: Mesocycle Progression in Hypertrophy," indicating the
field does not fully agree), authored by the same RP team behind the MEV/MAV/MRV
heuristics, so it should be read as an informed expert argument built on the broader
dose-response literature (Schoenfeld et al. 2017 above) rather than a new controlled
trial.

**Practical week-to-week magnitude**: RP's own public material (not the peer-reviewed
piece) illustrates progression as roughly **+1–3 sets per muscle group per week** from
MEV toward MRV over a ~4–6 week mesocycle before deloading.
Confidence: **Heuristic / practitioner consensus only** — no citation is given even by
the source itself for this specific increment.

---

## 3. Deload

This is the best-sourced section — a 2025 practitioner-facing narrative review
synthesizes essentially the entire current evidence base, including several controlled
studies and survey/Delphi consensus data:

**Bell, L., Darragh, I.A.J., Kyle, T.S., Rogerson, D., & Nolan, D. (2025). "A Practical
Approach to Deloading: Recommendations and Considerations for Strength and Physique
Sports." *Strength and Conditioning Journal* (accepted manuscript, DOI:
10.1519/SSC.0000000000000910).**

### Definition

"A deload is a period of reduced training stress designed to mitigate physiological and
psychological fatigue, promote recovery, and enhance preparedness for subsequent
training" — an operational definition reached via expert Delphi consensus.
Source: **Bell, L., Strafford, B.W., Coleman, M., Androulakis Korakakis, P., & Nolan, D.
(2023). "Integrating Deloading into Strength and Physique Sports Training Programmes: An
International Delphi Consensus Approach." *Sports Medicine - Open*, 9(1), 87.**
Confidence: **Heuristic / expert-consensus**, but explicitly and rigorously derived
(formal Delphi methodology with accredited S&C coaches).

### Triggers: planned vs. autoregulated

- **Planned/scheduled deloads** are the norm — built into the program every **4–8
  weeks** as a "checkpoint," regardless of whether fatigue has become a problem, because
  the risk of non-functional overreaching from short unbroken loading blocks is
  considered low by high-performance coaches.
- **Autoregulated/reactive deloads** are triggered by monitoring objective (load lifted,
  bar velocity) and subjective (perceived wellbeing, motivation, soreness, sleep)
  markers, and are used either standalone or layered on top of planned deloads (an
  "optional" pre-planned deload, taken only if needed).
- A companion **survey of 246 competitive strength/physique athletes** found deloads are
  actually used **every 5.6 ± 2.3 weeks**, for **6.4 ± 1.7 days**, with reducing fatigue
  (92.3%), preparing for the next block (64.6%), and enhancing performance (59.8%) cited
  as the top reasons.
  Source: **Rogerson, D., Nolan, D., Korakakis, P.A., et al. (2024). "Deloading
  Practices in Strength and Physique Sports: A Cross-sectional Survey." *Sports
  Medicine - Open*, 10(1), 26.**
  Confidence: **Well-established as *practice*** (large, real athlete survey); this is
  descriptive of what people do, not a controlled test of what's optimal.

### Duration

Typical **5–7 days** for structured/planned deloads (survey mean 6.4 days); longer or
combined with 2–5 days of full training cessation after especially long/hard blocks.
Reactive deloads can be as short as a single session.
Source: Bell et al. 2025 (synthesis); Rogerson et al. 2024 (survey data).
Confidence: **Reasonable-but-debated / practitioner consensus** — no RCT compares 5 vs.
7 vs. 10 days head-to-head for outcome differences.

### Volume vs. intensity vs. both — and by how much

**Both are commonly reduced**, and the literature explicitly distinguishes recommended
magnitude by how much recovery is needed:

| Recovery need | Recommended volume reduction (relative to the prior training block) |
|---|---|
| Low | ≤25–45% |
| Moderate | 40–60% |
| High | 60–90% |

Source: **Bell et al. 2025**, Table 3 ("General recommendations for the implementation of
deloading"), itself synthesized from Bell et al.'s own coach-interview study (Bell L,
Nolan D, Immonen V, et al. *Front Sports Act Living* 2022) and the Rogerson et al. 2024
survey.
Confidence: **Heuristic / expert-consensus band, not a single hard number.** The paper
explicitly states elsewhere: *"There is a clear absence of high-quality experimental
research elucidating the objective benefits of deloading and the optimal organization of
training variables to elicit those benefits."* Use the **midpoint of the "moderate"
tier (~50%)** as your default if you want one defensible number — it is the best-sourced
practical anchor available, but it is **consensus, not causally-tested optimum.**

**Intensity**: recommended to drop **absolute/relative load by roughly ~10% off %1RM**
while keeping reps constant, and/or reduce sets, and/or increase RIR by **1–3** (i.e.,
train further from failure) rather than changing the weight on the bar. Source: same
Bell et al. 2025 Table 3.
Confidence: **Heuristic / expert-consensus** — the "~10%" figure has no independent
citation of its own within the paper; treat it as the authors' practical synthesis.

**One directly experimental data point exists** (rare in this literature): a controlled
6-week protocol that ramped from 10 sets/exercise/week to 32 sets/exercise/week, then
applied either a **1-week deload (~85% volume reduction, active recovery)** or full
training cessation, found **no differences** in squat velocity or vastus lateralis
thickness between the two approaches post-deload.
Source: **Vann, C.G., Haun, C.T., Osburn, S.C., et al. (2021). "Molecular Differences in
Skeletal Muscle After 1 Week of Active vs. Passive Recovery from High-Volume Resistance
Training." *Journal of Strength and Conditioning Research*, 35(8), 2102–2113.**
Confidence: **Reasonable-but-debated** (single study, small sample, very high starting
volume that may not generalize) but it is genuine controlled evidence, unlike most of
this section — and it shows an **85% cut caused no measurable harm**, i.e., the field's
typical 40–60% recommendation is conservative relative to what one controlled study
found tolerable.

A second controlled comparison found a **1-week full training cessation** produced
muscle-thickness/lean-mass outcomes statistically indistinguishable from continuing to
train, but a **6% smaller** increase in Smith-machine squat 1RM.
Source: **Coleman, M., Burke, R., Augustin, F., et al. (2024). "Gaining more from doing
less? The effects of a one-week deload period during supervised resistance training on
muscular adaptations." *PeerJ*, 12, e16777.**
Confidence: **Reasonable-but-debated** — single study.

### Deload vs. taper (a useful distinction for terminology)

A **taper** targets peak performance before competition (volume cut **30–60%**,
intensity often *maintained* ≥85%1RM or cut ~25–30% depending on priority, 1–2 week
taper + 2–7 day cessation before competition) — a *different* construct from a general
*deload*, which targets fatigue management before returning to normal training, not
peak performance.
Source: **Mujika, I. & Padilla, S. (2003). "Scientific Bases for Precompetition Tapering
Strategies." *Medicine & Science in Sports & Exercise*, 35(7), 1182–1187**; and **Travis,
S.K., Mujika, I., Gentles, J.A., Stone, M.H., & Bazyler, C.D. (2020). "Tapering and
Peaking Maximal Strength for Powerlifting Performance: A Review." *Sports*, 8(9), 125.**
Confidence: **Well-established** as a conceptual distinction, useful if your app ever
adds a competition-prep mode distinct from ordinary deloads.

---

## 4. Load progression models

### Double progression (rep range, then load)

**Mechanism**: pick a load and a rep range (e.g., 6–10); add reps set-to-set/session-to-
session until the top of the range is hit for the prescribed sets, then increase load
and drop back to the bottom of the rep range.

**Evidence**: A controlled 8-week trial directly compared progressing load (fixed
8–12 reps, increase weight) vs. progressing reps (fixed load, increase reps) in
resistance-trained lifters.
Source: **Plotkin, D., Coleman, M., Van Every, D., et al. (2022). "Progressive overload
without progressing load? The effects of load or repetition progression on muscular
adaptations." *PeerJ*, 10, e14142.**
Findings: both groups gained similarly in hypertrophy (6.7–12.9% pooled increases across
muscles); strength gains were nearly identical (~20 kg squat 1RM both groups, 2 kg
difference favoring load-progression, described by the authors as of "questionable
practical significance"). Rectus femoris growth modestly favored the reps-progression
group.
Confidence: **Reasonable-but-debated** (single RCT, 8 weeks, 38 completers) but it
directly supports that **rep progression is a legitimate, evidence-backed alternative to
load progression**, not merely a beginner's workaround — useful if double progression is
used as a fallback when equipment increments are coarse.

### RPE-based progression / RIR-based autoregulation

**Mechanism**: instead of a fixed %1RM, prescribe a target RPE (or RIR) for a set; the
lifter selects a load that produces that subjective effort, and load is expected to
naturally auto-correct with daily readiness.

**Scale validity**: the RIR-based RPE scale (RPE 10 = 0 RIR, RPE 9 = 1 RIR, etc.) shows
strong inverse correlation with movement velocity (r = −0.88 in experienced squatters, r
= −0.77 in novices), supporting it as a reasonably valid proxy for proximity to failure,
more accurate in experienced lifters.
Source: **Zourdos, M.C., Klemp, A., Dolan, C., et al. (2016). "Novel Resistance
Training–Specific Rating of Perceived Exertion Scale Measuring Repetitions in Reserve."
*Journal of Strength and Conditioning Research*, 30(1), 267–275.**
Confidence: **Well-established** that RIR-RPE correlates with objective proximity-to-
failure measures (velocity loss); **novice accuracy is measurably worse** than
experienced-lifter accuracy — an important caveat for auto-regulating novice users.

**Practical scale/application**: RPE-8 ≈ 2 RIR, RPE-9 ≈ 1 RIR, RPE-10 = 0 RIR, described
and operationalized for programming.
Source: **Helms, E.R., Cronin, J., Storey, A., & Zourdos, M.C. (2016). "Application of
the Repetitions in Reserve-Based Rating of Perceived Exertion Scale for Resistance
Training." *Strength and Conditioning Journal*, 38(4), 42–49.**
Confidence: **Well-established** as a practical framework built directly on the Zourdos
et al. 2016 validation data.

**Head-to-head RPE vs. %1RM**: an 8-week DUP RCT matched sets/reps/exercises but assigned
load either by fixed %1RM or by target RPE.
Source: **Helms, E.R., Byrnes, R.K., Cooke, D.M., et al. (2018). "RPE vs. Percentage 1RM
Loading in Periodized Programs Matched for Sets and Repetitions." *Frontiers in
Physiology*, 9, 247.**
Findings: both approaches produced significant, similar strength/hypertrophy gains;
RPE-based loading showed small effect-size advantages (79% probability of superiority
for squat, 57% for bench press) — "both loading types are effective," RPE may offer a
modest edge via individualization.
Confidence: **Reasonable-but-debated** (single study, 21 subjects, 8 weeks) but this is
a genuine RCT, not just heuristic — a reasonably strong single-study basis for treating
RPE-based autoregulation as at least as good as fixed %1RM.

### How session data should feed the next prescription — the Autoregulatory Progressive
### Resistance Exercise (APRE) model

**Mechanism**: rather than a fixed linear plan, the lifter performs a "test set" at a
given RM target (e.g., 6RM); the **actual reps achieved** at that load are looked up
against a table that prescribes the load adjustment for the *next* session (more reps
than target → increase load next time; fewer → hold or decrease).
Source: **Mann, J.B., Thyfault, J.P., Ivey, P.A., & Sayers, S.P. (2010). "The Effect of
Autoregulatory Progressive Resistance Exercise vs. Linear Periodization on Strength
Improvement in College Athletes." *Journal of Strength and Conditioning Research*,
24(7), 1718–1723.**
Findings: 6 weeks of APRE outperformed a fixed linear-periodization plan for squat and
bench press 1RM gains in Division I college football players.
Confidence: **Reasonable-but-debated** (single study, athlete population may not
generalize to general gym users) but this is the most directly relevant controlled
demonstration that "let recent performance set tomorrow's load" beats a rigid pre-set
plan, at least over 6 weeks in trained athletes.

---

## 5. Autoregulation — the decision logic

This is the one area where a **specific, peer-reviewed, quantified adjustment rule**
exists (not just "use your judgment"):

**Rule** (Helms et al. 2018, Table 3 "Example RPE load adjustments"): for **every 0.5 RPE
deviation** from the session's target RPE (or target RPE range), adjust load by
**~2%** in the compensating direction. E.g., target RPE range 6–8: if the lifter actually
hits RPE 8.5 (0.5 over the top of range), cut load ~2% for the next set/session; if they
hit RPE 5 (2 points under range floor), that's a 4-point deviation → increase load ~4×2%
= ~8% (the paper's worked example specifically shows a 4% increase for being under by 1
full point i.e. two 0.5 steps). Missed reps trigger additional load reductions beyond
the RPE-based adjustment.
Source: **Helms, E.R., Byrnes, R.K., Cooke, D.M., et al. (2018). *Frontiers in
Physiology*, 9, 247** (same study as above).
Confidence: **Reasonable-but-debated** as an *optimality* claim (only tested in one 8-week
RCT), but it is a **directly citable, specific, peer-reviewed adjustment rule** — the
strongest concrete number in this whole report for "how much should RPE feedback move
the next prescribed load." Recommended as your primary citation if the app implements
session-to-session RPE-driven load adjustment.

**Complementary week-to-week rule (non-RPE-specific, more general)**: when a lifter can
complete **1–2 reps over the prescribed target for the current load, for two
consecutive sessions**, increase load by **2–10%** (smaller increments for upper-body /
smaller-muscle or more technical lifts, larger for lower-body / simpler lifts).
Source: **ACSM (2009) Position Stand**, "Progression Models in Resistance Training for
Healthy Adults," *Medicine & Science in Sports & Exercise*, 41(3), 687–708 (as above).
Confidence: **Well-established** — this is the longest-standing, most widely-cited
concrete load-progression rule in the field, though it predates and is independent of
RPE-based methods.

**Practical synthesis for decision logic** (combining the above sources):
- Session RPE **higher than planned** for the prescribed reps → reduce next
  session/set's load roughly 2% per 0.5 RPE of overshoot (Helms et al. 2018), and/or
  treat it as a signal the current weekly volume may be exceeding what's recoverable
  (Bell et al. 2025's fatigue-monitoring logic feeding into whether a deload is
  warranted).
- Session RPE **lower than planned** (lifter had more in the tank) → increase load by
  the same ~2%-per-0.5-RPE rule, or apply the ACSM 2–10% rule if using rep-based
  (non-RPE) progression and the lifter beat the top of the rep range for 2 straight
  sessions.
- **Missed target reps entirely** → hold or reduce load next session rather than
  advancing (APRE logic, Mann et al. 2010; also implicit in Helms et al. 2018's "missed
  reps incur additional load reductions").
Confidence: **This synthesis itself is not from a single source** — it is an
evidence-consistent combination of the Helms 2018 RPE-adjustment table, the ACSM
progression rule, and the APRE mechanism. Label it in code comments as "informed by
[citations]," not as a single validated algorithm.

---

## 6. Starting a new mesocycle relative to the previous one's peak

This is the **weakest-sourced** section — there is essentially no controlled research
directly comparing different mesocycle-restart strategies (e.g., "restart at 70% of
previous peak" vs. "restart at previous starting volume" vs. "restart with built-in
overload"). What exists:

- **Practitioner consensus (RP-style)**: restart the new mesocycle at or near **MEV**
  (a fraction of the volume the previous mesocycle ended at, near MRV), then ramp back up
  toward MRV again before the next deload — explicitly **never start at MRV** ("you have
  nowhere to go but down").
  Source: RP Strength public materials (rpstrength.com); Israetel et al., *Scientific
  Principles of Hypertrophy Training*.
  Confidence: **Heuristic / practitioner consensus, uncited even by its own source.**

- **Bell et al. 2025** (Strength and Conditioning Journal, cited fully in Section 3)
  describes deloads as occurring "either in the final week of the mesocycle... or the
  first week of a new mesocycle," and defines "normal training volume" — the number a
  deload's percentage cut is measured against — as **"the volume undertaken in the
  previous training block."** This implies the new block's starting point is generally
  **relative to the previous block's volume**, not an absolute reset to zero or to a
  fixed number, and not simply "return to where the previous block *started*" — but the
  paper does not give a specific restart percentage.
  Confidence: **Heuristic / practitioner consensus.**

- **Issurin's "residual training effects" principle** is the relevant theoretical
  underpinning for *why* you don't fully reset between blocks: different fitness
  qualities decay at different rates after a block ends (e.g., maximal strength is
  retained longer than aerobic capacity), so block sequencing is designed to
  **exploit and superimpose retained (residual) adaptations** from the prior block
  rather than start from an unadapted baseline. This supports the general principle that
  a new mesocycle should build on — not ignore — what the previous one achieved, i.e.
  some form of **built-in overload relative to the pre-previous-block baseline** is
  implied, even though the *within-block* starting volume is lower than the prior
  block's peak.
  Source: **Issurin, V.B. (2010).** *Sports Medicine*, 40(3), 189–206 (as above); also
  discussed in Issurin's earlier **"Block periodization versus traditional training
  theory: a review." *Journal of Sports Medicine and Physical Fitness*, 2008;48(1):65-75.**
  Confidence: **Reasonable-but-debated** — the residual-effects concept itself is
  reasonably well-accepted descriptively (different qualities detrain at different
  rates is physiologically plausible and supported by detraining literature broadly),
  but there is no controlled trial validating a specific restart-volume percentage
  derived from it.

**Bottom line for Section 6**: the literature supports the *qualitative* shape — new
mesocycle starts below the previous mesocycle's peak volume/intensity but at or above
the trainee's baseline (leveraging retained/residual adaptation, i.e., some built-in
overload relative to where the *first* mesocycle started) — but **no source gives a
specific validated percentage** for where exactly to restart. Any specific number your
app uses here should be labeled a design choice/heuristic, not "per the literature."

---

## Judgment on the app's current hardcoded multipliers

Given the above, here is how the four current phase multipliers hold up:

**`on_ramp: 0.85x volume / 12–15 reps / ~65% e1RM`** — Reasonably defensible as an
"anatomical adaptation"-style phase (Bompa). No literature gives a precise 0.85x, but
starting below full mesocycle volume at moderate-high reps/low intensity matches the
consensus shape of an introductory phase. **Heuristic, but directionally sound.**

**`accumulation: 1.15x volume / 8–12 reps / ~72% e1RM`** — Consistent with Schoenfeld's
dose-response literature (moderate reps, sets pushed up) and with RP's MEV→MAV ramp
concept. The >1.0x multiplier (i.e., volume increases from on-ramp) matches the
well-established idea that volume should rise as a mesocycle progresses. **Reasonably
well-grounded.**

**`intensification: 0.90x volume / 4–6 reps / ~85% e1RM`** — **This is the multiplier
most worth revisiting**, as you flagged. Several converging (though none individually
conclusive) lines of evidence suggest a mere 10% set-count cut is small relative to what
typically accompanies a drop to 4–6 reps at ~85% e1RM:
  1. Baz-Valle et al.'s validation of "total sets" as a volume proxy is specifically
     scoped to **6–20+ reps**; 4–6 reps sits at/below the edge of that validated range,
     so treating "sets" as an equivalent volume unit across accumulation and
     intensification phases is itself questionable, independent of the multiplier's
     size.
  2. Schoenfeld et al. (2021, *Sports*, "Loading Recommendations...") note that matching
     *volume load* (not just set count) between heavy and moderate-load work requires
     substantially **more**, not fewer, sets at heavy loads — and that heavy-load
     high-volume protocols show sustainability/joint-stress problems. Practically, this
     means programs don't typically try to hold set-count volume roughly flat into a
     heavy phase; they lean on fewer sets and accept lower total tonnage.
  3. The general periodization literature (Bompa's phase model; Lorenz & Morrison 2015)
     consistently describes volume decreasing "systematically" as intensity climbs
     phase-over-phase — a 10% cut is a small step relative to how that relationship is
     usually described qualitatively (accumulation phases are typically described as
     markedly higher-volume than strength/intensification phases, not ~10% apart).
  4. Simple arithmetic check: even with only a 10% set-count cut, going from ~10 reps
     at ~72% e1RM to ~5 reps at ~85% e1RM cuts **total tonnage** roughly in half per set
     — so the *volume-load* is already dropping substantially even though the *set
     count* barely is. If "0.90x volume" is meant to represent overall training stress
     rather than literal set count, it may already be doing more than it looks like; if
     it's meant as a literal set-count multiplier, it looks low.
  **No source gives a precise "correct" multiplier for this transition** — this is a
  reasoned inference from multiple partially-relevant sources, not a citation-backed
  number. Recommend treating ~0.90x as a candidate to test lower (e.g., 0.70–0.80x) if
  set-count is being cut, or documenting explicitly that the multiplier represents
  tonnage/stress rather than set count if that's the intent.

**`deload: 0.50x volume / 6–8 reps / ~60% e1RM`** — **Well-supported as a reasonable
default.** 50% volume reduction sits almost exactly at the midpoint of Bell et al.
(2025)'s "moderate recovery needs" tier (40–60%) and is within the range independently
reported for tapering (30–60%, Mujika & Padilla 2003). The one directly-experimental
data point (Vann et al. 2021) found even an 85% cut caused no measurable harm, meaning
50% is a conservative, well-inside-the-safe-zone choice. Reps at 6–8 with intensity cut
to ~60% e1RM (down from ~72–85% in prior phases) roughly matches the "~10% off %RM while
maintaining reps" and/or "increase RIR" guidance in the same source, though the
magnitude of intensity cut here (from an 85% peak) is larger than that heuristic's
literal "~10%" — reasonable, since deload intensity is better read as relative to the
*mesocycle's typical/average* intensity (accumulation's ~72%) than to the single peak
week. **This is your best-grounded multiplier of the four** — cite Bell et al. (2025)
directly in the code comment.

---

## Consolidated bibliography

**Primary peer-reviewed / textbook sources**

1. Issurin, V.B. (2010). New Horizons for the Methodology and Physiology of Training
   Periodization. *Sports Medicine*, 40(3), 189–206.
2. Issurin, V.B. (2008). Block periodization versus traditional training theory: a
   review. *Journal of Sports Medicine and Physical Fitness*, 48(1), 65–75.
3. Cunanan, A.J., DeWeese, B.H., Wagle, J.P., et al. (2018). The General Adaptation
   Syndrome: A Foundation for the Concept of Periodization. *Sports Medicine*, 48(4),
   787–797. (+ published comment/reply, 2018.)
4. Stone, M.H., Hornsby, W.G., Haff, G.G., et al. (2021). Periodization and Block
   Periodization in Sports: Emphasis on Strength-Power Training—A Provocative and
   Challenging Narrative. *Journal of Strength and Conditioning Research*, 35(8),
   2351–2371.
5. Lorenz, D. & Morrison, S. (2015). Current Concepts in Periodization of Strength and
   Conditioning for the Sports Physical Therapist. *International Journal of Sports
   Physical Therapy*, 10(6), 734–747.
6. Bompa, T.O. & Buzzichelli, C. *Periodization of Strength Training for Sports* /
   *Periodization Training for Sports*. Human Kinetics (multiple editions).
7. Schoenfeld, B.J., Ogborn, D., & Krieger, J.W. (2017). Dose–response relationship
   between weekly resistance training volume and increases in muscle mass: A systematic
   review and meta-analysis. *Journal of Sports Sciences* (PubMed 27433992).
8. Baz-Valle, E., Fontes-Villalba, M., & Santos-Concejero, J. (2018). Total Number of
   Sets as a Training Volume Quantification Method for Muscle Hypertrophy: A Systematic
   Review. (PubMed 30063555.)
9. Baz-Valle, E., Balsalobre-Fernández, C., Alix-Fages, C., & Santos-Concejero, J.
   (2022). A Systematic Review of the Effects of Different Resistance Training Volumes
   on Muscle Hypertrophy.
10. Israetel, M., Feather, J., Faleiro, T.V., & Juneau, C.-E. (2020). Mesocycle
    Progression in Hypertrophy: Volume Versus Intensity. *Strength and Conditioning
    Journal*, 42(5), 2–13. (+ published response letter, 2020.)
11. Israetel, M., Hoffmann, J., Davis, M., & Feather, J. *Scientific Principles of
    Hypertrophy Training* (Renaissance Periodization, Book 1). Self-published,
    ~2021–2022.
12. Helms, E.R., Morgan, A., & Valdez, A.M. *The Muscle and Strength Pyramid: Training*.
    Self-published (multiple editions).
13. Bell, L., Darragh, I.A.J., Kyle, T.S., Rogerson, D., & Nolan, D. (2025). A Practical
    Approach to Deloading: Recommendations and Considerations for Strength and Physique
    Sports. *Strength and Conditioning Journal* (accepted manuscript, DOI
    10.1519/SSC.0000000000000910).
14. Bell, L., Strafford, B.W., Coleman, M., Androulakis Korakakis, P., & Nolan, D.
    (2023). Integrating Deloading into Strength and Physique Sports Training
    Programmes: An International Delphi Consensus Approach. *Sports Medicine - Open*,
    9(1), 87.
15. Rogerson, D., Nolan, D., Korakakis, P.A., et al. (2024). Deloading Practices in
    Strength and Physique Sports: A Cross-sectional Survey. *Sports Medicine - Open*,
    10(1), 26.
16. Bell, L., Nolan, D., Immonen, V., et al. (2022). "You can't shoot another bullet
    until you've reloaded the gun": Coaches' perceptions, practices and experiences of
    deloading in strength and physique sports. *Frontiers in Sports and Active Living*,
    4.
17. Vann, C.G., Haun, C.T., Osburn, S.C., et al. (2021). Molecular Differences in
    Skeletal Muscle After 1 Week of Active vs. Passive Recovery from High-Volume
    Resistance Training. *Journal of Strength and Conditioning Research*, 35(8),
    2102–2113.
18. Coleman, M., Burke, R., Augustin, F., et al. (2024). Gaining more from doing less?
    The effects of a one-week deload period during supervised resistance training on
    muscular adaptations. *PeerJ*, 12, e16777.
19. Mujika, I. & Padilla, S. (2003). Scientific Bases for Precompetition Tapering
    Strategies. *Medicine & Science in Sports & Exercise*, 35(7), 1182–1187.
20. Travis, S.K., Mujika, I., Gentles, J.A., Stone, M.H., & Bazyler, C.D. (2020).
    Tapering and Peaking Maximal Strength for Powerlifting Performance: A Review.
    *Sports*, 8(9), 125.
21. Plotkin, D., Coleman, M., Van Every, D., et al. (2022). Progressive overload without
    progressing load? The effects of load or repetition progression on muscular
    adaptations. *PeerJ*, 10, e14142.
22. Zourdos, M.C., Klemp, A., Dolan, C., et al. (2016). Novel Resistance
    Training–Specific Rating of Perceived Exertion Scale Measuring Repetitions in
    Reserve. *Journal of Strength and Conditioning Research*, 30(1), 267–275.
23. Helms, E.R., Cronin, J., Storey, A., & Zourdos, M.C. (2016). Application of the
    Repetitions in Reserve-Based Rating of Perceived Exertion Scale for Resistance
    Training. *Strength and Conditioning Journal*, 38(4), 42–49.
24. Helms, E.R., Byrnes, R.K., Cooke, D.M., et al. (2018). RPE vs. Percentage 1RM
    Loading in Periodized Programs Matched for Sets and Repetitions. *Frontiers in
    Physiology*, 9, 247.
25. Mann, J.B., Thyfault, J.P., Ivey, P.A., & Sayers, S.P. (2010). The Effect of
    Autoregulatory Progressive Resistance Exercise vs. Linear Periodization on Strength
    Improvement in College Athletes. *Journal of Strength and Conditioning Research*,
    24(7), 1718–1723.
26. American College of Sports Medicine (2009). Progression Models in Resistance
    Training for Healthy Adults [Position Stand]. *Medicine & Science in Sports &
    Exercise*, 41(3), 687–708.
27. Schoenfeld, B.J., Grgic, J., Van Every, D.W., & Plotkin, D.L. (2021). Loading
    Recommendations for Muscle Strength, Hypertrophy, and Local Endurance: A
    Re-Examination of the Repetition Continuum. *Sports*, 9(2), 32.
28. Grgic, J., et al. (2022). Effects of Periodization on Strength and Muscle
    Hypertrophy in Volume-Equated Resistance Training Programs: A Systematic Review and
    Meta-analysis. (PubMed 35044672.)
29. Effects of linear and daily undulating periodized resistance training programs on
    measures of muscle hypertrophy: a systematic review and meta-analysis (2017). (PMC
    5571788.)

**Practitioner/industry sources — cited only for stated common-practice context, never
as scientific authority**: RP Strength (rpstrength.com) public articles on volume
landmarks; various fitness-app/blog explainers surfaced during search (not cited above
as authority, and none should be treated as one).

---

*Compiled via web research (WebSearch/WebFetch) on 2026-09-11. Where full text could not
be accessed (paywalled journal pages), citations were verified via abstract pages,
author-archived accepted manuscripts (e.g., Sheffield Hallam University SHURA
repository), or multiple independent secondary summaries. Flag any claim above for
re-verification against the primary PDF before quoting it verbatim in a scientific
context.*

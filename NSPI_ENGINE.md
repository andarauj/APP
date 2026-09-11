# Motor Adaptativo NSPI — design

Objetivo: replicar o **Adaptive Progressive Overload** do JeFit (o motor por
trás do "Adaptive Plan" e da funcionalidade "Periodization"), incluindo o
**North Star Progress Index (NSPI)**, de forma **totalmente offline**,
explicável, e assente no que o Changes já regista.

Referência: artigos do JeFit colados pelo dono (Abr/Set 2026). Nada de
LLM/rede — só heurísticas transparentes, como as do `utils/progressIndex.ts`
e `utils/autoRegulation.ts` que já existem.

---

## 0. O que já existe (base a reutilizar)

| Peça | Onde | Reaproveita para |
|---|---|---|
| `computeProgressIndex` (consistência, volume, equilíbrio muscular, progressão) | `utils/progressIndex.ts` | é o embrião do NSPI — reescreve-se com os 3 eixos do JeFit |
| Auto-regulação por RPE em sessão (`adjustmentSuggestion`) | `app/workout/active.tsx` + `utils/autoRegulation.ts` | ajuste série-a-série (o NSPI é semana-a-semana; coexistem) |
| Geração de plano (`generatePlan`, `SPLIT_TEMPLATES`, `pickExercisesForDay`) | `utils/planGenerator.ts` | gera o esqueleto do mesociclo |
| Planos → dias → `plan_exercises` (sets/reps/rest/setType) | schema | onde os alvos por fase são escritos |
| `workout_sets` (weight, reps, rpe, completed_at, set_type, is_pr) | schema | fonte de todos os sinais |
| Ledger de migrações (`schema_migrations`, `runStep`, `getFailedMigrations`) | `db/database.ts` | migração segura das tabelas novas |
| Definições k/v (`getSetting`/`setSetting`) + `onboarding*` do wizard novo | `db/settingsDao.ts` | objetivo/nível/dias/local/duração já recolhidos |

---

## 1. Modelo de dados (tabelas novas)

Tudo em SQLite local. Uma migração `migrateAdaptiveEngine`.

### `adaptive_plan`  (0..1 ativo por vez)
| coluna | tipo | notas |
|---|---|---|
| id | INTEGER PK | |
| plan_id | INTEGER | FK → `plans.id` (o plano gerado/adotado) |
| goal | TEXT | `bulking` \| `strength` \| `cutting` \| `general` |
| experience | TEXT | `beginner` \| `intermediate` \| `advanced` |
| days_per_week | INTEGER | |
| session_minutes | INTEGER | |
| equipment_pref | TEXT | `any` \| `free_weights` \| `gymleco` |
| week_start_dow | INTEGER | 0=Dom..6=Sáb (Definições) |
| created_at | INTEGER | epoch s |
| active | INTEGER | 1 = a periodização está ligada ("Auto-apply periodization") |

### `adaptive_cycle`  (3 por plano; gera-se o seguinte ao acabar o 3º)
| id | PK |
| plan_id | FK |
| cycle_index | INTEGER (1..3) |
| baseline_json | TEXT — 1RM/e1RM estimado por padrão de movimento no início do ciclo |
| started_at / ended_at | INTEGER |

### `adaptive_week`  (o registo semanal — 1 linha por semana treinada)
| id | PK |
| cycle_id | FK |
| week_index | INTEGER (1..N dentro do ciclo) |
| phase | TEXT — `on_ramp` \| `accumulation` \| `intensification` \| `deload` |
| is_bridge | INTEGER — semana de consolidação (meio-passo) |
| planned_json | TEXT — alvos escritos para a semana (peso/reps/séries por exercício) |
| nspi_load / nspi_volume / nspi_balance | REAL (0..100) |
| nspi_score | REAL (0..100) |
| decision | TEXT — `advance` \| `bridge` \| `hold` \| `deload_early` |
| recap_json | TEXT — { changed[], why[], expect } para o ecrã Weekly Recap |
| week_start / week_end | INTEGER |
| status | TEXT — `active` \| `done` |

### `adaptive_exercise_state`  (progressão por exercício)
| id | PK |
| adaptive_plan_id | FK |
| exercise_id | FK |
| current_weight | REAL — alvo atual |
| current_reps_low / current_reps_high | INTEGER — janela de reps atual |
| step_stall_count | INTEGER — sessões seguidas sem progredir (gatilho de bridge) |
| last_progressed_at | INTEGER |

> Alternativa considerada e rejeitada: pôr `phase`/`cycle` como colunas em
> `plans`. Rejeitada porque o JeFit guarda o ciclo **na conta**, não no
> plano — "trocas de plano e o teu lugar no ciclo vem contigo". As tabelas
> acima mantêm essa semântica (o ciclo segue o `adaptive_plan`, que se pode
> re-apontar a outro `plan_id`).

---

## 2. NSPI — o score (0..100)

Média ponderada de três eixos, **ciente da fase** (um deload leve conta como
recuperação planeada, não como queda).

### 2.1 Progressão de carga — `nspi_load`
Para cada padrão de movimento principal (agachamento, supino, remada,
levantamento, press vertical), compara o **e1RM** (Epley: `w·(1+r/30)`) da
melhor série da semana com o **baseline do ciclo**.

```
loadDelta_i = (e1RM_semana_i - e1RM_baseline_i) / e1RM_baseline_i
nspi_load   = clamp( 50 + 600 * mean(loadDelta_i) , 0 , 100 )
```
(≈ +8% no conjunto dos padrões → 100; −8% → 0; sem histórico → 50.)
Na fase `deload`, aplica-se `loadDelta_i = max(loadDelta_i, 0)` (não penaliza).

### 2.2 Conclusão de volume — `nspi_volume`
Séries **efetivas** (não-aquecimento, ≥1 rep) concluídas ÷ séries planeadas
para a semana.

```
completion = min(1, séries_efetivas_feitas / séries_planeadas)
nspi_volume = 100 * completion
```

### 2.3 Equilíbrio de movimento — `nspi_balance`
Reaproveita `getWeeklyVolumeByMuscle`. Distribuição de séries pelos 6 grandes
grupos (empurrar horizontal/vertical, puxar horizontal/vertical, quadríceps,
posterior/glúteo). Quanto mais uniforme face ao alvo da fase, maior.

```
nspi_balance = 100 * (1 - gini(distribuição_vs_alvo))
```

### 2.4 Score final (ponderação por objetivo)
| objetivo | load | volume | balance |
|---|---|---|---|
| strength | 0.55 | 0.25 | 0.20 |
| bulking | 0.30 | 0.50 | 0.20 |
| cutting | 0.35 | 0.35 | 0.30 |
| general | 0.40 | 0.35 | 0.25 |

`nspi_score = Σ peso · eixo`. Guardado em `adaptive_week`.

---

## 3. As fases (um ciclo = 4 fases, ~1 semana cada)

Multiplicadores aplicados aos alvos-base do plano (séries × reps × %e1RM):

| fase | volume (×séries) | intensidade (reps / %e1RM) | objetivo |
|---|---|---|---|
| **On-Ramp** | 0.85 | reps altas (12–15), ~65% | reencontrar cargas, técnica |
| **Accumulation** | 1.15 | 8–12, ~72% | acumular trabalho (maior parte do crescimento) |
| **Intensification** | 0.90 | 4–6, ~85% | pico de força |
| **Deload** | 0.50 | 6–8 fáceis, ~60% | recuperação; próximo ciclo parte mais alto |

Ajuste fino por objetivo: `bulking` puxa Accumulation mais longa/volumosa;
`strength` puxa Intensification mais pesada; `cutting` encurta e vigia
fadiga; `general` fica no meio.

Uma fase dura **1 semana**, mas pode ficar **1 semana extra** (bridge) se a
decisão semanal assim o disser.

---

## 4. Decisão semanal (o coração)

Corre no **`week_start_dow`**. Olha para a semana que terminou e escolhe o
que fazer na próxima. Quatro perguntas:

1. **Carga a subir?** `nspi_load` da semana vs. média das 2 anteriores.
2. **Fez o trabalho?** `nspi_volume ≥ 85%`?
3. **Equilíbrio mantido?** `nspi_balance ≥ 60` e sem grupo < 50% do alvo.
4. **Alinhado com a fase?** o progresso condiz com o que a fase pede
   (ex.: numa Intensification espera-se `load` a subir e `volume` a descer;
   numa Accumulation o contrário).

### Resultado

| Sinais | Decisão | Efeito |
|---|---|---|
| momentum forte (1✔ 2✔ 3✔ 4✔) | **advance** | avança para o passo/fase seguinte; sobe alvos |
| momentum fraco (2✔ mas 1✘, ou stall ≥ 2) | **bridge** | repete a fase 1 semana (meio-passo): consolida antes de forçar |
| fadiga alta (`nspi_volume` a cair 2 semanas, RPE médio ≥ 9, sono/queixas via sinais de fadiga) | **deload_early** | entra já em Deload, mesmo fora de ordem |
| dentro do esperado mas sem folga | **hold** | mantém alvos, mesma fase |

Nunca empilha uma fase mais dura sobre uma semana que correu mal — é o
princípio "progress is not a punishment system".

### Override manual
Se o utilizador editar peso/reps de um exercício durante o treino, isso
entra nos sinais da semana seguinte (o `adaptive_exercise_state` é
atualizado a partir do que foi **registado**, não do que foi planeado).

---

## 5. Mutação do plano por fase

Ao mudar de semana/fase, o motor reescreve `plan_exercises` (sets/reps/rest)
e o `adaptive_exercise_state.current_weight` de cada exercício:

```
alvo_peso   = e1RM_atual * %intensidade_da_fase   (arredondado ao incremento real do equipamento)
alvo_reps   = janela da fase, ajustada por step_stall_count
alvo_séries = base_do_plano * ×volume_da_fase
```

- **Exercícios não mudam.** O motor nunca troca de exercício nem reordena
  dias (igual ao JeFit "Periodization on your own plan").
- Troca de exercício dentro do mesmo padrão de movimento é permitida ao
  utilizador; o `adaptive_exercise_state` migra o progresso.
- Arredondamento de peso usa as `Training Preferences › Equipment` (placas/
  halteres disponíveis) — reaproveita/estende `utils/calculators.ts`
  (`calculatePlates`).

---

## 6. Weekly Recap (ecrã)

`recap_json` gerado na decisão semanal, renderizado num ecrã dedicado
(`app/adaptive/recap.tsx`), acessível de um card no `Progresso › Resumo` e
de um banner no `Treino › Plano` quando há recap novo.

```
{
  phaseFrom, phaseTo, decision,
  changed: [ "Volume +1 série em agachamento e supino",
             "Peso alvo +2.5 kg no levantamento" ],
  why:     [ "Progressão de carga forte (NSPI carga 78)",
             "Concluíste 96% do volume planeado" ],
  expect:  "Esta semana é de acumulação: mais séries, RPE 7–8." ,
  nspi: { score, load, volume, balance, trend }
}
```

Linguagem: explicar sempre o **porquê** ("aumentámos o volume porque a tua
progressão de carga foi forte no agachamento e supino"), nunca só "os pesos
subiram".

---

## 7. Superfícies de UI

| Onde | O quê |
|---|---|
| `Definições › Treino` | toggle **"Periodização automática"** (liga/desliga `adaptive_plan.active`); **dia de início de semana** |
| `Treino › Plano` (header) | badge da fase (cor: On-Ramp verde `#37C871` · Accumulation âmbar `#F5A623` · Intensification laranja `#FF6B3C` · Deload ciano `#3EC8E0`) + `‹ Ciclo N · Fase M ›` |
| `Treino › Explorar` | entrada "Plano Adaptativo" (card roxo→violeta, "Começar") → wizard (reusa o onboarding: objetivo/nível/dias/local/duração) |
| ecrã de exercício no treino | **estrela roxa** ✦ → popover "porquê este alvo": mostra a fase, o %e1RM e a janela de reps |
| `Progresso › Resumo` | card **NSPI** (score /100, 3 eixos, tendência) — substitui o "Índice de Progresso" atual quando há plano adaptativo; card "Weekly Recap" quando há novo |
| toast no fim da série | "Novo recorde de e1RM (3 meses)!" quando bate o baseline |

---

## 8. Migração

`runStep('migrateAdaptiveEngine', …)` — `CREATE TABLE IF NOT EXISTS` das 4
tabelas + índices (`adaptive_week(cycle_id, week_index)`,
`adaptive_exercise_state(adaptive_plan_id, exercise_id)`).
Sem `ALTER` a tabelas existentes → reversível e seguro num upgrade real.

---

## 9. Plano de implementação (sub-fases N1..N6)

- **N1 — dados + score.** Migração das 4 tabelas. `utils/nspi.ts`:
  `computeNspi(weekData) → { load, volume, balance, score }`. **Testes**
  com BD simulada (o repo já tem esse padrão em `db/__tests__/`).
- **N2 — fases + geração do ciclo.** `utils/adaptivePlan.ts`:
  `buildCycle(goal, exp, days, minutes, equip) → GeneratedCycle` (reusa
  `generatePlan`). `applyPhaseTargets(cycle, week, phase)`. Testes das
  janelas de reps/volume por fase e objetivo.
- **N3 — decisão semanal.** `decideNextWeek(history, currentPhase, goal) →
  { decision, nextPhase, recap }`. Tabela de verdade toda coberta por
  testes (momentum forte/fraco/fadiga/hold, bridge, deload antecipado,
  fim de ciclo → novo ciclo com baseline mais alto).
- **N4 — orquestração.** Serviço que corre no arranque/foco: se
  `adaptive_plan.active` e passou o `week_start_dow`, fecha a semana
  (calcula NSPI, decide, escreve `adaptive_week` + muta `plan_exercises`).
  Idempotente (não fecha a mesma semana 2×).
- **N5 — UI.** Badge de fase, wizard, card NSPI, ecrã Weekly Recap,
  estrela roxa "porquê este alvo", toggles nas Definições.
- **N6 — integração.** "Treino Inteligente" diário passa a atalho menor;
  `Progresso › Resumo` mostra NSPI quando há plano adaptativo. Documentar
  no `ESTADO.md`.

Cada sub-fase: `tsc` + testes + (quando houver UI) `eas update` + verificação
no emulador.

---

## 10. Decisões (fechadas 2026-09-10)

1. **Objetivos:** `bulking · strength · cutting · general` (sem "Power").
2. **Fase = 1 semana fixa** + bridge opcional (cobre o "esticar a fase").
3. **Manter os dois** — Índice de Progresso para quem não usa plano
   adaptativo; NSPI para quem usa. O card do `Progresso › Resumo` mostra o
   que se aplica.
4. **Sem gate "Elite"** — no JeFit é pago; no Changes é **grátis e sempre
   acessível**. Nada de "Elite Hub", nada de rótulos "ELITE", nada de
   `expo-in-app-purchases`. A entrada "Plano Adaptativo" no `Treino ›
   Explorar` é um card normal.

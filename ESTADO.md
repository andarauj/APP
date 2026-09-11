# Changes — estado do projeto

Última revisão: 11 de setembro de 2026.

**Versionamento:** `1.0.0` é a versão de referência ("versão 1") — a que
fecha todo o trabalho de redesenho + motor adaptativo. Dali para a frente,
cada lote de alterações sobe o número de patch (`1.0.1`, `1.0.2`, ...) em
`app.json` (`expo.version`).

Este ficheiro substitui `TIER1_FEATURES.md` e `NAVEGACAO_REFACTOR.md`, que
descreviam um estado que já não existia e davam por concluídas coisas que
nunca chegaram a funcionar.

Regra para quem editar este ficheiro: só entra aqui o que foi verificado a
correr. Se não foi executado, vai para "Por validar".

---

## Verificado

Comandos corridos neste repositório:

| Verificação | Resultado |
|---|---|
| `npx tsc --noEmit` | sem erros |
| `npm run lint` | 0 erros, 18 avisos |
| `npm test` | 32 suites, 371 testes |

Os testes cobrem lógica pura (cálculos, geração de planos, agregações), o
dataset de exercícios, o `getWeightChange`, o registo de migrações, o
temporizador de descanso e a alcançabilidade das rotas. **Não** cobrem
renderização de ecrãs nem permissões.

O lint nunca tinha corrido: havia `eslint` e `eslint-config-expo`
instalados, mas nenhum ficheiro de configuração. Os 34 avisos que restam são
dependências de hooks e algumas variáveis por usar; nenhum é erro.

### Passagem em emulador Android (10 de setembro de 2026)

Build de desenvolvimento gerada por EAS (perfil `preview`, APK) e instalada
num emulador Pixel 8 / API 36 / x86_64. `tsc`, lint e testes não executam um
ecrã; isto executou. **Instalação de raiz apenas — não foi testado um upgrade
a partir de uma instalação anterior.**

Percorrido com base de dados vazia: onboarding, gerar treino (Treino
Inteligente, 19 séries), completar série, matar a app a meio e retomar pelo
banner "Treino por terminar", terminar, ver no histórico, reabrir a app e
confirmar que Streak/Recorde/Treinos persistem. Abertos: os 5 separadores, os
separadores de topo, o hub de progresso e os seus 7 ecrãs, Equilíbrio,
Favoritos, 1RM, detalhe de exercício, Perfil. Botão "voltar" em ecrãs
encadeados. Descanso: temporizador conta de 30 s, muda para vermelho aos 5 s
e agenda a notificação local — **não** foi testado com o telemóvel bloqueado.
Biblioteca: 1414 exercícios (563 curados + 851 importados), scroll e detalhe.

Três bugs que partiam a app a correr e que passavam em `tsc`, lint e testes:

| Bug | Ficheiro | Correção |
|---|---|---|
| Crash no arranque: `importExerciseDb` fazia `INSERT` simples e 22 nomes do dataset colidem com o índice único `exercises.name` (`UNIQUE constraint failed` → rollback → rejeição não tratada). A biblioteca ficava a 0 e a Home revertia a 0/0/0. | `db/exerciseDbSeed.ts` | `INSERT OR IGNORE` (o seed curado PT ganha a colisão, que é a precedência pretendida); contagem por `res.changes` |
| `app/progress/onerm.tsx` fica em spinner infinito quando aberto pelo hub (sem `exerciseId`): o `useEffect` fazia `return` sem nunca pôr `loading` a `false`. | `app/progress/onerm.tsx` | `setLoading(false)` no ramo sem `exerciseId`; cai no estado-vazio já existente |
| Crash ao renderizar a lista da biblioteca cheia: `removeClippedSubviews` numa `SectionList` sob a New Architecture (`addViewAt: failed to insert view … index=N count=0` no `ReactClippingViewManager`). Não aparecia antes porque a lista estava vazia por causa do bug acima. | `app/(tabs)/exercises.tsx` | removido `removeClippedSubviews`; os restantes `initialNumToRender`/`maxToRenderPerBatch`/`windowSize` mantêm o objetivo de desempenho |

---

## Navegação

Cinco separadores na barra inferior:

```
Início · Treino · Planos · Perfil · Exercícios
```

Dois deles têm separadores de topo próprios:

- **Treino** — Meu Plano · Treino Livre · Histórico
- **Planos** — Todos · Novos · Favoritos

### Centro de progresso

Os sete ecrãs de análise estavam espalhados por três sítios: fadiga,
conquistas e resumo mensal na Home, comparação de fotos no Perfil, e
equilíbrio, 1RM e favoritos três níveis abaixo dentro do histórico. Quem não
fosse remexer no histórico nunca descobria metade.

`app/progress/index.tsx` reúne-os todos, com entrada na Home. Os atalhos
antigos ficaram — o hub junta, não substitui.

**Histórico** continua fora da barra, alcançável pelo separador de topo
dentro de Treino e pelo hub.

### Proteção contra ecrãs órfãos

`app/__tests__/navigation.test.ts` lê os `router.push` do código e verifica
que cada destino existe, que cada ecrã de análise tem pelo menos uma entrada
vinda de outro ficheiro, e que a biblioteca de exercícios continua na barra.

Isto existe porque já aconteceu duas vezes: os ecrãs de progresso nasceram
sem ponto de entrada, e esconder o separador Exercícios deixou a biblioteca
inteira inacessível. Nenhum dos dois casos apareceu no typecheck, no lint ou
em qualquer teste — o código estava correto e a app estava partida.

**Nota sobre os cinco separadores:** houve uma tentativa de reduzir a
quatro escondendo Exercícios. O resultado foi a biblioteca inteira ficar
sem acesso. Enterrar um destino de uso frequente para cumprir um número é
pior do que ter um separador a mais.

### Por validar

Este percurso foi feito num **emulador** com instalação de raiz (ver
"Passagem em emulador Android" acima) — os seis passos passam. Falta:

- **Correr num Android físico.** Emulador x86_64 não é o mesmo que hardware
  arm64.
- **Upgrade a partir de uma instalação anterior.** Só foi testada instalação
  de raiz.
- Descanso com o telemóvel **bloqueado** (o alerta a tocar à hora certa).

Percurso mínimo (feito em emulador, por refazer em dispositivo):

1. Primeira abertura com base de dados vazia.
2. Criar ou escolher um plano, iniciar treino.
3. Fechar a app a meio e retomar o treino interrompido.
4. Terminar o treino, ver no histórico.
5. Abrir Equilíbrio, 1RM e Favoritos.
6. Botão "voltar" em todos os ecrãs.

---

## Desempenho

- A pesquisa de exercícios tinha **`SELECT` sem `LIMIT`**: com a caixa vazia
  devolvia os ~1400 registos, e três seletores diferentes renderizavam-nos
  todos. Passou a ter limite de 100 por omissão. O ecrã da biblioteca chama
  com `Infinity` de propósito — truncar ali esconderia exercícios sem sinal
  nenhum, que seria pior. Coberto por testes nos dois sentidos.
- A `SectionList` da biblioteca está afinada (`initialNumToRender`,
  `maxToRenderPerBatch`, `windowSize`). Sem `getItemLayout`: a altura da
  linha varia com a presença de ilustração, e uma estimativa fixa
  desalinharia as linhas em vez de acelerar. **Sem `removeClippedSubviews`:**
  na New Architecture rebentava a lista assim que tinha as ~1400 linhas
  (`addViewAt: failed to insert view … index=N count=0`, verificado em
  emulador). Os três props acima já limitam quantas linhas montam.
- A lista de sessões do histórico tem `scrollEnabled={false}` dentro de um
  `ScrollView`, o que normalmente é mau — mas carrega 30 de cada vez com
  paginação, portanto não compensa mexer.

## Biblioteca de exercícios

Duas camadas:

| Origem | Quantidade | Idioma | Imagens |
|---|---|---|---|
| `db/exerciseSeedData.ts` | 564 | português, curado | não |
| `assets/data/exercise-db.json` | 876 | **português** (instruções traduzidas) | sim (873) |

O dataset importado é o [free-exercise-db](https://github.com/yuhonas/free-exercise-db),
sob Unlicense — domínio público, sem atribuição obrigatória nem restrição
de uso comercial. Está vendorizado no repositório, portanto a importação
não precisa de rede. É idempotente e corre dentro de uma transação: uma
falha a meio não deixa a tabela meio populada a passar por completa.

**22 nomes do dataset colidem com o seed curado** ("Air Bike", "Bench Dips",
"Dead Bug", "Face Pull", "Good Morning", …). Com o índice único
`exercises.name` (parcial, `is_custom = 0`) a importação fazia `INSERT`
simples, rebentava com `UNIQUE constraint failed`, a transação revertia e a
rejeição escapava até crashar o arranque. Agora é `INSERT OR IGNORE`: os
colidentes são saltados, o curado PT fica como camada de qualidade, e o
resto (851 registos) entra. Num arranque de raiz importa 851; verificado em
emulador.

**As ilustrações são remotas.** Vêm de `raw.githubusercontent.com` na
primeira visualização. Nomes, músculos, equipamento e instruções são
locais; as imagens não. A app não é totalmente offline neste aspeto.

**As instruções do dataset foram traduzidas para PT-PT** (871 de 876, 5 sem
texto). Tradução automática via Google Translate `pt-PT`, revista por
amostragem. O JSON vendorizado já traz o texto traduzido (instalações de
raiz), e a migração `migrateExerciseDbInstructionsPt` faz `UPDATE` por
`api_id` nas bases já semeadas em inglês (dado, não `ALTER` — segue o padrão
de `migrateExerciseAltNames`). Nomes, músculos e equipamento ficam iguais ao
original.

O JSON é carregado preguiçosamente: um `import` no topo do módulo obrigava a
interpretar 822 KB em todos os arranques, incluindo o caso normal em que a
tabela já está cheia e não há nada a importar. Agora só é lido quando falta
mesmo importar alguma coisa — na prática, uma vez.

### O que foi removido, e porquê

- Um gerador que fabricava ~1050 nomes combinatórios ("Explosive Bench
  Press with Kettlebell"), com instruções em template repetidas centenas de
  vezes. O código dizia produzir "15k+"; produzia 1050.
- Um ecrã de vídeos cujos `video_url` eram links de pesquisa do YouTube. O
  "player" fazia `Linking.openURL` — atirava para fora da app, para uma
  página de resultados que podia nem ser o exercício certo.
- Um serviço de cache de vídeos offline cujas funções devolviam `null`,
  `[]` e `0`.
- Um `fetch` à API do exercisedb.io, que deixou de existir nesse formato.

No lugar: a ilustração do dataset, num modal dentro da app, no cabeçalho do
exercício durante o treino e no ecrã de detalhe.

As colunas `video_url` e `video_cached_path` ficaram na tabela — apagar
colunas numa base de dados instalada é risco sem retorno. A migração limpa
os links de pesquisa já gravados.

---

## Descanso entre séries

O default é **30 segundos**, definido em `DEFAULT_SETTINGS.defaultRestSeconds`.

O temporizador conta pela diferença de instantes reais (`Date.now()`), não
por acumulação de ticks, portanto não se desfasa quando o sistema congela o
JavaScript com o ecrã bloqueado. Ao iniciar o descanso é agendada uma
notificação local para o fim, e o `expo-keep-awake` mantém o ecrã ligado
apenas neste ecrã. Há aviso háptico duplo aos 5 segundos, distinto do alerta
final.

Em emulador: o temporizador conta de 30 s, muda para vermelho aos 5 s e
agenda a notificação local. O teste que falta continua a ser o óbvio:
iniciar um descanso, **bloquear o telemóvel**, e ver se o alerta toca à hora.

Havia três valores em desacordo: a definição global dizia 30, o fallback do
treino ativo dizia 90, e o schema tinha `DEFAULT 90`. Estão alinhados.

Os descansos por tipo de plano no `planGenerator` são deliberados e não
devem ser uniformizados: 180 s para força, 45 s para resistência, 30 s para
cardio.

---

## Motor adaptativo (NSPI)

Design completo em `NSPI_ENGINE.md`. Motor de periodização automática
(ciclos de 4 fases, ajuste semanal, North Star Progress Index) assente só em
heurísticas explicáveis, sem rede nem LLM. Sempre acessível, sem gates.

Estado por sub-fase:

| Sub-fase | O quê | Estado |
|---|---|---|
| N1 | 4 tabelas (`adaptive_plan/cycle/week/exercise_state`) + `utils/nspi.ts` (score /100: carga + volume + equilíbrio, ponderado por objetivo) | **feito**, 14 testes |
| N2 | `utils/adaptivePlan.ts` — fases (On-Ramp/Acumulação/Intensificação/Descarga), multiplicadores por objetivo, `phaseTargets`, `roundToIncrement`, `loadIncrement` | **feito**, 18 testes |
| N3 | `utils/adaptiveDecision.ts` — decisão semanal (advance / bridge / hold / deload_early), "progresso não é punição" | **feito**, 13 testes |
| N4 | Orquestração: migração `migrateAdaptiveEngine`; `db/adaptiveDao.ts` (CRUD); `utils/movementClassify.ts` (padrão + bucket, puro); `utils/adaptiveWeek.ts` (janela + assemblagem de sinais, puro); `utils/adaptiveService.ts` (`startAdaptivePlan`, `closeWeekIfDue` idempotente, `getAdaptiveStatus`) | **feito**, 29 testes |
| N5 | UI: `hooks/useAdaptiveStatus.ts`; wizard `app/adaptive/start.tsx` (objetivo/nível/plano/dia de início); card "Plano Adaptativo" em `Treino › Explorar`; badge de fase em `Treino › Plano`; card **NSPI** em `Progresso › Resumo` (substitui o Índice de Progresso quando há semana fechada); ecrã `app/adaptive/recap.tsx` (Weekly Recap); toggle "Periodização automática" + dia de início de semana em `Definições`; estrela roxa "porquê este alvo" no treino ativo | **feito** |
| N6 | `closeWeekIfDue` corre a cada `useAdaptiveStatus` em foco (idempotente — só faz trabalho real na primeira chamada depois da semana acabar). ~~"Treino Inteligente" vira atalho compacto~~ — removido por completo a pedido do dono (11/09): deixou de fazer sentido com o motor adaptativo a decidir a semana. | **feito** |
| N7 | Níveis de experiência (Iniciante/Intermédio/Avançado) passam a afetar o motor a sério, não só o onboarding: `EXPERIENCE_ADJUST` em `utils/adaptivePlan.ts` (deltas relativos sobre o spec já ajustado por objetivo — iniciante intensifica mais leve e com rep window mais larga, avançado intensifica mais fundo e descarrega mais fundo); `strongThreshold` em `utils/adaptiveDecision.ts` (2 em vez de 3 para iniciante — progressão quase linear merece uma fasquia mais baixa para avançar). `intermediate` fica vazio de propósito: é o comportamento de sempre, por isso todo o código existente que não passa `experience` continua bit-a-bit igual. Editável em `Perfil › Definições › Plano Adaptativo (NSPI)` (chips "NÍVEL"). | **feito**, 9 testes novos |

**Estrela roxa "porquê este alvo" — feito.** Em `app/workout/active.tsx`
(~1650 linhas, já tinha partido duas vezes com refactors não testados — ver
Dívida conhecida), adição puramente aditiva e isolada: um `useEffect`
próprio (não mexe em `init()`), um ícone `Star` no cabeçalho do exercício só
quando esse exercício tem estado no motor adaptativo, e um `Modal`
`transparent overFullScreen` novo com a fase, o %e1RM alvo e a janela de
reps. Nenhuma função existente foi alterada. Verificado em dispositivo:
estrela aparece em cada exercício do plano adaptativo, popover mostra "Fase
de Adaptação · ~65% do teu 1RM estimado · 12–15 reps" (correto para On-Ramp),
fechar o popover e registar séries continua a funcionar, sair/descartar o
treino continua a funcionar. Sem crashes.

**Verificado em emulador (2026-09-11), fluxo completo:** wizard `Treino ›
Explorar › Plano Adaptativo` → gerou plano ("Plano Adaptativo", Upper/Lower,
4x/semana) → `startAdaptivePlan` escreveu `adaptive_plan`/`adaptive_cycle`/
`adaptive_week` e reescreveu `plan_exercises` (reps 12-15, fase On-Ramp,
confirmado no ecrã do plano) → badge de fase em `Treino › Plano` ("Ciclo 1 ·
Adaptação") → card violeta em `Explorar` muda para o estado "ativo" → toggle
"Periodização automática" em Definições liga/desliga o `adaptive_plan.active`
sem apagar o ciclo → pausar e reativar preserva o dia de início da semana →
o ecrã Weekly Recap distingue "nunca ligado" de "em pausa" (aponta para
Definições em vez de relançar o wizard e criar um segundo plano) → "Treino
Inteligente" fica compacto quando há plano adaptativo ativo. Sem crashes,
sem erros de migração no logcat.

Migração das 4 tabelas: só `CREATE TABLE IF NOT EXISTS` + índices, sem
`ALTER`. `adaptive_exercise_state` ganhou `base_sets` (as tabelas nunca
foram distribuídas, portanto acrescentar coluna ao `CREATE` é seguro).

`closeWeekIfDue` nunca lança — corre à cabeça de um ecrã e a app tem de
sobreviver a uma linha má ou a um lock. Idempotente: uma segunda chamada
para a mesma transição de semana é no-op (`planWeekExistsForStart`).

**Testes: 30 suites / 320.** `tsc` limpo. OTA publicada e verificada em
emulador (a app arranca sem erros de migração com as 4 tabelas novas).

---

## Plataforma

**Android apenas**, declarado em `app.json` (`"platforms": ["android"]`).

O bloco de configuração iOS foi removido: nunca foi construído nem testado
nada para iOS, e mantê-lo dava a entender um suporte que não existe. O
script `npm run ios` também saiu — mas **`expo prebuild` volta a reescrevê-lo
no `package.json`**; se se correr um prebuild, apagar o script outra vez.

Web está fora pela mesma razão mais uma técnica: o `expo-sqlite` no web
precisa do asset WASM do wa-sqlite e a app assenta toda numa base de dados
SQLite local.

Declarar a plataforma explicitamente faz um build para qualquer outra coisa
falhar em voz alta em vez de meio-suceder.

Ficaram no código três verificações `Platform.OS === 'ios'` (som de
notificação e comportamento do `KeyboardAvoidingView`). São defensivas —
avaliam para `undefined` em Android — e não vale a pena removê-las.

---

## Dívida conhecida

- **14 avisos de lint** (eram 31 — o resto eram imports/variáveis por usar,
  removidos). Os que restam são `require()` em ficheiros de teste (padrão
  deliberado para reiniciar módulos entre casos) e `import/first` a seguir
  a um `jest.mock()`.
- **Teclado a tapar o peso/reps do último exercício — mitigado, não
  totalmente verificável em emulador.** Duas causas reais corrigidas:
  (1) todos os exercícios abriam expandidos ao mesmo tempo — só o primeiro
  abre agora, os outros ficam colapsados (toca no cabeçalho para abrir) e
  concluir todas as séries de um exercício fecha-o e abre o seguinte
  automaticamente; (2) o `KeyboardAvoidingView` só tinha `behavior` definido
  para iOS — em Android (a única plataforma da app) não fazia nada. Também
  foi acrescentado um ajuste manual que desloca o ecrã para o campo focado
  ficar acima do teclado. Este emulador usa um teclado numérico muito baixo
  (ligado a "teclado físico" do host), por isso o cenário exato não dá para
  confirmar visualmente aqui — fica para verificar num telemóvel real.
- **`app/workout/active.tsx` tem ~1640 linhas.** O `TempoMetronomeBox` já
  saiu para `components/workout/`. O `SetRow` (~220 linhas) é o candidato
  seguinte, mas está tipado contra `ActiveExercise` e usa o
  `AnimatedTouchable` definido no ficheiro, portanto movê-lo arrasta os
  dois. Um refactor não testado deste ficheiro já o partiu uma vez — fica
  para depois da passagem em dispositivo.
- **Sem `WorkoutContext`.** Centralizar o estado do treino num contexto
  dedicado limparia o ecrã, mas é a mesma categoria de mudança: grande,
  mecânica, e impossível de verificar sem correr um treino.
- ~~Upgrade real por exercitar~~ **Coberto.** `db/__tests__/migrations.upgrade.test.ts`
  corre a sequência real de `initDatabase()` contra SQLite a sério (`node:sqlite`,
  não um mock) — uma vez numa instalação de raiz, e uma vez contra um schema
  "dia 1" escrito à mão (sem nenhuma das colunas que só existem por `ALTER`),
  com linhas de exemplo. Encontrou um bug real no processo: `idx_plan_exercises_day`
  era criado no bloco fatal do schema base, antes de `migratePlanDays` garantir
  que `day_index` existia — numa instalação verdadeiramente antiga isso
  derrubava a app inteira com "Database unavailable" logo no arranque.
  Corrigido (o índice sai do bloco fatal; `migratePlanDays` já o recriava a
  seguir, em segurança). Continua a faltar um telemóvel Android real — o
  teste cobre o SQL, não o hardware arm64 nem o resto do sistema operativo.
- **Descanso com o telemóvel bloqueado — verificado.** Timer de descanso
  iniciado, ecrã bloqueado de imediato; a notificação (`changes-rest-timer`)
  apareceu no `dumpsys notification` do sistema com som e vibração armados,
  dentro da janela agendada. Falta só o mesmo teste num telemóvel real.
- ~~Instruções do dataset por traduzir~~ **Feito** — 871 traduzidas para
  PT-PT, no JSON vendorizado + migração `migrateExerciseDbInstructionsPt`.
  Verificado em emulador.
- ~~"Peso Corporpo" / "levar a injury"~~ **Corrigido.**
- **`migrateSecondaryMuscleTokens` usava `TRIM(BOTH ',' FROM x)`** — sintaxe
  Postgres, não SQLite (`near "','": syntax error`). Falhava em todos os
  arranques desde que foi adicionada. Corrigido para `TRIM(REPLACE(...), ',')`.
  Visto a passar em emulador.
- **Sem teste para a colisão de nomes na importação.** O crash do índice
  único passava em `tsc`, lint e nos 246 testes. Faltava um teste que
  carregue `exercise-db.json` + o seed curado e falhe se um `INSERT` simples
  colidir.
- **`app.json` ganhou `extra.eas.projectId` e `owner`** de `eas init`, para
  a build EAS. Sai daqui se se voltar ao workflow sem EAS.

---

## Conteúdo/UX — pedidos do dono (11 de setembro de 2026)

Lote de 10 pedidos, todos **feitos** e verificados em emulador via `eas
update`:

- **Áudio do descanso não para música de fundo** — já era assim
  (`interruptionMode: 'duckOthers'` em `utils/sound.ts`, baixa o volume e
  repõe sozinho); só faltava dizer.
- **Níveis de experiência no motor adaptativo** — ver N7 acima.
- **`Treino › Plano` mostra o que está planeado por dia + estimativa de
  tempo.** Novo card "O QUE ESTÁ PLANEADO": lê `plan_exercises` do plano
  adaptativo (já reescrito pelo motor a cada semana — reflete sempre a fase
  atual), agrupa por dia, e usa `utils/workoutTime.ts`
  (`estimateDayMinutes`) para uma estimativa que conta séries × tempo de
  execução, descanso entre séries, e tempo de troca de exercício/peso entre
  exercícios. Expansível por dia.
- **"Treino Inteligente" removido por completo** — ver N6 acima.
- **Sinais de Fadiga: nível geral de "stacking".** `overallFatigueLevel()`
  em `utils/fatigueSignals.ts` conta quantos TIPOS de sinal (salto de
  volume, regressão de força, RPE creep) disparam ao mesmo tempo — 2+ ao
  mesmo tempo pesa mais do que um isolado, é o padrão real de sobrecarga.
  Banner novo no topo do ecrã com essa leitura; sinais dentro de cada tipo
  passam a vir ordenados por gravidade.
- **Consistência: quadrados → gráfico de barras semanais.** O grid
  dia-a-dia ("aqueles quadrados não me dizem nada") saiu;
  `components/ui/TrainingConsistencyChart.tsx` (substitui
  `TrainingHeatmap.tsx`, apagado) mostra uma barra por semana com altura =
  séries reais dessa semana, cor graduada à escala da própria pessoa, toque
  para ver o detalhe. `utils/trainingHeatmap.ts` ganhou
  `aggregateWeeklyConsistency`.
- **Descrição em "Gerar Divisão" e "5/3/1"** — subtítulos curtos nos cards
  de `Treino › Explorar`.
- **Perfil enriquecido.** Cabeçalho novo com resumo vitalício (treinos,
  dias seguidos, recordes, kg levantados, "a treinar desde X") — visível em
  qualquer sub-separador do Perfil, não só nos Recordes. `getAchievementStats`
  ganhou `currentStreak` e `firstWorkoutAt`.
- **Tab dedicada "Meus Planos".** 4º separador em `Treino` (Explorar ·
  Plano · Instantâneo · Meus Planos), decisão tomada com o dono entre isto
  e um 5º ícone na barra inferior. Estado/ações partilhados com o ecrã
  Planos standalone via `hooks/usePlansManager.ts` +
  `components/ui/PlanGroupCard.tsx` + `PlanVersionModal.tsx`, para não haver
  duas ideias diferentes do que "duplicar" ou "apagar" um plano fazem.
  Criar/listar/duplicar/apagar verificado em emulador.
- **"Streak" → "Dias seguidos"** em `Progresso › Resumo`.

Todas as strings de marketing ("grátis", "sem conta", "sem anúncios") foram
removidas do onboarding, do ecrã de confirmação do plano adaptativo e de
`Treino › Explorar` — o dono já sabe, não precisa que a app repita. Frases
motivacionais (`utils/motivationalQuotes.ts` e a notificação associada)
foram apagadas por completo. Todas as referências de código ao JeFit foram
removidas (`grep -ri jefit` limpo em todo o repositório, incluindo um
comentário residual em `app/workout/active.tsx` encontrado a 2026-09-11).

---

## Segundo lote de pedidos (11 de setembro de 2026)

Todos **feitos** e verificados em emulador via `eas update`:

- **Bug corrigido: botão "Gerar Plano da Semana X" no 5/3/1 não respondia.**
  Tinha `disabled={!allSet}` no `Button`, o que bloqueava o `onPress` por
  completo — incluindo o alerta "Falta definir pesos" que já existia mas
  nunca conseguia disparar. O botão passa a estar sempre ativo; o próprio
  `handleGenerate` mostra o alerta quando faltam pesos.
- **Cronómetro de descanso redesenhado** — `components/ui/RestRing.tsx`,
  um anel circular SVG (mesma técnica do `DonutChart`) que esvazia à medida
  que o tempo passa, com "-15s"/"+15s" a flanquear. Substitui a barra de
  texto anterior em `app/workout/active.tsx`.
- **Cronómetro por série liga-se à análise de ritmo.** O
  `workout_sets.set_duration` já existia e já era escrito (via o
  cronómetro "Tempo de série"), mas nunca era reposto a zero entre séries
  nem usado para nada — corrigido (reset automático após cada série) e
  `utils/setPace.ts` (ritmo ideal = reps × 3s, configurável) passa a
  comparar o tempo real com o ideal. `app/workout/summary.tsx` mostra um
  card "Ritmo das séries" + o tempo por série na lista; um botão novo
  (`exportWorkoutSummaryText`) envia esse resumo pela folha de partilha do
  Android — que já inclui Gmail e "Quick Share" (o mecanismo de
  transferência nativo do Android), cobrindo também o pedido de exportar o
  backup para as transferências do telemóvel sem código extra.
- **Assistente do plano adaptativo sugere mais dias quando não chegam.**
  `suggestedDaysPerWeek()` em `utils/planGenerator.ts` — se os
  minutos/sessão escolhidos não derem para cobrir todos os grupos
  musculares do dia mais exigente da divisão, sugere o próximo
  dias/semana que resolve, com opção de aceitar ou manter.
- **Gerador de treino em casa** — `app/plan/home.tsx` +
  `generateHomeWorkout()`: pergunta que parte do corpo, quanto tempo, e se
  quer cardio; gera só com halteres/peso do corpo (`home_dumbbell`, um
  novo `EquipmentPreference` que nunca recua para equipamento de ginásio,
  ao contrário de `free_weights`). Acessível em `Treino › Explorar`.

**Testes: 32 suites / 371.** `tsc` limpo, lint sem novos avisos.

---

## Terceiro lote — redesenho do plano adaptativo e onboarding (11 de setembro de 2026)

Pedido: replicar os *padrões* (não o texto/cores/layout) de uma app de
referência descrita pelo dono para o onboarding e o ecrã do plano
adaptativo, mais validar os números do motor contra a literatura de
periodização. Cinco peças, cada uma commitada e verificada em emulador via
`eas update`:

- **Fases nomeadas e explicadas.** Já existiam (`PHASE_LABEL_PT` em 5
  sítios da UI) — o que faltava era o "porquê" do ciclo como narrativa, não
  só por fase isolada. Card novo "Quatro fases, um objetivo cada" no Weekly
  Recap (`CYCLE_RATIONALE_PT`); a semana de Adaptação a seguir a uma
  Descarga deixa de reutilizar o texto da primeiríssima semana ("reencontrar
  as cargas") e passa a falar de consolidar num patamar mais alto.
- **Multiplicadores da fase fundamentados.** `PERIODIZATION_RESEARCH.md`
  (29 fontes primárias, cada afirmação com nível de confiança). A
  intensificação cortava só 10% do volume para 4-6 reps a ~85% e1RM —
  fraco face à literatura (Baz-Valle et al. só valida "séries" como unidade
  de volume até aos 6 reps) — revisto para 20%. A descarga (50%) já estava
  bem fundamentada (Bell et al. 2025) e ficou como estava, agora com a
  fonte em comentário.
- **Ecrã do plano** (`app/adaptive/plan.tsx`, novo) — "aqui está o teu
  programa", não uma lista de exercícios: resumo objetivo/experiência/
  ciclo, gráfico de progressão (real a cheio, projeção tracejada e sem
  números inventados), bloco das quatro fases, um cartão por semana do
  ciclo atual, ciclo seguinte bloqueado, três cartões de benefício.
  Diferença deliberada da referência: o motor daqui é reativo (decide a
  semana seguinte só quando a atual fecha), não pré-calculado — por isso as
  semanas futuras aparecem esbatidas como pré-visualização, e não há um
  número fixo de "N ciclos totais".
- **Onboarding redesenhado** (`app/onboarding.tsx`) — nível com frase
  completa por opção, dias numa grelha 2/linha (1-6 + "Todos os dias"),
  duração com selo IDEAL calculado a partir de `suggestedDaysPerWeek` (não
  adivinhado), zonas-alvo (grelha 3/linha, sem arte anatómica — círculos de
  cor, reutilizando a paleta do `MuscleBalanceRadar`), lesões
  (Músculos/Articulações, "Não tenho lesões" desativa o resto), equipamento
  (localização editável a pré-selecionar, checklist por categoria real da
  app — 5 categorias, adaptadas ao vocabulário de 12 tags do dataset, não
  copiadas da referência). `utils/planGenerator.ts` ganhou
  `allowedEquipment` e `excludedMuscles` (aditivos, sem mudar chamadores
  existentes) para que cada pergunta influencie mesmo o plano gerado — regra
  explícita do pedido.
- **Cartão de entrada** (`Treino › Explorar`) — variante rica quando há
  plano ativo: etiqueta de fase, subtítulo, linha objetivo/duração/
  equipamento (valores reais, não inventados), botão "Ver o meu plano".

**Testes: 32 suites / 377** (6 novos: checklist de equipamento fino,
exclusão de lesões, fallback do Gymleco, valor fundamentado da
intensificação). `tsc` limpo, lint sem erros novos.

---

## Prioridade

1. Correr num Android **real** — hardware arm64, o resto continua por ver
   mesmo com tudo o que segue verificado noutro sítio.
2. ~~Testar upgrade de base de dados a partir de uma instalação anterior~~ —
   coberto por teste (ver Dívida conhecida). Falta só o dispositivo real.
3. ~~Descanso com o telemóvel bloqueado~~ — verificado em emulador (som +
   vibração armados, notificação entregue). Falta só o dispositivo real.
4. Só depois, funcionalidades novas.

O emulador tirou os crashes que partiam a app a correr, mostrou o fluxo de
raiz a funcionar, e agora também cobre — com SQLite a sério, não simulado —
o upgrade a partir de uma instalação antiga e a notificação de descanso com
o ecrã bloqueado. O que falta a partir daqui é só mesmo hardware real:
arm64, e tudo o que só um telemóvel físico mostra (bateria, outras apps a
interromper, redes reais). Até lá, a app não deve ser dada como pronta,
independentemente do que o `tsc`, o lint e os testes digam.

# Changes — estado do projeto

Última revisão: 10 de setembro de 2026.

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
| `npm run lint` | 0 erros, 20 avisos |
| `npm test` | 24 suites, 246 testes |

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

Design completo em `NSPI_ENGINE.md`. Replica o *Adaptive Progressive
Overload* / *Periodization* do JeFit (ciclos de 4 fases, ajuste semanal,
North Star Progress Index) **totalmente offline** — só heurísticas
explicáveis, sem rede nem LLM. **Grátis e sempre acessível** (no JeFit é
pago; aqui não há gate "Elite").

Estado por sub-fase:

| Sub-fase | O quê | Estado |
|---|---|---|
| N1 | 4 tabelas (`adaptive_plan/cycle/week/exercise_state`) + `utils/nspi.ts` (score /100: carga + volume + equilíbrio, ponderado por objetivo) | **feito**, 14 testes |
| N2 | `utils/adaptivePlan.ts` — fases (On-Ramp/Acumulação/Intensificação/Descarga), multiplicadores por objetivo, `phaseTargets`, `roundToIncrement`, `loadIncrement` | **feito**, 18 testes |
| N3 | `utils/adaptiveDecision.ts` — decisão semanal (advance / bridge / hold / deload_early), "progresso não é punição" | **feito**, 13 testes |
| N4 | Orquestração: migração `migrateAdaptiveEngine`; `db/adaptiveDao.ts` (CRUD); `utils/movementClassify.ts` (padrão + bucket, puro); `utils/adaptiveWeek.ts` (janela + assemblagem de sinais, puro); `utils/adaptiveService.ts` (`startAdaptivePlan`, `closeWeekIfDue` idempotente, `getAdaptiveStatus`) | **feito**, 29 testes |
| N5 | UI: `hooks/useAdaptiveStatus.ts`; wizard `app/adaptive/start.tsx` (objetivo/nível/plano/dia de início); card "Plano Adaptativo" em `Treino › Explorar`; badge de fase em `Treino › Plano`; card **NSPI** em `Progresso › Resumo` (substitui o Índice de Progresso quando há semana fechada); ecrã `app/adaptive/recap.tsx` (Weekly Recap); toggle "Periodização automática" + dia de início de semana em `Definições`; estrela roxa "porquê este alvo" no treino ativo | **feito** |
| N6 | "Treino Inteligente" vira atalho compacto quando há plano adaptativo ativo; `closeWeekIfDue` corre a cada `useAdaptiveStatus` em foco (idempotente — só faz trabalho real na primeira chamada depois da semana acabar) | **feito** |

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

- **20 avisos de lint, nenhum de hooks.** Os que restam são variáveis por
  usar e `require()` em ficheiros de teste.
- **`app/workout/active.tsx` tem ~1640 linhas.** O `TempoMetronomeBox` já
  saiu para `components/workout/`. O `SetRow` (~220 linhas) é o candidato
  seguinte, mas está tipado contra `ActiveExercise` e usa o
  `AnimatedTouchable` definido no ficheiro, portanto movê-lo arrasta os
  dois. Um refactor não testado deste ficheiro já o partiu uma vez — fica
  para depois da passagem em dispositivo.
- **Sem `WorkoutContext`.** Centralizar o estado do treino num contexto
  dedicado limparia o ecrã, mas é a mesma categoria de mudança: grande,
  mecânica, e impossível de verificar sem correr um treino.
- **Upgrade real por exercitar.** Há agora um registo de migrações
  (`schema_migrations`): um passo só é dado como aplicado depois de
  terminar, portanto uma falha é repetida no arranque seguinte em vez de
  ficar esquecida, e `getFailedMigrations()` expõe o que falhou. Isto está
  coberto por testes com base de dados simulada, e a instalação de raiz foi
  vista a correr em emulador — mas **um upgrade a partir de uma instalação
  antiga real continua por fazer**.
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

## Prioridade

1. Correr num Android **real** e refazer o fluxo (em emulador já passa).
2. Testar upgrade de base de dados a partir de uma instalação anterior.
3. Descanso com o telemóvel bloqueado.
4. Só depois, funcionalidades novas.

O emulador tirou os três crashes que partiam a app a correr e mostrou o
fluxo de raiz a funcionar, mas não substitui os pontos 1–3: hardware arm64,
percurso de upgrade e notificação com o ecrã bloqueado continuam por ver.
Até lá, a app não deve ser dada como pronta, independentemente do que o
`tsc`, o lint e os testes digam.

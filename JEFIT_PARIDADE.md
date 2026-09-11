# Changes → paridade com o JeFit

Plano vivo. Objetivo declarado pelo dono do projeto: **o Changes deve ficar
idêntico ao JeFit — funcionalidades, opções, menus e design.**

Fonte da verdade: capturas do JeFit (2026) fornecidas pelo dono — onboarding
completo, ecrã de registo com periodização, barra inferior, estado vazio do
Workout, separador Progresso. Guardadas mentalmente aqui; se houver dúvida,
pedir nova captura em vez de inventar.

O que **não** se replica 1:1 (assets proprietários):
- vídeos/animações de exercícios do JeFit (biblioteca licenciada) — ficamos
  com as ilustrações estáticas do free-exercise-db;
- ilustrações e fotos de corpo do onboarding do JeFit;
- logótipo/wordmark. O nome continua "Changes".

Replica-se: a **linguagem visual, o layout, os componentes, a navegação e o
conjunto de funcionalidades**.

---

## 1. Arquitetura de informação do JeFit (verificada por captura)

### Barra inferior — 4 separadores
`Discover · Workout · Exercises · Progress`

Ícones: velocímetro (Discover) · check dentro de quadrado arredondado, azul
sólido quando ativo (Workout) · halteres/argolas (Exercises) · grelha de
barras / calendário (Progress). Ativo = azul; inativo = contorno cinza.
Sem separador "Perfil" nem "Início": o perfil é o avatar + ⚙️ no header do
Progresso; o "painel" é o `Progress › Overview`.

### Workout — sub-abas de texto com sublinhado azul
`Find · Planned · Instant ✦`

- **Find** — catálogo de planos. Grelha de categorias (Muscle Gain, Fat Loss,
  Push/Pull, Abs, Full Body, At Home, 3 Day Split, Stretch), botão FILTER,
  secções "For You" e "Trendy", detalhe do plano → "Select as Current Plan".
  É também onde se entra no plano adaptativo ("Get started").
- **Planned** — o plano atual. Card no topo (se adaptativo: badge de fase,
  navegação `< Ciclo N Fase M >`, barra de periodização, "Current").
  Sub-abas `Overview · Day Details`. Lista de dias (nome, tempo estimado, nº
  de exercícios, data do último). "+ Add a day". Botão flutuante
  "Start Workout".
  - Estado vazio: ilustração + "Let's get your first workout plan!" + dois
    botões azuis largos: "Find a Plan" / "Create from scratch".
- **Instant ✦** — treino rápido ad-hoc. Chips: duração ▾ · alvo ▾ ·
  equipamento (N) ▾ · ícone relâmpago. Lista de exercícios gerada
  (`3 x 8 reps · 120s`), "+ Add Exercise", "Start Workout".

### Exercises
Lista com filtro por músculo e equipamento. Detalhe do exercício:
- header: back · chip "Goal: 150lbs" · partilhar · estrela (favorito)
- media (vídeo/imagem) + miniatura
- nome + nomes alternativos por baixo
- sub-abas `History · Chart` (intervalos `14D · 1M · 3M · 6M`), botão
  "1 Rep Max"

### Progress
Header: avatar · nome · "Iron points N" · badge "Elite hub" · 🔄 · ⚙️
Sub-abas `Overview · Body · Activity`
- **Overview** — card "Volume ›" (`12,500 lbs This week`, delta %), card
  "Workout Time ›" (`2h 36m`, delta %), calendário mensal com dias de treino
  a azul, "N Total sessions", "N weeks Current Streak" 🏆, botão
  "Compare with…". Tocar num card → detalhe com gráfico de barras e
  intervalos `7D · 14D · 1M · 3M · All`.
- **Body** — medidas corporais + fotos de progresso.
- **Activity** — registo de sessões.

### Discover
Feed / desafios / artigos / promos de planos. (Sem back-end social do nosso
lado — fica stub de artigos/dicas ou adiado.)

### Ecrã de registo (entra-se por "Start Workout")
- header: back · ícone de gráfico · ícone de troca · `···`
  (menu: trocar exercício · notas · superset)
- media dobrável (swipe up); barra de progresso segmentada (1 segmento/série)
- nome do exercício + `1RM: 62.1` (azul, à direita)
- tabela: colunas `Set | Lbs | Reps | ✓`
  - label da série: `W` (dourado) para aquecimento, depois `1 2 3`
  - linha ativa com fundo cinza muito claro; valores sublinhados a azul
  - com periodização ligada: peso mostra `50 → ✦` (valor antigo riscado +
    estrela roxa), sublabel `Per Arm`; reps com sublabel `Target 10-12`
  - `+` adiciona série; `Delete` na linha vazia
- rodapé: ícones lápis · cronómetro · grelha · círculo azul
- botão primário grande: **"Log Set"**
- painel de descanso: `- 15s` ( anel circular `Interval 01:30` ) `+ 15s`,
  reset, pausa, `Rest Timer: 01:30  Countdown [toggle]`
- toast: "New 3M Records!" com troféu 1RM

### Onboarding (sequência completa capturada)
1. What's your main goal for training? — Bulking / Strength / Cutting / Maintaining
2. Which describes your current build best? — Skinny / Average / Overweight (cartões com foto)
3. What is your goal body type? — Shredded / Bulk / Berserk (cartões com foto)
4. What are your target zones? — Arms/Back/Pecs/Abs/Legs (pills sobre foto)
5. What is your fitness level? — New to fitness / Workout from time to time / I exercise regularly
6. Interstitial escuro: "Consistent Workout Leads to Better Health" (lista de benefícios, ícones de linha em gradiente)
7. What is your height? — toggle `ft/lb | cm/kg`, régua deslizante, número grande `181 cm`, card explicativo de BMI
8. What is your current weight? — régua `78 kg`, medidor de BMI (`you - 23,81 / Normal`)
9. What is your goal weight? — régua `90 kg`, medidor de BMI alvo
10. How old are you? — roda numérica vertical `38`, card de dica
11. Where do you usually train? — Large Gym / Apartment Gym / Home (cartões com subtítulo)
12. Select your equipment list — checklist com miniaturas + chevrons (Free Weights, Benches, Racks, Attachments, Weight Machines, Cardio Machines, Other), "Continue" + "Deselect all"
13. How many days a week do you want to train? — 1..6 em grelha + Everyday
14. How long do you want to train — Up to 30 mins / 45 mins [IDEAL] / 1 hour / 1 hour 15 mins
15. How often do you guess your weight or reps? — I always guess / Sometimes not sure / Never, I know how to progress
16. Interstitial: "No Guesswork - Adjust your load as you progress" (mockup de telefone)
17. Interstitial escuro: "Stay connected to what motivates you" — Enable notifications / Not now
18. "Personalizing your plan…" — loader circular %, testemunhos, "Trusted by over 12 million people"
→ aterra em `Workout › Planned` (estado vazio)

### Definições (parcial, do artigo de periodização)
- `Definições › Workouts`: toggle "Auto-apply periodization"; "week start day"
- `Training Preferences › Equipment`: placas, halteres, definições de máquina

---

## 1b. Especificações de ecrã (capturas de alta fidelidade, 2026-09-10)

### Barra inferior (confirmada em ~15 capturas)
4 abas. Ícones: **Discover** velocímetro · **Workout** check dentro de
quadrado arredondado (preenchido a azul sólido quando ativo) · **Exercises**
haltere estilizado `)-(` · **Progress** grelha de quadradinhos.
Ativo = ícone + label azul; inativo = contorno fino cinza + label cinza.

### Workout › Find
- sub-abas de texto `Find · Planned · Instant ✨` — ativo a preto bold com
  sublinhado azul curto; inativos cinza.
- cabeçalho de secção "For You" (preto bold ~22).
- **Card-herói do Plano Adaptativo**: cartão grande raio ~20, fundo
  **gradiente roxo→violeta**, formas de brilho (✦) ao fundo. Badge-pílula de
  fase ao centro no topo, com **cor por fase**: On Ramp = verde ·
  Accumulation = âmbar · Intensification = laranja-vermelho · Deload = ciano
  · New cycle = branco. Título "Your Adaptive Plan" branco bold, subtítulo.
  **Linha ondulada** (cor = a da fase, tracejada à frente do ponto atual,
  ponto branco no fim). Linha de 3 stats (Bulking/Goal · 45 Min/Duration ·
  Large Gym/Equipment) com divisórias verticais. Botão branco largura total
  "Get Started" com texto azul.
- "Category" + botão-pílula "FILTER" (ícone de sliders, à direita).
- scroll horizontal de círculos de categoria: ícone azul line-art num
  círculo cinza-claro ~72, label por baixo (Muscle Gain · Fat Loss [KCAL] ·
  Push/Pull · Abs · Full Body · At Home · 3 Day Split · Stretch).
- "Trending".
- pílula azul flutuante "⚡ Unlock all Elite plans".

### Workout › Planned
- banner de imagem (foto p&b de atleta) com gradiente; "New Workout" branco;
  botões no canto: "⇄ Plan" (pílula contornada) e "···" (círculo contornado).
- sub-abas `Overview · Day Details` (ícone de lista, sublinhado preto grosso
  no ativo).
- card "Try the adaptive plan" (✦ roxo, corpo de texto, "Get Started" azul).
- card de dia: pega de arrasto `⋮⋮` · tile cinza com haltere azul · `MON`
  (azul, versalete) · "Workout Day #1" bold · "Est. 0m, 0 exercises" cinza ·
  "Not Started" cinza à direita. Contorno azul-claro quando selecionado.
- "Day Limit • 5 days" (esq.) · "+ Add a day" azul (dir.).
- estado vazio total: ilustração + "Let's get your first workout plan!" +
  "Find a Plan" / "Create from scratch" (dois botões azuis largos).

### Workout › Instant
chips: `duração ▾` · `alvo ▾` · `Equipment (N) ▾` · ⚡. Lista de exercícios
gerada (`3 x 8 reps · 120s`), "+ Add Exercise", "Start Workout".

### Exercises (landing)
- título "Exercise" grande bold.
- grelha 3 colunas de **silhuetas musculares circulares**: corpo cinza com o
  músculo-alvo a **azul**, label por baixo (Triceps, Chest, Shoulder, Biceps,
  Abs, Back, Forearms, Upper Leg, Glutes, Cardio [pulmões], Lower Leg, "Show
  all" [corpo todo azul]).
- tocar num → ecrã de lista de exercícios.

### Exercises › lista
- header: back · "Exercises" · "+" azul (criar personalizado).
- campo de pesquisa cinza arredondado, "Search exercise name".
- fila de filtros (scroll h.): chip "✕" (limpar) · **"Your Equipment ▾"**
  (pílula azul sólida quando ativo) · "Muscles ▾" · "Pattern ▾" (pílulas
  cinza).
- "All exercises / 1294 found" (setas de ordenação) à esq.; "⇅ Popularity"
  à dir.
- linhas: miniatura circular ~64 · nome bold ~17 · músculos trabalhados
  cinza por baixo (`Lower Chest, Triceps Long Head`). Divisória hairline.
  Sem chevron.

### Modal de filtro (bottom sheet)
folha de topo arredondado, pega, título ao centro ("Muscle"), "✕" à direita.
Grelha 3-col de silhuetas circulares, selecionado = músculo a azul. Botão
azul largura total "Confirm" ao fundo.

### Catálogo de planos (Find → categoria)
- header: back · pílula de pesquisa grande "Search Workouts".
- chips (scroll h.): "Muscle ▾ · Equipment ▾ · Days ▾ · Level ▾ · Jefit
  created ▾".
- "1132 Workouts found" · "⇣≣ Sort by: Downloads".
- cards: imagem grande arredondada (raio ~12) · pílula escura no canto
  inferior-esq. com 🔥 + nº de downloads · label "ELITE" (versalete itálico
  roxo) quando aplicável · título bold ~20 (até 2 linhas) · meta cinza
  `Intermediate • Cutting • 2 Days`. Divisória hairline.

### Detalhe de categoria (ex.: "Fat Loss")
header: back. Herói: fundo em gradiente claro, "Fat Loss" enorme bold,
"Most popular workouts" cinza, marca de água grande esbatida (KCAL). Lista
de cards de plano (tile placeholder cinza com ⚡ branco + contador 🔥,
título bold, meta cinza, "ELITE" roxo).

### Progress (aba)
- header: avatar + "andarauj" bold · 🔄 · ⚙️.
- dois cards de preenchimento cinza lado a lado: "🪙 Iron Points / 10" ·
  "⚡ Elite Hub / Unlock Elite" (gradiente subtil).
- sub-abas `Overview · Body · Activity` — texto azul + sublinhado azul no
  ativo; cinza nos outros.
- **Overview** (pilha de cards brancos, fundo `#F7F8FA`):
  - card-promo "Enable periodization ⚡" — título bold + relâmpago, "✕" para
    dispensar, ícone de mini-gráfico à esq., corpo "Train with structured
    periodization…", link azul "Enable now". (Há um card empilhado atrás —
    carrossel de promos.)
  - card "✦ Progress Index" (estrela roxa) + chevron. Valor grande em
    **roxo** ("Not Started Yet" / ou o score), data cinza por baixo, mini
    barra + ponto à direita.
  - dois stat-cards: "Volume ›" (`0 kg` grande bold / "This week") ·
    "Workout Time ›" (`0m` / "This week"). Com dados: delta % verde/vermelho.
  - card de calendário: "setembro 2026 ›", cabeçalho `S M T W T F S`, grelha
    de dias (dias de treino = círculo azul preenchido). Abaixo, com dados:
    "N Total sessions" · "N weeks Current Streak" 🏆 · "Compare with…".
  - tocar num stat-card → detalhe com gráfico de barras por dia e intervalos
    `7D·14D·1M·3M·All`.
- **Body** (cards brancos):
  - card "Muscle Recovery ›" — duas silhuetas corporais cinza (frente +
    costas) lado a lado.
  - card "Composition" + "ⓘ" — 3 colunas: Body Fat `--` · BMI `23,8` (azul,
    grande) · Lean Body Mass `--`.
  - card "Body Stats ›".
- **Activity**: feed — post com avatar, "Há N minutos", texto, banner de
  conquista (medalhão dourado: nome, "N iron points", descrição), "0 like
  0 comment", fila de ações ♥ · 💬 · ⤴.

### Exercises › lista — estados de filtro
Chip de filtro **ativo = pílula azul sólida** com texto branco (ex.:
"Your Equipment ▾", "Triceps ▾"); inativo = pílula com contorno cinza.
Chip "✕" (quadrado com contorno azul) limpa os filtros. Controlo de
ordenação à direita: "⇅ Popularity" (ícone azul + texto preto bold).
Contador "All exercises / N found" com chevrons de ordenação empilhados.
Linhas altas (~110): miniatura circular ~64 · nome bold ~18 · músculos
cinza ~15. Divisória hairline.

### Perfil (via avatar do Progress)
header: back · username bold · "Edit" (pílula contornada azul) · "···".
Avatar + 3 stats (Followers · Following · Iron Points; números bold, labels
cinza). Separadores de secção full-bleed cinza. Secções: "Composition"
(Body Fat / BMI azul / Lean Body Mass), "Achievements" (+ "Edit" azul),
"Activity" (feed).

### Muscle Recovery
header: back · "Muscle Recovery". Duas silhuetas corporais (frente + costas)
lado a lado, cinza. Tabela `Muscle | Recovery Rate | Recovery Time`, linhas
zebra (fundo alternado muito claro), ex.: "Abs 100% 0m".

### Loader "Adapting & Personalizing your plan"
fundo branco, título bold a 2 linhas. 4 grupos empilhados com barra
horizontal: "Goal & Focus" · "Schedule & Duration" · "Equipment & Setup" ·
"Experience & Safety". Cada barra enche numa **cor diferente** (roxo · ciano
· teal · coral) e mostra ✓ verde ao concluir, spinner enquanto ativa.
Rodapé: "Hang tight! We're matching your inputs with millions of successful
Jefit workouts…".

### Onboarding — footer
Nos passos com escolha há barra de progresso azul no topo e, no fundo,
**"Back" (pílula contornada azul) + "Continue" (pílula azul sólida)** lado a
lado. Cartão de opção selecionado = fundo azul-claro `#E4EDFF`, título a
preto, subtítulo cinza; não-selecionado = fundo cinza `#F4F5F7`.

### Cores das fases do mesociclo (badge + linha do card adaptativo)
| Fase | Cor |
|---|---|
| On Ramp | verde `#37C871` |
| Accumulation | âmbar `#F5A623` |
| Intensification | laranja-vermelho `#FF6B3C` |
| Deload | ciano `#3EC8E0` |
| New cycle | branco |

---

## 2. Changes hoje → alvo

Barra atual: `Início · Treino · Planos · Perfil · Exercícios` (5)
Alvo: `Descobrir · Treino · Exercícios · Progresso` (4)

| Mudança | Detalhe |
|---|---|
| Fundir `Treino` + `Planos` → um `Treino` | sub-abas `Explorar (Find) · Plano (Planned) · Instantâneo (Instant)`. O "Treino Inteligente" atual → **Instantâneo**. Gerador de divisão / 5·3·1 → **Explorar › Criar**. |
| Tirar `Histórico` do `Treino` | → `Progresso › Atividade` |
| Consolidar `Progresso` | novo separador `Resumo · Corpo · Atividade`. Absorve o hub `app/progress` (1RM, Equilíbrio, Fadiga, Conquistas, O Teu Mês, Índice de Progresso) e `Perfil › Recordes/Corpo`. Header com avatar + ⚙️. |
| Dissolver `Perfil` | Definições → ⚙️ no header do Progresso. Calculadoras → dentro de Exercícios ou Treino. |
| `Início` | não existe no JeFit — o conteúdo (streak, volume, calendário) vai para `Progresso › Resumo`. |
| `Exercícios` | fica na barra (já coincide). Adicionar sub-abas `Histórico · Gráfico` + botão "1RM" no detalhe. |
| `Descobrir` | novo. Stub de artigos/dicas, ou adiado (barra com 3). |

---

## 3. Sistema de design (extraído das capturas)

### Cor — claro
| Papel | JeFit (alvo) | Antes (Volt & Ink) |
|---|---|---|
| primário | `#2F6BFF` azul vivo | `#5B4FE8` indigo |
| primário-contentor / seleção | `#E4EDFF` azul-claro | `#E3E0FD` |
| fundo | `#F7F8FA` quase-branco | `#F7F7FB` |
| superfície (cartão) | `#FFFFFF` | `#FFFFFF` |
| superfície-variante (cartão cinza) | `#F4F5F7` | `#F0F0F7` |
| texto | `#16181D` quase-preto | `#0F172A` |
| texto secundário | `#8A8F98` | `#475569` |
| contorno | `#EAEBEE` (JeFit quase não usa contornos) | `#DDDCE8` |
| acento (premium/AI ✦) | `#7C4DFF` roxo | `#E85D3F` coral |
| positivo / check | `#34C759` verde | `#0D9488` teal |
| aquecimento (`W`) | `#F5A623` dourado | igual |
| recorde 1RM / streak | `#F5A623` dourado | `#E85D3F` coral |

Escuro: navy profundo estilo JeFit — fundo `#0B1220`, cartão `#141C2B`,
primário `#4B82FF`.

### Tipografia
Títulos JeFit = **muito pesados** (ExtraBold 800), grandes, entrelinha
apertada, quase pretos, alinhados à esquerda, frequentemente a 2 linhas.
Números-herói (réguas, "181", "78") = ExtraBold ~52.

| token | antes | alvo |
|---|---|---|
| h1 | Inter-Bold 32/38 | **Inter-ExtraBold 30/34** |
| h2 | Inter-Bold 24/29 | Inter-ExtraBold 24/28 |
| h4 (título de opção) | Inter-SemiBold 18/22 | Inter-SemiBold 17/22 |
| button | Inter-SemiBold 16/20 | **Inter-Bold 17/22** |
| numberLarge | Inter-Bold 48/54 | **Inter-ExtraBold 52/56** |

Novo peso a carregar: `Inter_800ExtraBold` → `'Inter-ExtraBold'`.

### Forma e espaçamento
- raio: cartões `16`, botões pílula (`999`), chips pílula
- padding de cartão `20`; gap entre cartões de opção `14`
- padding horizontal do ecrã `20`
- botão primário: largura total, altura `56`, azul sólido, texto branco bold
- botão em fundo escuro: branco com texto escuro
- botão desativado: cinza claro, texto branco

### Componentes a introduzir/re-estilar
`OptionCard` (linha selecionável: título + subtítulo; selecionado = azul) ·
`PrimaryButton` (pílula azul largura total) · `ThinProgressBar` (topo do
onboarding) · `UnitToggle` (`ft/lb | cm/kg`) · `RulerSlider` (altura/peso) ·
`NumberWheel` (idade) · `TextTabs` (Find/Planned/Instant com sublinhado azul)
· `DarkInterstitial` (ecrã de valor, fundo navy + ícones em gradiente) ·
tab bar (4 abas, azul ativo).

---

## 4. Fases

- [x] **Fase 0 — Fundação.** ✅ 2026-09-10. Paleta JeFit (claro+escuro) em
      `constants/colors.ts` · tipografia ExtraBold em `constants/typography.ts`
      · fonte `Inter_800ExtraBold` em `app/_layout.tsx` · `Button` (raio 14,
      texto Bold) · `Card` (hairline + sombra suave) · `Chip` (pílula, sem
      anel) · `SearchBar` (sem contorno). Verificado a correr em emulador:
      azul-sobre-branco, títulos ExtraBold, sem crash, importação 851 OK.
      Estrutura de navegação ainda a antiga (5 separadores PT) — é a Fase 1.
- **Fase 1 — Navegação.** Decisões (2026-09-10): barra de 3 agora
      (`Treino · Exercícios · Progresso`); `Descobrir` adiado → 4ª aba na
      Fase 3; `Início` dissolve-se no `Progresso`; Calculadoras + Definições
      via ⚙️ no cabeçalho do Progresso.
  - [x] **1a** ✅ verificado em emulador. Barra `app/(tabs)/_layout.tsx`
        (`Treino` [ClipboardCheck] · `Exercícios` [Dumbbell] · `Progresso`
        [CalendarDays] · `Perfil` [User, 4º temporário]). `index` → título
        "Progresso" + ⚙️→Perfil no header (funciona). `plans` e `history`
        fora da barra (`href:null`); `plans` alcançável por link "Planos" no
        header do Treino (funciona, sem órfãos). tsc/246 testes OK, sem crash.
  - [~] **1b** — `start.tsx` sub-abas → `Explorar · Plano · Instantâneo`
        (default `Plano`). **Plano** = planeador semanal + treino de hoje +
        recuperação de treino por terminar. **Instantâneo** = Treino
        Inteligente + Treino Livre + Repetir último. **Explorar** = criar/
        gerar planos (Novo/Divisão/5·3·1) + lista "Os meus planos" (toca →
        `/plan/[id]`, "Gerir" → `plans.tsx` para editar/duplicar/apagar).
        Sub-aba "Histórico" removida do Treino (alcançável pelo Progresso).
        Link "Planos" do header removido. tsc/246 testes OK. → build EAS
        (a verificar). Nota: `plans.tsx` continua como rota `href:null` para
        a gestão; funde-se por completo na 1c se fizer sentido.
  - [x] **1c** ✅ verificado em emulador. `_layout.tsx`: `profile` →
        `href:null` → **barra final de 3** (`Treino · Exercícios ·
        Progresso`). `index.tsx` com sub-abas `Resumo · Corpo · Atividade`:
        · **Resumo** = painel existente.
        · **Corpo** = "Registar medidas" (modal) + Medidas/fotos (→ `profile`),
          Comparar fotos, Equilíbrio muscular.
        · **Atividade** = "Histórico completo" (→ `history`) + últimos treinos
          + ANÁLISE (1RM, fadiga, mês, conquistas, favoritos) — funde o hub
          `/progress`.
        ⚙️ do header → `profile`. Sem crash, sem órfãos. tsc/246 testes OK.

  **Fase 1 COMPLETA (2026-09-10).** Barra JeFit (3), Treino =
  `Explorar/Plano/Instantâneo`, Progresso = `Resumo/Corpo/Atividade`,
  Perfil via ⚙️. Falta só `Descobrir` (Fase 3).
- **Fase 2 — Ecrãs prioritários.**
  - [x] **2a** ✅ verificado em emulador. Detalhe de exercício = layout
        JeFit (media topo, nome ExtraBold, tags, `Gráfico·Histórico` +
        `14D·1M·3M·6M`, herói 1RM, estrela favorito). Lista = linhas com
        miniatura circular + músculos por baixo, ~1414 sem crash. Fix ao
        overlap da fila de pills de filtro (build seguinte). Também: i18n
        "Peso Corporal" (era "Corporpo") e "lesão" (era "injury").
        Detalhe original (obsoleto):
        `app/exercise/[id].tsx`: media no topo, nome ExtraBold +
        nomes alternativos, sub-abas `Gráfico · Histórico` com chips de
        intervalo `14D·1M·3M·6M`, herói "Máximo estimado (1RM)", favorito
        (estrela) no header. `components/ui/ExerciseListItem.tsx`: linha
        JeFit (miniatura circular 56, nome bold, músculos por baixo, sem
        chevron). `exercises.tsx`: título ExtraBold + fila de pills de
        filtro inline (abre a bottom-sheet). tsc/246 testes OK. → build
        (a verificar).
  - [ ] **2b** — Plano (Planned) · Progresso › Resumo (cards JeFit).
        NOTA: o "Plano" do Changes é um planeador semanal (atribui plano →
        dia da semana), conceito diferente do "Planned" do JeFit (rotina
        atual com lista de dias). Fica como está por agora — não é bug, é
        modelo diferente. Resumo já está próximo do JeFit pós-Fase 0.
  - [ADIADO] **2c** — ecrã de registo (`app/workout/active.tsx`, ~1650
        linhas). **Decisão: não mexer agora.** Pós-Fase 0 já lê "JeFit" na
        cor e na estrutura (X para cancelar · nome + timer azul + pausa ·
        "Terminar" verde · barra de stats Séries/Volume/Exercícios · tabela
        de séries). O que falta para paridade total — painel de descanso
        **circular** ("Interval 01:30" com reset/pausa/toggle Countdown) e o
        menu `···` (trocar exercício/notas/superset) num header próprio — é
        um restyle de componentes que o ESTADO.md diz ter partido este
        ficheiro 2× quando feito sem teste em dispositivo. Fica para uma
        passagem dedicada com tempo de Android real.

- **Imagens de exercício — animação de 2 frames.** `ExerciseMedia.tsx`:
  quando o URL é do free-exercise-db (`.../0.jpg`), deriva `.../1.jpg` (fim
  do movimento) e faz cross-fade entre os dois (~1,1 s). Se o `1.jpg` não
  existir, fica o estático. Só no ecrã de detalhe (a lista mantém miniatura
  estática, por perf). Sem novos assets, sem API. JS puro → `eas update`.
  Feito, tsc/246 testes OK; sai no 1º `eas update` após o build OTA-ready.

- **Fase 3 — Descobrir + resto.**
  - [~] **Descobrir** — nova aba (1ª da barra) → **barra final de 4:
        `Descobrir · Treino · Exercícios · Progresso`** (silhueta JeFit
        completa). `app/(tabs)/discover.tsx`: frase do dia + "Dicas para ti"
        (`getTrainingTips`, heurísticas locais) + "Aprende" (5 notas
        evergreen sobre sobrecarga progressiva, deload, técnica, descanso,
        consistência). Sem feed social (sem back-end). tsc/246 testes OK.
        → build EAS (a verificar).
- [ ] **Fase 3 — Resto.** Onboarding (18 passos), Definições, estados
      vazios, `Descobrir`. → build final.
- [ ] **Épico paralelo (funcionalidade, não menu): Periodização /
      mesociclos.** Motor de 4 fases, previews semanais, "why this weight"
      no exercício, score /100 (NSPI). Depois da reestruturação.

---

## 4b. Entrega (build vs OTA)

Desde 2026-09-10: `expo-updates` configurado (canal `preview`,
`android.runtimeVersion.policy = "appVersion"` → runtime = `expo.version`
"1.0.0"). A partir do build "OTA-ready":

- **mudança só de JS** (ecrãs, tema, navegação, lógica) → `eas update
  --branch preview` → chega ao emulador ao reabrir a app (~30 s).
- **mudança nativa** (novo pacote com código nativo, `app.json` plugins/
  permissões/ícone, `newArchEnabled`) → **novo build EAS** + subir
  `expo.version`.

Instalar o APK OTA-ready 1× no emulador; depois é `eas update`.

---

## 5. Registo de decisões

- 2026-09-10: âmbito passou de "estrutura + menus" para "redesenho completo,
  design incluído". A paleta "Volt & Ink" documentada em `constants/colors.ts`
  é substituída pela paleta azul-sobre-branco do JeFit por decisão explícita
  do dono.
- `Início` — a decidir: eliminar (barra de 4) vs. manter leve como 5º.
- `Descobrir` — a decidir: stub agora vs. adiar.
- `Calculadoras` — a decidir: dentro de Exercícios/Treino vs. `Perfil` mínimo.

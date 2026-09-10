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

Nada disto foi visto a correr num dispositivo. O percurso mínimo a
percorrer antes de confiar na navegação:

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
  `windowSize`, `removeClippedSubviews`). Sem `getItemLayout`: a altura da
  linha varia com a presença de ilustração, e uma estimativa fixa
  desalinharia as linhas em vez de acelerar.
- A lista de sessões do histórico tem `scrollEnabled={false}` dentro de um
  `ScrollView`, o que normalmente é mau — mas carrega 30 de cada vez com
  paginação, portanto não compensa mexer.

## Biblioteca de exercícios

Duas camadas:

| Origem | Quantidade | Idioma | Imagens |
|---|---|---|---|
| `db/exerciseSeedData.ts` | 564 | português, curado | não |
| `assets/data/exercise-db.json` | 876 | inglês | sim (873) |

O dataset importado é o [free-exercise-db](https://github.com/yuhonas/free-exercise-db),
sob Unlicense — domínio público, sem atribuição obrigatória nem restrição
de uso comercial. Está vendorizado no repositório, portanto a importação
não precisa de rede. É idempotente e corre dentro de uma transação: uma
falha a meio não deixa a tabela meio populada a passar por completa.

**As ilustrações são remotas.** Vêm de `raw.githubusercontent.com` na
primeira visualização. Nomes, músculos, equipamento e instruções são
locais; as imagens não. A app não é totalmente offline neste aspeto.

**As instruções do dataset estão em inglês.** O seed curado em português
continua a ser a camada de qualidade.

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

Nada disto foi confirmado num dispositivo. O teste que falta é o óbvio:
iniciar um descanso, bloquear o telemóvel, e ver se o alerta toca à hora.

Havia três valores em desacordo: a definição global dizia 30, o fallback do
treino ativo dizia 90, e o schema tinha `DEFAULT 90`. Estão alinhados.

Os descansos por tipo de plano no `planGenerator` são deliberados e não
devem ser uniformizados: 180 s para força, 45 s para resistência, 30 s para
cardio.

---

## Plataforma

**Android apenas**, declarado em `app.json` (`"platforms": ["android"]`).

O bloco de configuração iOS foi removido: nunca foi construído nem testado
nada para iOS, e mantê-lo dava a entender um suporte que não existe. O
script `npm run ios` também saiu.

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
  coberto por testes com base de dados simulada — mas **um upgrade a partir
  de uma instalação antiga real continua por fazer**.
- **Instruções do dataset por traduzir** (876 registos).

---

## Prioridade

1. Correr num Android real e percorrer o fluxo acima.
2. Testar upgrade de base de dados a partir de uma instalação anterior.
3. Só depois, funcionalidades novas.

Os pontos 1 e 2 não podem ser feitos fora de um dispositivo. Enquanto não
forem feitos, a app não deve ser dada como pronta, independentemente do que
o `tsc`, o lint e os testes digam — nenhum deles executa um ecrã.

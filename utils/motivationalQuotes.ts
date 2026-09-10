/**
 * A curated set of short, direct training phrases — written to feel like
 * something a training partner would actually say, not a generic poster
 * quote. Kept in Portuguese to match the rest of the app.
 */
export const MOTIVATIONAL_QUOTES: string[] = [
  'O treino de hoje é o motivo do teu progresso de amanhã.',
  'Ninguém se arrepende de ter ido treinar. Vai.',
  'A tua única concorrência és tu mesmo há uma semana.',
  'Já estiveste cansado antes e treinaste na mesma. Consegues outra vez.',
  'Consistência bate motivação. Aparece, mesmo sem vontade.',
  'Um treino medíocre ainda bate zero treinos.',
  'O peso na barra não sabe que estás cansado.',
  'Daqui a uma hora vais estar contente por teres ido.',
  'Cada série é um voto no atleta que queres ser.',
  'A parte difícil é vestir o equipamento. O resto já sabes fazer.',
  'Não precisas de motivação, precisas de um hábito.',
  'Hoje não tem de ser o teu melhor treino. Só tem de acontecer.',
  'O corpo aguenta muito mais do que a cabeça acredita.',
  'Progresso não é linear, mas só existe se apareceres.',
  'Ninguém ficou mais forte a ficar em casa.',
  'Ainda estás a tempo de fazer disto um bom dia de treino.',
  'A disciplina que tens hoje é a força que vais ter amanhã.',
  'Ir metade motivado é melhor que não ir nada.',
  'O treino que saltas hoje não se recupera, só se compensa amanhã.',
  'Faz por quem eras há um ano, que sonhava em estar onde estás agora.',
];

/**
 * Picks a quote deterministically by day of year — the same phrase shows
 * all day (stable if the person reopens the app), and changes the next
 * day. Deterministic and pure so it's independently testable, with no
 * randomness that could show a different quote on every render.
 */
export function getQuoteForDate(date: Date = new Date()): string {
  const startOfYear = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / 86400000);
  const index = ((dayOfYear % MOTIVATIONAL_QUOTES.length) + MOTIVATIONAL_QUOTES.length) % MOTIVATIONAL_QUOTES.length;
  return MOTIVATIONAL_QUOTES[index];
}

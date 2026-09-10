import { escapeXml, unescapeXml, escapeMd } from '../xmlExport';

describe('escapeXml / unescapeXml round-trip', () => {
  it('escapes all five XML-special characters', () => {
    const raw = `Tom & Jerry's "Big" <Show>`;
    const escaped = escapeXml(raw);
    expect(escaped).not.toContain('&<');
    expect(escaped).toContain('&amp;');
    expect(escaped).toContain('&lt;');
    expect(escaped).toContain('&gt;');
    expect(escaped).toContain('&quot;');
    expect(escaped).toContain('&apos;');
  });

  it('round-trips arbitrary text through escape then unescape', () => {
    const samples = [
      `Supino <Barra> & "Halteres"`,
      `Costas / Bíceps 100%`,
      `<script>alert('x')</script>`,
      'Plain text with no special characters',
    ];
    for (const s of samples) {
      expect(unescapeXml(escapeXml(s))).toBe(s);
    }
  });

  it('produces a value safe to embed in an XML attribute (no unescaped quotes)', () => {
    const dangerous = `"><exercicio nome="Injected`;
    const escaped = escapeXml(dangerous);
    expect(escaped).not.toContain('"');
    expect(escaped).not.toMatch(/<[a-z]/);
  });
});

describe('escapeMd', () => {
  // Regression test: a custom exercise name containing "|" used to silently
  // break the alignment of Markdown tables in the exported training report.
  it('escapes pipe characters so table rows stay intact', () => {
    const name = 'Curl | Bíceps Especial';
    const escaped = escapeMd(name);
    // The backslash is added BEFORE the pipe (it doesn't remove it), so what
    // matters is that no *unescaped* pipe remains — a naive `.toContain('|')`
    // would wrongly fail here since "\|" still contains the character "|".
    expect(escaped).not.toMatch(/(?<!\\)\|/);
    expect(escaped).toContain('\\|');

    const row = `| ${escaped} | 80kg |`;
    // A correctly escaped row should still split into exactly 4 cells
    // (leading/trailing empty strings + 2 real cells) when split on
    // unescaped pipes — an actual table-delimiter split would treat "\|"
    // as literal text, not a column boundary.
    expect(row.split(/(?<!\\)\|/).length).toBe(4);
  });

  it('escapes markdown emphasis characters so they cannot alter formatting', () => {
    const name = 'Supino *Especial* (variante_A)';
    const escaped = escapeMd(name);
    expect(escaped).not.toMatch(/(?<!\\)\*/); // no unescaped asterisk
    expect(escaped).not.toMatch(/(?<!\\)_/); // no unescaped underscore
  });

  it('collapses newlines so a name cannot inject extra report lines', () => {
    const name = 'Linha 1\nLinha 2\r\nLinha 3';
    const escaped = escapeMd(name);
    expect(escaped).not.toMatch(/[\r\n]/);
  });

  it('leaves plain text unchanged', () => {
    expect(escapeMd('Supino com Barra')).toBe('Supino com Barra');
  });
});

// A small, strict reader for the subset of YAML our workflow files use, so the
// deploy-rails test can check .github/workflows/deploy.yml without a new
// dependency. It understands block mappings, block sequences, plain and quoted
// scalars, flow sequences of scalars ([a, b]), literal blocks (|) and
// comments. Every value is kept as a string (no booleans or numbers).
//
// It fails closed: anchors, aliases, tags, flow mappings, folded blocks,
// several documents, tabs and duplicate keys all throw, so a workflow written
// outside this subset fails the test instead of being half-read.

export type Yaml = string | null | Yaml[] | { [key: string]: Yaml };

interface Line { n: number; indent: number; text: string; raw: string }

/** Removes a trailing comment (a # at the start or after a space, outside quotes). */
function stripComment(text: string): string {
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      if (i === 0 || /[\s:[,-]/.test(text[i - 1])) quote = ch;
    } else if (ch === '#' && (i === 0 || /\s/.test(text[i - 1]))) {
      return text.slice(0, i).trimEnd();
    }
  }
  return text.trimEnd();
}

function scalar(text: string, n: number): Yaml {
  const t = text.trim();
  if (t === '' || t === '~' || t === 'null') return null;
  if (/^[&*!{>%@`|]/.test(t)) throw new Error(`line ${n}: unsupported YAML (${t.slice(0, 20)})`);
  if (t.startsWith('"')) {
    if (!t.endsWith('"') || t.length < 2) throw new Error(`line ${n}: unterminated string`);
    return JSON.parse(t) as string;
  }
  if (t.startsWith("'")) {
    if (!t.endsWith("'") || t.length < 2) throw new Error(`line ${n}: unterminated string`);
    return t.slice(1, -1).replace(/''/g, "'");
  }
  if (t.startsWith('[')) {
    if (!t.endsWith(']')) throw new Error(`line ${n}: unterminated flow sequence`);
    const inner = t.slice(1, -1).trim();
    return inner === '' ? [] : inner.split(',').map((part) => {
      const v = scalar(part, n);
      if (typeof v !== 'string') throw new Error(`line ${n}: only scalars in a flow sequence`);
      return v;
    });
  }
  return t;
}

/** Splits "key: value" (the key may be quoted). Returns null when the text is not a mapping entry. */
function splitKey(text: string): [string, string] | null {
  const m = /^("[^"]*"|'[^']*'|[^\s"'#\-[{][^:#]*?|-[^\s:#][^:#]*?)\s*:(?:\s+(.*))?$/.exec(text);
  if (!m) return null;
  const rawKey = m[1];
  const key = rawKey.startsWith('"') || rawKey.startsWith("'") ? rawKey.slice(1, -1) : rawKey;
  return [key, m[2] ?? ''];
}

const isItem = (text: string) => /^-(\s|$)/.test(text);

export function parseYaml(source: string): Yaml {
  if (source.includes('\t')) throw new Error('tabs are not allowed');
  const all: Line[] = source.split('\n').map((raw, i) => {
    const indent = raw.length - raw.trimStart().length;
    return { n: i + 1, indent, raw, text: stripComment(raw.slice(indent)) };
  });
  if (all.some((l) => l.text === '---' || l.text === '...')) throw new Error('several documents are not supported');
  let pos = 0;

  const skipBlank = () => {
    while (pos < all.length && all[pos].text === '') pos++; // blank or comment-only
  };

  function literal(parentIndent: number): string {
    const lines: string[] = [];
    let blockIndent = -1;
    while (pos < all.length) {
      const l = all[pos];
      if (l.raw.trim() === '') { lines.push(''); pos++; continue; }
      if (l.indent <= parentIndent) break;
      if (blockIndent < 0) blockIndent = l.indent;
      if (l.indent < blockIndent) throw new Error(`line ${l.n}: literal block indentation`);
      lines.push(l.raw.slice(blockIndent));
      pos++;
    }
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    return lines.join('\n') + '\n';
  }

  /** The value after "key:" or "- ": inline, a literal block, or a nested block. */
  function valueAfter(inline: string, ownIndent: number, n: number, sameIndentSequence: boolean): Yaml {
    if (inline === '|' || inline === '|-') {
      const text = literal(ownIndent);
      return inline === '|-' ? text.replace(/\n$/, '') : text;
    }
    if (inline !== '') return scalar(inline, n);
    skipBlank();
    if (pos >= all.length) return null;
    const next = all[pos];
    if (next.indent > ownIndent) return block(next.indent);
    if (sameIndentSequence && next.indent === ownIndent && isItem(next.text)) return block(next.indent);
    return null;
  }

  function block(indent: number): Yaml {
    skipBlank();
    if (isItem(all[pos].text)) {
      const items: Yaml[] = [];
      for (;;) {
        skipBlank();
        if (pos >= all.length) break;
        const l = all[pos];
        if (l.indent < indent) break;
        if (l.indent > indent || !isItem(l.text)) {
          if (l.indent === indent) break; // a mapping key after a same-indent sequence
          throw new Error(`line ${l.n}: bad sequence indentation`);
        }
        const rest = l.text.slice(1).trimStart();
        const itemIndent = indent + (l.text.length - rest.length);
        if (rest !== '' && splitKey(rest)) {
          // "- key: value" starts a mapping whose further keys sit at itemIndent.
          all[pos] = { ...l, indent: itemIndent, text: rest };
          items.push(block(itemIndent));
        } else {
          pos++;
          items.push(valueAfter(rest, indent, l.n, false));
        }
      }
      return items;
    }
    const map: { [key: string]: Yaml } = {};
    for (;;) {
      skipBlank();
      if (pos >= all.length) break;
      const l = all[pos];
      if (l.indent < indent) break;
      if (l.indent > indent) throw new Error(`line ${l.n}: bad mapping indentation`);
      if (isItem(l.text)) break; // the parent's same-indent sequence ends here
      const kv = splitKey(l.text);
      if (!kv) throw new Error(`line ${l.n}: expected "key: value", got "${l.text}"`);
      const [key, inline] = kv;
      if (Object.hasOwn(map, key)) throw new Error(`line ${l.n}: duplicate key "${key}"`);
      pos++;
      map[key] = valueAfter(inline, indent, l.n, true);
    }
    return map;
  }

  skipBlank();
  if (pos >= all.length) return null;
  const root = block(all[pos].indent);
  skipBlank();
  if (pos < all.length) throw new Error(`line ${all[pos].n}: unexpected content`);
  return root;
}

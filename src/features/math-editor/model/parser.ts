import { ascii, frac, ident, num, op, seq, template, uid, type MathNode, type Sequence } from './model';

const FUNCTIONS = ['sin', 'cos', 'tan', 'log', 'ln', 'exp'];

/** Deliberately bounded notation importer. Unknown commands fail visibly, never guess. */
export function parse(input: string): Sequence {
  if (input.length > 4000) throw Error('Use at most 4000 characters.');
  const text = ascii(input).trim().replace(/^\$\$?|\$\$?$/g, '').replace(/\\(?:left|right)(?![a-zA-Z])/g, '').replace(/\\[,;! ]/g, '').replace(/\\%/g, '%');
  let p = 0, depth = 0, count = 0;
  /** Nodes created from LaTeX braces {..}: invisible grouping, used as a base for ^ ! % / and otherwise flattened. */
  const braced = new WeakSet<MathNode>();
  const space = () => { while (p < text.length && /\s/.test(text[p])) p++; };
  /** A LaTeX argument: {..}, or a single token. With `single`, a bare number contributes one digit (\frac12 = \frac{1}{2}). */
  function group(single = false, allowEmpty = false): Sequence {
    space();
    if (text[p] !== '{') {
      if (single && /[0-9]/.test(text[p] ?? '')) { if (++count > 600) throw Error('Expression is too large.'); return seq([num(text[p++])]); }
      return seq([atom()]);
    }
    p++; const body = sequence('}', allowEmpty); if (text[p++] !== '}') throw Error('Close the LaTeX brace.'); return body;
  }
  function nested<T>(fn: () => T): T { if (++depth > 16) throw Error('Expression nesting is too deep.'); const result = fn(); depth--; return result; }
  /** Function argument: (..) is used as the argument itself, not wrapped in a second pair of parentheses. */
  function argument(name: string): Sequence {
    space();
    if (p >= text.length || /[+\-−*×÷=<>≤≥≠,،)}\]|]/.test(text[p])) throw Error(`Add the argument of ${name}, e.g. ${name}(x).`);
    if (text[p] === '(') { const g = atom(); if (g.type === 'group') return g.body; }
    return nested(group);
  }
  function enclosed(close: string, message: string, delim?: 'bracket'): MathNode {
    p++; const body = nested(() => sequence(close)); if (text[p++] !== close) throw Error(message);
    return { id: uid(), type: 'group', body, ...(delim ? { delim } : {}) };
  }
  function atom(): MathNode {
    space(); if (++count > 600) throw Error('Expression is too large.');
    const c = text[p]; if (!c) throw Error('Complete the expression.');
    if (c === '{') { const node: MathNode = { id: uid(), type: 'group', body: nested(group) }; braced.add(node); return node; }
    if (c === '(') return enclosed(')', 'Close the parenthesis.');
    if (c === '[') return enclosed(']', 'Close the square bracket.', 'bracket');
    if (c === '|') { p++; const body = nested(() => sequence('|')); if (text[p++] !== '|') throw Error('Close the absolute value bar.'); return template('abs', [body]); }
    if (c === '√') { p++; return { id: uid(), type: 'root', body: nested(() => group(true)) }; }
    if (/[0-9.]/.test(c)) {
      const start = p; while (p < text.length && /[0-9.]/.test(text[p])) p++;
      const value = text.slice(start, p); if (!/^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$/.test(value)) throw Error('Check the decimal number.');
      return num(value);
    }
    if (/[a-zA-Z]/.test(c)) {
      const paren = text.slice(p).match(/^(abs|f)(?=\s*\()/);
      if (paren) { p += paren[0].length; const g = atom(); if (g.type !== 'group') throw Error('Use parentheses for the function.'); return template(paren[0], [g.body]); }
      const fn = text.slice(p).match(/^(sin|cos|tan|log|ln|exp)(?![a-zA-Z])/);
      if (fn) { p += fn[0].length; return template(fn[0], [argument(fn[0])]); }
      p++; return ident(c);
    }
    if ('πθ∞σ'.includes(c)) { p++; return ident(c); }
    if (c === '\\') {
      const found = text.slice(p).match(/^\\([a-zA-Z]+)/); if (!found) throw Error('Check the LaTeX command.');
      p += found[0].length; const command = found[1];
      if (command === 'placeholder') {
        if (text[p] === '[') { const end = text.indexOf(']', p + 1); if (end < 0) throw Error('Close the placeholder option.'); p = end + 1; }
        if (text[p] === '{') { p++; sequence('}', true); if (text[p++] !== '}') throw Error('Close the placeholder.'); }
        return num();
      }
      if (['frac', 'dfrac', 'tfrac'].includes(command)) return nested(() => frac(group(true, true), group(true, true)));
      if (command === 'sqrt') {
        space(); if (text[p] === '[') throw Error('nth roots like \\sqrt[3]{x} are not supported yet; write the power form, e.g. {x}^{\\frac{1}{3}}.');
        return { id: uid(), type: 'root', body: nested(() => group(true, true)) };
      }
      if (FUNCTIONS.includes(command)) return template(command, [argument(command)]);
      if (command === 'abs') return template('abs', [argument('abs')]);
      if (command === 'square') return num();
      const special: Record<string, string> = { pi: 'π', theta: 'θ', infty: '∞', sigma: 'σ' };
      if (special[command]) return ident(special[command]);
      throw Error(`Cannot import \\${command} yet. Insert its template from Symbols.`);
    }
    throw Error(`Unsupported input near ${text.slice(p, p + 12)}.`);
  }
  const base = (prev: MathNode): Sequence => braced.has(prev) && prev.type === 'group' ? prev.body : seq([prev]);
  function sequence(stop: string | null, allowEmpty = false): Sequence {
    const children: MathNode[] = [];
    while (true) {
      space(); if (p >= text.length || text[p] === stop) break;
      const c = text[p];
      const command = text.slice(p).match(/^\\(times|cdot|div|leq|geq|neq|le|ge|ne)(?![a-zA-Z])/);
      if (command) { p += command[0].length; children.push(op(({ times: '×', cdot: '·', div: '÷', leq: '≤', geq: '≥', neq: '≠', le: '≤', ge: '≥', ne: '≠' } as Record<string, string>)[command[1]])); continue; }
      if ('+-−*×÷·=<>≤≥≠,،'.includes(c)) { p++; children.push(op(({ '-': '−', '*': '×', '،': ',' } as Record<string, string>)[c] ?? c)); continue; }
      if (c === '/' || c === '^' || c === '%' || c === '!') {
        p++; const prev = children.pop(); if (!prev || prev.type === 'operator') throw Error('Put a value before this operator.');
        if (c === '%') children.push(template('percent', [base(prev)]));
        else if (c === '!') children.push(template('factorial', [base(prev)]));
        else if (c === '^') children.push({ id: uid(), type: 'power', base: base(prev), exponent: nested(() => group(false, true)) });
        else {
          let denominator = atom(); space();
          if (text[p] === '^') { p++; denominator = { id: uid(), type: 'power', base: base(denominator), exponent: nested(group) }; }
          children.push(frac(base(prev), braced.has(denominator) && denominator.type === 'group' ? denominator.body : seq([denominator])));
        }
        continue;
      }
      children.push(atom());
    }
    const flat = children.flatMap(n => braced.has(n) && n.type === 'group' ? n.body.children : [n]);
    if (!flat.length) { if (allowEmpty) return seq([num()]); throw Error('Enter a formula first.'); }
    return seq(flat);
  }
  const answer = sequence(null); space(); if (p !== text.length) throw Error('Check the closing symbols.'); return answer;
}

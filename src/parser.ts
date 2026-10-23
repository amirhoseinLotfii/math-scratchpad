import { ascii, frac, ident, num, op, seq, template, uid, type MathNode, type Sequence } from './model';

/** Deliberately bounded notation importer. Unknown commands fail visibly, never guess. */
export function parse(input: string): Sequence {
  if (input.length > 4000) throw Error('Use at most 4000 characters.');
  const text = ascii(input).trim().replace(/^\$\$?|\$\$?$/g, '').replace(/\\(?:left|right)/g, '').replace(/\\[,;! ]/g, '');
  let p = 0, depth = 0, count = 0;
  const space = () => { while (p < text.length && /\s/.test(text[p])) p++; };
  function group(): Sequence {
    space(); if (text[p] !== '{') return seq([atom()]);
    p++; const body = sequence('}'); if (text[p++] !== '}') throw Error('Close the LaTeX brace.'); return body;
  }
  function nested<T>(fn: () => T): T { if (++depth > 16) throw Error('Expression nesting is too deep.'); const result = fn(); depth--; return result; }
  function atom(): MathNode {
    space(); if (++count > 600) throw Error('Expression is too large.');
    const c = text[p]; if (!c) throw Error('Complete the expression.');
    if (c === '{') return { id: uid(), type: 'group', body: nested(group) };
    if (c === '(') {
      p++; const body = nested(() => sequence(')')); if (text[p++] !== ')') throw Error('Close the parenthesis.');
      return { id: uid(), type: 'group', body };
    }
    if (c === '√') { p++; return { id: uid(), type: 'root', body: nested(group) }; }
    if (/[0-9.]/.test(c)) {
      const start = p; while (p < text.length && /[0-9.]/.test(text[p])) p++;
      const value = text.slice(start, p); if (!/^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$/.test(value)) throw Error('Check the decimal number.');
      return num(value);
    }
    if (/[a-zA-Z]/.test(c)) {
      const fn = text.slice(p).match(/^(sin|cos|tan|log|ln|exp|abs|f)(?=\s*\()/);
      if (fn) { p += fn[0].length; const g = atom(); if (g.type !== 'group') throw Error('Use parentheses for the function.'); return template(fn[0], [g.body]); }
      p++; return ident(c);
    }
    if ('πθ∞σ'.includes(c)) { p++; return ident(c); }
    if (c === '\\') {
      const found = text.slice(p).match(/^\\([a-zA-Z]+)/); if (!found) throw Error('Check the LaTeX command.');
      p += found[0].length; const command = found[1];
      if (['frac', 'dfrac', 'tfrac'].includes(command)) return nested(() => frac(group(), group()));
      if (command === 'sqrt') return { id: uid(), type: 'root', body: nested(group) };
      if (['sin', 'cos', 'tan', 'ln', 'log', 'exp', 'abs'].includes(command)) return template(command, [nested(group)]);
      if (command === 'square') return num();
      const special: Record<string, string> = { pi: 'π', theta: 'θ', infty: '∞', sigma: 'σ' };
      if (special[command]) return ident(special[command]);
      throw Error(`Cannot import \\${command} yet. Insert its template from Symbols.`);
    }
    throw Error(`Unsupported input near ${text.slice(p, p + 12)}.`);
  }
  function sequence(stop: string | null): Sequence {
    const children: MathNode[] = [];
    while (true) {
      space(); if (p >= text.length || text[p] === stop) break;
      const c = text[p];
      const command = text.slice(p).match(/^\\(times|cdot|div|leq|geq|neq|le|ge|ne)(?![a-zA-Z])/);
      if (command) { p += command[0].length; children.push(op(({ times: '×', cdot: '×', div: '÷', leq: '≤', geq: '≥', neq: '≠', le: '≤', ge: '≥', ne: '≠' } as Record<string, string>)[command[1]])); continue; }
      if ('+-−*×÷=<>≤≥≠'.includes(c)) { p++; children.push(op(({ '-': '−', '*': '×' } as Record<string, string>)[c] ?? c)); continue; }
      if (c === '/' || c === '^' || c === '%' || c === '!') {
        p++; const prev = children.pop(); if (!prev || prev.type === 'operator') throw Error('Put a value before this operator.');
        if (c === '%') children.push(template('percent', [seq([prev])]));
        else if (c === '!') children.push(template('factorial', [seq([prev])]));
        else if (c === '^') children.push({ id: uid(), type: 'power', base: seq([prev]), exponent: nested(group) });
        else {
          let denominator = atom(); space();
          if (text[p] === '^') { p++; denominator = { id: uid(), type: 'power', base: seq([denominator]), exponent: nested(group) }; }
          children.push(frac(seq([prev]), seq([denominator])));
        }
        continue;
      }
      children.push(atom());
    }
    if (!children.length) throw Error('Enter a formula first.'); return seq(children);
  }
  const answer = sequence(null); space(); if (p !== text.length) throw Error('Check the closing symbols.'); return answer;
}

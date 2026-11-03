import { Fragment, type ReactNode } from 'react';
import type { Block } from '../lib/playbookContent';
import { LETTER_1, LETTER_1_CLOSE, LETTER_2, LETTER_2_CLOSE } from '../lib/playbookContent';
import { fill, salutation, type FillContext } from '../lib/playbook';

/** Renders **bold** inside a line of text. */
export function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return <>{parts.map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>))}</>;
}

/** Highlights anything still in [brackets] so missing details stand out. */
function Filled({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\])/g);
  return <>{parts.map((p, i) => (/^\[[^\]]+\]$/.test(p) ? <mark key={i} className="pb-missing">{p}</mark> : <Rich key={i} text={p} />))}</>;
}

export function LetterPreview({ which, ctx, mailed = false }: { which: 1 | 2; ctx: FillContext; mailed?: boolean }) {
  const body = which === 1 ? LETTER_1 : LETTER_2(mailed);
  const p = ctx.profile ?? {};
  return (
    <div className="pb-letter">
      <p>{which === 1 ? salutation(ctx.owner) : 'Hello,'}</p>
      {body.map((t, i) => <p key={i}><Filled text={fill(t, ctx)} /></p>)}
      <p>{which === 1 ? LETTER_1_CLOSE : LETTER_2_CLOSE}</p>
      <p className="pb-sig">
        <Filled text={p.my_name || '[your name]'} /><br />
        <Filled text={p.phone || '[your phone]'} /><br />
        <Filled text={p.email || '[your email]'} />
      </p>
    </div>
  );
}

export function PlaybookBlocks({ blocks, ctx, extra }: { blocks: Block[]; ctx: FillContext; extra?: ReactNode }) {
  return (
    <div className="pb">
      {blocks.map((b, i) => {
        switch (b.t) {
          case 'h': return <h4 key={i}>{b.text}</h4>;
          case 'p': return <p key={i}><Filled text={fill(b.text, ctx)} /></p>;
          case 'script': return <blockquote key={i} className="pb-script"><Filled text={`“${fill(b.text, ctx)}”`} /></blockquote>;
          case 'list': return <ul key={i}>{b.items.map((x, j) => <li key={j}><Filled text={fill(x, ctx)} /></li>)}</ul>;
          case 'check': return <ul key={i} className="pb-check">{b.items.map((x, j) => <li key={j}><label className="check"><input type="checkbox" /> <span><Filled text={fill(x, ctx)} /></span></label></li>)}</ul>;
          case 'table': return (
            <div key={i} className="table-wrap pb-table">
              <table>
                <thead><tr><th>{b.head[0]}</th><th>{b.head[1]}</th></tr></thead>
                <tbody>{b.rows.map(([q, a], j) => <tr key={j}><td>{q}</td><td><Filled text={fill(a, ctx)} /></td></tr>)}</tbody>
              </table>
            </div>
          );
          case 'letter': return <LetterPreview key={i} which={b.which} ctx={ctx} />;
        }
      })}
      {extra}
    </div>
  );
}

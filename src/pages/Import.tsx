import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import {
  TARGETS, detectDuplicates, fetchGoogleSheet, guessMapping, parseFile, parsePastedText, resolveOwner, rowsToBusinesses,
  type Grid, type ImportRow, type TargetKey,
} from '../lib/importer';
import { fullAddress, nowISO, uid } from '../lib/util';
import type { Owner } from '../lib/types';
import { Field } from '../components/ui';

type Source = 'file' | 'paste' | 'sheet';

const AI_PROMPT = 'List every laundromat in [CITY, STATE] as a table with these columns: Name, Address, City, State, ZIP, Phone, Website, Owner (if known). Only include businesses you are confident exist.';

export function Import() {
  const { types, businesses, owners, importBatch, saveType, toast } = useStore();
  const navigate = useNavigate();
  const [source, setSource] = useState<Source>('file');
  const [raw, setRaw] = useState<Grid | null>(null);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<TargetKey[]>([]);
  const [typeId, setTypeId] = useState<string>(types[0]?.id ?? '');
  const [newTypeName, setNewTypeName] = useState('');
  const [sourceLabel, setSourceLabel] = useState('');
  const [paste, setPaste] = useState('');
  const [sheetUrl, setSheetUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<'source' | 'map' | 'review'>('source');
  const [review, setReview] = useState<ImportRow[]>([]);
  const [include, setInclude] = useState<Set<number>>(new Set());

  const grid: Grid | null = useMemo(() => {
    if (!raw) return null;
    if (hasHeader) return raw;
    const width = Math.max(...raw.map((r) => r.length));
    return [Array.from({ length: width }, (_, i) => `Column ${i + 1}`), ...raw];
  }, [raw, hasHeader]);

  function loadGrid(g: Grid, label: string) {
    if (g.length < 2) throw new Error('Need a header row plus at least one row of data.');
    setRaw(g);
    setHasHeader(true);
    setMapping(guessMapping(g[0]));
    setSourceLabel(label);
    setStep('map');
  }

  async function run(fn: () => Promise<void>) {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const width = grid ? Math.max(...grid.map((r) => r.length)) : 0;
  const mapped = new Set(mapping);
  const mappingProblems = !mapped.has('name') && !mapped.has('address') && !mapped.has('full_address')
    ? 'Map at least a Business name or an address column.' : '';

  function buildReview() {
    if (!grid) return;
    const rows = detectDuplicates(rowsToBusinesses(grid, mapping, typeId || null, sourceLabel), businesses);
    setReview(rows);
    setInclude(new Set(rows.filter((r) => r.status === 'new').map((r) => r.rowIndex)));
    setStep('review');
  }

  async function doImport() {
    await run(async () => {
      let finalType = typeId || null;
      if (typeId === '__new') {
        if (!newTypeName.trim()) throw new Error('Name the new business type.');
        const t = { id: uid(), name: newTypeName.trim(), fields: [], created_at: nowISO() };
        await saveType(t);
        finalType = t.id;
      }
      const ownerPool: Owner[] = [...owners];
      const newOwners: Owner[] = [];
      const chosen = review.filter((r) => include.has(r.rowIndex) && r.status !== 'invalid');
      const toSave = chosen.map((r) => {
        const b = { ...r.business, type_id: finalType };
        if (r.owner) {
          const { owner, created } = resolveOwner(r.owner, ownerPool);
          if (created) newOwners.push(owner);
          b.owner_id = owner.id;
        }
        if (b.geocode_status === 'pending' && !fullAddress(b)) b.geocode_status = 'failed';
        return b;
      });
      await importBatch(newOwners, toSave);
      toast(`Imported ${toSave.length} businesses${newOwners.length ? ` and ${newOwners.length} owners` : ''}. Map locations are being looked up in the background.`);
      navigate('/businesses?sort=added');
    });
  }

  const counts = { new: 0, duplicate: 0, ruled_out: 0, invalid: 0 };
  review.forEach((r) => counts[r.status]++);

  return (
    <div>
      <h1>Import businesses</h1>

      {error && <div className="alert error">{error}</div>}

      {step === 'source' && (
        <div className="card stack">
          <div className="chips">
            <button className={`chip big ${source === 'file' ? 'on' : ''}`} onClick={() => setSource('file')}>📄 Excel / CSV file</button>
            <button className={`chip big ${source === 'paste' ? 'on' : ''}`} onClick={() => setSource('paste')}>📋 Paste a table</button>
            <button className={`chip big ${source === 'sheet' ? 'on' : ''}`} onClick={() => setSource('sheet')}>🟩 Google Sheet link</button>
          </div>

          {source === 'file' && (
            <>
              <p className="muted">Upload a .xlsx or .csv file. The first row should be column headings. (Google Drive file? Open it, then File → Download → .xlsx or .csv.)</p>
              <input type="file" accept=".xlsx,.csv,.tsv,.txt" disabled={busy} onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) run(async () => loadGrid(await parseFile(f), f.name.replace(/\.[^.]+$/, '')));
              }} />
            </>
          )}

          {source === 'paste' && (
            <>
              <p className="muted">Paste rows copied from Excel or Google Sheets, or a table from ChatGPT / Claude.</p>
              <details className="small">
                <summary style={{ cursor: 'pointer' }}>Prompt to use with ChatGPT or Claude</summary>
                <div className="alert info" style={{ marginTop: 8 }}>
                  {AI_PROMPT}
                  <div style={{ marginTop: 6 }}><button className="btn sm" onClick={() => { navigator.clipboard?.writeText(AI_PROMPT); toast('Prompt copied'); }}>Copy prompt</button></div>
                </div>
                <p className="muted">AI lists often contain closed or made-up businesses. That's fine here: you'll weed them out as you call and visit.</p>
              </details>
              <textarea style={{ minHeight: 200, fontFamily: 'ui-monospace, monospace', fontSize: 13 }} value={paste} onChange={(e) => setPaste(e.target.value)}
                placeholder={'| Name | Address | Phone |\n|---|---|---|\n| Sunshine Laundry | 12 Main St, Springfield, IL 62704 | 555-123-4567 |'} />
              <button className="btn primary" disabled={!paste.trim()} onClick={() => run(async () => loadGrid(parsePastedText(paste), 'Pasted list'))}>Next</button>
            </>
          )}

          {source === 'sheet' && (
            <>
              <p className="muted">In Google Sheets click <strong>Share → General access → Anyone with the link (Viewer)</strong>, then paste the link here. To import a specific tab, open that tab first so the link ends in <code>#gid=…</code>.</p>
              <input value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" />
              <button className="btn primary" disabled={!sheetUrl.trim() || busy} onClick={() => run(async () => loadGrid(await fetchGoogleSheet(sheetUrl), 'Google Sheet'))}>{busy ? 'Loading…' : 'Load sheet'}</button>
            </>
          )}
        </div>
      )}

      {step === 'map' && grid && (
        <div className="card stack">
          <h2>Match up the columns</h2>
          <p className="muted small">We guessed based on the headings. Fix anything that's wrong. "Keep as extra info" saves the column on the business, so nothing is lost.</p>
          <div className="grid form">
            <Field label="Business type for these rows">
              <select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
                {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                <option value="">No type</option>
                <option value="__new">+ New type…</option>
              </select>
            </Field>
            {typeId === '__new' && <Field label="New type name"><input value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)} placeholder="e.g. Car wash" /></Field>}
            <Field label="Source label (saved on each business)"><input value={sourceLabel} onChange={(e) => setSourceLabel(e.target.value)} /></Field>
          </div>
          <label className="check"><input type="checkbox" checked={hasHeader} onChange={(e) => { setHasHeader(e.target.checked); const g = e.target.checked ? raw! : null; setMapping(g ? guessMapping(g[0]) : Array(width).fill('extra')); }} /> First row is column headings</label>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Column</th><th>Example values</th><th>Save as</th></tr></thead>
              <tbody>
                {Array.from({ length: width }, (_, c) => (
                  <tr key={c}>
                    <td><strong>{grid[0][c] || `Column ${c + 1}`}</strong></td>
                    <td className="small muted" style={{ maxWidth: 320 }}>{grid.slice(1, 4).map((r) => r[c]).filter(Boolean).join(' · ').slice(0, 120)}</td>
                    <td style={{ minWidth: 200 }}>
                      <select value={mapping[c] ?? 'extra'} onChange={(e) => setMapping((m) => { const n = [...m]; n[c] = e.target.value as TargetKey; return n; })}>
                        {TARGETS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {mappingProblems && <div className="alert warn">{mappingProblems}</div>}
          <div className="row">
            <button className="btn primary" disabled={!!mappingProblems} onClick={buildReview}>Check for duplicates →</button>
            <button className="btn" onClick={() => { setStep('source'); setRaw(null); }}>Start over</button>
          </div>
        </div>
      )}

      {step === 'review' && (
        <div className="card stack">
          <h2>Review</h2>
          <div className="row">
            <span className="badge ok">{counts.new} new</span>
            <span className="badge warn">{counts.duplicate} duplicate{counts.duplicate === 1 ? "" : "s"}</span>
            <span className="badge danger">{counts.ruled_out} previously ruled out</span>
            {counts.invalid > 0 && <span className="badge out">{counts.invalid} unusable</span>}
          </div>
          <p className="small muted">Only checked rows will be imported. Duplicates and ruled-out matches are unchecked so they don't come back onto your list.</p>
          <div className="table-wrap" style={{ maxHeight: 460 }}>
            <table>
              <thead><tr><th /><th>Row</th><th>Business</th><th>Address</th><th>Owner</th><th>Status</th></tr></thead>
              <tbody>
                {review.map((r) => (
                  <tr key={r.rowIndex} className={r.status === 'new' ? '' : 'dim'}>
                    <td><input type="checkbox" disabled={r.status === 'invalid'} checked={include.has(r.rowIndex)} onChange={() => setInclude((s) => { const n = new Set(s); if (n.has(r.rowIndex)) n.delete(r.rowIndex); else n.add(r.rowIndex); return n; })} /></td>
                    <td className="small">{r.rowIndex}</td>
                    <td>{r.business.name}</td>
                    <td className="small">{fullAddress(r.business)}</td>
                    <td className="small">{r.owner?.name}</td>
                    <td className="small">{r.status === 'new' ? <span className="badge ok">New</span> : <span className={`badge ${r.status === 'ruled_out' ? 'danger' : r.status === 'invalid' ? 'out' : 'warn'}`}>{r.reason}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row">
            <button className="btn primary" disabled={busy || include.size === 0} onClick={doImport}>{busy ? 'Importing…' : `Import ${include.size} businesses`}</button>
            <button className="btn" onClick={() => setStep('map')}>← Back</button>
          </div>
        </div>
      )}
    </div>
  );
}

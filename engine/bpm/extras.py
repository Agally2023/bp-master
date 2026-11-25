"""Extra report slides (same analyses as the web dashboard): sinkers, workstation frequency/personnel, SR efficiency, SR feed audit, hapa wash/dispatch.
Each function takes plain row dicts and returns a slide spec for media.add_spec_slide, or None when there is nothing to show."""
from __future__ import annotations
import re
from collections import defaultdict

GREEN, GOLD, RED, CYAN, PURPLE = '0E812E', 'CB8306', 'C0392B', '00BDF0', '7030A0'
SINKER_STD = {'nursery': 4, 'broodstock': 10}
REASONS = [('Lunch break', r'lunch'), ('Breakfast / tea break', r'breakfast|tea'), ('Stocking / transfer duties', r'stock|transfer'), ('Recount / sampling', r'recount|sampl'),
           ('Meeting', r'meeting|briefing'), ('Sump / maintenance', r'sump|repair|maint'), ('Leave / sickness', r'sick|leave|off duty|absent'), ('Washroom', r'wash ?room|toilet|restroom')]
def _mean(v): v = [x for x in (v or []) if x is not None]; return sum(v) / len(v) if v else None
def _f(x):
    try: return float(x)
    except (TypeError, ValueError): return None
def _weeks(rows, year, week, cap=52):
    ws = [r['iso_week'] for r in rows if r.get('iso_year') == year and r.get('iso_week') and r['iso_week'] <= week]
    if not ws: return []
    return list(range(max(min(ws), week - cap + 1), week + 1))
def _last(vals):
    for i in range(len(vals) - 1, -1, -1):
        if vals[i] is not None: return i
    return -1

def sinkers(rows, year, week):
    rows = [r for r in rows if r.get('iso_year') == year and r.get('sinkers') is not None and r.get('iso_week') and r['iso_week'] <= week]
    weeks = _weeks(rows, year, week)
    if not weeks: return None
    ser, lines = [], []
    for k, name, col in (('nursery', 'Nursery (PNS), 4 sinkers', GOLD), ('broodstock', 'Broodstock (BS), 10 sinkers', GREEN)):
        by = defaultdict(list)
        for r in rows:
            if str(r.get('unit_type')).lower() == k: by[r['iso_week']].append(min(1.0, (_f(r['sinkers']) or 0) / SINKER_STD[k]))
        vals = [_mean(by.get(w)) for w in weeks]; ser.append((name, vals, col)); i = _last(vals)
        lines.append(f"{k.capitalize()}: {vals[i]:.1%} of the {SINKER_STD[k]}-sinker standard in week {weeks[i]}." if i >= 0 else f'{k.capitalize()}: no sinker counts recorded this year.')
    return dict(title='Bottom Rope Sinkers (% of standard)', anchor='bottom rope', charts=[dict(kind='line', cats=[str(w) for w in weeks], series=ser + [('Standard (100%)', [1.0] * len(weeks), RED)], fmt='0%', y='Sinkers (% of standard)', x='ISO week', h=0.5)], tables=[], lines=lines)

def ws_frequency(rows, year, week):
    rows = [dict(r, unit=re.sub(r'\s+', '', str(r.get('ras') or '?')).upper()) for r in rows if r.get('iso_year') == year and r.get('iso_week') and r['iso_week'] <= week]
    if not rows: return None
    weeks = _weeks(rows, year, week); units = sorted({r['unit'] for r in rows})
    stats = []
    for u in units:
        d = [r for r in rows if r['unit'] == u]; bad = [r for r in d if (_f(r.get('score')) if _f(r.get('score')) is not None else 1) < 1]
        bw = defaultdict(int); aw = set()
        for r in d: aw.add(r['iso_week'])
        for r in bad: bw[r['iso_week']] += 1
        stats.append(dict(unit=u, audits=len(d), nc=len(bad), rate=len(bad) / len(d), wnc=len(bw), wa=len(aw), series=[bw.get(w, 0) if w in aw else None for w in weeks]))
    stats.sort(key=lambda s: -s['nc']); total_nc = sum(s['nc'] for s in stats)
    bad = [r for r in rows if (_f(r.get('score')) if _f(r.get('score')) is not None else 1) < 1]
    def cls(r):
        t = str(r.get('reason') or '').strip().lower()
        if not t: return 'Not stated'
        return next((n for n, rx in REASONS if re.search(rx, t)), 'Other')
    def nm(r):
        t = re.sub(r'\s+', ' ', str(r.get('employee_responsible') or '').strip())
        return 'Not specified' if not t or re.fullmatch(r'(?i)n/?a|not specified|none', t) else t[:1].upper() + t[1:]
    ppl = defaultdict(lambda: defaultdict(int))
    for r in bad: ppl[nm(r)][cls(r)] += 1
    prow = sorted(((p, sum(c.values()), c) for p, c in ppl.items()), key=lambda x: -x[1])
    fmt = lambda c: ', '.join(f'{k} ({v})' for k, v in sorted(c.items(), key=lambda x: -x[1])[:4])
    palette = [RED, GOLD, GREEN, CYAN, PURPLE]
    tables = [dict(head=['Incubation', 'Audits', 'Non-conforming', '% non-conforming', 'Weeks with a non-conformance'], rows=[[s['unit'], s['audits'], s['nc'], f"{s['rate']:.1%}", f"{s['wnc']} of {s['wa']}"] for s in stats], widths=[14, 10, 14, 14, 22]),
              dict(head=['Personnel', 'Non-conformances', '% of all', 'Reasons (count)'], rows=[[p, n, f'{n / total_nc:.1%}' if total_nc else '', fmt(c)] for p, n, c in prow[:8]], widths=[18, 14, 10, 50])]
    return dict(title='Workstation Non-Conformances: Frequency by Incubation and Personnel', anchor='workstation', charts=[dict(kind='line', cats=[str(w) for w in weeks], series=[(s['unit'], s['series'], palette[i % 5]) for i, s in enumerate(stats)], fmt='0', y='Non-conforming audits per week', x='ISO week', h=0.34)],
                tables=tables, lines=[f'{total_nc} of {len(rows)} audits this year were non-conforming.' + (f" Most: {stats[0]['unit']} ({stats[0]['nc']})." if stats else '') + (f' Personnel most often responsible: {prow[0][0]} ({prow[0][1]}).' if prow else '')])

def _iso_in(rows, year, week): return [r for r in rows if r.get('iso_year') == year and r.get('iso_week') == week]

def sr_efficiency(rows, year, week):
    rows = [r for r in rows if r.get('iso_year') == year and r.get('pct_males') is not None and r['iso_week'] <= week]
    if not rows: return None
    weeks = _weeks(rows, year, week); by = defaultdict(list)
    for r in rows: by[r['iso_week']].append(r)
    vals = [None if w not in by else sum(_f(x['males']) or 0 for x in by[w]) / max(1, sum(_f(x['samples']) or 0 for x in by[w])) for w in weeks]
    cur = by.get(week, []); last_i = _last(vals)
    tab = [[r.get('cage_no'), r.get('batch_code'), r.get('doc'), r.get('abw_g'), r.get('samples'), r.get('females'), f"{_f(r['pct_males']):.1%}"] for r in sorted(cur, key=lambda r: _f(r['pct_males']))[:10]]
    ln = [f'Week {weeks[last_i]}: {vals[last_i]:.1%} males across {len(by[weeks[last_i]])} cages sampled (target ≥ 95%).' if last_i >= 0 else '']
    low = [r for r in rows if _f(r['pct_males']) < 0.95]
    ln.append(f'{len(low)} of {len(rows)} samples this year were below 95% males.')
    return dict(title='Sex Reversal (Male Conversion) Efficiency', anchor='bottom rope', charts=[dict(kind='line', cats=[str(w) for w in weeks], series=[('% males', vals, GREEN), ('Target (95%)', [0.95] * len(weeks), RED)], fmt='0%', y='Males (% of sample)', x='ISO week', h=0.34, min=0.5, max=1)],
                tables=[dict(head=['Cage', 'Batch', 'DOC', 'ABW (g)', 'Samples', 'Females', '% males'], rows=tab, widths=[12, 20, 8, 10, 10, 10, 10])] if tab else [], lines=ln)

def sr_feed(rows, year, week):
    rows = [r for r in rows if r.get('iso_year') == year and r['iso_week'] <= week]
    if not rows: return None
    weeks = _weeks(rows, year, week); by = defaultdict(list)
    for r in rows: by[r['iso_week']].append(r)
    prep = [sum(_f(x.get('feed_prepared_kg')) or 0 for x in by[w]) if w in by else None for w in weeks]
    horm = [sum(_f(x.get('hormone_qty')) or 0 for x in by[w]) if w in by else None for w in weeks]
    tab = [[str(r.get('date'))[:10], r.get('feed_type'), r.get('feed_prepared_kg'), r.get('hormone_qty'), r.get('hygiene'), r.get('feed_quality'), r.get('sop_followed')] for r in sorted(rows, key=lambda r: str(r.get('date')), reverse=True)[:8]]
    sop = [r for r in rows if str(r.get('sop_followed') or '').strip().lower().startswith('n')]
    return dict(title='Sex Reversal Feed Audit', anchor='bottom rope', charts=[dict(kind='bar', cats=[str(w) for w in weeks], series=[('Feed prepared (kg)', prep, GREEN)], fmt='0', y='Feed prepared (kg)', x='ISO week', h=0.3), dict(kind='bar', cats=[str(w) for w in weeks], series=[('Hormone used (kg)', horm, GOLD)], fmt='0.0', y='Hormone used (kg)', x='ISO week', h=0.3)],
                tables=[dict(head=['Date', 'Feed type', 'Prepared (kg)', 'Hormone (kg)', 'Hygiene', 'Feed quality', 'SOP followed'], rows=tab, widths=[12, 30, 12, 12, 10, 12, 12])],
                lines=[f'{len(rows)} feed preparations audited this year; SOP not followed in {len(sop)}.'])

def hapa_wash(rows, year, week):
    rows = [r for r in rows if r.get('iso_year') == year and r['iso_week'] <= week]
    if not rows: return None
    weeks = _weeks(rows, year, week); by = defaultdict(list)
    for r in rows: by[r['iso_week']].append(r)
    tot = lambda k, w: sum(_f(x.get(k)) or 0 for x in by[w]) if w in by else None
    size = defaultdict(lambda: defaultdict(float))
    for r in rows:
        for k in ('received', 'washed', 'dispatched', 'exchanged', 'cost'): size[r.get('hapa_size') or '?'][k] += _f(r.get(k)) or 0
    tab = [[s, int(v['received']), int(v['washed']), int(v['dispatched']), int(v['exchanged']), f"{v['cost']:,.0f}"] for s, v in sorted(size.items(), key=lambda x: -x[1]['washed'])]
    cost = sum(v['cost'] for v in size.values())
    return dict(title='Hapas Received, Washed and Dispatched', anchor='bottom rope', charts=[dict(kind='bar', cats=[str(w) for w in weeks], series=[('Washed', [tot('washed', w) for w in weeks], GREEN), ('Dispatched', [tot('dispatched', w) for w in weeks], GOLD), ('Exchanged', [tot('exchanged', w) for w in weeks], CYAN)], fmt='0', y='Hapas (no.)', x='ISO week', h=0.34)],
                tables=[dict(head=['Hapa size', 'Received', 'Washed', 'Dispatched', 'Exchanged', 'Wash cost'], rows=tab, widths=[22, 12, 12, 12, 12, 14])], lines=[f'Year to date: {int(sum(v["washed"] for v in size.values())):,} hapas washed, {int(sum(v["dispatched"] for v in size.values())):,} dispatched; wash cost {cost:,.0f}.'])

def days_late(piv, exp, d, label, since, until):
    """Days Late Summary for ponds whose flip started in the latest 3 weeks: days taken per stage (bars) against expected days (line), plus the stage x pond days-late table."""
    if piv is None or piv.shape[1] == 0: return None
    def late(p): return sum(max(0, v - exp.get(stg, 99)) for stg, v in piv[p].items() if v == v and v is not None and exp.get(stg) is not None)
    ponds = sorted(piv.columns, key=lambda p: (-late(p), str(p)))[:8]; stages = list(piv.index)
    pal = [GREEN, GOLD, CYAN, RED, PURPLE, '1F4E79', '7F7F7F', 'FF7F50']
    nm = lambda v: None if v != v or v is None else float(v)
    rows = [[st, int(exp[st])] + [('-' if piv.loc[st, p] != piv.loc[st, p] else max(0, int(piv.loc[st, p]) - int(exp[st]))) for p in ponds] for st in stages]
    ndelayed = sum(1 for p in piv.columns if late(p) > 0); fmt = lambda x: x.strftime('%d %b')
    return dict(title=f'Days Late Summary: {label} Ponds', anchor='pond flipping',
                charts=[dict(kind='barline', cats=stages, series=[(str(p), [nm(piv.loc[st, p]) for st in stages], pal[i % 8]) for i, p in enumerate(ponds)], line=('Expected days/stage', [float(exp[st]) for st in stages], 'FFC000'), fmt='0', y='Days', x='Stage', h=0.4)],
                tables=[dict(head=[f'{label}: days late', 'Expected'] + [str(p) for p in ponds], rows=rows, widths=[22, 8] + [8] * len(ponds), red_positive=True)],
                lines=[f'Ponds whose flip started {fmt(since)} to {fmt(until)} (latest 3 weeks): {piv.shape[1]}; {ndelayed} with at least one delayed stage. Days late = days taken minus expected days.'])

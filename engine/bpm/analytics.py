"""Weekly analytics. Every function takes canonical tables and returns plain data; no I/O."""
from __future__ import annotations
import pandas as pd

def workstation_trend(ws: pd.DataFrame, year: int, week: int, n_weeks: int = 13):
    d = ws[ws.iso_year == year]
    wk = d.groupby('iso_week')['score'].mean()
    weeks = [w for w in range(week - n_weeks + 1, week + 1) if w >= 1]
    return [(w, float(wk[w]) if w in wk.index else None) for w in weeks]

def workstation_noncompliant(ws: pd.DataFrame, year: int, week: int):
    d = ws[(ws.iso_year == year) & (ws.iso_week == week) & (ws.score < 1)].sort_values(['audit_date', 'audit_time'])
    return d[['audit_date', 'ras', 'score', 'noncompliant_island', 'employee_responsible', 'reason']]

REASON_CATS = [('Lunch break', r'lunch'), ('Breakfast / tea break', r'breakfast|tea'), ('Stocking / transfer duties', r'stock|transfer'),
               ('Recount / sampling', r'recount|sampl'), ('Meeting', r'meeting|briefing'), ('Sump / maintenance', r'sump|repair|maint'),
               ('Leave / sickness', r'sick|leave|off duty|absent'), ('Washroom', r'wash ?room|toilet|restroom'),
               ('Harvest / feeding', r'harvest|feed')]

def workstation_reasons(nc: pd.DataFrame, top=3):
    """Group free-text reasons into categories so the counts mean something."""
    import re
    out = {}
    for t in nc['reason'].dropna().astype(str):
        t = t.strip().lower()
        if t in ('', 'n/a', 'nan', 'none'):
            continue
        hit = [name for name, rx in REASON_CATS if re.search(rx, t)] or ['Other']
        for h in hit:
            out[h] = out.get(h, 0) + 1
    return pd.Series(out, dtype=int).sort_values(ascending=False).head(top)

def bottom_rope_weekly(br: pd.DataFrame, year: int, upto_week: int):
    d = br[(br.iso_year == year) & (br.iso_week <= upto_week)]
    g = d.groupby('iso_week').agg(audited=('hapa_failed', 'size'), failed=('hapa_failed', 'sum'),
                                  ropes=('total_ropes', 'sum')).astype({'failed': int})
    g['nc_pct'] = g.failed / g.audited
    return g

def bottom_rope_by_pond(br: pd.DataFrame, year: int, week: int):
    d = br[(br.iso_year == year) & (br.iso_week == week)].copy()
    d['f_pos'] = (d.wrong_position_ropes > 0) & d.hapa_failed
    d['f_hook'] = d.missing_hook > 0
    d['f_tie'] = d.not_tied > 0
    d['f_post'] = d.missing_posts > 0
    g = d.groupby('pond_id').agg(audited=('hapa_failed', 'size'), failed=('hapa_failed', 'sum'),
                                 pos=('f_pos', 'sum'), hook=('f_hook', 'sum'), tie=('f_tie', 'sum'), post=('f_post', 'sum')).astype(int)
    return g.sort_index()

def day3_week(d3: pd.DataFrame, year: int, week: int):
    d = d3[(d3.iso_year == year) & (d3.iso_week == week)].sort_values(['recount_date', 'unit'])
    return d[['unit', 'recount_date', 'survival']]

# ---------------- biosecurity ----------------
def rating_band(v, good=0.80, avg=0.50):
    return 'Good' if v >= good else ('Average' if v >= avg else 'Poor')

def bio_weekly_overall(bio, year, upto):
    """Overall = equal-weighted mean of the category averages present that week (matches the Excel summary)."""
    d = bio[(bio.iso_year == year) & bio.scored]
    cat = d.groupby(['iso_week', 'analysis_category'])['rating_value'].mean().groupby('iso_week').mean()
    return [(w, float(cat[w]) if w in cat.index else None) for w in range(int(cat.index.min()), upto + 1)] if len(cat) else []

def bio_category_week(bio, year, week):
    d = bio[(bio.iso_year == year) & (bio.iso_week == week) & bio.scored]
    g = d.groupby('analysis_category')['rating_value'].agg(['count', 'mean'])
    return g.sort_values('mean')

# ---------------- parasitology ----------------
STAGES = ['Stage 2', 'Stage 3', 'Early Stage 4', 'Late Stage 4', 'Stage 1', 'Fry']
ISLANDS = ['Mbasa South', 'Kibuogi North', 'Remba South', 'Ringiti East', 'Mfangano East', 'Kibuogi South',
           'Takawiri West', 'Takawiri East', 'Mfangano West', 'Mbasa North', 'Ringiti West', 'Remba North']

def _prev_int(g):
    n, c, t = g.samples_collected.sum(), g.infected_samples.sum(), g.total_parasites.sum()
    return (c / n if n else None), (t / c if c else 0.0 if n else None)

def para_weekly(par, ras, year, weeks, by, keys):
    d = par[(par.ras == ras) & (par.iso_year == year)]
    out = {k: {'prev': [], 'int': []} for k in keys}
    for k in keys:
        for w in weeks:
            g = d[(d.iso_week == w) & (d[by] == k)]
            p, i = _prev_int(g) if len(g) else (None, None)
            out[k]['prev'].append(p); out[k]['int'].append(i)
    return out

def para_overall(par, ras, year, week):
    d = par[(par.ras == ras) & (par.iso_year == year) & (par.iso_week == week)]
    p, i = _prev_int(d) if len(d) else (None, None)
    by_stage = {s: _prev_int(d[d.stage == s])[0] for s in STAGES if (d.stage == s).any()}
    return p, i, by_stage

# ---------------- RAS water ----------------
def water_vs_prevalence(water, par, d0, d1):
    import numpy as np
    w = water[(water.date >= d0) & (water.date <= d1)].groupby('date')['volume_l'].sum()
    p = par[(par.date >= d0) & (par.date <= d1)].groupby('date')['prevalence'].mean()
    days = sorted(set(w.index) | set(p.index))
    rows = [(d, float(w.get(d, float('nan'))), float(p.get(d, float('nan')))) for d in days]
    ok = [(v, x) for _, v, x in rows if v == v and x == x]
    r = float(np.corrcoef([a for a, _ in ok], [b for _, b in ok])[0, 1]) if len(ok) >= 3 else None
    return rows, r, len(ok)

# ================= batch 3 =================
def stocking_daily(st, year, week):
    d = st[(st.iso_year == year) & (st.iso_week == week)]
    g = d.groupby('date').agg(abw=('abw', 'mean'), req=('req', 'mean'), target=('target', 'mean'), actual=('actual', 'mean'),
                              variance=('variance', 'mean'), est=('est', 'mean'), diff=('diff', 'mean'), n=('abw', 'size'))
    return g

def transfer_temps(tf, year, week):
    d = tf[(tf.iso_year == year) & (tf.iso_week == week)]
    agg = {}
    for k in ('tray_temp', 'bucket_temp_wo', 'bucket_temp_w', 'pond_temp', 'temp_var'):
        agg[k + '_min'] = (k, 'min'); agg[k + '_max'] = (k, 'max')
    g = d.groupby('date').agg(**agg, stock_time=('stock_time', 'first'), n=('pond', 'size'))
    # Reporting-tab rule: variance = bucket temp (with fish) min/max minus the day's pond temp (min)
    g['temp_var_min'] = g['bucket_temp_w_min'] - g['pond_temp_min']
    g['temp_var_max'] = g['bucket_temp_w_max'] - g['pond_temp_min']
    return g

def egg_weekly(eg, year, week, n_weeks=13):
    d = eg[eg.iso_year == year].groupby('iso_week')['abp'].mean()
    return [(w, float(d[w]) if w in d.index else None) for w in range(max(1, week - n_weeks + 1), week + 1)]

def hapa_exchange_weekly(hx, year, week, n_weeks=12):
    d = hx[hx.iso_year == year].groupby('iso_week').agg(t=('to_exchange', 'sum'), a=('exchanged', 'sum'))
    out = []
    for w in range(max(1, week - n_weeks + 1), week + 1):
        out.append((w, float(d.loc[w, 'a'] / d.loc[w, 't']) if w in d.index and d.loc[w, 't'] > 0 else None))
    return out

def jars_low(vol, year, week, max_star=2):
    d = vol[(vol.iso_year == year) & (vol.iso_week == week)]
    low = d[d.star <= max_star].sort_values(['date', 'pond'])
    return low, len(d), int((low.mixed_h.fillna(0) > 0).sum())

def flip_table(fl, kind, year, month):
    """Ponds whose scheduled flip is in the given month: stage x pond table of days taken, plus expected days."""
    d = fl[(fl.kind == kind) & (pd.to_datetime(fl.scheduled).dt.year == year) & (pd.to_datetime(fl.scheduled).dt.month == month)]
    ponds = (d.drop_duplicates('pond').sort_values('scheduled')['pond']).tolist()
    st = d.drop_duplicates('stage').sort_values('order')[['stage', 'expected_days']]
    piv = d.pivot_table(index='stage', columns='pond', values='days', aggfunc='first').reindex(index=st.stage, columns=ponds)
    return piv, dict(zip(st.stage, st.expected_days)), d

def flipped_in_week(fl, kind, year, week):
    d = fl[(fl.kind == kind) & (fl.iso_year == year) & (fl.iso_week == week)]
    return sorted(d.pond.unique())

def flip_overdue(piv, expected):
    out = []
    for pond in piv.columns:
        for stg, v in piv[pond].items():
            if v == v and v is not None and v > expected.get(stg, 99):
                out.append((pond, stg, int(v), int(expected[stg])))
    return out

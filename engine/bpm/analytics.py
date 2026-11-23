"""Weekly analytics. Every function takes canonical tables and returns plain data; no I/O."""
from __future__ import annotations
import pandas as pd


def latest_week(df, year, week, wcol='iso_week', ycol='iso_year'):
    """(year, week) to show for a weekly table: the selected week if it has rows, otherwise the most recent earlier week that does."""
    if df is None or not len(df):
        return year, week
    if ((df[ycol] == year) & (df[wcol] == week)).any():
        return year, week
    d = df[(df[ycol] < year) | ((df[ycol] == year) & (df[wcol] < week))]
    if not len(d):
        return year, week
    m = d.assign(_k=d[ycol] * 100 + d[wcol])['_k'].max()
    return int(m // 100), int(m % 100)

def _asof(out, y, w, year, week):
    out.attrs['asof'] = (y, w, (y, w) != (year, week))
    return out

def workstation_trend(ws: pd.DataFrame, year: int, week: int, n_weeks: int = 13):
    d = ws[ws.iso_year == year]
    wk = d.groupby('iso_week')['score'].mean()
    weeks = [w for w in range(week - n_weeks + 1, week + 1) if w >= 1]
    return [(w, float(wk[w]) if w in wk.index else None) for w in weeks]

def workstation_noncompliant(ws: pd.DataFrame, year: int, week: int):
    y, w = latest_week(ws[ws.score < 1], year, week)
    d = ws[(ws.iso_year == y) & (ws.iso_week == w) & (ws.score < 1)].sort_values(['audit_date', 'audit_time'])
    return _asof(d[['audit_date', 'ras', 'score', 'noncompliant_island', 'employee_responsible', 'reason']], y, w, year, week)

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
    y, w = latest_week(br, year, week)
    d = br[(br.iso_year == y) & (br.iso_week == w)].copy()
    d['f_pos'] = (d.wrong_position_ropes > 0) & d.hapa_failed
    d['f_hook'] = d.missing_hook > 0
    d['f_tie'] = d.not_tied > 0
    d['f_post'] = d.missing_posts > 0
    g = d.groupby('pond_id').agg(audited=('hapa_failed', 'size'), failed=('hapa_failed', 'sum'),
                                 pos=('f_pos', 'sum'), hook=('f_hook', 'sum'), tie=('f_tie', 'sum'), post=('f_post', 'sum')).astype(int)
    return _asof(g.sort_index(), y, w, year, week)

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
    t = bio[(bio.iso_year == year) & (bio.analysis_category == 'Overall (typed)') & bio.rating_value.notna()]
    typed = {int(w): float(v) for w, v in zip(t.iso_week, t.rating_value)}          # overall typed in the Excel (same as the Biosecurity dashboard)
    weeks = [int(x) for x in cat.index] + list(typed)
    if not weeks: return []
    lo = min(weeks)
    return [(w, typed[w] if w in typed else float(cat[w]) if w in cat.index else None) for w in range(lo, upto + 1)]

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
    y, w = latest_week(st, year, week)
    d = st[(st.iso_year == y) & (st.iso_week == w)]
    g = d.groupby('date').agg(abw=('abw', 'mean'), req=('req', 'mean'), target=('target', 'mean'), actual=('actual', 'mean'),
                              variance=('variance', 'mean'), est=('est', 'mean'), diff=('diff', 'mean'), n=('abw', 'size'))
    return _asof(g, y, w, year, week)

def transfer_temps(tf, year, week):
    y, w = latest_week(tf, year, week)
    d = tf[(tf.iso_year == y) & (tf.iso_week == w)]
    agg = {}
    for k in ('tray_temp', 'bucket_temp_wo', 'bucket_temp_w', 'pond_temp', 'temp_var'):
        agg[k + '_min'] = (k, 'min'); agg[k + '_max'] = (k, 'max')
    g = d.groupby('date').agg(**agg, stock_time=('stock_time', 'first'), n=('pond', 'size'))
    # Reporting-tab rule: variance = bucket temp (with fish) min/max minus the day's pond temp (min)
    g['temp_var_min'] = g['bucket_temp_w_min'] - g['pond_temp_min']
    g['temp_var_max'] = g['bucket_temp_w_max'] - g['pond_temp_min']
    return _asof(g, y, w, year, week)

def egg_weekly(eg, year, week, n_weeks=13):
    d = eg[eg.iso_year == year].groupby('iso_week')['abp'].mean()
    return [(w, float(d[w]) if w in d.index else None) for w in range(max(1, week - n_weeks + 1), week + 1)]

def hapa_exchange_weekly(hx, year, week, n_weeks=12):
    d = hx[hx.iso_year == year].groupby('iso_week').agg(t=('to_exchange', 'sum'), a=('exchanged', 'sum'))
    out = []
    for w in range(max(1, week - n_weeks + 1), week + 1):
        out.append((w, float(d.loc[w, 'a'] / d.loc[w, 't']) if w in d.index and d.loc[w, 't'] > 0 else None))
    return out

def hapa_last_recorded(hx, year, week):
    """(week, rate) of the most recent week up to `week` with exchanges scheduled, or None."""
    d = hx[(hx.iso_year == year) & (hx.iso_week <= week)].groupby('iso_week').agg(t=('to_exchange', 'sum'), a=('exchanged', 'sum'))
    d = d[d.t > 0]
    return None if d.empty else (int(d.index.max()), float(d.loc[d.index.max(), 'a'] / d.loc[d.index.max(), 't']))

def hapa_first_week(hx, year, week):
    d = hx[(hx.iso_year == year) & (hx.iso_week <= week) & (hx.to_exchange > 0)]
    return None if d.empty else int(d.iso_week.min())

def jars_low(vol, year, week, max_star=2):
    y, w = latest_week(vol, year, week)
    d = vol[(vol.iso_year == y) & (vol.iso_week == w)]
    low = _asof(d[d.star <= max_star].sort_values(['date', 'pond']), y, w, year, week)
    return low, len(d), int((low.mixed_h.fillna(0) > 0).sum())

def flip_progress(fl, kind, total, as_of=None, last_expected=None):
    """Ponds in progress, whatever week they started. A pond is complete automatically when every stage is recorded, or when every
    stage before the last is recorded and the last stage has had its expected days since (scheduled + recorded days).
    Returns [(pond, scheduled, stages_done)] sorted by scheduled date."""
    import datetime as _dt
    d = fl[fl.kind == kind]
    out = []
    for (pond, sched), g in d.groupby(['pond', 'scheduled']):
        rec = g.dropna(subset=['days']); n = int(rec.stage.nunique())
        if n >= total: continue
        if as_of is not None and last_expected is not None and n == total - 1 and (rec.order == total - 1).sum() == 0:
            end = sched + _dt.timedelta(days=float(rec[rec.days > 0].days.sum()) + float(last_expected))
            if end <= as_of: continue
        out.append((pond, sched, n))
    return sorted(out, key=lambda t: (t[1], t[0]))

def flip_table(fl, kind, year, month, total=None, as_of=None, last_expected=None):
    """Stage x pond table of days taken, plus expected days. Shows every pond in progress (any week or month) plus ponds scheduled in the given month."""
    k = fl[fl.kind == kind]
    sched = pd.to_datetime(k.scheduled)
    mask = (sched.dt.year == year) & (sched.dt.month == month)
    if total:
        keep = {(p, s) for p, s, _ in flip_progress(fl, kind, total, as_of, last_expected)}
        mask = mask | pd.Series([(p, s) in keep for p, s in zip(k.pond, k.scheduled)], index=k.index)
    d = k[mask].copy()
    d.loc[d.days < 0, 'days'] = float('nan')                 # negative days come from a blank/typed date in the Excel file: shown as '-', never as a value
    d = d[d.groupby('pond').scheduled.transform('max') == d.scheduled]        # a pond flipped twice shows its latest flip
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


# ---------------- picture grids (filled automatically) ----------------
def _dmy(d):
    d = str(d)[:10].split('-'); return f'{d[2]}/{d[1]}/{d[0]}' if len(d) == 3 else str(d)

def pick_bio_photos(rows, n=4):
    """Biosecurity: up to n photos of the week, newest first, one per item/location before any repeat. rows: bio_photos, newest first."""
    seen, first, rest = set(), [], []
    for r in rows:
        k = (r.get('item'), r.get('location')); (rest if k in seen else first).append(r); seen.add(k)
    return [dict(row=r, caption=', '.join(x for x in (r.get('item'), r.get('location'), _dmy(r.get('log_date'))) if x)) for r in (first + rest)[:n]]

def pick_pond_photos(photos, progress, totals):
    """Pond flipping: the latest photo of every pond still in progress, whatever week it was taken.
    photos: bpm_pond_photos newest first; progress: {kind: [(pond, scheduled, stages_done)]}; totals: {kind: stage count}."""
    latest = {}
    for p in photos: latest.setdefault(str(p['pond']).strip().lower(), p)
    seen, out = set(), []
    for kind in ('nursery', 'broodstock'):
        for pond, _, n in progress.get(kind, []):
            k = str(pond).strip().lower(); p = latest.get(k)
            if p is None or k in seen: continue
            seen.add(k); out.append(dict(row=p, caption=', '.join([str(pond), p.get('stage') or f'{n} of {totals.get(kind)} stages done', _dmy(p.get('photo_date'))])))
    return out


# ---- broodstock stocking density & sex ratio (same maths as web/js/analytics.js broodDensity)
SEX_TARGET = 3.0

def brood_density(bs, year, week, n=12):
    """Weekly pooled F:M ratio and mean density (kg/m2 = total biomass / hapa area; hapa area 80 m2; standard density 1.5 kg/m2)."""
    cols = ['iso_year', 'iso_week', 'female_count', 'male_count', 'female_biomass', 'male_biomass', 'target_biomass', 'target_stocking_density_range']
    d = bs[(bs.iso_year == year) & (bs.iso_week <= week)].copy() if len(bs) else pd.DataFrame(columns=cols)
    for c in cols[2:]: d[c] = pd.to_numeric(d[c], errors='coerce')
    first = int(d.iso_week.min()) if len(d) else week; n = min(52, max(n, week - first + 1))
    weeks = list(range(max(1, week - n + 1), week + 1))
    def dens(r):
        area = 80.0   # standard hapa area (120 kg target / 1.5 kg/m2)
        return ((r.female_biomass if r.female_biomass == r.female_biomass else 0) + (r.male_biomass if r.male_biomass == r.male_biomass else 0)) / area
    ratio, density = [], []
    for w in weeks:
        g = d[d.iso_week == w]; m = g.male_count.fillna(0).sum()
        ratio.append(float(g.female_count.fillna(0).sum() / m) if len(g) and m else None)
        gb = g[g.female_biomass.notna() | g.male_biomass.notna()]
        density.append(float(gb.apply(dens, axis=1).mean()) if len(gb) else None)
    last = lambda s: next(((weeks[i], s[i]) for i in range(len(s) - 1, -1, -1) if s[i] is not None), None)
    return dict(weeks=weeks, ratio=ratio, density=density, target_density=1.5, hapas=int((d.iso_week == week).sum()),
                last_ratio=last(ratio), last_density=last(density), this_week=bool((d.iso_week == week).any()))

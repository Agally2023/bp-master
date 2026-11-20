"""Importers: Excel -> canonical tables (same columns as the Supabase tables) + validation issues."""
from __future__ import annotations
import pandas as pd
from .xl import read_sheet, col, issue, num, split_future, iso, sha256

def _dates(df, c, label, issues):
    d = pd.to_datetime(df[c], errors='coerce')
    bad = d.isna()
    if bad.any():
        issues.append(issue('error', 'bad_date', f"{label}: {int(bad.sum())} row(s) with missing/invalid date were rejected.", bad.sum()))
    df[c] = d
    return df[~bad].copy()

def _excel_errors(errs, label, issues):
    for k, n in errs.items():
        issues.append(issue('warning', 'excel_error', f"{label}: column '{k}' has {n} Excel error cell(s) (#REF!/#DIV/0!/...). Values ignored and recomputed where possible.", n))

# ---------------- Incubation workstation compliance ----------------
def workstation(path, as_of):
    issues = []
    raw, errs, _ = read_sheet(path, 'Audit Data', 'Date')
    _excel_errors(errs, 'Workstation', issues)
    n0 = len(raw)
    c = {k: col(raw, *p) for k, p in dict(
        date=('date',), time=('time',), ras=('department',), total=('total number',),
        comp=('number of compliant',), non=('number of non compliant',), score=('score',),
        loc=('location of non',), isl=('name of non',), emp=('employee',), reason=('reason',), aud=('auditor',)).items()}
    df = pd.DataFrame({
        'audit_date': raw[c['date']], 'audit_time': raw[c['time']].astype(str),
        'ras': raw[c['ras']], 'total_islands': num(raw[c['total']]),
        'compliant_islands': num(raw[c['comp']]), 'noncompliant_islands': num(raw[c['non']]),
        'score_excel': num(raw[c['score']]),
        'noncompliance_location': raw[c['loc']], 'noncompliant_island': raw[c['isl']],
        'employee_responsible': raw[c['emp']], 'reason': raw[c['reason']], 'auditor': raw[c['aud']]})
    df = _dates(df, 'audit_date', 'Workstation', issues)
    miss = df[['ras', 'total_islands', 'compliant_islands']].isna().any(axis=1)
    if miss.any():
        issues.append(issue('error', 'missing_values', f"Workstation: {int(miss.sum())} row(s) missing RAS or island counts were rejected.", miss.sum()))
        df = df[~miss]
    df['noncompliant_islands'] = df['noncompliant_islands'].fillna(df['total_islands'] - df['compliant_islands'])
    inc = df['compliant_islands'] + df['noncompliant_islands'] != df['total_islands']
    if inc.any():
        issues.append(issue('warning', 'count_mismatch', f"Workstation: {int(inc.sum())} row(s) where compliant + non-compliant islands != total islands.", inc.sum()))
    df['score'] = (df['compliant_islands'] / df['total_islands']).round(4)   # recomputed, not trusted
    mm = (df['score'] - df['score_excel']).abs() > 0.005
    if mm.any():
        issues.append(issue('warning', 'score_mismatch', f"Workstation: {int(mm.sum())} row(s) where the Excel score differs from compliant/total; app value used.", mm.sum()))
    df, fi = split_future(df, 'audit_date', as_of, 'Workstation'); issues += fi
    df = iso(df, 'audit_date')
    df['audit_date'] = df['audit_date'].dt.date
    return df.drop(columns=['score_excel']).reset_index(drop=True), dict(rows_read=n0, issues=issues, sha=sha256(path))

# ---------------- Bottom rope (nursery / broodstock) ----------------
def bottom_rope(path, sheet, unit_type, as_of):
    issues = []
    raw, errs, _ = read_sheet(path, sheet, 'Date')
    _excel_errors(errs, f'Bottom rope {unit_type}', issues)
    keyed = raw[col(raw, 'date')].notna() | raw[col(raw, 'pond id')].notna() | raw[col(raw, 'hapa no')].notna()
    raw = raw[keyed]                      # trailing pre-formatted rows hold only formula zeros
    n0 = len(raw)
    g = lambda *p: col(raw, *p)
    def n(c, default=0):
        return num(raw[c]).fillna(default) if c else pd.Series(default, index=raw.index)
    df = pd.DataFrame({
        'audit_date': raw[g('date')], 'pond_id': raw[g('pond id')], 'hapa_no': num(raw[g('hapa no')]),
        'top_position': n(g('top position')), 'middle_position': n(g('middle position')),
        'bottom_position': n(g('bottom position')), 'not_tied': n(g('not tied')),
        'missing_hook': n(g('missing hook')), 'total_ropes': n(g('total ropes')),
        'missing_posts': n(g('missing posts')), 'wrong_position_ropes': n(g('wrong position')),
        'comment': raw[g('comment')] if g('comment') else None})
    df = _dates(df, 'audit_date', f'Bottom rope {unit_type}', issues)
    bad = df['pond_id'].isna() | df['hapa_no'].isna()
    if bad.any():
        issues.append(issue('error', 'missing_values', f"Bottom rope {unit_type}: {int(bad.sum())} row(s) without pond/hapa were rejected.", bad.sum()))
        df = df[~bad]
    df['non_conformances'] = df[['not_tied', 'missing_hook', 'missing_posts', 'wrong_position_ropes']].sum(axis=1)
    df['hapa_failed'] = df['non_conformances'] > 0      # rule: 1 failed rope = hapa fails
    df['unit_type'] = unit_type
    df['hapa_no'] = df['hapa_no'].astype(int)
    dup = df.duplicated(['audit_date', 'pond_id', 'hapa_no'], keep=False)
    if dup.any():
        issues.append(issue('warning', 'duplicate', f"Bottom rope {unit_type}: {int(dup.sum())} row(s) are the same hapa audited twice on one date (kept, as Excel counts them).", dup.sum()))
    df, fi = split_future(df, 'audit_date', as_of, f'Bottom rope {unit_type}'); issues += fi
    df = iso(df, 'audit_date'); df['audit_date'] = df['audit_date'].dt.date
    for c in ['top_position', 'middle_position', 'bottom_position', 'not_tied', 'missing_hook', 'total_ropes', 'missing_posts', 'wrong_position_ropes', 'non_conformances']:
        df[c] = df[c].astype(int)
    # cross-check against Excel's own flag
    if g('hapa failed'):
        ex = num(raw[g('hapa failed')]).reindex(df.index)
        d = (ex.notna()) & (ex.astype(float) != df['hapa_failed'].astype(float))
        if d.any():
            issues.append(issue('warning', 'failed_flag_mismatch', f"Bottom rope {unit_type}: {int(d.sum())} row(s) where Excel 'Hapa Failed' differs from the recomputed rule.", d.sum()))
    return df.reset_index(drop=True), dict(rows_read=n0, issues=issues, sha=sha256(path))

# ---------------- Day-3 recounts ----------------
def day3(path, as_of):
    issues = []
    raw, errs, _ = read_sheet(path, 'Data', 'Stocking Date')
    _excel_errors(errs, 'Day-3', issues)
    n0 = len(raw)
    g = lambda *p: col(raw, *p)
    df = pd.DataFrame({
        'stocking_date': pd.to_datetime(raw[g('stocking date')], errors='coerce'),
        'unit': raw[g('unit')], 'pond': raw[g('pond')], 'hapa': raw[g('hapa')].astype(str),
        'batch_code': raw[g('ras')], 'in_abw': num(raw[g('in abw')]), 'in_fish_no': num(raw[g('in fish no')]),
        'recount_date': pd.to_datetime(raw[g('day 3 recount date')], errors='coerce'),
        'recount_pcs': num(raw[g('day 3 recount pcs')]), 'recount_abw': num(raw[g('day 3 recount abw')]),
        'survival_excel': num(raw[g('survival')])})
    miss = df['unit'].isna() | df['recount_date'].isna() | df['recount_pcs'].isna() | df['in_fish_no'].isna()
    if miss.any():
        issues.append(issue('info', 'no_recount_yet', f"Day-3: {int(miss.sum())} stocked unit(s) have no Day-3 recount yet (not an error).", miss.sum()))
        df = df[~miss]
    # pond/hapa cells can be blank while the Unit label (e.g. A3-8) is filled: take them from the label
    lab_ = df['unit'].astype(str).str.extract(r'^(.+)-(\d+)$')
    df['pond'] = df['pond'].where(df['pond'].notna(), lab_[0]); df['hapa'] = df['hapa'].where(~df['hapa'].isin(['nan', 'None', '<NA>', '']), lab_[1])
    hp = pd.to_numeric(df['hapa'], errors='coerce')
    derived = df['pond'].astype(str) + '-' + hp.round().astype('Int64').astype(str)
    lab = (df['unit'].astype(str) != derived) & hp.notna()
    if lab.any():
        issues.append(issue('warning', 'unit_label_mismatch', f"Day-3: {int(lab.sum())} row(s) where the Unit label differs from Pond-Hapa (e.g. {df.loc[lab,'unit'].iloc[0]} vs {derived[lab].iloc[0]}); Pond-Hapa used.", lab.sum(), [f"{a} -> {b}" for a, b in zip(df.loc[lab,'unit'].head(6), derived[lab].head(6))]))
    df.loc[hp.notna(), 'unit'] = derived[hp.notna()]
    df['hapa'] = hp.round().astype('Int64').astype(str)
    df['survival'] = (df['recount_pcs'] / df['in_fish_no']).round(4)    # recomputed
    mm = (df['survival'] - df['survival_excel']).abs() > 0.005
    if mm.any():
        issues.append(issue('warning', 'survival_mismatch', f"Day-3: {int(mm.sum())} row(s) where Excel survival differs from recount/stocked; app value used.", mm.sum()))
    wild = df['survival'] > 1.5
    if wild.any():
        issues.append(issue('warning', 'implausible_survival', f"Day-3: {int(wild.sum())} unit(s) with survival above 150% - recount or stocking number likely wrong.", wild.sum(), df.loc[wild, 'unit'].astype(str).head(8).tolist()))
    df, fi = split_future(df, 'recount_date', as_of, 'Day-3'); issues += fi
    df = iso(df, 'recount_date')
    for c in ['stocking_date', 'recount_date']:
        df[c] = df[c].dt.date
    df['in_fish_no'] = df['in_fish_no'].astype(int); df['recount_pcs'] = df['recount_pcs'].astype(int)
    return df.drop(columns=['survival_excel']).reset_index(drop=True), dict(rows_read=n0, issues=issues, sha=sha256(path))

# ---------------- Biosecurity & hygiene ----------------
def biosecurity(path, as_of):
    issues = []
    raw, errs, _ = read_sheet(path, 'Raw Audit Log', 'Date')
    _excel_errors(errs, 'Biosecurity', issues)
    n0 = len(raw)
    g = lambda *p: col(raw, *p)
    df = pd.DataFrame({'audit_date': raw[g('date')], 'location': raw[g('location')].fillna('').astype(str).str.strip(),
                       'category': raw[g('category')], 'metric': raw[g('metric')],
                       'reported_pct': num(raw[g('reported')]), 'rating': raw[g('mapped rating')],
                       'rating_value': num(raw[g('rating value')]),
                       'analysis_category': raw[g('analysis category')].fillna('').astype(str).str.strip()})
    df = _dates(df, 'audit_date', 'Biosecurity', issues)
    ns = (df['analysis_category'].isin(['Not scored', 'nan', 'None'])) | df['rating_value'].isna()
    if ns.any():
        issues.append(issue('info', 'not_scored', f"Biosecurity: {int(ns.sum())} entr(ies) have no scoring category/value and are excluded from averages.", ns.sum()))
    df['scored'] = ~ns
    out = (df['rating_value'] < 0) | (df['rating_value'] > 1)
    if out.any():
        issues.append(issue('warning', 'out_of_range', f"Biosecurity: {int(out.sum())} rating value(s) outside 0-1.", out.sum()))
    df, fi = split_future(df, 'audit_date', as_of, 'Biosecurity'); issues += fi
    df = iso(df, 'audit_date'); df['audit_date'] = df['audit_date'].dt.date
    return df.reset_index(drop=True), dict(rows_read=n0, issues=issues, sha=sha256(path))

# ---------------- Parasitology ----------------
def parasitology(path, as_of):
    issues = []
    raw, errs, _ = read_sheet(path, 'Parasitology Data Input', 'DATE')
    _excel_errors(errs, 'Parasitology', issues)
    n0 = len(raw)
    S = [c for c in raw.columns if c.lower().startswith('sample ') and c.lower() != 'sample type/ stage'][:10]
    g = lambda *p: col(raw, *p)
    cnts = raw[S].apply(pd.to_numeric, errors='coerce').fillna(0)
    df = pd.DataFrame({'sample_date': raw[g('date')],
                       'ras': raw[g('ras')].fillna('').astype(str).str.upper().str.replace(' ', '', regex=False),
                       'stage': raw[g('sample type')].fillna('').astype(str).str.strip(),
                       'location': raw[g('location')].fillna('').astype(str).str.strip(),
                       'island': raw[g('island')].fillna('').astype(str).str.strip(),
                       'parasite': raw[g('name of parasites')].fillna('').astype(str).str.strip(),
                       'samples_collected': num(raw[g('number of samples')]),
                       'infected_samples': (cnts > 0).sum(axis=1), 'total_parasites': cnts.sum(axis=1)})
    from .analytics import ISLANDS, STAGES
    canon = {x.lower(): x for x in ISLANDS + STAGES}
    for c in ('stage', 'island'):
        before = df[c].copy()
        df[c] = df[c].map(lambda v: canon.get(v.lower(), v))
        n = int((before != df[c]).sum())
        if n:
            issues.append(issue('info', 'name_normalised', f"Parasitology: {n} '{c}' value(s) had inconsistent spelling/case and were normalised (e.g. 'Early stage 4' -> 'Early Stage 4').", n))
    odd = df.loc[df['stage'].eq('Stage 4'), 'stage']
    if len(odd):
        issues.append(issue('warning', 'stage_unspecified', f"Parasitology: {len(odd)} row(s) are 'Stage 4' without Early/Late - excluded from stage charts.", len(odd)))
    unk = sorted(set(df.loc[(df['location'] == 'Tray') & ~df['island'].isin(ISLANDS), 'island']))
    if unk:
        issues.append(issue('warning', 'unrecognised_island', f"Parasitology: tray samples with unrecognised island names: {unk[:6]}", len(unk), unk[:10]))
    df = _dates(df, 'sample_date', 'Parasitology', issues)
    bad = df['samples_collected'].isna() | (df['samples_collected'] <= 0)
    if bad.any():
        issues.append(issue('error', 'missing_values', f"Parasitology: {int(bad.sum())} row(s) without a valid 'Number of samples collected' were rejected.", bad.sum()))
        df = df[~bad]
    over = df['infected_samples'] > df['samples_collected']
    if over.any():
        issues.append(issue('warning', 'infected_gt_samples', f"Parasitology: {int(over.sum())} row(s) have more positive samples than samples collected.", over.sum()))
    df, fi = split_future(df, 'sample_date', as_of, 'Parasitology'); issues += fi
    df = iso(df, 'sample_date'); df['sample_date'] = df['sample_date'].dt.date
    df['samples_collected'] = df['samples_collected'].astype(int)
    return df.reset_index(drop=True), dict(rows_read=n0, issues=issues, sha=sha256(path))

# ---------------- RAS water vs parasite prevalence ----------------
def ras_water(path, as_of):
    issues = []
    wr, e1, _ = read_sheet(path, 'Water Data', 'Logged Date')
    pr, e2, _ = read_sheet(path, 'Parasite Data', 'Date')
    _excel_errors(e1, 'RAS water', issues); _excel_errors(e2, 'RAS parasite sample', issues)
    water = pd.DataFrame({'date': pd.to_datetime(wr[col(wr, 'date used')], errors='coerce'),
                          'volume_l': num(wr[col(wr, 'volume added')])})
    nv = water['volume_l'].isna()
    if nv.any():
        issues.append(issue('info', 'blank_volume', f"RAS water: {int(nv.sum())} log row(s) without a volume are ignored (left blank, not zero).", nv.sum()))
    water = water.dropna(subset=['date', 'volume_l'])
    par = pd.DataFrame({'date': pd.to_datetime(pr[col(pr, 'date')], errors='coerce'),
                        'stage_group': pr[col(pr, 'stage group')], 'prevalence': num(pr[col(pr, 'prevalence')])}).dropna(subset=['date', 'prevalence'])
    return water, par, dict(rows_read=len(wr) + len(pr), issues=issues, sha=sha256(path))

# ================= batch 3 =================
def _std(df, mapping):
    """mapping: out_name -> (prefixes...)  -> DataFrame with canonical names (missing columns -> NaN)."""
    out = {}
    for k, pref in mapping.items():
        c = col(df, *pref)
        out[k] = df[c] if c else pd.Series([None] * len(df), index=df.index)
    return pd.DataFrame(out)

# ---------------- Fry-to-pond stocking numbers ----------------
def stocking(path, as_of):
    issues = []
    raw, errs, _ = read_sheet(path, 'Data', 'Date'); _excel_errors(errs, 'Stocking', issues)
    n0 = len(raw)
    df = _std(raw, dict(date=('date',), ras=('ras',), abw=('calculated abw',), req=('calculated required',), target=('target stocking',),
                        actual=('actual weight',), est=('estimated',), auditor=('auditor',), remarks=('remarks',)))
    df['date'] = pd.to_datetime(df['date'], errors='coerce')
    for c in ('abw', 'req', 'target', 'actual', 'est'):
        df[c] = num(df[c])
    bad = df['date'].isna() | df[['abw', 'req', 'actual']].isna().any(axis=1)
    if bad.any():
        issues.append(issue('error', 'missing_values', f"Stocking: {int(bad.sum())} row(s) missing date/ABW/weights were rejected.", bad.sum()))
        df = df[~bad]
    df['est'] = df['actual'] / df['abw']; df['target'] = df['req'] / df['abw']      # recomputed
    df['variance'] = df['actual'] / df['req'] - 1; df['diff'] = df['est'] - df['target']
    wild = df['variance'].abs() > 0.5
    if wild.any():
        issues.append(issue('warning', 'implausible_variance', f"Stocking: {int(wild.sum())} row(s) with variance beyond +/-50% - check weights.", wild.sum()))
    df, fi = split_future(df, 'date', as_of, 'Stocking'); issues += fi
    df = iso(df, 'date'); df['date'] = df['date'].dt.date
    return df.reset_index(drop=True), dict(rows_read=n0, issues=issues, sha=sha256(path))

# ---------------- Fry transfers (incubation -> pond) ----------------
def fry_transfers(path, as_of):
    issues = []
    raw, errs, _ = read_sheet(path, 'Fry Transfer Data', 'Date'); _excel_errors(errs, 'Fry transfers', issues)
    n0 = len(raw)
    df = _std(raw, dict(date=('date',), origin=('origin',), load_time=('truck loading',), stock_time=('pond stocking',), pond=('destination',),
                        hapa=('hapa stocked',), aerators=('aerators',), tray_do=('tray do',), tray_temp=('tray temp',),
                        bucket_do_wo=('bucket do(mg/l) without',), bucket_temp_wo=('bucket temp (0c) without',),
                        bucket_do_w=('bucket do(mg/l) with fish',), bucket_temp_w=('bucket temp (0c) with fish', 'bucket temp  (0c) with fish'),
                        pond_do=('pond do',), pond_temp=('pond temp',), activeness=('fish activeness',), handling=('handling',), auditor=('auditor',)))
    df['date'] = pd.to_datetime(df['date'], errors='coerce'); df = df.dropna(subset=['date'])
    for c in ('tray_temp', 'bucket_temp_wo', 'bucket_temp_w', 'pond_temp', 'tray_do', 'bucket_do_wo', 'bucket_do_w', 'pond_do'):
        df[c] = num(df[c])
    df['temp_var'] = df['bucket_temp_w'] - df['pond_temp']        # transfer bucket (with fish) vs pond water, as in the Reporting tab
    df, fi = split_future(df, 'date', as_of, 'Fry transfers'); issues += fi
    df = iso(df, 'date'); df['date'] = df['date'].dt.date
    return df.reset_index(drop=True), dict(rows_read=n0, issues=issues, sha=sha256(path))

# ---------------- Egg separation ratings ----------------
def egg_separation(path, as_of):
    issues = []
    raw, errs, _ = read_sheet(path, 'Egg Separation Ratings', 'Egg Collection Date'); _excel_errors(errs, 'Egg separation', issues)
    n0 = len(raw)
    df = _std(raw, dict(date=('egg collection date',), incubation=('incubation rating',), abp=('aqua best practice',), comments=('comments',)))
    df['date'] = pd.to_datetime(df['date'], errors='coerce'); df = df.dropna(subset=['date'])
    for c in ('incubation', 'abp'):
        df[c] = num(df[c])
    rng = ((df['abp'] < 1) | (df['abp'] > 5)) & df['abp'].notna()
    if rng.any():
        issues.append(issue('warning', 'rating_range', f"Egg separation: {int(rng.sum())} rating(s) outside 1-5.", rng.sum()))
    nr = df['abp'].isna()
    if nr.any():
        issues.append(issue('info', 'unrated', f"Egg separation: {int(nr.sum())} collection day(s) have no Aqua Best Practice rating yet.", nr.sum()))
        df = df[~nr]
    df, fi = split_future(df, 'date', as_of, 'Egg separation'); issues += fi
    df = iso(df, 'date'); df['date'] = df['date'].dt.date
    return df.reset_index(drop=True), dict(rows_read=n0, issues=issues, sha=sha256(path))

# ---------------- Hapa exchange (nursery / broodstock) ----------------
def hapa_exchange(path, sheet, kind, as_of):
    issues = []
    first = 'Week' if kind == 'nursery' else 'Scheduled Exchange Date'
    raw, errs, _ = read_sheet(path, sheet, first); _excel_errors(errs, f'Hapa exchange {kind}', issues)
    n0 = len(raw)
    df = _std(raw, dict(scheduled=('scheduled exchange',), pond=('pond',), to_exchange=('number of hapas',), exchanged=('number exchanged',),
                        actual_date=('actual exchange',), days_delayed=('days delayed',), compliant=('compliant', 'exchanged on time'), rejected=('rejected hapas',)))
    df['scheduled'] = pd.to_datetime(df['scheduled'], errors='coerce')
    df = df.dropna(subset=['scheduled', 'pond'])
    for c in ('to_exchange', 'exchanged', 'days_delayed'):
        df[c] = num(df[c])
    bad = df['to_exchange'].isna()
    if bad.any():
        issues.append(issue('error', 'missing_values', f"Hapa exchange {kind}: {int(bad.sum())} row(s) without 'number to exchange' were rejected.", bad.sum()))
        df = df[~bad]
    ne = df['exchanged'].isna()
    if ne.any():
        issues.append(issue('info', 'not_yet_exchanged', f"Hapa exchange {kind}: {int(ne.sum())} scheduled row(s) have no 'number exchanged' yet (counted as 0).", ne.sum()))
        df['exchanged'] = df['exchanged'].fillna(0)
    over = df['exchanged'] > df['to_exchange']
    if over.any():
        issues.append(issue('warning', 'exchanged_gt_scheduled', f"Hapa exchange {kind}: {int(over.sum())} row(s) exchanged more hapas than scheduled.", over.sum()))
    df['kind'] = kind
    df, fi = split_future(df, 'scheduled', as_of, f'Hapa exchange {kind}'); issues += fi
    df = iso(df, 'scheduled'); df['scheduled'] = df['scheduled'].dt.date
    return df.reset_index(drop=True), dict(rows_read=n0, issues=issues, sha=sha256(path))

# ---------------- Egg volumetric (per-jar star ratings) ----------------
def egg_volumetric(path, as_of):
    issues = []
    raw, errs, _ = read_sheet(path, 'Egg Volumetric Data', 'Date'); _excel_errors(errs, 'Egg volumetric', issues)
    n0 = len(raw)
    df = _std(raw, dict(date=('date',), pond=('pond id',), incubator=('incubator',), total_h=('total egg height',), mixed_h=('mixed stages',),
                        pct12=('% stage 1',), overall=('% overall',), star=('star rating',)))
    df['date'] = pd.to_datetime(df['date'], errors='coerce'); df = df.dropna(subset=['date'])
    old = df['date'] < pd.Timestamp('2025-01-01')
    if old.any():
        issues.append(issue('error', 'implausible_year', f"Egg volumetric: {int(old.sum())} row(s) dated before 2025 (e.g. {df.loc[old,'date'].iloc[0]:%Y-%m-%d}) - likely a year typo (2016 for 2026); rejected.", old.sum(),
                            sorted({d.strftime('%Y-%m-%d') for d in df.loc[old, 'date']})[:6]))
        df = df[~old]
    for c in ('total_h', 'mixed_h', 'pct12', 'overall', 'star'):
        df[c] = num(df[c])
    ns = df['star'].isna()
    if ns.any():
        issues.append(issue('warning', 'no_star', f"Egg volumetric: {int(ns.sum())} jar(s) without a star rating were rejected.", ns.sum())); df = df[~ns]
    df['incubator'] = df['incubator'].fillna('').astype(str)
    df, fi = split_future(df, 'date', as_of, 'Egg volumetric'); issues += fi
    df = iso(df, 'date'); df['date'] = df['date'].dt.date
    return df.reset_index(drop=True), dict(rows_read=n0, issues=issues, sha=sha256(path))

# ---------------- Pond flipping ----------------
def flipping(path, sheet, kind, as_of):
    """Long table: one row per pond x stage with days taken and expected days (expected is read from the header, e.g. 'Drying Period (7 days)')."""
    import re
    issues = []
    raw, errs, _ = read_sheet(path, sheet, 'Pond ID'); _excel_errors(errs, f'Flipping {kind}', issues)
    n0 = len(raw)
    sched = pd.to_datetime(raw[col(raw, 'scheduled flipping')], errors='coerce')
    stages = []
    for c in raw.columns:
        m = re.match(r'^(.*?)\s*\((\d+)\s*days?\)\s*$', c)
        if m:
            nm = re.sub(r'\s+days?$', '', m.group(1).strip(), flags=re.I).strip()
            stages.append((nm[:1].upper() + nm[1:], int(m.group(2)), c))
        elif c.lower().startswith('days late to last'):
            stages.insert(0, ('Last egg collection' if kind == 'broodstock' else 'Last fish transfer', 0, c))
    rows = []
    for i in raw.index:
        if pd.isna(sched[i]) or pd.isna(raw.loc[i, col(raw, 'pond id')]):
            continue
        for order, (nm, exp, c) in enumerate(stages):
            v = pd.to_numeric(raw.loc[i, c], errors='coerce')
            rows.append(dict(kind=kind, pond=str(raw.loc[i, col(raw, 'pond id')]).strip(), scheduled=sched[i], stage=nm, order=order,
                             expected_days=exp, days=None if pd.isna(v) else float(v)))
    df = pd.DataFrame(rows)
    df, fi = split_future(df, 'scheduled', as_of, f'Flipping {kind}'); issues += fi
    df = iso(df, 'scheduled'); df['scheduled'] = df['scheduled'].dt.date
    return df.reset_index(drop=True), dict(rows_read=n0, issues=issues, sha=sha256(path))

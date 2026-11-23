"""Adapters: database rows (registry field names) -> the DataFrames the analytics/deck code expects."""
from __future__ import annotations
import datetime as dt
import pandas as pd

import json as _json, os as _os
_REG = _json.load(open(_os.path.join(_os.path.dirname(__file__), '..', '..', 'web', 'modules.json')))['modules']

def _blank(key):
    """Empty frame with the module's columns, so a table with no rows yet gives an empty slide section instead of a crash."""
    m = next((x for x in _REG if x['key'] == key), None)
    return pd.DataFrame(columns=[f['name'] for f in m['fields']] if m else [])

def _df(rows, key=None):
    return pd.DataFrame(rows) if rows else (_blank(key) if key else pd.DataFrame())

def _dates(df, *cols):
    for c in cols:
        if c in df: df[c] = pd.to_datetime(df[c], errors='coerce').dt.date
    return df

def workstation(rows):
    d = _dates(_df(rows, 'workstation_audits'), 'audit_date'); return d

def bottom_rope(rows, unit):
    d = _df(rows, 'bottom_rope_audits')
    if d.empty: return d
    d = d[d.unit_type == unit].copy(); d['hapa_failed'] = d['hapa_failed'].fillna(False).astype(bool)
    for c in ('wrong_position_ropes', 'missing_posts', 'missing_hook', 'not_tied', 'total_ropes'): d[c] = pd.to_numeric(d[c], errors='coerce').fillna(0)
    return _dates(d, 'audit_date')

def day3(rows):
    d = _dates(_df(rows, 'day3_recounts'), 'stocking_date', 'recount_date')
    if not d.empty: d['unit'] = d['pond'].astype(str) + '-' + d['hapa'].astype(str) if 'unit' not in d or d['unit'].isna().all() else d['unit']
    return d

def biosecurity(rows):
    d = _dates(_df(rows), 'audit_date')
    if not d.empty:
        if 'superseded' in d: d = d[~d['superseded'].fillna(False).astype(bool)].copy()       # Biosecurity-dashboard dates replace the Excel rows
        d['scored'] = d['rating_value'].notna() & ~d['analysis_category'].isin(['Not scored', 'Overall (typed)'])
    return d

def parasitology(rows):
    d = _dates(_df(rows), 'sample_date')
    for c in ('samples_collected', 'infected_samples', 'total_parasites'):
        if c in d: d[c] = pd.to_numeric(d[c], errors='coerce').fillna(0)
    return d

def ras_water(rows):
    d = _df(rows).rename(columns={'used_date': 'date'})
    if not d.empty: d['date'] = pd.to_datetime(d['date'])
    return d

def ras_prevalence(rows):
    d = _df(rows).rename(columns={'sample_date': 'date'})
    if not d.empty: d['date'] = pd.to_datetime(d['date'])
    return d

def stocking(rows):
    return _dates(_df(rows).rename(columns={'audit_date': 'date'}), 'date')

def transfers(rows):
    return _dates(_df(rows), 'date')

def egg_separation(rows):
    return _dates(_df(rows).rename(columns={'abp_rating': 'abp', 'incubation_rating': 'incubation'}), 'date')

def egg_volumetric(rows):
    return _dates(_df(rows), 'date')

def flips(rows, stage_defs):
    """pond_flips rows hold stage_days as a dict; the analytics use one row per pond x stage."""
    out = []
    for r in rows:
        kind = r['kind']; defs = stage_defs.get(kind, [])
        order = {s['name']: i for i, s in enumerate(defs)}; exp = {s['name']: s['expected'] for s in defs}
        for stage, days in (r.get('stage_days') or {}).items():
            out.append(dict(kind=kind, pond=r['pond'], scheduled=r['scheduled'], stage=stage, order=order.get(stage, 99),
                            expected_days=exp.get(stage), days=days, iso_year=r.get('iso_year'), iso_week=r.get('iso_week')))
    d = pd.DataFrame(out)
    if not d.empty: d['scheduled'] = pd.to_datetime(d['scheduled']).dt.date
    return d

def hapa_exchange(rows, kind):
    d = _df(rows)
    if d.empty: return d
    d = d[d.kind == kind].copy()
    for c in ('to_exchange', 'exchanged'): d[c] = pd.to_numeric(d[c], errors='coerce').fillna(0)
    return _dates(d, 'scheduled', 'actual_date')


def broodstock(rows):
    return _dates(_df(rows, 'broodstock_density'), 'date')

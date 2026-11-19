"""Weekly deck from database tables (same maths as build_report.py, which reads Excel directly)."""
from __future__ import annotations
import datetime as dt
import pandas as pd
from . import analytics as A, comments as C, deck, dbframes as F, media

COMMENT_MAP = {'workstation': ['workstation'], 'biosecurity': ['biosecurity'], 'parasitology': ['parasitology'], 'ras_water': ['ras_water'], 'day3': ['day3'],
               'stocking': ['stocking'], 'transfers': ['transfers'], 'eggs': ['egg'], 'flipping': ['flipping'], 'bottom_rope': ['bottom_rope_nursery', 'bottom_rope_broodstock'],
               'hapa_exchange': ['hapa_exchange']}

def build_week(T, year, week, out, template, stage_defs, overrides=None, images=None, exclude=(), ras='RAS2'):
    """T: {module_key: [row dicts]}; overrides: {section_key: comment text}; images: [{section_key, slot, kind, path}]; exclude: section keys to drop."""
    ws = F.workstation(T.get('workstation_audits', [])); nur = F.bottom_rope(T.get('bottom_rope_audits', []), 'nursery'); bro = F.bottom_rope(T.get('bottom_rope_audits', []), 'broodstock')
    d3 = F.day3(T.get('day3_recounts', []))
    tr = A.workstation_trend(ws, year, week); nc = A.workstation_noncompliant(ws, year, week); sub = A.day3_week(d3, year, week)
    gn, gb = A.bottom_rope_weekly(nur, year, week), A.bottom_rope_weekly(bro, year, week)
    cm = {'workstation': C.workstation(tr, nc, A.workstation_reasons(nc)), 'day3': C.day3(sub, year, week),
          'bottom_rope_nursery': C.bottom_rope(gn, week), 'bottom_rope_broodstock': C.bottom_rope(gb, week)}
    mon = dt.date.fromisocalendar(year, week, 1); sun = mon + dt.timedelta(days=6)
    title = f"Day 3 survival (%) per unit – Week {week} ({mon:%d %b %Y} – {sun:%d %b %Y})"
    extra = {}
    if T.get('biosecurity_audits'):
        bio = F.biosecurity(T['biosecurity_audits']); ov, cat = A.bio_weekly_overall(bio, year, week), A.bio_category_week(bio, year, week)
        extra['bio'] = dict(overall=ov, cat=cat, band=A.rating_band); cm['biosecurity'] = C.biosecurity(ov, cat)
    if T.get('ras_water_volume') or T.get('ras_parasite_prevalence'):
        w_, p_ = F.ras_water(T.get('ras_water_volume', [])), F.ras_prevalence(T.get('ras_parasite_prevalence', []))
        if not w_.empty and not p_.empty:
            rows, r_, n_ = A.water_vs_prevalence(w_, p_, pd.Timestamp(mon), pd.Timestamp(sun)); extra['water'] = dict(rows=rows); cm['ras_water'] = C.ras_water(rows, r_, n_, week)
    if T.get('parasitology_samples'):
        par = F.parasitology(T['parasitology_samples']); wks = list(range(max(1, week - 12), week + 1)); iw = list(range(max(1, week - 7), week + 1))
        isl = A.para_weekly(par, ras, year, iw, 'island', A.ISLANDS); p_all, i_all, by_stage = A.para_overall(par, ras, year, week)
        now = [v['prev'][-1] for v in isl.values() if v['prev'][-1] is not None]
        extra['para'] = dict(weeks=wks, stages=A.STAGES, stage=A.para_weekly(par, ras, year, wks, 'stage', A.STAGES), islands=A.ISLANDS, island_weeks=iw, island=isl)
        cm['parasitology'] = C.parasitology(sum(now) / len(now) if now else None, i_all, by_stage, week, ras)
    if T.get('stocking_audits'):
        extra['stocking'] = A.stocking_daily(F.stocking(T['stocking_audits']), year, week); cm['stocking'] = C.stocking(extra['stocking'])
    if T.get('fry_transfers'):
        extra['transfers'] = A.transfer_temps(F.transfers(T['fry_transfers']), year, week); cm['transfers'] = C.transfers(extra['transfers'])
    if T.get('egg_separation_ratings') and T.get('egg_volumetric_jars'):
        eg, vol = F.egg_separation(T['egg_separation_ratings']), F.egg_volumetric(T['egg_volumetric_jars'])
        trend = A.egg_weekly(eg, year, week); low, tot, mixed = A.jars_low(vol, year, week); extra['egg'] = dict(trend=trend, low=low); cm['egg'] = C.egg(trend, low, tot, mixed)
    if T.get('pond_flips'):
        fl = F.flips(T['pond_flips'], stage_defs)
        if not fl.empty:
            tn, en, _ = A.flip_table(fl, 'nursery', year, sun.month); tb, eb, _ = A.flip_table(fl, 'broodstock', year, sun.month)
            extra['flip'] = dict(nursery=(tn, en), broodstock=(tb, eb))
            cm['flipping'] = C.flipping(week, {'nursery': A.flipped_in_week(fl, 'nursery', year, week), 'broodstock': A.flipped_in_week(fl, 'broodstock', year, week)}, A.flip_overdue(tn, en) + A.flip_overdue(tb, eb))
    if T.get('hapa_exchanges'):
        hn, hb = F.hapa_exchange(T['hapa_exchanges'], 'nursery'), F.hapa_exchange(T['hapa_exchanges'], 'broodstock')
        pns, bs = A.hapa_exchange_weekly(hn, year, week), A.hapa_exchange_weekly(hb, year, week); extra['hapa'] = dict(pns=pns, bs=bs); cm['hapa_exchange'] = C.hapa_exchange(pns, bs, week)
    for sec, text in (overrides or {}).items():                  # comments edited by people replace the drafts
        lines = [l.strip() for l in (text or '').split('\n') if l.strip()]
        for k in COMMENT_MAP.get(sec, []):
            if lines and k in cm: cm[k] = lines
    deck.build(template, out, year, week, sun + dt.timedelta(days=2), tr, nc, cm, sub, title,
               {'nursery': (gn, A.bottom_rope_by_pond(nur, year, week)), 'broodstock': (gb, A.bottom_rope_by_pond(bro, year, week))}, extra)
    media.finish(out, week, images or [], set(exclude))
    return cm

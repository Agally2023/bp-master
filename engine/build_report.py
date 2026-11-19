#!/usr/bin/env python3
"""Usage: python build_report.py --year 2026 --week 46 --as-of 2026-11-18 --out ../out/report.pptx [--data-dir DIR]"""
import argparse, datetime as dt, json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from bpm import importers as I, analytics as A, comments as C, deck

ap = argparse.ArgumentParser()
ap.add_argument('--year', type=int, required=True); ap.add_argument('--week', type=int, required=True)
ap.add_argument('--as-of', default=dt.date.today().isoformat())
ap.add_argument('--workstation', required=True); ap.add_argument('--bottom-rope', required=True); ap.add_argument('--day3', required=True)
ap.add_argument('--biosecurity'); ap.add_argument('--parasitology'); ap.add_argument('--ras-water'); ap.add_argument('--ras', default='RAS2')
ap.add_argument('--stocking'); ap.add_argument('--fry-transfers'); ap.add_argument('--egg-collection'); ap.add_argument('--pond-flipping'); ap.add_argument('--hapa-exchange')
ap.add_argument('--template', default=os.path.join(os.path.dirname(__file__), '..', 'templates', 'VF_BP_Weekly_Template.pptx'))
ap.add_argument('--out', required=True)
a = ap.parse_args()

ws, m1 = I.workstation(a.workstation, a.as_of)
nur, m2 = I.bottom_rope(a.bottom_rope, 'Nursery', 'nursery', a.as_of)
bro, m3 = I.bottom_rope(a.bottom_rope, 'Broodstock', 'broodstock', a.as_of)
d3, m4 = I.day3(a.day3, a.as_of)

tr = A.workstation_trend(ws, a.year, a.week); nc = A.workstation_noncompliant(ws, a.year, a.week)
sub = A.day3_week(d3, a.year, a.week)
gn, gb = A.bottom_rope_weekly(nur, a.year, a.week), A.bottom_rope_weekly(bro, a.year, a.week)
cm = {'workstation': C.workstation(tr, nc, A.workstation_reasons(nc)), 'day3': C.day3(sub, a.year, a.week),
      'bottom_rope_nursery': C.bottom_rope(gn, a.week), 'bottom_rope_broodstock': C.bottom_rope(gb, a.week)}
mon = dt.date.fromisocalendar(a.year, a.week, 1); sun = mon + dt.timedelta(days=6)
title = f"Day 3 survival (%) per unit – Week {a.week} ({mon:%d %b %Y} – {sun:%d %b %Y})"
extra, imp = {}, dict(workstation=m1, bottom_rope_nursery=m2, bottom_rope_broodstock=m3, day3=m4)
import pandas as pd
if a.biosecurity:
    bio, mb = I.biosecurity(a.biosecurity, a.as_of); imp['biosecurity'] = mb
    ov, cat = A.bio_weekly_overall(bio, a.year, a.week), A.bio_category_week(bio, a.year, a.week)
    extra['bio'] = dict(overall=ov, cat=cat, band=A.rating_band); cm['biosecurity'] = C.biosecurity(ov, cat)
if a.ras_water:
    w_, p_, mw = I.ras_water(a.ras_water, a.as_of); imp['ras_water'] = mw
    rows, r_, n_ = A.water_vs_prevalence(w_, p_, pd.Timestamp(mon), pd.Timestamp(sun))
    extra['water'] = dict(rows=rows); cm['ras_water'] = C.ras_water(rows, r_, n_, a.week)
if a.parasitology:
    par, mp = I.parasitology(a.parasitology, a.as_of); imp['parasitology'] = mp
    wks = list(range(max(1, a.week - 12), a.week + 1)); iw = list(range(max(1, a.week - 7), a.week + 1))
    isl = A.para_weekly(par, a.ras, a.year, iw, 'island', A.ISLANDS)
    p_all, i_all, by_stage = A.para_overall(par, a.ras, a.year, a.week)
    isl_now = [v['prev'][-1] for v in isl.values() if v['prev'][-1] is not None]
    avg_isl = sum(isl_now) / len(isl_now) if isl_now else None      # deck definition: mean of island prevalences
    extra['para'] = dict(weeks=wks, stages=A.STAGES, stage=A.para_weekly(par, a.ras, a.year, wks, 'stage', A.STAGES),
                         islands=A.ISLANDS, island_weeks=iw, island=isl)
    cm['parasitology'] = C.parasitology(avg_isl, i_all, by_stage, a.week, a.ras)
if a.stocking:
    st, ms = I.stocking(a.stocking, a.as_of); imp['stocking'] = ms
    extra['stocking'] = A.stocking_daily(st, a.year, a.week); cm['stocking'] = C.stocking(extra['stocking'])
if a.fry_transfers:
    tf, mt = I.fry_transfers(a.fry_transfers, a.as_of); imp['fry_transfers'] = mt
    extra['transfers'] = A.transfer_temps(tf, a.year, a.week); cm['transfers'] = C.transfers(extra['transfers'])
if a.egg_collection:
    eg, me = I.egg_separation(a.egg_collection, a.as_of); imp['egg_separation'] = me
    vol, mv = I.egg_volumetric(a.egg_collection, a.as_of); imp['egg_volumetric'] = mv
    tr_e = A.egg_weekly(eg, a.year, a.week); low, tot, mixed = A.jars_low(vol, a.year, a.week)
    extra['egg'] = dict(trend=tr_e, low=low); cm['egg'] = C.egg(tr_e, low, tot, mixed)
if a.pond_flipping:
    fn, mfn = I.flipping(a.pond_flipping, 'Nursery Ponds Data', 'nursery', a.as_of)
    fb, mfb = I.flipping(a.pond_flipping, 'Broodstock Ponds Data', 'broodstock', a.as_of); imp['flipping_nursery'] = mfn; imp['flipping_broodstock'] = mfb
    fl = pd.concat([fn, fb]); tn, en, _ = A.flip_table(fl, 'nursery', a.year, sun.month); tb, eb, _ = A.flip_table(fl, 'broodstock', a.year, sun.month)
    extra['flip'] = dict(nursery=(tn, en), broodstock=(tb, eb))
    cm['flipping'] = C.flipping(a.week, {'nursery': A.flipped_in_week(fl, 'nursery', a.year, a.week), 'broodstock': A.flipped_in_week(fl, 'broodstock', a.year, a.week)},
                                A.flip_overdue(tn, en) + A.flip_overdue(tb, eb))
if a.hapa_exchange:
    hn, mhn = I.hapa_exchange(a.hapa_exchange, 'Nursery Exchange', 'nursery', a.as_of)
    hb, mhb = I.hapa_exchange(a.hapa_exchange, 'Broodstock Exchange', 'broodstock', a.as_of); imp['hapa_exchange_nursery'] = mhn; imp['hapa_exchange_broodstock'] = mhb
    pns, bs = A.hapa_exchange_weekly(hn, a.year, a.week), A.hapa_exchange_weekly(hb, a.year, a.week)
    extra['hapa'] = dict(pns=pns, bs=bs); cm['hapa_exchange'] = C.hapa_exchange(pns, bs, a.week)
deck.build(a.template, a.out, a.year, a.week, sun + dt.timedelta(days=2), tr, nc, cm, sub, title,
           {'nursery': (gn, A.bottom_rope_by_pond(nur, a.year, a.week)), 'broodstock': (gb, A.bottom_rope_by_pond(bro, a.year, a.week))}, extra)
rep = {'week': a.week, 'year': a.year, 'imports': {k: {'rows_read': m['rows_read'], 'issues': m['issues']} for k, m in
       imp.items()}, 'draft_comments': cm}
json.dump(rep, open(os.path.splitext(a.out)[0] + '_import_report.json', 'w'), indent=2, default=str)
print('deck ->', a.out)

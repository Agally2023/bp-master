"""Weekly deck from database tables (same maths as build_report.py, which reads Excel directly)."""
from __future__ import annotations
import datetime as dt
import pandas as pd
from . import analytics as A, comments as C, deck, dbframes as F, media, extras as X

COMMENT_MAP = {'workstation': ['workstation'], 'biosecurity': ['biosecurity'], 'parasitology': ['parasitology'], 'ras_water': ['ras_water'], 'day3': ['day3'],
               'stocking': ['stocking'], 'transfers': ['transfers'], 'eggs': ['egg'], 'flipping': ['flipping'], 'bottom_rope': ['bottom_rope_nursery', 'bottom_rope_broodstock'],
               'hapa_exchange': ['hapa_exchange'], 'brood_density': ['brood_density'], 'rope_analysis': ['rope_analysis']}

WARNINGS = []

def warn(section, e):
    """One section failing must never stop the whole report: log it, skip that section's extras, tell the user."""
    import sys, traceback
    traceback.print_exc(file=sys.stderr); WARNINGS.append(f'{section}: {type(e).__name__}: {e}'[:160])

# A chart with no data points (e.g. no Day-3 recounts logged that week) makes python-pptx raise
# "ValueError: chart data contains no categories" and used to abort the whole export.
# Instead, drop the empty chart from the slide and report it through the X-Report-Warnings header.
_replace_chart = deck.replace_chart

def _safe_replace_chart(sh, cats, *args, **kwargs):
    if not cats:
        name = sh.name
        sh._element.getparent().remove(sh._element)
        WARNINGS.append(f'Chart {name} omitted: no data for this week')
        return
    return _replace_chart(sh, cats, *args, **kwargs)

deck.replace_chart = _safe_replace_chart

def build_week(T, year, week, out, template, stage_defs, overrides=None, images=None, exclude=(), ras='RAS2', photo_src=None):
    """T: {module_key: [row dicts]}; overrides: {section_key: comment text}; images: [{section_key, slot, kind, path}]; exclude: section keys to drop."""
    flip_prog = flip_tot = None; WARNINGS.clear()
    ws = F.workstation(T.get('workstation_audits', [])); nur = F.bottom_rope(T.get('bottom_rope_audits', []), 'nursery'); bro = F.bottom_rope(T.get('bottom_rope_audits', []), 'broodstock')
    d3 = F.day3(T.get('day3_recounts', []))
    tr = A.workstation_trend(ws, year, week); nc = A.workstation_noncompliant(ws, year, week); sub = A.day3_week(d3, year, week)
    gn, gb = A.bottom_rope_weekly(nur, year, week), A.bottom_rope_weekly(bro, year, week)
    cm = {'workstation': C.workstation(tr, nc, A.workstation_reasons(nc)), 'day3': C.day3(sub, year, week),
          'bottom_rope_nursery': C.bottom_rope(gn, week), 'bottom_rope_broodstock': C.bottom_rope(gb, week)}
    mon = dt.date.fromisocalendar(year, week, 1); sun = mon + dt.timedelta(days=6)
    title = f"Day 3 survival (%) per unit – Week {week} ({mon:%d %b %Y} – {sun:%d %b %Y})"
    extra = {}
    try:
        if T.get('biosecurity_audits'):
            bio = F.biosecurity(T['biosecurity_audits']); ov, cat = A.bio_weekly_overall(bio, year, week), A.bio_category_week(bio, year, week)
            if ov and ov[-1][1] is not None:      # no scored biosecurity rows this year: leave the slide's chart out rather than crash
                cm['biosecurity'] = C.biosecurity(ov, cat); extra['bio'] = dict(overall=ov, cat=cat, band=A.rating_band)
    except Exception as e: warn('Biosecurity', e)
    try:
        if T.get('ras_water_volume') or T.get('ras_parasite_prevalence'):
            w_, p_ = F.ras_water(T.get('ras_water_volume', [])), F.ras_prevalence(T.get('ras_parasite_prevalence', []))
            if not w_.empty and not p_.empty:
                rows, r_, n_ = A.water_vs_prevalence(w_, p_, pd.Timestamp(mon), pd.Timestamp(sun))
                if rows:    # no water/prevalence readings in this week: skip the slide's chart
                    cm['ras_water'] = C.ras_water(rows, r_, n_, week); extra['water'] = dict(rows=rows)
    except Exception as e: warn('RAS water', e)
    try:
        if T.get('parasitology_samples'):
            par = F.parasitology(T['parasitology_samples']); wks = list(range(max(1, week - 12), week + 1)); iw = list(range(max(1, week - 7), week + 1))
            isl = A.para_weekly(par, ras, year, iw, 'island', A.ISLANDS); p_all, i_all, by_stage = A.para_overall(par, ras, year, week)
            now = [v['prev'][-1] for v in isl.values() if v['prev'][-1] is not None]
            extra['para'] = dict(weeks=wks, stages=A.STAGES, stage=A.para_weekly(par, ras, year, wks, 'stage', A.STAGES), islands=A.ISLANDS, island_weeks=iw, island=isl)
            cm['parasitology'] = C.parasitology(sum(now) / len(now) if now else None, i_all, by_stage, week, ras)
    except Exception as e: warn('Parasitology', e)
    try:
        if T.get('stocking_audits'):
            extra['stocking'] = A.stocking_daily(F.stocking(T['stocking_audits']), year, week); cm['stocking'] = C.stocking(extra['stocking'])
    except Exception as e: warn('Stocking', e)
    try:
        if T.get('fry_transfers'):
            extra['transfers'] = A.transfer_temps(F.transfers(T['fry_transfers']), year, week); cm['transfers'] = C.transfers(extra['transfers'])
    except Exception as e: warn('Transfers', e)
    try:
        if T.get('egg_separation_ratings') or T.get('egg_volumetric_jars'):
            if not (T.get('egg_separation_ratings') and T.get('egg_volumetric_jars')):
                raise ValueError('needs both egg_separation_ratings and egg_volumetric_jars; one is empty, so the egg slide was left out')
            eg, vol = F.egg_separation(T['egg_separation_ratings']), F.egg_volumetric(T['egg_volumetric_jars'])
            trend = A.egg_weekly(eg, year, week); low, tot, mixed = A.jars_low(vol, year, week); extra['egg'] = dict(trend=trend, low=low); cm['egg'] = C.egg(trend, low, tot, mixed)
    except Exception as e: warn('Egg separation', e)
    try:
        if T.get('pond_flips'):
            fl = F.flips(T['pond_flips'], stage_defs)
            if not fl.empty:
                tot = {k: len(stage_defs.get(k, [])) or None for k in ('nursery', 'broodstock')}
                import datetime as _dt
                as_of = min(_dt.date.today(), sun if isinstance(sun, _dt.date) else sun.date())
                lastx = {k: (stage_defs.get(k) or [{}])[-1].get('expected') for k in tot}
                since = (sun if isinstance(sun, _dt.date) else sun.date()) - _dt.timedelta(days=20); until = sun if isinstance(sun, _dt.date) else sun.date()
                tn, en, _ = A.flip_table(fl, 'nursery', year, sun.month, tot['nursery'], as_of, lastx['nursery'], since, until); tb, eb, _ = A.flip_table(fl, 'broodstock', year, sun.month, tot['broodstock'], as_of, lastx['broodstock'], since, until)
                prog = {k: A.flip_progress(fl, k, tot[k], as_of, lastx[k]) for k in tot if tot[k]}; flip_prog, flip_tot = prog, tot
                extra['flip'] = dict(nursery=(tn, en), broodstock=(tb, eb), since=since, until=until)
                cm['flipping'] = C.flipping(week, prog, A.flip_overdue(tn, en) + A.flip_overdue(tb, eb), tot)
    except Exception as e: warn('Pond flipping', e)
    try:
        if T.get('hapa_exchanges'):
            hn, hb = F.hapa_exchange(T['hapa_exchanges'], 'nursery'), F.hapa_exchange(T['hapa_exchanges'], 'broodstock')
            lp = A.hapa_last_recorded(hn, year, week) if not hn.empty else None; lb = A.hapa_last_recorded(hb, year, week) if not hb.empty else None
            fw = [x for x in (A.hapa_first_week(hn, year, week) if not hn.empty else None, A.hapa_first_week(hb, year, week) if not hb.empty else None) if x]
            nw = min(52, max(12, week - min(fw) + 1)) if fw else 12   # both curves run across one shared axis, from the first week with data
            pns, bs = A.hapa_exchange_weekly(hn, year, week, nw), A.hapa_exchange_weekly(hb, year, week, nw)
            lp = A.hapa_last_recorded(hn, year, week) if not hn.empty else None; lb = A.hapa_last_recorded(hb, year, week) if not hb.empty else None
            extra['hapa'] = dict(pns=pns, bs=bs, last_pns=lp, last_bs=lb); cm['hapa_exchange'] = C.hapa_exchange(pns, bs, week, lp, lb)
    except Exception as e: warn('Hapa exchange', e)
    brood = None
    try:
        if T.get('broodstock_density'):
            brood = A.brood_density(F.broodstock(T['broodstock_density']), year, week); cm['brood_density'] = C.brood(brood, week)
    except Exception as e: warn('Broodstock density and sex ratio', e)
    for sec, text in (overrides or {}).items():                  # comments edited by people replace the drafts
        lines = [l.strip() for l in (text or '').split('\n') if l.strip()]
        for k in COMMENT_MAP.get(sec, []):
            mine = lines
            if sec == 'bottom_rope':        # one editable comment feeds two slides: 'Nursery: ...' / 'Broodstock: ...' lines go to their own slide, untagged lines to both
                tag = k.split('_')[-1].capitalize() + ':'; other = ('Broodstock:' if tag == 'Nursery:' else 'Nursery:')
                mine = [l[len(tag):].strip() if l.startswith(tag) else l for l in lines if not l.startswith(other)]
            if mine and k in cm: cm[k] = mine
    deck.build(template, out, year, week, sun + dt.timedelta(days=2), tr, nc, cm, sub, title,
               {'nursery': (gn, A.bottom_rope_by_pond(nur, year, week)), 'broodstock': (gb, A.bottom_rope_by_pond(bro, year, week))}, extra)
    if T.get('pond_prep_scoring'):          # latest scored record per pond for ponds flipped in the report's month
        latest = {}
        for r in T['pond_prep_scoring']:
            if str(r.get('flipping_date', ''))[:7] == sun.strftime('%Y-%m') and (r['pond'] not in latest or str(r['flipping_date']) > str(latest[r['pond']]['flipping_date'])): latest[r['pond']] = r
        try:
            if 'prep_scoring' not in exclude: media.add_prep_slide(out, list(latest.values()), sun.strftime('%B %Y'), note=(overrides or {}).get('prep_scoring') or None)
        except Exception as e: warn('Pond preparation scoring', e)
    try:
        if 'rope_analysis' not in exclude and (len(nur) or len(bro)):
            fn, an_, wn_ = A.bottom_rope_failures(nur, year, week); fb, ab_, wb_ = A.bottom_rope_failures(bro, year, week)
            lines = (overrides or {}).get('rope_analysis') or C.rope_analysis(fn, an_, fb, ab_)
            lines = lines if isinstance(lines, list) else [l for l in str(lines).split('\n') if l.strip()]
            media.add_rope_slide(out, gn, gb, [('Nursery', fn), ('Broodstock', fb)], lines)
    except Exception as e: warn('Bottom rope conformance slide', e)
    try:
        if brood is not None and 'brood_density' not in exclude: media.add_brood_slide(out, brood, cm['brood_density'])
    except Exception as e: warn('Broodstock slide', e)
    try:                                                    # Days Late Summary slides (latest 3 weeks), Broodstock then Nursery, right after the flipping slide
        if 'days_late' not in exclude and extra.get('flip'):
            for kind, label in (('nursery', 'Nursery'), ('broodstock', 'Broodstock')):
                for spec in reversed(X.days_late(*extra['flip'][kind], label, extra['flip']['since'], extra['flip']['until'])): media.add_spec_slide(out, spec, anchor='pond flipping')
    except Exception as e: warn('Days late summary', e)
    for key, fn_, tbl in (('sinkers', X.sinkers, 'bottom_rope_audits'), ('ws_frequency', X.ws_frequency, 'workstation_audits'), ('sr_efficiency', X.sr_efficiency, 'sr_efficiency'),
                          ('sr_feed', X.sr_feed, 'sex_reversal_feed'), ('hapa_wash', X.hapa_wash, 'hapa_wash_dispatch')):
        try:
            if key in exclude or not T.get(tbl): continue
            spec = fn_(T[tbl], year, week)
            if spec:
                if (overrides or {}).get(key): spec['lines'] = [l.strip() for l in overrides[key].split('\n') if l.strip()]
                media.add_spec_slide(out, spec)
        except Exception as e: warn('Slide ' + key, e)
    images = list(images or [])
    if photo_src:
        try: images += _auto_photos(photo_src, images, flip_prog, flip_tot)
        except Exception as e: warn('Photos', e)
    try: media.finish(out, week, images, set(exclude))
    except Exception as e: warn('Final pass (logos, photos, fonts)', e)   # the deck is already saved: never lose the whole report to a cosmetic step
    return cm


def _auto_photos(src, images, prog, tot):
    """Fill the two picture grids when nobody uploaded photos by hand. src: {'bio': rows, 'pond': rows, 'fetch': fn(bucket, path) -> local file}."""
    out, have = [], {i['section_key'] for i in images if i.get('kind') == 'photo'}
    fetch = src['fetch']
    if 'bio_photos' not in have:
        picks = [(p['bucket'], p['path'], p['caption']) for p in A.pick_hygiene_photos(src.get('hygiene') or [])]
        picks += [('biosecurity-photos', p['row']['file_path'], p['caption']) for p in A.pick_bio_photos(src.get('bio') or [], 40)]
        for n, (bucket, path, cap) in enumerate(picks, 1):
            f = fetch(bucket, path)
            if f: out.append(dict(section_key='bio_photos', slot=n, kind='photo', path=f, caption=cap))
    if 'flip_photos' not in have and prog:
        for n, p in enumerate(A.pick_pond_photos(src.get('pond') or [], prog, tot or {}), 1):
            f = fetch('bpm-report-images', p['row']['storage_path'])
            if f: out.append(dict(section_key='flip_photos', slot=n, kind='photo', path=f, caption=p['caption']))
    return out

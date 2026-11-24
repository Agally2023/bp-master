"""Draft comments from the numbers. These are STARTING TEXT; people edit or clear them in the app."""
from __future__ import annotations
import pandas as pd

def _pp(a, b):
    return None if a is None or b is None else (a - b) * 100

def workstation(trend, nc: pd.DataFrame, reasons: pd.Series):
    cur = trend[-1][1]; prev = trend[-2][1] if len(trend) > 1 else None
    d = _pp(cur, prev)
    if d is None or abs(d) < 1:
        head = "No significant change compared to last week"
    else:
        head = f"{'Increase' if d > 0 else 'Decline'} of {abs(d):.0f} percentage points compared to last week"
    lines = [head]
    if len(nc):
        lines.append(f"{len(nc)} audit(s) did not attain 100% compliance this week.")
    if len(reasons):
        top = '; '.join(f"{r} ({n})" for r, n in reasons.items())
        lines.append(f"Main reasons: {top}.")
    lines.append("[Add your own comment / corrective action here]")
    return lines

def day3(sub: pd.DataFrame, year, week, target=0.97):
    if sub.empty:
        return [f"No Day-3 recounts were recorded in week {week}.", "[Add comment]"]
    s = sub.survival; n = len(sub)
    above_t = int((s >= target).sum()); over = int((s > 1.05).sum())
    lo = sub.loc[s.idxmin()]; hi = sub.loc[s.idxmax()]
    lines = [f"In week {week}, {above_t} of {n} hapas recounted met the {target:.0%} target; {over} were above 105%"
             + (", a signal of possible pond overstocking." if over else "."),
             f"Minimum and maximum survival were {lo.survival:.0%} ({lo.unit}) and {hi.survival:.0%} ({hi.unit}), respectively."]
    low = sub[s < target]
    if len(low):
        lines.append(f"Below target: " + ", ".join(f"{u} ({v:.1%})" for u, v in zip(low.unit, low.survival)) + ".")
    lines.append("[Add likely causes, e.g. fry size variation, bottom mortalities]")
    return lines

def bottom_rope(g: pd.DataFrame, week: int):
    if week not in g.index:
        return [f"No bottom rope audits were recorded in week {week}.", "[Add comment]"]
    r = g.loc[week]
    status = "still fail" if r.failed > 0 else "meets the standard"
    return [f"Total of {int(r.audited)} hapas were audited; {int(r.failed)} failed the audit metrics, a non-conformance of {r.nc_pct:.1%} ({status}).",
            "[Add comment]"]

def biosecurity(overall, cat):
    cur = overall[-1][1]; prev = overall[-2][1] if len(overall) > 1 else None
    if cur is None: return ['No scored biosecurity audits this week yet.', '[Add comment]']
    trend = '' if prev is None else (f", {'up' if cur > prev else 'down'} from {prev:.0%} last week" if abs(cur - prev) >= 0.01 else ', unchanged from last week')
    lines = [f"Overall performance is {cur:.0%}{trend}."]
    if len(cat):
        lo = cat.index[0]; lines.append(f"Lowest category: {lo} at {cat.iloc[0]['mean']:.0%}.")
    lines.append("[Add comment]")
    return lines

def ras_water(rows, r, n, week):
    if r is None:
        return [f"Not enough days with both water volume and parasite data in week {week} to compute a correlation.", "[Add comment]"]
    strength = 'weak' if abs(r) < 0.4 else ('moderate' if abs(r) < 0.7 else 'strong')
    return [f"The correlation between the volume of water exchanged in the RAS and parasite prevalence for week {week} is {r:.2f} ({strength}, n = {n} days).",
            "Only a few days are available, so interpret with caution." if n < 10 else "",
            "[Add comment / next step]"] if False else [
            f"The correlation between the volume of water exchanged in the RAS and parasite prevalence for week {week} is {r:.2f} ({strength}, n = {n} days"
            + ("; too few days to be conclusive)." if n < 10 else ")."), "[Add comment / next step]"]

def parasitology(p, i, by_stage, week, ras):
    if p is None:
        return [f"No {ras} parasitology samples were recorded in week {week}.", "[Add comment]"]
    lines = [f"The average parasite prevalence across the islands in {ras} was {p:.0%} (intensity {i:.1f} parasites per infected sample)."]
    if by_stage:
        lines.append("By stage: " + ", ".join(f"{s} {v:.0%}" for s, v in sorted(by_stage.items(), key=lambda x: -x[1])) + ".")
    lines.append("[Add comment]")
    return lines

def _stale(df):
    a = getattr(df, 'attrs', {}).get('asof')
    return f"Week {a[1]} data shown: no newer records have been entered yet." if a and a[2] else None

def stocking(daily):
    v = daily['variance']
    ok = int((v.abs() <= 0.05).sum())
    return [x for x in [_stale(daily), f"The daily average variance ranged from {v.min():.1%} to {v.max():.1%}; {ok} of {len(v)} days were within the ±5% limit.",
            "[Add comment]"] if x]

def transfers(t):
    if t.empty:
        return ["No fry transfers were audited this week.", "[Add comment]"]
    lo, hi = t['temp_var_min'].min(), t['temp_var_max'].max()
    return [x for x in [_stale(t), f"Temperature variance between incubation water and pond water ranged from {lo:.1f} to {hi:.1f}°C across {int(t['n'].sum())} audited hapa stockings.",
            "[Add comment, e.g. acclimation practice]"] if x]

def egg(trend, low, total, mixed):
    cur = trend[-1][1]; prev = trend[-2][1] if len(trend) > 1 else None
    cmp_ = '' if prev is None or cur is None else (f", {'an improvement' if cur > prev + 0.05 else 'a decline' if cur < prev - 0.05 else 'no real change'} compared with last week ({prev:.2f})")
    return [f"The weekly average egg stage separation was {cur:.2f}{cmp_}." if cur is not None else "No egg separation ratings this week.",
            (f"About {len(low)} of {total} jars scored 0-2 stars; {mixed} of them had mixed stages." + (f" (Jars: {_stale(low)[:-1]})" if _stale(low) else "")), "[Add comment]"]

def flipping(week, progress, overdue, total=None):
    """Pond flipping is progressive: list every pond still in progress, whatever week it started in."""
    lines = []
    for kind in ('Nursery', 'Broodstock'):
        p = progress.get(kind.lower(), [])
        n = (total or {}).get(kind.lower())
        names = {pn for pn, _, d in p}; late = sorted({o[0] for o in overdue if o[0] in names})
        lines.append(f"{kind}: " + (f"{len(p)} pond(s) in progress, {len(late)} delayed" + (": " + ', '.join(late) if late else "") + "." if p else "no pond in progress."))
    if overdue:
        lines.append("Stages above expected days: " + "; ".join(f"{p} {s} {d}d (exp. {e}d)" for p, s, d, e in overdue[:6]) + ('...' if len(overdue) > 6 else '.'))
    lines.append("[Add comment]")
    return lines

def hapa_exchange(pns, bs, week, last_pns=None, last_bs=None):
    """Two separate figures: nursery (PNS) and broodstock (BS). A unit with nothing scheduled this week reports its last recorded week."""
    f = lambda x: f"{x:.0%}"
    def one(series, last, name):
        v = series[-1][1] if series else None
        if v is not None: return f"{name} was {f(v)}"
        return f"{name}: no exchanges scheduled in week {week} (last recorded week {last[0]}: {f(last[1])})" if last else f"{name}: no exchanges recorded"
    return [f"Hapa exchange compliance: {one(pns, last_pns, 'nursery (PNS)')}; {one(bs, last_bs, 'broodstock (BS) ponds')}.", "[Add comment]"]


def brood(bd, week):
    """Sex ratio (standard 3 females : 1 male) and stocking density (target kg/m2) for the broodstock hapas recounted."""
    def one(name, last, this_week, fmt):
        if last is None: return f"{name}: no recounts recorded"
        return f"{name} {fmt(last[1])}" + ('' if this_week and last[0] == week else f" (no recounts in week {week}; last recorded week {last[0]})")
    sr = one('sex ratio was', bd['last_ratio'], bd['this_week'], lambda v: f"{v:.2f}:1, {v / 3:.0%} of the 3:1 standard")
    de = one('mean stocking density was', bd['last_density'], bd['this_week'], lambda v: f"{v:.2f} kg/m2, {v / bd['target_density']:.0%} of the {bd['target_density']:g} kg/m2 target")
    return [f"Broodstock {sr}; {de}." + (f" {bd['hapas']} hapas were recounted this week." if bd['this_week'] else ''), "[Add comment]"]


def rope_analysis(nur_rows, nur_n, bro_rows, bro_n):
    out = []
    for nm, rows, n in (('Nursery', nur_rows, nur_n), ('Broodstock', bro_rows, bro_n)):
        if not n: out.append(f"{nm}: no bottom rope audits recorded."); continue
        if not rows: out.append(f"{nm}: all {n} audited hapas conform."); continue
        ponds = sorted({r[0] for r in rows}); mets = {}
        for r in rows:
            for part in r[2].split(', '): mets[part.split(' (')[0]] = mets.get(part.split(' (')[0], 0) + 1
        out.append(f"{nm}: {len(rows)} of {n} hapas failed; ponds affected: {', '.join(ponds)}; most common failed metric: {max(mets, key=mets.get)} ({mets[max(mets, key=mets.get)]} hapas).")
    return out + ['[Add comment]']

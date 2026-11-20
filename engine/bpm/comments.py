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

def stocking(daily):
    v = daily['variance']
    ok = int((v.abs() <= 0.05).sum())
    return [f"The daily average variance ranged from {v.min():.1%} to {v.max():.1%}; {ok} of {len(v)} days were within the ±5% limit.",
            "[Add comment]"]

def transfers(t):
    if t.empty:
        return ["No fry transfers were audited this week.", "[Add comment]"]
    lo, hi = t['temp_var_min'].min(), t['temp_var_max'].max()
    return [f"Temperature variance between incubation water and pond water ranged from {lo:.1f} to {hi:.1f}°C across {int(t['n'].sum())} audited hapa stockings.",
            "[Add comment, e.g. acclimation practice]"]

def egg(trend, low, total, mixed):
    cur = trend[-1][1]; prev = trend[-2][1] if len(trend) > 1 else None
    cmp_ = '' if prev is None or cur is None else (f", {'an improvement' if cur > prev + 0.05 else 'a decline' if cur < prev - 0.05 else 'no real change'} compared with last week ({prev:.2f})")
    return [f"The weekly average egg stage separation was {cur:.2f}{cmp_}." if cur is not None else "No egg separation ratings this week.",
            f"About {len(low)} of {total} jars scored 0-2 stars; {mixed} of them had mixed stages.", "[Add comment]"]

def flipping(week, flipped, overdue):
    lines = []
    for kind in ('Nursery', 'Broodstock'):
        f = flipped.get(kind.lower(), [])
        lines.append(f"{kind}: " + (f"ponds flipped in week {week}: {', '.join(f)}." if f else f"no pond was flipped in week {week}."))
    if overdue:
        lines.append("Stages above expected days: " + "; ".join(f"{p} {s} {d}d (exp. {e}d)" for p, s, d, e in overdue[:6]) + ('...' if len(overdue) > 6 else '.'))
    lines.append("[Add comment]")
    return lines

def hapa_exchange(pns, bs, week):
    a = pns[-1][1]; b = bs[-1][1]
    f = lambda x: 'n/a' if x is None else f"{x:.0%}"
    return [f"Hapa exchange compliance for the nursery (PNS) was {f(a)} and for the broodstock (BS) ponds was {f(b)} in week {week}.", "[Add comment]"]

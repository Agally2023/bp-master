"""Fill the Victory Farms weekly template. Charts stay native/editable; tables replace the Excel screenshots."""
from __future__ import annotations
import copy, datetime as dt, re
from pptx import Presentation
from pptx.chart.data import CategoryChartData
from pptx.dml.color import RGBColor
from pptx.util import Emu, Pt
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR

def shape(slide, name, nth=0):
    hits = [s for s in slide.shapes if s.name == name]
    return hits[nth]

def set_lines(sh, lines, size=None):
    """Replace text keeping the first paragraph's formatting (bullets, font, size)."""
    tf = sh.text_frame
    proto = copy.deepcopy(tf.paragraphs[0]._p)
    for r in proto.findall('{http://schemas.openxmlformats.org/drawingml/2006/main}r')[1:]:
        proto.remove(r)
    body = tf._txBody
    for p in list(body.findall('{http://schemas.openxmlformats.org/drawingml/2006/main}p')):
        body.remove(p)
    for line in lines:
        p = copy.deepcopy(proto)
        runs = p.findall('{http://schemas.openxmlformats.org/drawingml/2006/main}r')
        if runs:
            runs[0].find('{http://schemas.openxmlformats.org/drawingml/2006/main}t').text = line
            if size:
                A = '{http://schemas.openxmlformats.org/drawingml/2006/main}'
                rpr = runs[0].find(A + 'rPr')
                if rpr is None:
                    from lxml import etree
                    rpr = etree.SubElement(runs[0], A + 'rPr'); runs[0].remove(rpr); runs[0].insert(0, rpr)
                rpr.set('sz', str(int(size * 100)))
        body.append(p)

def _detach_external(chart):
    from pptx.oxml.ns import qn
    part = chart.part
    ext = part._element.find(qn('c:externalData'))
    if ext is not None:
        rid = ext.get(qn('r:id'))
        part._element.remove(ext)
        part.drop_rel(rid)

def _no_overlay(ax):
    """Axis titles must reserve their own space instead of drawing over the tick labels."""
    from pptx.oxml.ns import qn
    from lxml import etree
    t = ax._element.find(qn('c:title'))
    if t is None: return
    ov = t.find(qn('c:overlay'))
    if ov is None:
        ov = etree.SubElement(t, qn('c:overlay'))
        lay = t.find(qn('c:layout'))
        (lay.addnext(ov) if lay is not None else t.find(qn('c:tx')).addnext(ov))
    ov.set('val', '0')

def replace_chart(sh, cats, vals, fmt, title=None, xt=None, yt=None):
    """vals: list of numbers (single series, keeps its name) or list of (name, values) for multi-series charts."""
    _detach_external(sh.chart)
    cd = CategoryChartData(number_format=fmt)
    cd.categories = cats
    if vals and isinstance(vals[0], tuple):
        for name, v in vals:
            cd.add_series(name, [None if x is None or x != x else float(x) for x in v])
    else:
        cd.add_series(sh.chart.plots[0].series[0].name, vals)
    sh.chart.replace_data(cd)
    ch = sh.chart
    if len(ch.plots[0].series) == 1 and 'LINE' in str(ch.chart_type):          # a single line is always Victory Farms green
        se = ch.plots[0].series[0]; g = RGBColor(0x0E, 0x81, 0x2E)
        se.format.line.color.rgb = g
        try:
            se.marker.format.fill.solid(); se.marker.format.fill.fore_color.rgb = g; se.marker.format.line.color.rgb = g
        except Exception:
            pass
    for ax, t in ((ch.category_axis, xt), (ch.value_axis, yt)):               # label both axes
        if t:
            ax.has_title = True; ax.axis_title.text_frame.text = t
            r = ax.axis_title.text_frame.paragraphs[0].runs[0]; r.font.size = Pt(10); r.font.bold = True
            _no_overlay(ax)
    if title and sh.chart.has_title:
        tf = sh.chart.chart_title.text_frame
        tf.text = title

def table(slide, anchor, header, rows, widths, header_fill, font=8, total_last=False, align=None, fill_fn=None, width=None, color_fn=None):
    """Native table drawn over the screenshot's position; the old picture is removed by the caller."""
    L, T, W = anchor.left, anchor.top, (width or anchor.width)
    rh = Emu(int(font * 12700 * 2.1))
    gs = slide.shapes.add_table(len(rows) + 1, len(header), L, T, W, Emu(rh * (len(rows) + 1)))
    tbl = gs.table
    tot = sum(widths)
    for i, w in enumerate(widths):
        tbl.columns[i].width = Emu(int(W * w / tot))
    tblPr = tbl._tbl.tblPr
    for k in ('bandRow', 'firstRow'):
        tblPr.set(k, '0')
    sid = tblPr.find('{http://schemas.openxmlformats.org/drawingml/2006/main}tableStyleId')
    if sid is not None:
        sid.text = '{5940675A-B579-460E-94D1-54222C63F5DA}'      # "No Style, Table Grid"
    def cell(r, c, text, bold=False, fill=None, color=None, al=PP_ALIGN.LEFT):
        ce = tbl.cell(r, c)
        ce.margin_left = ce.margin_right = Emu(45720); ce.margin_top = ce.margin_bottom = Emu(18000)
        ce.vertical_anchor = MSO_ANCHOR.MIDDLE
        ce.text = '' if text is None else str(text)
        p = ce.text_frame.paragraphs[0]; p.alignment = al
        for run in p.runs:
            run.font.size = Pt(font); run.font.bold = bold; run.font.name = 'Calibri'
            if color: run.font.color.rgb = color
        if fill is not None:
            ce.fill.solid(); ce.fill.fore_color.rgb = fill
        else:
            ce.fill.background()
    isnum = lambda v: bool(re.fullmatch(r'[\(\-–]?\s*[\d.,]+\s*(%|x)?\)?', str(v).strip())) if v is not None else False
    numcol = [bool(rows) and sum(isnum(r[c]) for r in rows) >= max(1, len(rows) // 2) for c in range(len(header))]   # numbers right-aligned (Victory Farms template)
    for c, h in enumerate(header):
        cell(0, c, h, True, header_fill[0], header_fill[1], PP_ALIGN.RIGHT if numcol[c] else PP_ALIGN.CENTER)
    for r, row in enumerate(rows, 1):
        last = total_last and r == len(rows)
        for c, v in enumerate(row):
            al = PP_ALIGN.RIGHT if numcol[c] and isnum(v) else (align[c] if align else PP_ALIGN.LEFT)
            f = fill_fn(r, c, v) if fill_fn else None
            tc = color_fn(r, c, v) if color_fn else None
            cell(r, c, v, bold=last or bool(tc), fill=f or (RGBColor(0xDD, 0xEB, 0xF7) if last else None), color=tc, al=al)
    for i in range(len(rows) + 1):
        tbl.rows[i].height = rh
    return gs

BLUE_DARK = (RGBColor(0x00, 0x20, 0x60), RGBColor(0xFF, 0xFF, 0xFF))
BLUE_LIGHT = (RGBColor(0xBD, 0xD7, 0xEE), RGBColor(0x00, 0x00, 0x00))

def drop_slides(prs, keep):
    lst = prs.slides._sldIdLst
    for i, sid in reversed(list(enumerate(list(lst), 1))):
        if i not in keep:
            prs.part.drop_rel(sid.rId); lst.remove(sid)

def build(template, out, year, week, report_date, ws_trend, ws_nc, comments, d3_sub, d3_title, br, extra=None):
    prs = Presentation(template)
    S = lambda n: prs.slides[n - 1]
    # --- cover
    cover = S(1)
    for sh in cover.placeholders:
        if sh.has_text_frame and 'Week' in sh.text_frame.text:
            for p in sh.text_frame.paragraphs:
                for r in p.runs:
                    r.text = re.sub(r'Week\s*\d+', f'Week {week}', r.text)
        elif sh.has_text_frame and re.search(r'\d+\s*/\s*\d+', sh.text_frame.text):
            runs = [r for p in sh.text_frame.paragraphs for r in p.runs]
            runs[0].text = report_date.strftime('%d/%m/%Y')
            for r in runs[1:]: r.text = ''
    # --- slide 2: workstation compliance
    s = S(2)
    cats = [f' Wk {w} ' for w, _ in ws_trend]
    replace_chart(shape(s, 'Chart 6'), cats, [v for _, v in ws_trend], '0%', xt='ISO week', yt='Compliance (%)')
    cur = ws_trend[-1][1]
    shape(s, 'Oval 9').text_frame.paragraphs[0].runs[0].text = f'{cur:.1%}'
    pic = shape(s, 'Picture 5'); anchor = pic
    _nc0 = ws_nc
    ws_nc = ws_nc.sort_values(['score', 'audit_date'])           # worst audits first
    rows = [[r.audit_date.strftime('%d/%m/%Y'), r.ras, f'{r.score:.1%}', r.noncompliant_island or '', r.employee_responsible or '', r.reason or '']
            for r in ws_nc.itertuples()]
    more = max(0, len(rows) - 6); rows = rows[:6]
    if rows:
        g = table(s, anchor, ['Date', 'RAS', 'Score (%)', 'Name of non-compliant island', 'Employee responsible', 'Reason for non-compliance'],
                  rows, [9, 6, 6, 21, 21, 37], BLUE_DARK, font=7)
        asof_note(s, anchor, _nc0, week)
        bottom = g.top + g.height
    else:
        bottom = anchor.top
    pic._element.getparent().remove(pic._element)
    box = shape(s, 'TextBox 12')
    box.top = Emu(max(box.top, bottom + 150000)); box.height = Emu(1500000)
    lines = comments['workstation'] + ([f'(+{more} more audits - see app)'] if more else [])
    set_lines(box, lines, size=14)
    # --- slide 8: day-3 recounts
    s = S(8)
    replace_chart(shape(s, 'Chart 2'), list(d3_sub.unit), [float(v) for v in d3_sub.survival], '0.0%', d3_title, xt='Pond-Hapa unit', yt='3-day survival (%)')
    set_lines(shape(s, 'TextBox 23'), comments['day3'], size=14)
    # --- slide 12: bottom rope
    s = S(12)
    for key, chart_name, pic_name, box_name in (('nursery', 'Chart 7', 'Picture 6', 'TextBox 31'), ('broodstock', 'Chart 14', 'Picture 10', 'TextBox 16')):
        g, by_pond = br[key]
        wk = list(range(max(1, week - 11), week + 1))                       # last 12 weeks
        vals = [float(g.loc[w, 'nc_pct']) if w in g.index else None for w in wk]
        bar_replace(shape(s, chart_name), [f'Wk {w}' for w in wk], vals, '0%', f'Bottom rope non-conformance: % of hapas failed ({key.capitalize()})', 'ISO week', 'Hapas failed the audit (%)')
        pic = shape(s, pic_name)
        bp = by_pond.sort_values(['failed', 'audited'], ascending=False)
        if len(bp) > 5:
            head, rest = bp.iloc[:5], bp.iloc[5:]
            body = [[i, *r] for i, r in zip(head.index, head.values.tolist())]
            body.append([f'Other ponds ({len(rest)})', *rest.sum().astype(int).tolist()])
        else:
            body = [[i, *r] for i, r in zip(bp.index, bp.values.tolist())]
        body.append(['Grand total', *bp.sum().astype(int).tolist()])
        num = [PP_ALIGN.LEFT] + [PP_ALIGN.CENTER] * 6
        table(s, pic, ['Pond', 'Hapas audited (no.)', 'Hapas failed (no.)', 'Failed: position (no.)', 'Failed: missing hook (no.)', 'Failed: not tied (no.)', 'Failed: missing posts (no.)'],
              body, [10, 9, 9, 9, 11, 9, 11], BLUE_LIGHT, total_last=True, align=num)
        asof_note(s, pic, by_pond, week)
        pic._element.getparent().remove(pic._element)
        set_lines(shape(s, box_name), comments[f'bottom_rope_{key}'], size=14)
    keep = {1, 2, 8, 12, 13}
    protos = {'title': copy.deepcopy([sh for sh in S(12).shapes if sh.name == 'Text Placeholder 1' and sh.left < 1000000][0]._element), 'oval': copy.deepcopy(shape(S(9), 'Oval 11')._element), 'box': copy.deepcopy(shape(S(9), 'TextBox 18')._element)}
    if extra:
        keep |= batch2(prs, year, week, comments, extra)
        keep |= batch3(prs, year, week, comments, extra)
    if extra and 'hapa' in extra:
        add_hapa_slide(prs, year, week, comments, extra['hapa'], protos)   # appended as slide 14, moved before back cover below
        keep.add(len(prs.slides))
    drop_slides(prs, keep=keep)
    if extra and 'hapa' in extra:
        lst = prs.slides._sldIdLst; items = list(lst)
        lst.remove(items[-1]); lst.insert(len(items) - 2, items[-1])
    prs.core_properties.title = f'VF BP Week {week} Report'
    prs.save(out)


GOOD = RGBColor(0xC6, 0xEF, 0xCE); AVG = RGBColor(0xFF, 0xEB, 0x9C); POOR = RGBColor(0xFF, 0xC7, 0xCE)

def _interp(vals):
    import pandas as pd
    return list(pd.Series(vals, dtype='float').interpolate(limit_area='inside'))

def batch2(prs, year, week, comments, x):
    """Slides 3 (biosecurity), 4 (RAS water), 6-7 (parasitology). Returns the slide numbers filled."""
    done = set(); S = lambda n: prs.slides[n - 1]
    if 'bio' in x:
        s = S(3); ov, cat = x['bio']['overall'], x['bio']['cat']
        chart = [sh for sh in s.shapes if sh.has_chart][0]
        weeks = [w for w, _ in ov]; v = [a for _, a in ov]
        replace_chart(chart, [str(w) for w in weeks], [('Shaded area (joins weeks without data)', _interp(v)),
                      ('Trend line (joins weeks without data)', _interp(v)), ('Overall rating', v)], '0%', xt='ISO week', yt='Biosecurity score (%)')
        pic = shape(s, 'Picture 6')
        rows = [[i, int(r['count']), f"{r['mean']:.1%}", x['bio']['band'](r['mean'])] for i, r in cat.iterrows()]
        n = int(cat['count'].sum()); tot = float(ov[-1][1])
        rows.append(['Overall', n, f'{tot:.1%}', x['bio']['band'](tot)])
        col = {'Good': GOOD, 'Average': AVG, 'Poor': POOR}
        table(s, pic, ['Category', 'Ratings (no.)', 'Average (%)', 'Rating'], rows, [14, 6, 8, 8], BLUE_DARK, font=9, total_last=True,
              align=[PP_ALIGN.LEFT] + [PP_ALIGN.CENTER] * 3, fill_fn=lambda r, c, v: col.get(v) if c == 3 else None)
        pic._element.getparent().remove(pic._element)
        set_lines(shape(s, 'TextBox 11'), comments['biosecurity'], size=14)
        done.add(3)
    if 'water' in x:
        s = S(4); rows = x['water']['rows']
        replace_chart(shape(s, 'Chart 5'), [d.strftime('%d-%b') for d, _, _ in rows],
                      [('Volume (x10^5 L)', [v / 1e5 if v == v else None for _, v, _ in rows]),
                       ('Avg prevalence: Eggs + Fry', [p if p == p else None for _, _, p in rows])], '0.000', xt='Date', yt='Volume (x10^5 L) / prevalence')
        set_lines(shape(s, 'TextBox 7'), comments['ras_water'], size=16)
        done.add(4)
    if 'para' in x:
        P = x['para']; s = S(6)
        cats = [f' Wk {w} ' for w in P['weeks']]
        for name, key, fmt in (('Chart 5', 'int', '0.0'), ('Chart 6', 'prev', '0%')):
            ser = [('New SOP Start', [None] * len(cats))] + [(st, P['stage'][st][key]) for st in P['stages']]
            replace_chart(shape(s, name), cats, ser, fmt, xt='ISO week', yt='Prevalence (%)' if '%' in fmt else 'Parasites per infected sample')
        set_lines(shape(s, 'TextBox 8'), comments['parasitology'], size=16)
        s = S(7); wk = [str(w) for w in P['island_weeks']]
        for name, key, fmt in (('Chart 8', 'prev', '0%'), ('Chart 9', 'int', '0.0')):
            replace_chart(shape(s, name), wk, [(i, P['island'][i][key]) for i in P['islands']], fmt, xt='ISO week', yt='Prevalence (%)' if '%' in fmt else 'Parasites per infected sample')
        done |= {6, 7}
    return done


def bar_replace(sh, cats, vals, fmt, title, xt, yt):
    """Swap a template line chart for a green clustered-column chart in the same place (percentage of hapas failed)."""
    from pptx.chart.data import CategoryChartData
    from pptx.enum.chart import XL_CHART_TYPE
    from pptx.util import Pt
    parent = sh._element.getparent(); l, t, w, h = sh.left, sh.top, sh.width, sh.height
    cd = CategoryChartData(number_format=fmt); cd.categories = cats
    cd.add_series('% hapas failed', [None if v is None or v != v else float(v) for v in vals])
    gf = None
    from pptx.shapes.shapetree import SlideShapes
    slide = sh.part.slide if hasattr(sh.part, 'slide') else None
    gf = slide.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, l, t, w, h, cd)
    parent.remove(sh._element)
    ch = gf.chart; ch.has_legend = False; ch.font.size = Pt(10)
    ch.has_title = True; ch.chart_title.text_frame.text = title; ch.chart_title.text_frame.paragraphs[0].runs[0].font.size = Pt(12); ch.chart_title.text_frame.paragraphs[0].runs[0].font.bold = True
    pl = ch.plots[0]; pl.gap_width = 60; pl.has_data_labels = True
    pl.data_labels.number_format = fmt; pl.data_labels.number_format_is_linked = False; pl.data_labels.font.size = Pt(9)
    se = pl.series[0]; se.format.fill.solid(); se.format.fill.fore_color.rgb = RGBColor(0x0E, 0x81, 0x2E)
    va = ch.value_axis; va.minimum_scale = 0; va.tick_labels.number_format = fmt; va.tick_labels.number_format_is_linked = False
    va.major_gridlines.format.line.color.rgb = RGBColor(0xD9, 0xD9, 0xD9)
    for ax, tx in ((ch.category_axis, xt), (va, yt)):
        ax.has_title = True; ax.axis_title.text_frame.text = tx
        r = ax.axis_title.text_frame.paragraphs[0].runs[0]; r.font.size = Pt(10); r.font.bold = True
    return gf

def asof_note(slide, anchor, df, week):
    """When a weekly table has no rows for the report week, it shows the latest earlier week: say so above the table."""
    a = getattr(df, 'attrs', {}).get('asof')
    if not a or not a[2]:
        return
    tb = slide.shapes.add_textbox(anchor.left, Emu(max(0, anchor.top - 210000)), anchor.width, Emu(200000))
    tf = tb.text_frame; tf.margin_left = tf.margin_top = tf.margin_bottom = 0; tf.word_wrap = True
    r = tf.paragraphs[0].add_run(); r.text = f'No Week {week} data yet - showing latest available: Week {a[1]}'
    r.font.size = Pt(9); r.font.italic = True; r.font.bold = True; r.font.color.rgb = RGBColor(0xC0, 0x00, 0x00)

def _drop_shape(sh):
    sh._element.getparent().remove(sh._element)

def batch3(prs, year, week, comments, x):
    done = set(); S = lambda n: prs.slides[n - 1]
    if any(k in x for k in ('stocking', 'transfers', 'egg')):
        s = S(9)
        if 'stocking' in x:
            d = x['stocking']; pic = shape(s, 'Picture 4')
            rows = [[i.strftime('%d/%m/%Y') if hasattr(i, 'strftime') else str(i), f'{r.abw:.4f}', f'{r.req:.0f}', f'{r.target:,.0f}', f'{r.actual:.1f}',
                     f'{r.variance:.1%}', f'{r.est:,.0f}', f"{r['diff']:,.0f}"] for i, r in d.iterrows()]
            table(s, pic, ['Date', 'Calc. ABW (g)', 'Required weight (g)', 'Target fry number (pcs)', 'Actual weight (g)', 'Variance (%)', 'Est. fry stocked (pcs)', 'Diff. (pcs)'],
                  rows, [9, 8, 10, 10, 10, 8, 10, 7], BLUE_DARK, font=8, align=[PP_ALIGN.LEFT] + [PP_ALIGN.CENTER] * 7)
            asof_note(s, pic, d, week); _drop_shape(pic); set_lines(shape(s, 'TextBox 17'), comments['stocking'], size=14)
        else:
            _drop_shape(shape(s, 'Picture 4')); _drop_shape(shape(s, 'TextBox 17'))
        if 'transfers' in x:
            t = x['transfers']; pic = shape(s, 'Picture 8')
            rng = lambda r, k: f"{r[k + '_min']:.1f} - {r[k + '_max']:.1f}"
            pz = x.get('transfer_parasites', {})   # {date: (intensity, prevalence)} - supplied by the auditor, '-' if not entered
            rows = [[i.strftime('%d/%m/%Y'), r.stock_time, rng(r, 'tray_temp'), rng(r, 'bucket_temp_wo'), rng(r, 'bucket_temp_w'), f"{r['pond_temp_min']:.1f}",
                     rng(r, 'temp_var'), *( (f'{pz[i][0]:.1f}', f'{pz[i][1]:.1%}') if i in pz else ('-', '-') )] for i, r in t.iterrows()]
            table(s, pic, ['Date', 'Stocking time', 'Tray temp (\u00b0C) min-max', 'Bucket, no fish (\u00b0C)', 'Bucket, with fish (\u00b0C)', 'Pond temp (\u00b0C)', 'Variance (<2) min-max', 'Parasite intensity', 'Parasite prevalence'],
                  rows or [['-'] * 9], [9, 9, 11, 11, 11, 8, 11, 9, 10], BLUE_DARK, font=8, align=[PP_ALIGN.LEFT] + [PP_ALIGN.CENTER] * 8)
            asof_note(s, pic, t, week); _drop_shape(pic); set_lines(shape(s, 'TextBox 13'), comments['transfers'], size=14)
        else:
            _drop_shape(shape(s, 'Picture 8')); _drop_shape(shape(s, 'TextBox 13'))
        if 'egg' in x:
            e = x['egg']
            replace_chart(shape(s, 'Chart 22'), [f' Wk {w} ' for w, _ in e['trend']], [v for _, v in e['trend']], '0.00', xt='ISO week', yt='ABP rating (1-5)')
            shape(s, 'Oval 11').text_frame.paragraphs[0].runs[0].text = f"{e['trend'][-1][1]:.2f}"
            pic = shape(s, 'Picture 15'); low = e['low']; _low0 = low; more = max(0, len(low) - 7); low = low.head(7)
            rows = [[r.date.strftime('%d/%m/%Y'), r.pond, r.incubator, f'{r.total_h:.1f}', f'{r.mixed_h:.1f}', f'{r.overall:.1%}', int(r.star)] for r in low.itertuples()]
            if more:
                rows.append([f'+{more} more', '', '', '', '', '', ''])
            table(s, pic, ['Date', 'Pond', 'Incubator', 'Total egg height (cm)', 'Mixed height (cm)', 'Overall (%)', 'Rating (stars)'],
                  rows or [['-'] * 7], [11, 7, 9, 12, 11, 9, 6], BLUE_DARK, font=7, align=[PP_ALIGN.LEFT] + [PP_ALIGN.CENTER] * 6, width=Emu(3700000),
                  color_fn=lambda r, c, v: RGBColor(0xFF, 0x00, 0x00) if c == 4 and v not in ('', '-') else None)  # mixed-stage height in red
            asof_note(s, pic, _low0, week); _drop_shape(pic); set_lines(shape(s, 'TextBox 20'), comments['egg'][1:], size=14)
            set_lines(shape(s, 'TextBox 18'), [comments['egg'][0]], size=14)
        else:
            for n in ('Chart 22', 'Oval 11', 'Picture 15', 'TextBox 20', 'TextBox 18', 'TextBox 21', 'Picture 19'):
                _drop_shape(shape(s, n))
        done.add(9)
    if 'flip' in x:
        s = S(10); F = x['flip']
        for pic_name, kind, label in (('Picture 2', 'broodstock', 'Broodstock ponds'), ('Picture 5', 'nursery', 'Nursery ponds')):
            piv, exp = F[kind]; pic = shape(s, pic_name)
            if piv.shape[1] == 0:
                _drop_shape(pic); continue
            ponds = list(piv.columns)[:14]
            rows = [[st, exp[st]] + [('-' if v != v or v is None else int(v)) for v in piv.loc[st, ponds]] for st in piv.index]
            header = [f'{label} - days per stage', 'Expected (days)'] + ponds
            def fill(r, c, v, rows=rows, exp=exp, piv=piv):
                if c >= 2 and v != '-' and v > rows[r - 1][1]:
                    return RGBColor(0xFF, 0x00, 0x00)
            table(s, pic, header, rows, [22, 7] + [6 if len(ponds) <= 10 else 5] * len(ponds), BLUE_DARK, font=8 if len(ponds) <= 10 else 7, align=[PP_ALIGN.LEFT] + [PP_ALIGN.CENTER] * (len(ponds) + 1), fill_fn=fill)
            _drop_shape(pic)
        set_lines(shape(s, 'TextBox 19'), comments['flipping'], size=14)
        done.add(10)
    return done

def add_hapa_slide(prs, year, week, comments, H, protos):
    from pptx.chart.data import CategoryChartData
    from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION
    from pptx.enum.shapes import PP_PLACEHOLDER
    ref = prs.slides[11]                                    # bottom rope slide -> same layout
    ns = prs.slides.add_slide(ref.slide_layout)
    for p in list(ns.placeholders):
        _drop_shape(p)
    ns.shapes._spTree.append(copy.deepcopy(protos['title'])); ttl = ns.shapes[-1]
    ttl.text_frame.paragraphs[0].runs[0].text = 'Pond Hapa Exchange Compliance'
    for r in ttl.text_frame.paragraphs[0].runs[1:]: r.text = ''
    ttl.width = Emu(7600000)
    pns, bs = H['pns'], H['bs']
    cd = CategoryChartData(number_format='0%'); cd.categories = [f'Wk {w}' for w, _ in pns]
    cd.add_series('PNS Exchange Rate', [v for _, v in pns]); cd.add_series('BS Exchange Rate', [v for _, v in bs])
    gf = ns.shapes.add_chart(XL_CHART_TYPE.LINE_MARKERS, Emu(300000), Emu(900000), Emu(7600000), Emu(3600000), cd)
    ch = gf.chart; ch.has_legend = True; ch.legend.position = XL_LEGEND_POSITION.BOTTOM; ch.legend.include_in_layout = False
    ch.has_title = False; ch.font.size = Pt(12)
    ch.category_axis.has_title = True; ch.category_axis.axis_title.text_frame.text = 'ISO week'; ch.value_axis.has_title = True; ch.value_axis.axis_title.text_frame.text = 'Exchanged / scheduled (%)'
    va = ch.value_axis; va.minimum_scale = 0.5; va.maximum_scale = 1.1; va.tick_labels.number_format = '0%'; va.tick_labels.number_format_is_linked = False
    va.major_gridlines.format.line.color.rgb = RGBColor(0xD9, 0xD9, 0xD9)
    for se, rgb in zip(ch.plots[0].series, (RGBColor(0xBF, 0x90, 0x00), RGBColor(0x1E, 0x7B, 0x3A))):
        se.format.line.color.rgb = rgb; se.format.line.width = Pt(2.25); se.smooth = False
        se.marker.format.fill.solid(); se.marker.format.fill.fore_color.rgb = rgb; se.marker.format.line.color.rgb = rgb
    for k, (series, rgb, top) in enumerate(((pns, RGBColor(0xBF, 0x90, 0x00), 1500000), (bs, RGBColor(0x1E, 0x7B, 0x3A), 2150000))):
        ns.shapes._spTree.append(copy.deepcopy(protos['oval'])); ov = ns.shapes[-1]
        ov.left, ov.top = Emu(8050000), Emu(top)
        ov.fill.solid(); ov.fill.fore_color.rgb = rgb
        v = series[-1][1]; lastrec = H.get('last_pns' if k == 0 else 'last_bs')
        ov.text_frame.paragraphs[0].runs[0].text = f'{v:.1%}' if v is not None else (f'Wk {lastrec[0]}: {lastrec[1]:.1%}' if lastrec else 'n/a')
    ns.shapes._spTree.append(copy.deepcopy(protos['box'])); bx = ns.shapes[-1]
    bx.left, bx.top, bx.width, bx.height = Emu(300000), Emu(4700000), Emu(7600000), Emu(900000)
    set_lines(bx, comments['hapa_exchange'], size=14)
"""Egg-separation 0-2 rating table for the weekly BP report (slide 9).

Drop into engine/bpm/ and call from the function in deck.py that fills the
egg separation slide, after the chart has been replaced:

    from .lowrated_table import fill_low_rated_table
    fill_low_rated_table(slide, egg_rows, total_jars)

egg_rows: iterable of dicts with keys
    date (datetime.date), week, pond, incubator, height, mixed,
    stage1 (0-1 or None), overall (0-1 or None), rating (0-5)
total_jars: number of jars audited that week (for the commentary line).
"""
from pptx.util import Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR

HEADERS = ["Date", "Week", "Pond ID", "Incubator No.", "Total Egg Height (cm)",
           "Mixed Stages Height (cm)", "% Stage 1", "% Overall Score", "Star Rating"]
COL_W = [0.13, 0.07, 0.10, 0.10, 0.13, 0.14, 0.10, 0.12, 0.11]
NAVY = RGBColor(0x0B, 0x2A, 0x5B)
RED = RGBColor(0xC0, 0, 0)
TABLE_NAME = "Egg Separation 0-2 Table"


def _fmt_num(v):
    if v is None:
        return ""
    return f"{v:g}" if isinstance(v, (int, float)) else str(v)


def _pct(v, dp):
    return "" if v is None else f"{v * 100:.{dp}f}%"


def _cell(c, text, bold=False, color=RGBColor(0, 0, 0), fill=None, size=7):
    c.margin_left = c.margin_right = Emu(30000)
    c.margin_top = c.margin_bottom = Emu(8000)
    c.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = c.text_frame.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    r = p.add_run()
    r.text = str(text)
    r.font.size, r.font.bold, r.font.color.rgb = Pt(size), bold, color
    if fill is not None:
        c.fill.solid(); c.fill.fore_color.rgb = fill
    else:
        c.fill.background()


def _find(slide, name):
    return next((s for s in slide.shapes if s.name == name), None)


def fill_low_rated_table(slide, rows, total_jars, max_rating=2,
                         picture_names=("Picture 15",),
                         marker_names=("Picture 19",),
                         note_name="TextBox 20"):
    low = sorted((r for r in rows if r["rating"] is not None and r["rating"] <= max_rating),
                 key=lambda r: (r["date"], str(r["pond"])))
    # slot = old table, else the pasted picture
    old = _find(slide, TABLE_NAME) or next((s for n in picture_names if (s := _find(slide, n))), None)
    if old is None:
        raise RuntimeError("slide has no egg-separation table slot "
                           f"(looked for {TABLE_NAME!r} and {picture_names})")
    L, T, W, H = old.left, old.top, old.width, old.height
    for s in [old] + [m for n in marker_names if (m := _find(slide, n))]:
        s._element.getparent().remove(s._element)

    mixed_n = sum(1 for r in low if (r["mixed"] or 0) > 0)
    if low:
        gf = slide.shapes.add_table(len(low) + 1, len(HEADERS), L, T, W, H)
        gf.name = TABLE_NAME
        t = gf.table
        t._tbl.tblPr.set("bandRow", "0"); t._tbl.tblPr.set("firstRow", "0")
        for i, w in enumerate(COL_W):
            t.columns[i].width = int(W * w)
        rh = int(min(H / (len(low) + 1), Emu(210000)))
        for row in t.rows:
            row.height = rh
        for j, h in enumerate(HEADERS):
            _cell(t.cell(0, j), h, True, RGBColor(255, 255, 255), NAVY, 6.5)
        for i, r in enumerate(low, 1):
            vals = [r["date"].strftime("%d/%m/%Y"), r["week"], r["pond"], r["incubator"],
                    _fmt_num(r["height"]), _fmt_num(r["mixed"] or 0),
                    _pct(r["stage1"], 1), _pct(r["overall"], 0), r["rating"]]
            for j, v in enumerate(vals):
                hot = j == 5 and (r["mixed"] or 0) > 0
                _cell(t.cell(i, j), v, hot, RED if hot else RGBColor(0, 0, 0),
                      RGBColor(0xF2, 0xF2, 0xF2) if i % 2 == 0 else None)
    else:
        tb = slide.shapes.add_textbox(L, T, W, Emu(400000)); tb.name = TABLE_NAME
        tb.text_frame.text = f"No jars rated 0-{max_rating} this week"

    note = _find(slide, note_name)
    if note is not None and note.has_text_frame:
        runs = note.text_frame.paragraphs[0].runs
        msg = (f"{len(low)} jars rated 0-{max_rating}; {mixed_n} with mixed stages "
               f"out of {total_jars} jars audited")
        if runs:
            runs[0].text = msg
            for extra in runs[1:]:
                extra.text = ""
    return {"low_rated": len(low), "mixed": mixed_n, "total": total_jars}

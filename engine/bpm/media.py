"""Post-processing of the built deck: analysed graphs replace native charts, 4-grid photo slides, excluded slides."""
from __future__ import annotations
import copy
from pathlib import Path
from pptx import Presentation
from pptx.util import Emu, Pt
from pptx.enum.text import PP_ALIGN
from pptx.dml.color import RGBColor
from PIL import Image

# section -> (text that identifies its slide, chart shape name or None = first chart)
SLIDE_KEY = {'workstation': ('Workstations Compli', None), 'biosecurity': ('Biosecurity and Hygiene', None), 'ras_water': ('RAS Water Volume', None),
             'parasitology': ('Incubation Parasitology', None), 'day3': ('hapas rec', None), 'eggs': ('Egg Stage', 'Chart 22'),
             'bottom_rope': ('Bottom Rope', None), 'hapa_exchange': ('Hapa Exchange', None), 'flipping': ('Pond Flipping Audit', None)}

def _texts(slide):
    return ' '.join(sh.text_frame.text for sh in slide.shapes if sh.has_text_frame)

def find_slide(prs, key):
    needle = SLIDE_KEY[key][0].lower()
    for i, s in enumerate(prs.slides):
        if needle in _texts(s).lower(): return i, s
    return None, None

def _fit(path, box):
    l, t, w, h = box; iw, ih = Image.open(path).size; sc = min(w / iw, h / ih)
    nw, nh = int(iw * sc), int(ih * sc); return Emu(l + (w - nw) // 2), Emu(t + (h - nh) // 2), Emu(nw), Emu(nh)

def replace_chart_with_picture(slide, path, name=None):
    charts = [sh for sh in slide.shapes if sh.has_chart and (name is None or sh.name == name)]
    if not charts: return False
    ch = charts[0]; box = (ch.left, ch.top, ch.width, ch.height); ch._element.getparent().remove(ch._element)
    l, t, w, h = _fit(path, box); slide.shapes.add_picture(path, l, t, w, h); return True

def move_slide(prs, old, new):
    lst = prs.slides._sldIdLst; el = list(lst)[old]; lst.remove(el); lst.insert(new, el)

def photo_slide(prs, after_idx, title, photos, layout_from):
    layout = prs.slides[layout_from].slide_layout; s = prs.slides.add_slide(layout)
    if s.shapes.title is not None: s.shapes.title.text = title
    else:
        tb = s.shapes.add_textbox(Emu(int(prs.slide_width * 0.04)), Emu(int(prs.slide_height * 0.03)), Emu(int(prs.slide_width * 0.9)), Emu(int(prs.slide_height * 0.09)))
        r = tb.text_frame.paragraphs[0].add_run(); r.text = title; r.font.size = Pt(28); r.font.bold = True; r.font.color.rgb = RGBColor(0x0E, 0x81, 0x2E)
    # remove empty placeholders except the title/number/footer
    for ph in list(s.placeholders):
        if ph.placeholder_format.type is not None and ph.has_text_frame and not ph.text_frame.text.strip() and ph != s.shapes.title and ph.placeholder_format.idx not in (12, 13, 11, 10):
            ph._element.getparent().remove(ph._element)
    # 2x2 grid with the photos tight against the centre line: left column right-aligned, right column left-aligned
    W, H = prs.slide_width, prs.slide_height; top = int(H * 0.13); gap = int(W * 0.012); cw = int(W * 0.46); chh = int(H * 0.31); pitch = int(H * 0.39); mid = int(W // 2)
    for i, (path, cap) in enumerate(photos[:4]):
        col, row = i % 2, i // 2
        x0 = mid - gap // 2 - cw if col == 0 else mid + gap // 2
        l, t, w, h = _fit(path, (x0, top + pitch * row, cw, chh))
        x = (x0 + cw - w) if col == 0 else x0          # hug the centre line
        y = top + pitch * row                           # all photos in a row share the top edge
        s.shapes.add_picture(path, Emu(x), Emu(y), Emu(w), Emu(h))
        if cap:
            tb = s.shapes.add_textbox(Emu(x), Emu(y + h + int(H * 0.005)), Emu(w), Emu(int(H * 0.05))); tf = tb.text_frame; tf.word_wrap = True
            p = tf.paragraphs[0]; p.alignment = PP_ALIGN.CENTER
            r = p.add_run(); r.text = cap; r.font.size = Pt(12); r.font.bold = True; r.font.color.rgb = RGBColor(0x26, 0x26, 0x26)
    move_slide(prs, len(prs.slides) - 1, after_idx + 1)

LOGO = Path(__file__).resolve().parent.parent / 'templates' / 'vf_logo.png'
ICON = Path(__file__).resolve().parent.parent / 'templates' / 'vf_icon.png'

def add_table_logos(prs):
    """Victory Farms V icon at the top right corner of slides that hold a table (not on every slide)."""
    if not ICON.exists(): return
    side = int(prs.slide_width * 0.058)
    for i, s in enumerate(prs.slides):
        if i == 0 or not any(getattr(sh, 'has_table', False) and sh.has_table for sh in s.shapes): continue
        x = prs.slide_width - side - int(prs.slide_width * 0.015); y = int(prs.slide_height * 0.015)
        for sh in s.shapes:                              # keep titles clear of the icon (the text wraps instead)
            if sh.has_text_frame and sh.top is not None and sh.top < y + side and sh.left + sh.width > x - int(prs.slide_width * 0.01) and sh.left < x:
                sh.width = Emu(x - int(prs.slide_width * 0.01) - sh.left); sh.text_frame.word_wrap = True
        pic = s.shapes.add_picture(str(ICON), Emu(x), Emu(y), Emu(side), Emu(side)); pic.name = 'VF Logo (table)'

def add_prep_slide(out, rows, month, anchor='flip'):
    """Native "Pond Preparation Scoring" table slide, placed after the pond-flipping slides. rows: dicts from bpm_pond_prep_scoring."""
    from . import deck
    if not rows: return
    prs = Presentation(out)
    last = max((i for i, s in enumerate(prs.slides) if anchor in _texts(s).lower()), default=None)
    if last is None: return
    layout = prs.slides[last].slide_layout; s = prs.slides.add_slide(layout)
    if s.shapes.title is not None: s.shapes.title.text = 'Pond Preparation Scoring'
    else:
        tb = s.shapes.add_textbox(Emu(int(prs.slide_width * 0.04)), Emu(int(prs.slide_height * 0.03)), Emu(int(prs.slide_width * 0.8)), Emu(int(prs.slide_height * 0.09)))
        r = tb.text_frame.paragraphs[0].add_run(); r.text = 'Pond Preparation Scoring'; r.font.size = Pt(28); r.font.bold = True; r.font.color.rgb = RGBColor(0x0E, 0x81, 0x2E)
    for ph in list(s.placeholders):
        if ph.has_text_frame and not ph.text_frame.text.strip() and ph != s.shapes.title and ph.placeholder_format.idx not in (12, 13, 11, 10):
            ph._element.getparent().remove(ph._element)
    pct = lambda v: '-' if v is None or v != v else f'{float(v) * 100:.1f}%'
    d8 = lambda v: '-' if not v else '/'.join(str(v)[:10].split('-')[::-1])
    rows = sorted(rows, key=lambda r: (r.get('overall_score') is None, r.get('overall_score') or 0))[:14]
    body = [[r['pond'], d8(r.get('flipping_date')), d8(r.get('stocking_date')), pct(r.get('prep_score')), pct(r.get('wq_score')), pct(r.get('post_score')), pct(r.get('overall_score')),
             '-' if r.get('rating') is None else f"{float(r['rating']):g}", r.get('action_points') or '-'] for r in rows]
    W, H = prs.slide_width, prs.slide_height
    anchor_box = type('A', (), dict(left=Emu(int(W * 0.04)), top=Emu(int(H * 0.15)), width=Emu(int(W * 0.92))))()
    def fill(r, c, v):
        if c in (3, 4, 5, 6) and v != '-':
            x = float(v[:-1]); return deck.GOOD if x >= 91 else deck.AVG if x >= 75 else deck.POOR
    deck.table(s, anchor_box, ['Pond', 'Flipped', 'Stocked', 'Preparation (%)', 'Water quality (%)', 'Post-stocking (%)', 'Overall (%)', 'Rating (0-5)', 'Action points'], body,
               [8, 10, 10, 10, 10, 10, 9, 8, 25], deck.BLUE_DARK, font=9, fill_fn=fill)
    note = s.shapes.add_textbox(Emu(int(W * 0.04)), Emu(int(H * 0.88)), Emu(int(W * 0.92)), Emu(int(H * 0.06)))
    note.text_frame.word_wrap = True; r = note.text_frame.paragraphs[0].add_run()
    r.text = f'Ponds flipped in {month}, lowest overall score first. Overall = average of preparation (stage KPIs met / 5) and post-stocking results.'; r.font.size = Pt(10); r.font.color.rgb = RGBColor(0x26, 0x26, 0x26)
    move_slide(prs, len(prs.slides) - 1, last + 1); prs.save(out)

def no_red_bars(prs):
    """No bar/column series may be red: recolour any explicitly red series fill to teal."""
    from pptx.enum.dml import MSO_FILL
    from pptx.dml.color import RGBColor
    for s in prs.slides:
        for sh in s.shapes:
            if not sh.has_chart or not any(k in str(sh.chart.chart_type) for k in ('COLUMN', 'BAR')): continue
            for pl in sh.chart.plots:
                for se in pl.series:
                    try:
                        f = se.format.fill
                        if f.type == MSO_FILL.SOLID and f.fore_color.type == 1:
                            r, g, b = f.fore_color.rgb[0], f.fore_color.rgb[1], f.fore_color.rgb[2]
                            if r > 170 and g < 90 and b < 90: f.fore_color.rgb = RGBColor(0x14, 0xA3, 0xA3)
                    except Exception:
                        pass

def restyle_tables(prs):
    """Victory Farms Excel template look for every table: navy (002060) header with bold white text,
    no grid, total row with a thin top rule, numbers right-aligned, entered values blue (0000FF), calculated columns black."""
    import re
    from lxml import etree
    A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
    NAVY, WHITE, BLUE = RGBColor(0x00, 0x20, 0x60), RGBColor(0xFF, 0xFF, 0xFF), RGBColor(0x00, 0x00, 0xFF)
    num = re.compile(r'[\(\-–]?\s*[\d.,]+\s*(%|x)?\)?$'); date = re.compile(r'\d{1,2}/\d{1,2}/\d{2,4}$')
    calc = re.compile(r'%|score|total|average|avg|rate|compliance|survival|overall|rating|variance|diff', re.I)
    def line(tag, on):
        ln = etree.Element(f'{{{A}}}{tag}')
        if on:
            ln.set('w', '9525'); sf = etree.SubElement(ln, f'{{{A}}}solidFill'); etree.SubElement(sf, f'{{{A}}}srgbClr').set('val', '000000')
        else:
            ln.set('w', '0'); etree.SubElement(ln, f'{{{A}}}noFill')
        return ln
    def borders(cell, top, bottom):
        tcPr = cell._tc.get_or_add_tcPr()
        for t in ('lnL', 'lnR', 'lnT', 'lnB'):
            for e in tcPr.findall(f'{{{A}}}{t}'): tcPr.remove(e)
        for i, (t, on) in enumerate((('lnL', 0), ('lnR', 0), ('lnT', top), ('lnB', bottom))): tcPr.insert(i, line(t, on))
    for s in prs.slides:
        for sh in s.shapes:
            if not (getattr(sh, 'has_table', False) and sh.has_table): continue
            tbl = sh.table; nr = len(tbl.rows); sid = tbl._tbl.tblPr.find(f'{{{A}}}tableStyleId')
            if sid is not None: sid.text = '{2D5ABB26-0587-4C30-8999-92F81FD0307C}'      # No Style, No Grid
            heads = [tbl.cell(0, c).text for c in range(len(tbl.columns))]
            for c, h in enumerate(heads):
                ce = tbl.cell(0, c); ce.fill.solid(); ce.fill.fore_color.rgb = NAVY; borders(ce, False, False)       # template banner row: navy, bold white
                for p in ce.text_frame.paragraphs:
                    for r in p.runs: r.font.bold = True; r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
            for r in range(1, nr):
                total = tbl.cell(r, 0).text.strip().lower() in ('total', 'overall')
                for c in range(len(tbl.columns)):
                    ce = tbl.cell(r, c); borders(ce, total, False); txt = ce.text.strip()
                    filled = ce.fill.type == 1 and ce.fill.fore_color.type == 1 and str(ce.fill.fore_color.rgb) not in ('DDEBF7', 'FFFFFF')
                    for p in ce.text_frame.paragraphs:
                        if num.match(txt): p.alignment = PP_ALIGN.RIGHT
                        for run in p.runs:
                            if total: run.font.bold = False; run.font.color.rgb = RGBColor(0, 0, 0)
                            elif filled: pass
                            elif (num.match(txt) and not calc.search(heads[c])) or date.match(txt): run.font.color.rgb = BLUE
                            else: run.font.color.rgb = RGBColor(0, 0, 0)
                    if total and not filled: ce.fill.background()

def _drop(prs, idx):
    lst = prs.slides._sldIdLst; sid = list(lst)[idx]; prs.part.drop_rel(sid.rId); lst.remove(sid)

def finish(out, week, images, exclude):
    prs = Presentation(out); by = {}
    for im in images: by.setdefault((im['section_key'], im['kind']), []).append(im)
    for key in SLIDE_KEY:                                   # analysed graph replaces the native chart
        for im in by.get((key, 'analysed_graph'), []):
            _, s = find_slide(prs, key)
            if s is not None: replace_chart_with_picture(s, im['path'], SLIDE_KEY[key][1])
    for key, title, anchor in (('flip_photos', 'Images of Flipped Ponds Progress', 'flipping'), ('bio_photos', 'Biosecurity Images', 'ras_water')):
        try:
            ph = sorted(by.get((key, 'photo'), []), key=lambda x: x['slot'])
            ti = next((i for i, s in enumerate(prs.slides) if _texts(s).strip().lower().startswith(title.lower())), None)   # the template's own picture slide holds last week's photos
            pos = ti if ti is not None else (find_slide(prs, anchor)[0] + 1 if find_slide(prs, anchor)[0] is not None else None)
            if pos is not None and ph and key not in exclude:
                chunks = [ph[k:k + 4] for k in range(0, len(ph), 4)]            # a new 2x2 grid slide for every 4 photos
                for n, c in enumerate(chunks):
                    photo_slide(prs, pos - 1 + n, title if n == 0 else f'{title} ({n + 1})', [(p['path'], p.get('caption') or '') for p in c], pos if ti is not None else pos - 1)
                if ti is not None: _drop(prs, ti + len(chunks))
            elif ti is not None: _drop(prs, ti)                              # no photos for this week: never show last week's pictures
        except Exception as e:
            from .pipeline import warn; warn('Picture grid ' + title, e)
    lst = prs.slides._sldIdLst
    for key in sorted(exclude & set(SLIDE_KEY), key=lambda k: 0):  # excluded sections lose their slide
        i, _ = find_slide(prs, key)
        if i is not None:
            sid = list(lst)[i]; prs.part.drop_rel(sid.rId); lst.remove(sid)
    from .pipeline import warn      # cosmetic passes must never stop the report from being produced
    for name, fn in (('Table styling', restyle_tables), ('Logos', add_table_logos), ('Chart colours', no_red_bars)):
        try: fn(prs)
        except Exception as e: warn(name, e)
    deck.apply_typography(prs)
    prs.save(out)

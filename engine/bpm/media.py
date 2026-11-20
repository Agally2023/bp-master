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

def add_table_logos(prs):
    """Victory Farms icon at the top right of every slide except the cover."""
    if not LOGO.exists(): return
    iw, ih = Image.open(LOGO).size; w = int(prs.slide_width * 0.055); h = int(w * ih / iw)
    for i, s in enumerate(prs.slides):
        if i > 0:   # every slide except the cover
            x = prs.slide_width - w - int(prs.slide_width * 0.015); y = int(prs.slide_height * 0.012)
            for sh in s.shapes:                          # keep titles clear of the logo (the text wraps instead)
                if sh.has_text_frame and sh.top is not None and sh.top < y + h and sh.left + sh.width > x - int(prs.slide_width * 0.01) and sh.left < x:
                    sh.width = Emu(x - int(prs.slide_width * 0.01) - sh.left); sh.text_frame.word_wrap = True
            pic = s.shapes.add_picture(str(LOGO), Emu(x), Emu(y), Emu(w), Emu(h)); pic.name = 'VF Logo (table)'

def finish(out, week, images, exclude):
    prs = Presentation(out); by = {}
    for im in images: by.setdefault((im['section_key'], im['kind']), []).append(im)
    for key in SLIDE_KEY:                                   # analysed graph replaces the native chart
        for im in by.get((key, 'analysed_graph'), []):
            _, s = find_slide(prs, key)
            if s is not None: replace_chart_with_picture(s, im['path'], SLIDE_KEY[key][1])
    for key, title, anchor in (('flip_photos', 'Images of Flipped Ponds Progress', 'flipping'), ('bio_photos', 'Biosecurity Images', 'biosecurity')):
        ph = sorted(by.get((key, 'photo'), []), key=lambda x: x['slot'])
        if ph and key not in exclude:
            i, _ = find_slide(prs, anchor)
            if i is not None: photo_slide(prs, i, title, [(p['path'], p.get('caption') or '') for p in ph], i)
    lst = prs.slides._sldIdLst
    for key in sorted(exclude & set(SLIDE_KEY), key=lambda k: 0):  # excluded sections lose their slide
        i, _ = find_slide(prs, key)
        if i is not None:
            sid = list(lst)[i]; prs.part.drop_rel(sid.rId); lst.remove(sid)
    add_table_logos(prs)
    prs.save(out)

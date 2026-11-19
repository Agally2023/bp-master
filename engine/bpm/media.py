"""Post-processing of the built deck: analysed graphs replace native charts, 4-grid photo slides, excluded slides."""
from __future__ import annotations
import copy
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
    W, H = prs.slide_width, prs.slide_height; top = Emu(int(H * 0.14)); gap = Emu(int(W * 0.015)); cw = Emu(int((W * 0.92 - gap) // 2)); chh = Emu(int(H * 0.33)); left = Emu(int(W * 0.04))
    for i, (path, cap) in enumerate(photos[:4]):
        x = left + (cw + gap) * (i % 2); y = top + (chh + Emu(int(H * 0.05))) * (i // 2)
        l, t, w, h = _fit(path, (x, y, cw, chh)); s.shapes.add_picture(path, l, t, w, h)
        if cap:
            tb = s.shapes.add_textbox(x, y + chh, cw, Emu(int(H * 0.04))); p = tb.text_frame.paragraphs[0]; p.alignment = PP_ALIGN.CENTER
            r = p.add_run(); r.text = cap; r.font.size = Pt(11); r.font.color.rgb = RGBColor(0x26, 0x26, 0x26)
    move_slide(prs, len(prs.slides) - 1, after_idx + 1)

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
    prs.save(out)

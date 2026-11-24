"""Smoke test: the weekly deck must build from real database rows (tests/fixtures_week47.json) for the latest week, the week before,
a week with no data at all, and when whole tables are empty. Run: python -m pytest tests/test_report_build.py  (needs python-pptx, pandas, pillow)."""
import json, os, sys, copy, tempfile
import pytest
HERE = os.path.dirname(__file__); ENGINE = os.path.join(HERE, '..', 'engine')
sys.path.insert(0, ENGINE); os.environ.setdefault('TEMPLATE', os.path.join(ENGINE, 'templates', 'VF_BP_Weekly_Template.pptx'))
import server                       # noqa: E402
from bpm import pipeline            # noqa: E402
from pptx import Presentation       # noqa: E402

T0 = json.load(open(os.path.join(HERE, 'fixtures_week47.json')))

def build(T, week):
    out = os.path.join(tempfile.mkdtemp(), 'r.pptx')
    pipeline.build_week(copy.deepcopy(T), 2026, week, out, server.TEMPLATE, server.STAGE_DEFS, {}, [], [], 'RAS2')
    return out, list(pipeline.WARNINGS)

@pytest.mark.parametrize('week', [47, 46, 45, 48])
def test_builds(week):
    out, warns = build(T0, week)
    assert len(Presentation(out).slides) >= 8
    assert not [w for w in warns if 'Final pass' in w or 'Typography' in w], warns

def test_week_without_records_shows_latest_week_note():
    T = copy.deepcopy(T0); T['egg_volumetric_jars'] = [r for r in T['egg_volumetric_jars'] if r['iso_week'] < 47]
    out, _ = build(T, 47)
    text = ' '.join(sh.text_frame.text for s in Presentation(out).slides for sh in s.shapes if sh.has_text_frame)
    assert 'No Week 47 data yet' in text

@pytest.mark.parametrize('empty', ['stocking_audits', 'fry_transfers', 'egg_volumetric_jars', 'egg_separation_ratings', 'bottom_rope_audits', 'workstation_audits', 'day3_recounts', 'biosecurity_audits'])
def test_empty_table_never_stops_the_report(empty):
    T = copy.deepcopy(T0); T[empty] = []
    out, _ = build(T, 47)
    assert os.path.getsize(out) > 10000

def test_fonts_are_calibri_12_dark():
    out, _ = build(T0, 46); import re
    for s in Presentation(out).slides:
        for sh in s.shapes:
            if getattr(sh, 'has_chart', False) and sh.has_chart:
                x = sh.chart._chartSpace.xml
                assert 'Calibri' in x and '262626' in x and not re.search(r'sz="(?!1200)\d+"', x)


def _titles(out):
    return [sh.text_frame.text for sl in Presentation(out).slides for sh in sl.shapes if sh.has_text_frame]

def test_broodstock_slide_present_and_excludable():
    out, w = build(T0, 47); assert not w
    assert any('Broodstock Stocking Density and Sex Ratio' in t for t in _titles(out))
    out2 = os.path.join(tempfile.mkdtemp(), 'r.pptx')
    pipeline.build_week(copy.deepcopy(T0), 2026, 47, out2, server.TEMPLATE, server.STAGE_DEFS, {}, [], ['brood_density', 'prep_scoring'], 'RAS2')
    assert not any('Broodstock Stocking Density and Sex Ratio' in t for t in _titles(out2))

def test_broodstock_comment_override():
    out = os.path.join(tempfile.mkdtemp(), 'r.pptx')
    pipeline.build_week(copy.deepcopy(T0), 2026, 47, out, server.TEMPLATE, server.STAGE_DEFS, {'brood_density': 'My custom broodstock note'}, [], [], 'RAS2')
    assert any('My custom broodstock note' in t for t in _titles(out))

def test_bottom_rope_analysis_slide():
    out, warns = build(T0, 47)
    text = ' '.join(sh.text_frame.text for s in Presentation(out).slides for sh in s.shapes if sh.has_text_frame)
    assert 'Bottom Rope Conformance and Failure Analysis' in text, warns
    assert not [w for w in warns if 'Bottom rope conformance' in w], warns

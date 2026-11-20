"""Phone-layout check in demo mode: drawer opens/closes, no horizontal page scroll on any page."""
import asyncio, glob, sys, os
from playwright.async_api import async_playwright
OUT = os.environ.get('OUT', '/tmp/')
A = '/mnt/user-data/attachments/cb1caadd-3e86-5118-8d81-c9eb497e3727/'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await pg.route('**/config.js', lambda r: r.fulfill(content_type='text/javascript', body='window.BPM_CONFIG={SUPABASE_URL:"",SUPABASE_ANON_KEY:"",REPORT_API_URL:"",IDLE_LOGOUT_MINUTES:0};'))
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_selector('#login form'); await pg.screenshot(path=OUT + 'm01_login.png')
        await pg.fill('input[type=email]', 'a@b.com'); await pg.fill('input[type=password]', 'x'); await pg.click('button[type=submit]'); await pg.wait_for_selector('#menu')
        async def overflow(tag):
            w = await pg.evaluate('[document.documentElement.scrollWidth, innerWidth]'); print(tag, 'scrollWidth/innerWidth', w, 'OK' if w[0] <= w[1] + 1 else 'HORIZONTAL OVERFLOW')
        assert not await pg.is_visible('#side') or (await pg.evaluate("document.querySelector('#side').getBoundingClientRect().right")) <= 0
        await pg.click('#menu'); await pg.wait_for_timeout(350); await pg.screenshot(path=OUT + 'm02_drawer.png')
        await pg.click('nav button[data-r=entry]'); await pg.wait_for_selector('.drop'); await pg.wait_for_timeout(350)
        assert not await pg.evaluate("document.querySelector('#app').classList.contains('nav-open')"), 'drawer should close on navigation'
        await pg.click('.modlist button:has-text("Import all")'); await pg.set_input_files('input[type=file]', [glob.glob(A + '*Fish_Transfers.xlsx')[0], glob.glob(A + '*Fry_To_Pond*')[0]])
        await pg.wait_for_selector('.imp .btn'); await pg.click('.imp .btn'); await pg.wait_for_selector('.imp .note')
        await overflow('entry'); await pg.screenshot(path=OUT + 'm03_entry.png', full_page=True)
        await pg.click('.modlist button:has-text("Pond Flipping")'); await pg.click('[role=tab]:has-text("Form"), button:has-text("Form")'); await pg.wait_for_selector('form.form'); await overflow('form'); await pg.screenshot(path=OUT + 'm04_form.png')
        for r in ['dashboard', 'reports']:
            await pg.click('#menu'); await pg.click(f'nav button[data-r={r}]'); await pg.wait_for_timeout(1200)
            if r == 'reports':
                await pg.select_option('.ctx select', '2026-46'); await pg.click('button:has-text("Create Week 46")'); await pg.wait_for_selector('details.sec')
            await overflow(r); print(await pg.evaluate("[...document.querySelectorAll('#view *')].filter(e=>e.getBoundingClientRect().right>392).slice(0,6).map(e=>e.tagName+'.'+e.className+' '+Math.round(e.getBoundingClientRect().right))")); await pg.screenshot(path=OUT + f'm05_{r}.png', full_page=True)
        await pg.click('#menu'); await pg.click('nav button[data-r=users]'); await pg.wait_for_timeout(600); await overflow('users')
        print('ERRORS:', errs); await b.close()
asyncio.run(main())

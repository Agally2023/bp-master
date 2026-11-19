import asyncio, glob, sys
from playwright.async_api import async_playwright
OUT='/tmp/claude-0/-home-claude/cb1caadd-3e86-5118-8d81-c9eb497e3727/scratchpad/'
A='/mnt/user-data/attachments/cb1caadd-3e86-5118-8d81-c9eb497e3727/'
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await b.new_page(viewport={'width':1440,'height':900})
        errs=[]; pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None); pg.on('pageerror',lambda e: errs.append('PAGEERR '+str(e)))
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_selector('#login form')
        await pg.screenshot(path=OUT+'01_login.png')
        await pg.fill('input[type=email]','audit@victoryfarms.com'); await pg.fill('input[type=password]','x'); await pg.click('button[type=submit]')
        await pg.wait_for_selector('.kpis, .card'); 
        await pg.select_option('.ctx select','2026-46'); await pg.wait_for_timeout(800)
        await pg.screenshot(path=OUT+'02_dash.png',full_page=True)
        await pg.click('#collapse'); await pg.wait_for_timeout(300); await pg.screenshot(path=OUT+'03_collapsed.png'); await pg.click('#collapse')
        await pg.click('nav button[data-r=entry]'); await pg.wait_for_selector('.drop'); await pg.screenshot(path=OUT+'04_entry_import.png')
        await pg.click('.modlist button:has-text("Incubation Workstation")'); await pg.wait_for_selector('form.form'); await pg.screenshot(path=OUT+'05_form.png')
        await pg.click('.modlist button:has-text("Pond Flipping")'); await pg.wait_for_selector('form.form'); await pg.screenshot(path=OUT+'06_flipform.png')
        await pg.click('.modlist button:has-text("Parasitology")'); await pg.wait_for_selector('form.form'); await pg.screenshot(path=OUT+'06b_para.png')
        # import test: upload real file to ALL
        await pg.click('.modlist button:has-text("Import all")'); 
        files=[glob.glob(A+'*Fish_Transfers.xlsx')[0], glob.glob(A+'*Fry_To_Pond*')[0]]
        await pg.set_input_files('input[type=file]',files); await pg.wait_for_selector('.imp .btn'); await pg.wait_for_timeout(1500)
        await pg.screenshot(path=OUT+'07_import_cards.png',full_page=True)
        await pg.click('.imp .btn'); await pg.wait_for_selector('.imp .note'); print('import note:',await pg.inner_text('.imp .note'))
        await pg.click('nav button[data-r=reports]'); await pg.wait_for_selector('.card button'); 
        await pg.select_option('.ctx select','2026-46'); await pg.wait_for_timeout(500)
        await pg.click('button:has-text("Create Week 46")'); await pg.wait_for_selector('.sec'); await pg.wait_for_timeout(800)
        await pg.screenshot(path=OUT+'08_report.png',full_page=True)
        print('ERRORS:',errs[:10]); await b.close()
asyncio.run(main())

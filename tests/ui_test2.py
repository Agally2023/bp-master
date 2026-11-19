import asyncio
from playwright.async_api import async_playwright
OUT='/tmp/claude-0/-home-claude/cb1caadd-3e86-5118-8d81-c9eb497e3727/scratchpad/'
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await b.new_page(viewport={'width':1440,'height':900})
        errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
        await pg.goto('http://localhost:8765/index.html'); await pg.fill('input[type=email]','a@b.c'); await pg.fill('input[type=password]','x'); await pg.click('button[type=submit]')
        await pg.click('nav button[data-r=entry]'); await pg.click('.modlist button:has-text("Incubation Workstation")'); await pg.wait_for_selector('form.form')
        await pg.fill('[name=audit_date]','2026-11-17'); await pg.fill('[name=ras]','RAS2'); await pg.fill('[name=total_islands]','6'); await pg.fill('[name=compliant_islands]','5')
        await pg.screenshot(path=OUT+'10_form_filled.png')
        n0=await pg.evaluate("0"); await pg.click('button:has-text("Save record")'); await pg.wait_for_timeout(500)
        await pg.fill('[name=audit_date]','2026-11-17'); await pg.fill('[name=ras]','RAS2'); await pg.fill('[name=total_islands]','6'); await pg.fill('[name=compliant_islands]','7'); await pg.click('button:has-text("Save record")')
        print('validation:', await pg.inner_text('.err-msg'))
        await pg.click('[role=tab]:has-text("Records")'); await pg.wait_for_timeout(400); print((await pg.inner_text('.card .muted')).split('\n')[0])
        await pg.screenshot(path=OUT+'11_records.png')
        await pg.click('.modlist button:has-text("Incubation Parasitology")'); await pg.click('[role=tab]:has-text("Form")'); await pg.screenshot(path=OUT+'12_para.png')
        print(errs); await b.close()
asyncio.run(main())

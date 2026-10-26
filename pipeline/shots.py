"""screenshots for a visual check: python pipeline/shots.py http://localhost:8000/index.html outdir [chapter ids, comma separated] [extra js]
Chapters are reached by id (cover, rivers, storms, ...). The optional 4th argument is JavaScript to run before each shot,
e.g. "window.__poli.select(5)" to open a district, or "window.__poli.play('2007314N10093')" to play Sidr."""
import sys, asyncio
from playwright.async_api import async_playwright
URL, OUT = sys.argv[1], sys.argv[2]
IDS = sys.argv[3].split(",") if len(sys.argv) > 3 and sys.argv[3] else None
JS = sys.argv[4] if len(sys.argv) > 4 else None
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--no-sandbox", "--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": 1440, "height": 860}); errs = []; cons = []
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: cons.append(m.text) if m.type == "error" else None)
        await pg.goto(URL); await pg.wait_for_timeout(8000)
        ids = IDS or await pg.evaluate("[...document.querySelectorAll('.step')].map(s=>s.dataset.id)")
        for cid in ids:
            await pg.evaluate(f"(() => {{ const el = [...document.querySelectorAll('.step')].find(s => s.dataset.id === '{cid}'); const p = document.getElementById('panel'); p.scrollTo({{ top: el.offsetTop - p.clientHeight * 0.2 }}); }})()")
            await pg.wait_for_timeout(2500)
            if JS: await pg.evaluate(JS); await pg.wait_for_timeout(2500)
            await pg.wait_for_timeout(3500)
            await pg.screenshot(path=f"{OUT}/{cid}.png", timeout=120000)
        print("page errors", errs[:3]); print("console errors", cons[:3]); await b.close()
asyncio.run(main())

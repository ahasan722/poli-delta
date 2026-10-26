"""screenshots of every chapter for a visual check: python pipeline/shots.py http://localhost:8790/index.html outdir"""
import sys, asyncio
from playwright.async_api import async_playwright
URL, OUT = sys.argv[1], sys.argv[2]
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=["--no-sandbox","--use-gl=swiftshader","--enable-webgl","--ignore-gpu-blocklist","--enable-unsafe-swiftshader"])
        pg=await b.new_page(viewport={"width":1200,"height":750}); errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(7000)
        n=await pg.evaluate("document.querySelectorAll('.step').length")
        for i in [int(x) for x in sys.argv[3].split(",")] if len(sys.argv)>3 else range(n):
            await pg.evaluate(f"document.querySelectorAll('.step')[{i}].scrollIntoView({{block:'center'}})"); await pg.wait_for_timeout(5000)
            await pg.screenshot(path=f"{OUT}/ch{i}.png", timeout=120000)
        print("errors", errs[:3]); await b.close()
asyncio.run(main())

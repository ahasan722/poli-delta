"""screenshots of the v5 scroll story: python pipeline/shots.py URL outdir [chapter indices, comma separated] [extra js]
Chapters are reached by index through window.__poli.go(i), which scrolls the page; the shot waits for the film to settle."""
import sys, asyncio
from playwright.async_api import async_playwright
URL, OUT = sys.argv[1], sys.argv[2]
IDS = [int(x) for x in sys.argv[3].split(",")] if len(sys.argv) > 3 and sys.argv[3] else list(range(9))
JS = sys.argv[4] if len(sys.argv) > 4 else None
W, H = (int(x) for x in (sys.argv[5] if len(sys.argv) > 5 else "1440x860").split("x"))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--no-sandbox", "--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": W, "height": H}); errs = []; cons = []
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: cons.append(m.text) if m.type == "error" else None)
        await pg.goto(URL); await pg.wait_for_timeout(9000)
        for i in IDS:
            # land in the middle of the chapter's hold, where its own animation is about half run
            await pg.evaluate(f"(() => {{ const span = innerHeight * 1.4; scrollTo(0, {i} * span + span * 0.5); }})()")
            await pg.wait_for_timeout(9000)
            if JS: await pg.evaluate(JS); await pg.wait_for_timeout(4000)
            await pg.screenshot(path=f"{OUT}/c{i}.png", timeout=120000)
        print("page errors", errs[:3]); print("console errors", cons[:3]); await b.close()
asyncio.run(main())

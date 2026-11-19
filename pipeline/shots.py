"""screenshots of the v6 steps: python pipeline/shots.py URL outdir [step indices, comma separated] [2d|3d] [WxH]
Each step is opened through window.__poli.go(i); the shot waits until the camera, the 2D/3D switch and the timeline have settled."""
import sys, asyncio
from playwright.async_api import async_playwright
URL, OUT = sys.argv[1], sys.argv[2]
IDS = [int(x) for x in sys.argv[3].split(",")] if len(sys.argv) > 3 and sys.argv[3] else list(range(9))
MODE = sys.argv[4] if len(sys.argv) > 4 else "3d"
W, H = (int(x) for x in (sys.argv[5] if len(sys.argv) > 5 else "1440x860").split("x"))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--no-sandbox", "--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": W, "height": H}, device_scale_factor=2); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.add_init_script("try { localStorage.setItem('poli-hint', '1'); } catch (e) {}")
        await pg.goto(f"{URL}#step=1&mode={MODE}"); await pg.wait_for_function("window.__poli && __poli.state.ready", timeout=90000)
        for i in IDS:
            await pg.evaluate(f"__poli.go({i})")
            await pg.wait_for_function("(() => { const P = __poli; return !P.flight && P.state.dimP === P.state.dimTarget && !P.state.tl.playing; })()", timeout=60000)
            await pg.wait_for_timeout(2500)
            await pg.screenshot(path=f"{OUT}/s{i}-{MODE}.png", timeout=120000)
        print("page errors", errs[:3]); await b.close()
asyncio.run(main())

"""functional walk of the page in headless Chromium: python pipeline/verify.py http://localhost:8000/index.html
Checks every chapter loads without a page error, the chapter strip and legend follow, the sea slider and
relief slider move their uniforms, Explore toggles orbit, and a phone-width viewport has no horizontal scroll."""
import sys, asyncio
from playwright.async_api import async_playwright
URL = sys.argv[1]
ARGS = ["--no-sandbox", "--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"]

async def main():
    fails = []
    def check(ok, msg):
        print(("ok   " if ok else "FAIL ") + msg)
        if not ok: fails.append(msg)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        pg = await b.new_page(viewport={"width": 1280, "height": 800}); errs = []; cons = []
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: cons.append(m.text) if m.type == "error" else None)
        await pg.goto(URL + "?lod=low"); await pg.wait_for_timeout(8000)
        check(await pg.evaluate("document.body.classList.contains('ready')"), "scene booted")
        n = await pg.evaluate("document.querySelectorAll('.step').length"); check(n == 18, f"{n} step sections (17 chapters + colophon)")
        navn = await pg.evaluate("document.querySelectorAll('#chapterNav a').length"); check(navn == 16, f"{navn} chapter links")
        for i in range(17):
            await pg.evaluate(f"document.querySelectorAll('.step')[{i}].scrollIntoView({{block:'center'}})"); await pg.wait_for_timeout(2600)
            ch = await pg.evaluate("window.__poli.state.chapter"); leg = await pg.evaluate("document.getElementById('legend').textContent.length")
            check(ch == i, f"chapter {i} active (got {ch}), legend {leg} chars")
            if i >= 1:
                on = await pg.evaluate("[...document.querySelectorAll('#chapterNav a.on')].map(a=>a.dataset.i)")
                check(on == [str(i)], f"  nav highlights {on}")
        # sea slider
        await pg.evaluate("document.querySelectorAll('.step')[10].scrollIntoView({block:'center'})"); await pg.wait_for_timeout(2600)
        before = await pg.evaluate("document.getElementById('seaPeople').textContent")
        await pg.evaluate("const r=document.getElementById('seaRange'); r.value=4; r.dispatchEvent(new Event('input',{bubbles:true}))"); await pg.wait_for_timeout(1200)
        after = await pg.evaluate("document.getElementById('seaPeople').textContent"); u = await pg.evaluate("window.__poli.terrain.uniforms.uSeaLevel.value")
        check(before != after and abs(u - 4) < 0.05, f"sea slider: {before} -> {after}, uSeaLevel {u:.2f}")
        # relief slider
        await pg.evaluate("const r=document.getElementById('exagRange'); r.value=30; r.dispatchEvent(new Event('input',{bubbles:true}))"); await pg.wait_for_timeout(1500)
        ex = await pg.evaluate("window.__poli.terrain.uniforms.uExag.value"); check(abs(ex - 30) < 0.5, f"relief slider sets uExag {ex:.1f}")
        # explore
        await pg.click("#freeBtn"); await pg.wait_for_timeout(300); free = await pg.evaluate("window.__poli.state.free"); check(free is True, "Explore toggles free mode")
        await pg.click("#freeBtn"); await pg.wait_for_timeout(300)
        # charts drawn
        for cid in ["chCover", "chSediment", "chLoss", "chSubsidence", "chExposure", "chDeaths", "chFloods"]:
            k = await pg.evaluate(f"document.querySelectorAll('#{cid} svg *').length"); check(k > 10, f"chart {cid}: {k} svg nodes")
        for nid in ["numLow10", "numLow5", "numPeople10", "numStorms", "numSund", "numHak", "numTan"]:
            t = await pg.evaluate(f"document.getElementById('{nid}').textContent"); check(t not in ("…", ""), f"number {nid} = {t}")
        fps = await pg.evaluate("window.__poli.state.frames"); print("frames rendered", fps)
        check(not errs, f"page errors: {errs[:2]}"); check(not cons, f"console errors: {cons[:2]}")
        # phone width
        m = await b.new_page(viewport={"width": 390, "height": 760}); merr = []; m.on("pageerror", lambda e: merr.append(str(e)))
        await m.goto(URL + "?lod=low"); await m.wait_for_timeout(7000)
        sw = await m.evaluate("document.documentElement.scrollWidth"); check(sw <= 390, f"phone: scrollWidth {sw}")
        navd = await m.evaluate("getComputedStyle(document.getElementById('chapterNav')).display"); check(navd == "none", f"phone: nav hidden ({navd})")
        await m.evaluate("document.querySelectorAll('.step')[6].scrollIntoView({block:'center'})"); await m.wait_for_timeout(2500)
        check(await m.evaluate("window.__poli.state.chapter") == 6, "phone: chapter 6 reached"); check(not merr, f"phone errors {merr[:1]}")
        await b.close()
    print("\n" + ("ALL PASSED" if not fails else f"{len(fails)} FAILED"))
    sys.exit(1 if fails else 0)
asyncio.run(main())

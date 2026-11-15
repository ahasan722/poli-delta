"""functional walk of v5 in headless Chromium: python pipeline/verify.py http://localhost:8000/index.html
Scrolls through every chapter and checks the spine, the panel text, the key and the camera framing; then the
explore tools (rule switches, ranked list, search, a canvas click, a storm), the keyboard, and a phone viewport."""
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
        pg = await b.new_page(viewport={"width": 1440, "height": 860}); errs, cons = [], []
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: cons.append(m.text) if m.type == "error" else None)
        await pg.goto(URL + "?lod=low"); await pg.wait_for_timeout(9000)
        check(await pg.evaluate("document.body.classList.contains('ready')"), "scene booted")
        n = await pg.evaluate("document.querySelectorAll('#spine a').length"); check(n == 9, f"spine lists {n} chapters, all visible text")
        fonts = await pg.evaluate("document.fonts.check('16px Newsreader') && document.fonts.check('16px \"IBM Plex Sans\"')"); check(fonts, "Newsreader and IBM Plex loaded, no Open Sans")
        no_open = await pg.evaluate("![...document.querySelectorAll('*')].some(e => getComputedStyle(e).fontFamily.includes('Open Sans'))"); check(no_open, "no element uses Open Sans")
        bg = await pg.evaluate("getComputedStyle(document.querySelector('#side')).backgroundColor"); check(bg == "rgb(255, 255, 255)", f"panels are plain white ({bg})")
        ids = ["cover", "low", "silt", "sink", "sea", "storms", "priority", "raise", "explore"]
        for i, cid in enumerate(ids):
            await pg.evaluate(f"scrollTo(0, {i} * innerHeight * 1.4 + innerHeight * 0.7)"); await pg.wait_for_timeout(5000)
            dom = await pg.evaluate("window.__poli.state.dom"); on = await pg.evaluate("[...document.querySelectorAll('#spine a.on')].map(a => +a.dataset.i)")
            vis = await pg.evaluate("[...document.querySelectorAll('.cap.vis')].map(c => c.dataset.ch)")
            panel_ok = (vis == [cid]) if cid != "explore" else await pg.evaluate("!document.getElementById('explorePanel').hidden")
            check(dom == i and on == [i] and panel_ok, f"chapter {i} {cid}: dominant {dom}, spine {on}, panel {vis if cid != 'explore' else 'explore tools'}")
        # framing check against the story's own boxes
        boxes = await pg.evaluate("(async () => (await import('./js/story.js')).CHAPTERS.map(c => c.view.box))()")
        for i, box in enumerate(boxes[:-1]):
            await pg.evaluate(f"scrollTo(0, {i} * innerHeight * 1.4 + innerHeight * 0.3)"); await pg.wait_for_timeout(4500)
            bad = await pg.evaluate("""(() => { const P = window.__poli; const box = %s; const K = 111.32 * Math.cos(23.4 * Math.PI / 180); const st = document.getElementById('stage');
              let bad = 0; for (const lon of [box[0], box[2]]) for (const lat of [box[1], box[3]]) { const V = new (P.camera.position.constructor)((lon - 90) * K, 0, -(lat - 23.4) * 111.32); V.project(P.camera);
                const x = (V.x + 1) / 2 * st.clientWidth, y = (1 - V.y) / 2 * st.clientHeight; if (x < -4 || x > st.clientWidth + 4 || y < -4 || y > st.clientHeight + 4) bad++; } return bad; })()""" % box)
            check(bad == 0, f"  chapter {i}: its ground box stays on screen ({bad} corners off)")
        # scroll-driven animation: the sea rises and the clock runs as the reader scrolls
        await pg.evaluate("scrollTo(0, 4 * innerHeight * 1.4 + innerHeight * 0.05)"); await pg.wait_for_timeout(4000); s0 = await pg.evaluate("document.getElementById('seaM').textContent")
        await pg.evaluate("scrollTo(0, 4 * innerHeight * 1.4 + innerHeight * 0.75)"); await pg.wait_for_timeout(4000); s1 = await pg.evaluate("document.getElementById('seaM').textContent")
        check(float(s1.split()[0]) > float(s0.split()[0]) + 0.5, f"sea rises with the scroll: {s0} -> {s1}")
        await pg.evaluate("scrollTo(0, 5 * innerHeight * 1.4 + innerHeight * 0.05)"); await pg.wait_for_timeout(4000); y0 = await pg.evaluate("+document.getElementById('stormY').textContent")
        await pg.evaluate("scrollTo(0, 5 * innerHeight * 1.4 + innerHeight * 0.75)"); await pg.wait_for_timeout(4000); y1 = await pg.evaluate("+document.getElementById('stormY').textContent")
        check(y1 > y0 + 20, f"cyclone clock runs with the scroll: {y0} -> {y1}")
        await pg.evaluate("scrollTo(0, 6 * innerHeight * 1.4 + innerHeight * 0.7)"); await pg.wait_for_timeout(5000)
        ten = await pg.evaluate("document.querySelectorAll('#chTen text').length"); share = await pg.evaluate("document.getElementById('tenShare').textContent")
        check(ten >= 30 and share.endswith("%"), f"the ten: chart drawn ({ten} labels), share {share}")
        # keyboard
        await pg.keyboard.press("ArrowDown"); await pg.wait_for_timeout(4500); check(await pg.evaluate("window.__poli.state.dom") == 7, "arrow key moves to the next chapter")
        # explore tools
        await pg.click("#modeExplore"); await pg.wait_for_timeout(5000)
        check(await pg.evaluate("window.__poli.state.dom") == 8, "Explore switch jumps to the tools")
        first = await pg.evaluate("document.querySelector('#rankList li .nm').textContent")
        await pg.click("#metricSeg button[data-m=severe]"); await pg.wait_for_timeout(800); first2 = await pg.evaluate("document.querySelector('#rankList li .nm').textContent")
        await pg.click("#sevSeg button[data-s='0']"); await pg.wait_for_timeout(800); n0 = await pg.evaluate("document.querySelectorAll('#rankList li[data-id]').length")
        check(first == "Satkhira" and first2 in ("Chattogram", "Noakhali") and n0 == 15, f"rule switches re-rank: {first} -> {first2}, list {n0}")
        await pg.click("#rankList li[data-id]"); await pg.wait_for_timeout(2500)
        sheet = await pg.evaluate("document.querySelector('#focus h3')?.firstChild?.textContent"); verdict = await pg.evaluate("document.querySelector('#focus .verdict')?.textContent || ''")
        check(bool(sheet) and len(verdict) > 10, f"list click opens the district sheet: {sheet}: {verdict[:60]}")
        await pg.click("#focus .back"); await pg.wait_for_timeout(600); check(await pg.evaluate("window.__poli.state.pick") == 0, "back arrow closes the sheet")
        await pg.fill("#search", "Bhola"); await pg.dispatch_event("#search", "change"); await pg.wait_for_timeout(1500)
        check(await pg.evaluate("document.querySelector('#focus h3')?.firstChild?.textContent") == "Bhola", "search opens Bhola")
        await pg.keyboard.press("Escape"); await pg.wait_for_timeout(500)
        box = await pg.evaluate("(() => { const r = document.querySelector('#stage canvas').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()")
        hitc = False
        for fx, fy in [(0.45, 0.6), (0.5, 0.55), (0.4, 0.5), (0.55, 0.62)]:
            await pg.mouse.move(box[0] + box[2] * fx, box[1] + box[3] * fy); await pg.wait_for_timeout(500)
            if await pg.evaluate("window.__poli.state.hover") > 0:
                await pg.mouse.down(); await pg.mouse.up(); await pg.wait_for_timeout(1500); hitc = await pg.evaluate("window.__poli.state.pick") > 0; break
        tipok = await pg.evaluate("document.getElementById('tip').innerHTML.includes('people under 5 m')")
        check(hitc and tipok, "hover shows the tooltip and a canvas click opens a district")
        await pg.keyboard.press("Escape"); await pg.wait_for_timeout(500)
        await pg.click("#stormChips .chip[data-sid='2007314N10093']"); await pg.wait_for_timeout(4000)
        st = await pg.evaluate("({ storm: window.__poli.state.storm, card: document.querySelector('#focus h3')?.firstChild?.textContent, tick: document.getElementById('fTick')?.textContent })")
        check(st["storm"] == "2007314N10093" and st["card"] == "Sidr" and st["tick"].startswith("day"), f"Sidr plays: {st}")
        await pg.click("#modeStory"); await pg.wait_for_timeout(5000); check(await pg.evaluate("window.__poli.state.dom") == 0 and not await pg.evaluate("window.__poli.state.storm"), "Story switch returns to the start and stops the storm")
        check(not errs, f"page errors: {errs[:2]}"); check(not cons, f"console errors: {cons[:2]}")
        m = await b.new_page(viewport={"width": 390, "height": 800}); merr = []; m.on("pageerror", lambda e: merr.append(str(e)))
        await m.goto(URL + "?lod=low"); await m.wait_for_timeout(8000)
        check(await m.evaluate("document.documentElement.scrollWidth") <= 390, "phone: no sideways scroll")
        await m.evaluate("scrollTo(0, 3 * innerHeight * 1.4 + innerHeight * 0.5)"); await m.wait_for_timeout(5000)
        check(await m.evaluate("window.__poli.state.dom") == 3 and await m.evaluate("document.querySelector('.cap.vis')?.dataset.ch") == "sink", "phone: scrolling drives the chapters")
        check(not merr, f"phone errors {merr[:1]}")
        await b.close()
    print("\n" + ("ALL PASSED" if not fails else f"{len(fails)} FAILED")); sys.exit(1 if fails else 0)
asyncio.run(main())

"""functional walk of the page in headless Chromium: python pipeline/verify.py http://localhost:8000/index.html
Checks every chapter loads without a page error, the rail and legend follow, the sea and relief sliders move their
uniforms, Explore toggles orbit, every chart draws, a district click opens its profile and highlights it, a storm plays
with its card and vortex, and a phone-width viewport has no horizontal scroll."""
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
        pg = await b.new_page(viewport={"width": 1440, "height": 860}); errs = []; cons = []
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: cons.append(m.text) if m.type == "error" else None)
        await pg.goto(URL + "?lod=low"); await pg.wait_for_timeout(9000)
        check(await pg.evaluate("document.body.classList.contains('ready')"), "scene booted")
        ids = await pg.evaluate("[...document.querySelectorAll('.step:not(.tail)')].map(s => s.dataset.id)")
        check(len(ids) >= 19, f"{len(ids)} chapters: {' '.join(ids)}")
        rail = await pg.evaluate("document.querySelectorAll('#rail a').length"); check(rail == len(ids), f"rail has {rail} dots")
        fonts = await pg.evaluate("document.fonts.check('16px Newsreader') && document.fonts.check('16px \"IBM Plex Sans\"') && document.fonts.check('16px \"IBM Plex Mono\"')"); check(fonts, "Newsreader, IBM Plex Sans and Mono loaded")
        scroll = "(id) => { const el = [...document.querySelectorAll('.step')].find(s => s.dataset.id === id); const p = document.getElementById('panel'); p.scrollTo({ top: el.offsetTop - p.clientHeight * 0.2 }); }"
        for cid in ids:
            await pg.evaluate(f"({scroll})('{cid}')"); await pg.wait_for_timeout(2400)
            ch = await pg.evaluate("window.__poli.state.chapter"); leg = await pg.evaluate("document.getElementById('legend').textContent.length")
            on = await pg.evaluate("[...document.querySelectorAll('#rail a.on')].map(a => a.dataset.id)")
            check(ch == cid and on == [cid], f"chapter {cid} active (got {ch}, rail {on}), legend {leg} chars")
        # sea slider
        await pg.evaluate(f"({scroll})('rise')"); await pg.wait_for_timeout(2600)
        before = await pg.evaluate("document.getElementById('seaPeople').textContent")
        await pg.evaluate("const r = document.getElementById('seaRange'); r.value = 4; r.dispatchEvent(new Event('input', { bubbles: true }))"); await pg.wait_for_timeout(1200)
        after = await pg.evaluate("document.getElementById('seaPeople').textContent"); u = await pg.evaluate("window.__poli.terrain.uniforms.uSeaLevel.value")
        check(before != after and abs(u - 4) < 0.05, f"sea slider: {before} -> {after}, uSeaLevel {u:.2f}")
        await pg.evaluate("const r = document.getElementById('exagRange'); r.value = 30; r.dispatchEvent(new Event('input', { bubbles: true }))"); await pg.wait_for_timeout(600)
        ex = await pg.evaluate("window.__poli.terrain.uniforms.uExag.value"); check(abs(ex - 30) < 0.5, f"relief slider sets uExag {ex:.1f}")
        await pg.click("#freeBtn"); await pg.wait_for_timeout(300); check(await pg.evaluate("window.__poli.state.free") is True, "Explore toggles free mode"); await pg.click("#freeBtn"); await pg.wait_for_timeout(300)
        for cid in ["chCover", "chSediment", "chLoss", "chSubsidence", "chExposure", "chDeaths", "chFloods", "chTemp", "chRain", "chSea"]:
            k = await pg.evaluate(f"document.querySelectorAll('#{cid} svg *').length"); check(k > 10, f"chart {cid}: {k} svg nodes")
        for nid in ["numLow10", "numLow5", "numPeople10", "numStorms", "numSund", "numHak", "numTan"]:
            t = await pg.evaluate(f"document.getElementById('{nid}').textContent"); check(t not in ("…", ""), f"number {nid} = {t}")
        # district: select by id, then by a real click on the canvas
        await pg.evaluate(f"({scroll})('ground')"); await pg.wait_for_timeout(2400)
        await pg.evaluate("window.__poli.select(5)"); await pg.wait_for_timeout(1800)
        name = await pg.evaluate("document.querySelector('#focus h3')?.firstChild?.textContent"); pick = await pg.evaluate("window.__poli.terrain.uniforms.uPick.value")
        check(name == "Bhola" and pick == 5, f"district profile opens ({name}, uPick {pick})")
        stats = await pg.evaluate("document.querySelectorAll('#focus .stat').length"); figs = await pg.evaluate("document.querySelectorAll('#focus svg *').length"); check(stats == 6 and figs > 20, f"district card: {stats} stats, {figs} svg nodes")
        await pg.click("#focus .x"); await pg.wait_for_timeout(800); check(await pg.evaluate("window.__poli.terrain.uniforms.uPick.value") == 0, "close clears the pick")
        await pg.evaluate(f"({scroll})('ground')"); await pg.wait_for_timeout(2600)
        box = await pg.evaluate("(() => { const r = document.querySelector('#stage canvas').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()")
        await pg.mouse.move(box[0] + box[2] * 0.5, box[1] + box[3] * 0.5); await pg.wait_for_timeout(400)
        hover = await pg.evaluate("window.__poli.terrain.uniforms.uHover.value"); tipShown = await pg.evaluate("getComputedStyle(document.getElementById('tip')).display")
        await pg.mouse.down(); await pg.mouse.up(); await pg.wait_for_timeout(1500)
        clicked = await pg.evaluate("window.__poli.terrain.uniforms.uPick.value"); cname = await pg.evaluate("document.querySelector('#focus h3')?.firstChild?.textContent")
        check(hover > 0 and tipShown == "block" and clicked > 0 and bool(cname), f"canvas hover + click picks a district (hover {hover}, picked {clicked} {cname})")
        await pg.click("#focus .x"); await pg.wait_for_timeout(600)
        # storm playback
        await pg.evaluate("window.__poli.play('2007314N10093')"); await pg.wait_for_timeout(4500)
        st = await pg.evaluate("({ ch: window.__poli.state.chapter, storm: window.__poli.state.storm, mode: window.__poli.state.mode, card: document.querySelector('#focus h3')?.firstChild?.textContent, tick: document.getElementById('fTick')?.textContent, chips: document.querySelectorAll('#stormChips .chip.on').length })")
        check(st["ch"] == "storms" and st["storm"] == "2007314N10093" and st["card"] == "Sidr" and st["tick"].startswith("day") and st["chips"] == 1, f"storm plays: {st}")
        vort = await pg.evaluate("(() => { const sc = window.__poli.terrain.mesh.parent; const w = sc.children.find(c => c.name === 'wind'); return { op: w.material.opacity, n: w.geometry.attributes.position.count }; })()")
        check(vort["op"] > 0.5 and vort["n"] > 1000, f"wind field visible: {vort}")
        await pg.click("#stormAll"); await pg.wait_for_timeout(800); check(await pg.evaluate("window.__poli.state.mode") == "all", "back to all storms")
        fr = await pg.evaluate("window.__poli.state.frames"); print("frames rendered", fr)
        check(not errs, f"page errors: {errs[:2]}"); check(not cons, f"console errors: {cons[:2]}")
        # phone width
        m = await b.new_page(viewport={"width": 390, "height": 760}); merr = []; m.on("pageerror", lambda e: merr.append(str(e)))
        await m.goto(URL + "?lod=low"); await m.wait_for_timeout(8000)
        sw = await m.evaluate("document.documentElement.scrollWidth"); check(sw <= 390, f"phone: scrollWidth {sw}")
        check(await m.evaluate("getComputedStyle(document.getElementById('rail')).display") == "none", "phone: rail hidden")
        await m.evaluate("(() => { const el = [...document.querySelectorAll('.step')].find(s => s.dataset.id === 'sundarbans'); window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - innerHeight * 0.5 }); })()"); await m.wait_for_timeout(2500)
        check(await m.evaluate("window.__poli.state.chapter") == "sundarbans", "phone: sundarbans reached"); check(not merr, f"phone errors {merr[:1]}")
        await b.close()
    print("\n" + ("ALL PASSED" if not fails else f"{len(fails)} FAILED"))
    sys.exit(1 if fails else 0)
asyncio.run(main())

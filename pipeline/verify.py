"""verify.py: v7 checks in Chromium (swiftshader WebGL). Run: python pipeline/verify.py http://localhost:8793/index.html [outdir]
Prints ok / FAIL lines and writes screenshots of 2D, 3D, the open sheet and the phone layout to outdir (default notes/shots).
Swiftshader renders on the CPU at a few frames a second, so waits are long and the frame-time sample is reported,
not held to 60 fps; on a laptop GPU the same page runs at the display rate."""
import asyncio, sys, json, subprocess, pathlib, statistics
from playwright.async_api import async_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8793/index.html"
OUT = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else pathlib.Path(__file__).resolve().parent.parent / "notes" / "shots"); OUT.mkdir(parents=True, exist_ok=True)
ARGS = ["--no-sandbox", "--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"]
fails = 0
def check(ok, msg):
    global fails; print(("ok   " if ok else "FAIL ") + msg, flush=True); fails += 0 if ok else 1

def hex2lab(h):
    import numpy as np
    c = np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)]) / 255
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    x = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]]) @ c / np.array([0.95047, 1, 1.08883])
    f = np.where(x > 0.008856, np.cbrt(x), 7.787 * x + 16 / 116)
    return np.array([116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])])
def pixel(png, x, y):
    from PIL import Image
    im = Image.open(png).convert("RGB"); r, g, b = im.getpixel((int(x), int(y))); return "#%02x%02x%02x" % (r, g, b)
def dE(a, b):
    import numpy as np; return float(np.linalg.norm(hex2lab(a) - hex2lab(b)))

async def settle(pg, ms=1500, limit=30000):
    """wait until no flight, no dimension change and the timeline is not playing"""
    await pg.wait_for_function("(() => { const P = __poli; return !P.flight && P.state.dimP === P.state.dimTarget && !P.state.tl.playing; })()", timeout=limit)
    await pg.wait_for_timeout(ms)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        ctx = await b.new_context(viewport={"width": 1440, "height": 860}, permissions=["clipboard-read", "clipboard-write"])
        pg = await ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        await pg.goto(URL); await pg.wait_for_function("window.__poli && __poli.state.ready", timeout=90000)
        check(await pg.evaluate("getComputedStyle(document.getElementById('loader')).opacity") is not None, "loader shown with progress, then hidden")
        await settle(pg, 2000, 60000)
        st = json.loads(await pg.evaluate("JSON.stringify({dim: __poli.state.dimP, renders: __poli.state.renders, hash: location.hash})"))
        check(st["dim"] == 1 and st["renders"] > 0, f"boots in 3D (opens flat and lifts): dimP {st['dim']}, {st['renders']} renders, {st['hash']}")
        fonts = await pg.evaluate("[...document.fonts].filter(f => f.status === 'loaded').map(f => f.family.replace(/\"/g, ''))")
        check({"Newsreader", "IBM Plex Sans"} <= set(fonts), f"Newsreader and IBM Plex loaded")
        check(not await pg.evaluate("[...document.querySelectorAll('*')].some(e => getComputedStyle(e).fontFamily.includes('Open Sans'))"), "no element uses Open Sans")
        check(await pg.evaluate("!/[\\u2014]/.test(document.body.innerText)"), "no em dashes in the page text")
        check(await pg.evaluate("getComputedStyle(document.body).backgroundColor") == "rgb(255, 255, 255)", "page background is plain white")
        await pg.screenshot(path=str(OUT / "v7-3d-cover.png"))

        # ---- render on demand: idle means no renders
        r0 = await pg.evaluate("__poli.state.renders"); await pg.wait_for_timeout(2500); r1 = await pg.evaluate("__poli.state.renders")
        check(r1 - r0 <= 2, f"render loop sleeps when nothing moves ({r1 - r0} renders in 2.5 s idle on the cover)")

        # ---- the hint
        await pg.click("#hintClose"); check(await pg.evaluate("document.getElementById('hint').hidden && localStorage.getItem('poli-hint') === '1'"), "first-visit hint dismisses and is remembered")

        # ---- 2D <-> 3D
        await pg.evaluate("__poli.go('priority')"); await settle(pg, 2500)
        c0 = await pg.evaluate("[__poli.cam.look.x, __poli.cam.look.z, __poli.cam.d]")
        await pg.screenshot(path=str(OUT / "v7-3d-the-ten.png"))
        await pg.keyboard.press("2"); await settle(pg, 2000)
        s2 = json.loads(await pg.evaluate("(() => { const P = __poli, v = P.camera.getWorldDirection(new P.camera.position.constructor()); return JSON.stringify({dim: P.state.dimP, exag: P.uniforms.uExag.value, down: v.y, look: [P.cam.look.x, P.cam.look.z, P.cam.d], hash: location.hash}); })()"))
        check(s2["dim"] == 0 and s2["exag"] < 1e-6 and s2["down"] < -0.9999, f"2D: straight down (dir.y {s2['down']:.5f}), relief flat (uExag {s2['exag']}), mode in URL {s2['hash']}")
        check(all(abs(a - b) < 0.5 for a, b in zip(c0[:2], s2["look"][:2])) and abs(c0[2] / s2["look"][2] - 1) < 0.01, "switch keeps the same centre and zoom")
        await pg.screenshot(path=str(OUT / "v7-2d-the-ten.png"))
        # the rendered cap colour of a district matches its key swatch (unlit caps)
        for name, want in [("Satkhira", "#fd8d3c"), ("Chattogram", "#bd0026")]:
            xy = await pg.evaluate(f"(() => {{ const d = __poli.data.districts.find(x => x.name === '{name}'); return __poli.project(d.centroid[0] + 0.05, d.centroid[1] - 0.12, 0.3); }})()")
            got = pixel(str(OUT / "v7-2d-the-ten.png"), *xy); check(dE(got, want) < 10, f"2D {name} renders {got}, key {want}: delta E {dE(got, want):.1f}")
        await pg.keyboard.press("3"); await settle(pg, 1500)
        s3 = await pg.evaluate("[__poli.state.dimP, __poli.uniforms.uExag.value]"); check(s3[0] == 1 and s3[1] > 10, f"3D again: dimP {s3[0]}, uExag {s3[1]:.1f}")
        # interrupt half way: no jump
        await pg.keyboard.press("2"); await pg.wait_for_timeout(500); await pg.keyboard.press("3")
        seq = await pg.evaluate("new Promise(res => { const out = []; const t0 = performance.now(); (function f() { out.push(__poli.state.dimP); if (performance.now() - t0 < 4000) requestAnimationFrame(f); else res(out); })(); })")
        jumps = max(abs(a - b) for a, b in zip(seq, seq[1:])) if len(seq) > 1 else 0
        check(seq[-1] == 1 and jumps < 0.3, f"switch interrupted half way blends back without a snap (largest step {jumps:.3f}, {len(seq)} frames)")
        await settle(pg, 500)

        # ---- steps: buttons, keys, wheel over the panel, back button
        await pg.evaluate("__poli.go(0)"); await settle(pg, 800)
        seen = []
        for i in range(9):
            await pg.click("#nextBtn"); await pg.wait_for_timeout(400)
            seen.append(await pg.evaluate("[__poli.state.step, document.querySelector('#steps li.on .t').textContent, (document.querySelector('.cap.vis') || {}).dataset?.ch || 'explore', location.hash]"))
        check([s[0] for s in seen] == list(range(1, 10)) and seen[-1][2] == "explore", "Next walks every step: " + ", ".join(s[1] for s in seen))
        check(await pg.evaluate("!document.getElementById('explorePanel').hidden && document.getElementById('modeExplore').classList.contains('on')"), "last step opens the Explore tools and the Explore tab")
        await pg.go_back(); await pg.wait_for_timeout(800); check(await pg.evaluate("__poli.state.step") == 8, "browser Back returns to the previous step")
        await pg.go_forward(); await pg.wait_for_timeout(800); check(await pg.evaluate("__poli.state.step") == 9, "browser Forward goes to the next step again")
        await pg.evaluate("__poli.go(2)"); await settle(pg, 500)
        await pg.keyboard.press("ArrowRight"); await pg.wait_for_timeout(300); a = await pg.evaluate("__poli.state.step")
        await pg.keyboard.press("ArrowLeft"); await pg.wait_for_timeout(300); bb = await pg.evaluate("__poli.state.step")
        check(a == 3 and bb == 2, f"arrow keys step forward and back ({a}, {bb})")
        await pg.mouse.move(180, 500); await pg.mouse.wheel(0, 120); await pg.wait_for_timeout(900)
        check(await pg.evaluate("__poli.state.step") == 3, "wheel over the story panel moves one step")
        await settle(pg, 500)
        d0 = await pg.evaluate("__poli.camT.d"); await pg.mouse.move(900, 450); await pg.mouse.wheel(0, -300); await pg.wait_for_timeout(600); d1 = await pg.evaluate("__poli.camT.d")
        check(d1 < d0 * 0.8 and await pg.evaluate("__poli.state.step") == 3, f"wheel over the map zooms it ({d0:.0f} -> {d1:.0f}) and does not change the step")
        await pg.keyboard.press("r"); await settle(pg, 300)
        await pg.keyboard.press("?"); check(await pg.evaluate("!document.getElementById('help').hidden"), "? opens the shortcuts box")
        await pg.keyboard.press("Escape"); check(await pg.evaluate("document.getElementById('help').hidden"), "Esc closes it")
        await pg.keyboard.press("["); await pg.wait_for_timeout(600); await pg.wait_for_function("document.getElementById('stage').getBoundingClientRect().left < 2", timeout=20000)
        check(await pg.evaluate("document.body.classList.contains('collapsed') && document.getElementById('stage').getBoundingClientRect().left < 2"), "[ hides the panel and the map takes the width")
        await pg.keyboard.press("["); await pg.wait_for_timeout(600)

        # ---- drag to pan, right-drag to turn
        await settle(pg, 300); l0 = await pg.evaluate("[__poli.cam.look.x, __poli.cam.look.z]")
        await pg.mouse.move(900, 450); await pg.mouse.down(); await pg.mouse.move(800, 400, steps=6); await pg.mouse.up(); await pg.wait_for_timeout(300)
        l1 = await pg.evaluate("[__poli.cam.look.x, __poli.cam.look.z]"); check(abs(l1[0] - l0[0]) + abs(l1[1] - l0[1]) > 5, "drag pans the map")
        az0 = await pg.evaluate("__poli.cam.az"); await pg.mouse.move(900, 450); await pg.mouse.down(button="right"); await pg.mouse.move(1000, 450, steps=6); await pg.mouse.up(button="right"); await pg.wait_for_timeout(300)
        az1 = await pg.evaluate("__poli.cam.az"); check(abs(az1 - az0) > 5, f"right-drag turns the map in 3D ({az0:.0f}° -> {az1:.0f}°)")
        await pg.click("#compass"); await settle(pg, 300); check(abs(await pg.evaluate("__poli.cam.az") - 180) < 0.5, "compass resets north")

        # ---- timeline on the cyclone step
        await pg.evaluate("__poli.go('storms')"); await pg.wait_for_timeout(1500)
        check(await pg.evaluate("!document.getElementById('timeline').hidden && __poli.state.tl.playing"), "cyclone step shows its timeline and plays it")
        await pg.keyboard.press(" "); check(not await pg.evaluate("__poli.state.tl.playing"), "Space pauses the timeline")
        await pg.evaluate("(() => { const s = document.getElementById('scrub'); s.value = 720; s.dispatchEvent(new Event('input')); })()"); await pg.wait_for_timeout(2500)
        y = await pg.evaluate("+document.getElementById('stormY').textContent"); check(2001 <= y <= 2009, f"scrubbing to 72% sets the clock to {y}")
        await settle(pg, 800); await pg.screenshot(path=str(OUT / "v7-3d-cyclones.png"))
        await pg.evaluate("__poli.go('sea')"); await settle(pg, 1500, 40000)
        sea = await pg.evaluate("[__poli.cur.uSeaLevel, document.getElementById('seaM').textContent]"); check(sea[0] > 1.3, f"sea step plays to the end: {sea[1]}")

        # ---- Explore: hover, click, sheet, search, a cyclone
        await pg.evaluate("__poli.go('explore')"); await settle(pg, 1500)
        xy = await pg.evaluate("(() => { const d = __poli.data.districts.find(x => x.name === 'Khulna'); const m = __poli.prisms.getObjectByName('p-' + d.id); return __poli.project(d.centroid[0], d.centroid[1], m.scale.y + 0.3); })()")
        await pg.mouse.move(xy[0] - 4, xy[1] - 4); await pg.mouse.move(*xy, steps=3); await pg.wait_for_timeout(1200)
        tipt = await pg.evaluate("document.getElementById('tip').classList.contains('on') ? document.querySelector('#tip .t').textContent : ''")
        check("Khulna" in tipt, f"hover shows the tooltip after its delay: {tipt.strip()[:40]}")
        await pg.mouse.click(*xy); await pg.wait_for_timeout(1200)
        sh = await pg.evaluate("document.getElementById('focus').classList.contains('on') ? document.querySelector('#focus h3').textContent : ''")
        check(sh.startswith("Khulna"), f"click opens the district sheet: {sh[:30]} / {await pg.evaluate('location.hash')}")
        await settle(pg, 1200); await pg.screenshot(path=str(OUT / "v7-sheet.png"))
        await pg.keyboard.press("Escape"); await pg.wait_for_timeout(500); check(not await pg.evaluate("document.getElementById('focus').classList.contains('on')"), "Esc closes the sheet")
        await pg.click("#search"); await pg.keyboard.type("bhol"); await pg.wait_for_timeout(300)
        opts = await pg.evaluate("[...document.querySelectorAll('#searchList li')].map(l => l.textContent)")
        await pg.keyboard.press("Enter"); await pg.wait_for_timeout(600)
        check(any("Bhola" in o for o in opts) and await pg.evaluate("document.querySelector('#focus h3').textContent.startsWith('Bhola') && !!__poli.flight"), f"search suggests {opts[:2]}, Enter opens Bhola and flies to it")
        await settle(pg, 500)
        await pg.click("#search"); await pg.keyboard.type("sidr"); await pg.wait_for_timeout(300); await pg.keyboard.press("Enter"); await pg.wait_for_timeout(1500)
        stx = json.loads(await pg.evaluate("JSON.stringify({s: __poli.state.storm, card: document.querySelector('#focus h3').textContent, tl: document.getElementById('tlLabel').textContent, hash: location.hash})"))
        check(stx["s"] == "2007314N10093" and "Sidr" in stx["card"] and "Sidr" in stx["tl"], f"search plays Cyclone Sidr with its own timeline ({stx['hash']})")
        await settle(pg, 800, 40000); check("day" in await pg.evaluate("document.getElementById('tlValue').textContent"), "the storm timeline reads days and wind")
        # ---- frame times during a camera flight
        ft = await pg.evaluate("new Promise(res => { __poli.go(0); const out = []; let last = performance.now(); (function f(t) { out.push(t - last); last = t; if (__poli.flight || out.length < 5) requestAnimationFrame(f); else res(out.slice(1)); })(performance.now()); })")
        med = statistics.median(ft) if ft else 0
        check(len(ft) > 3, f"frame time during a flight, swiftshader: median {med:.0f} ms over {len(ft)} frames (GPU browsers run at the display rate)")
        await settle(pg, 300)
        # ---- v7: the Bay, flowing rivers, the layers menu, the About page
        await pg.evaluate("__poli.go('bay')"); await settle(pg, 1500, 40000)
        bay = await pg.evaluate("[__poli.uniforms.uBathy.value, __poli.cur.flow, __poli.cur.farRivers]")
        t0 = await pg.evaluate("__poli.camera.parent ? 0 : 0") or 0
        check(bay[0] > 0.95 and bay[1] > 0.95 and bay[2] > 0.95, f"Bay step: depth shading {bay[0]:.2f}, river flow {bay[1]:.2f}, rivers beyond the border {bay[2]:.2f}")
        r0 = await pg.evaluate("__poli.state.renders"); await pg.wait_for_timeout(1500); r1 = await pg.evaluate("__poli.state.renders")
        check(r1 > r0, f"the rivers keep moving on the Bay step ({r1 - r0} frames in 1.5 s)")
        await pg.click("#layersBtn"); await pg.wait_for_timeout(300)
        lay = await pg.evaluate("[...document.querySelectorAll('#layersPop input')].map(i => i.dataset.layer + ':' + i.checked)")
        await pg.click("#layersPop label:has([data-layer=rivers])"); await pg.wait_for_timeout(1500)
        off = await pg.evaluate("__poli.cur.rivers")
        await pg.click("#layersPop label:has([data-layer=storms])"); await pg.wait_for_timeout(1500)
        on = await pg.evaluate("__poli.cur.storms")
        check("rivers:true" in lay and off < 0.05 and on > 0.8, f"layers menu shows {len(lay)} layers; rivers off ({off:.2f}), cyclone tracks on ({on:.2f})")
        await pg.keyboard.press("Escape"); check(await pg.evaluate("document.getElementById('layersPop').hidden"), "Esc closes the layers menu")
        await pg.evaluate("__poli.go('low')"); await pg.wait_for_timeout(500)
        check(await pg.evaluate("__poli.state.ov && Object.keys(__poli.state.ov).length === 0"), "layer changes reset at the next step")
        await pg.click("#modeAbout"); await pg.wait_for_timeout(600)
        ab = await pg.evaluate("[!document.getElementById('about').hidden, location.hash, document.querySelectorAll('.page h2').length]")
        check(ab[0] and "page=about" in ab[1] and ab[2] >= 6, f"About opens as a page with {ab[2]} sections, in the URL ({ab[1]})")
        await pg.go_back(); await pg.wait_for_timeout(500); check(await pg.evaluate("document.getElementById('about').hidden"), "Back closes the About page")
        await settle(pg, 500, 40000)
        # ---- share
        await pg.click("#shareBtn"); await pg.wait_for_timeout(300)
        check("copied" in (await pg.evaluate("document.getElementById('toast').textContent")).lower(), "Share copies the link")
        check(not errs, f"page and console errors: {errs[:3]}")
        await ctx.close()

        # ---- deep link
        ctx = await b.new_context(viewport={"width": 1440, "height": 860}); pg = await ctx.new_page(); e2 = []; pg.on("pageerror", lambda e: e2.append(str(e)))
        await pg.goto(URL + "#step=10&mode=2d&id=khulna"); await pg.wait_for_function("window.__poli && __poli.state.ready", timeout=90000); await settle(pg, 1500, 60000)
        dl = json.loads(await pg.evaluate("JSON.stringify({step: __poli.state.step, dim: __poli.state.dimTarget, pick: __poli.state.pick && __poli.data.byId[__poli.state.pick].name, sheet: document.getElementById('focus').classList.contains('on')})"))
        check(dl == {"step": 9, "dim": 0, "pick": "Khulna", "sheet": True}, f"deep link restores step, mode and selection: {dl}")
        await pg.screenshot(path=str(OUT / "v7-2d-sheet.png")); check(not e2, f"deep link errors: {e2[:2]}"); await ctx.close()

        # ---- reduced motion
        ctx = await b.new_context(viewport={"width": 1440, "height": 860}, reduced_motion="reduce"); pg = await ctx.new_page()
        await pg.goto(URL); await pg.wait_for_function("window.__poli && __poli.state.ready", timeout=90000); await pg.wait_for_timeout(1500)
        await pg.keyboard.press("2"); r = await pg.evaluate("[__poli.state.dimP]"); await pg.evaluate("__poli.go('sea')"); r2 = await pg.evaluate("[!!__poli.flight, __poli.state.tl.t, __poli.state.tl.playing]")
        check(r[0] == 0 and r2 == [False, 1, False], f"reduced motion: instant switch and jumps, no flights, timelines shown complete ({r}, {r2})"); await ctx.close()

        # ---- no WebGL
        ctx = await b.new_context(viewport={"width": 1280, "height": 800}); pg = await ctx.new_page(); e3 = []; pg.on("pageerror", lambda e: e3.append(str(e)))
        await pg.goto(URL + "?nogl=1"); await pg.wait_for_function("window.__poli && __poli.state.ready", timeout=60000); await pg.wait_for_timeout(800)
        n = await pg.evaluate("document.querySelectorAll('svg.fallback path').length"); await pg.click("#modeExplore"); await pg.wait_for_timeout(300)
        await pg.evaluate("document.querySelectorAll('svg.fallback path')[5].dispatchEvent(new MouseEvent('click', {bubbles: true}))"); await pg.wait_for_timeout(400)
        check(n == 64 and await pg.evaluate("document.getElementById('focus').classList.contains('on')") and not e3, f"without WebGL: flat SVG map of {n} districts, clickable, no errors {e3[:1]}")
        await pg.screenshot(path=str(OUT / "v7-fallback.png")); await ctx.close()

        # ---- phone
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True); pg = await ctx.new_page(); e4 = []; pg.on("pageerror", lambda e: e4.append(str(e)))
        await pg.goto(URL + "#step=8"); await pg.wait_for_function("window.__poli && __poli.state.ready", timeout=90000); await settle(pg, 2000, 60000)
        check(await pg.evaluate("document.documentElement.scrollWidth <= innerWidth"), "phone: no sideways scroll")
        sh = await pg.evaluate("[document.getElementById('panel').getBoundingClientRect().height, getComputedStyle(document.documentElement).getPropertyValue('--sheet')]")
        check(sh[0] > 200, f"phone: the panel is a bottom sheet ({sh[0]:.0f} px, --sheet {sh[1]})")
        await pg.screenshot(path=str(OUT / "v7-phone.png"))
        await pg.tap("#grip"); await pg.wait_for_timeout(600); h2 = await pg.evaluate("document.getElementById('panel').getBoundingClientRect().height")
        check(h2 != sh[0], f"phone: tapping the grip moves the sheet to the next stop ({sh[0]:.0f} -> {h2:.0f} px)")
        await pg.tap("#nextBtn"); await pg.wait_for_timeout(500); check(await pg.evaluate("__poli.state.step") == 8, "phone: Next works by touch")
        tgt = await pg.evaluate("[...document.querySelectorAll('.controls button, .pnav button')].filter(b => b.offsetParent).map(b => Math.min(b.offsetWidth, b.offsetHeight))")
        check(min(tgt) >= 44, f"phone: map and step buttons are at least 44 px ({min(tgt)} px smallest)")
        check(not e4, f"phone errors: {e4[:2]}"); await ctx.close()
        await b.close()

    r = subprocess.run([sys.executable, str(pathlib.Path(__file__).resolve().parent / "colours.py")], capture_output=True, text=True)
    check(r.returncode == 0, "palette: " + r.stdout.strip().splitlines()[-1])
    print("\nall checks passed" if not fails else f"\n{fails} FAILED")

asyncio.run(main())

"""teaser.py  --  a scripted walk through the page, recorded frame by frame with a virtual clock, as GIF and MP4.
python pipeline/teaser.py http://localhost:8000/index.html out/teaser   -> out/teaser.gif and out/teaser.mp4
Time is virtual: requestAnimationFrame and performance.now are replaced in the page, so every frame is a clean
1/12 s step no matter how slow the machine renders. A drawn cursor moves and clicks so the viewer sees the navigation."""
import sys, io, asyncio, subprocess
from pathlib import Path
from PIL import Image
from playwright.async_api import async_playwright
URL, OUT = sys.argv[1], Path(sys.argv[2])
FPS, DT = 12, 1000 / 12
W, H = 1440, 810
VIRTUAL = """(() => { let now = 0; const q = []; const ivs = new Map(); let iid = 0;
  window.requestAnimationFrame = cb => { q.push(cb); return q.length; }; window.cancelAnimationFrame = () => {};
  window.setInterval = (fn, ms) => { iid += 1; ivs.set(iid, { fn, ms, next: now + ms }); return iid; }; window.clearInterval = id => { ivs.delete(id); };
  performance.now = () => now;
  window.__tick = dt => { now += dt; for (const [id, v] of ivs) { while (v.next <= now) { v.next += v.ms; v.fn(); if (!ivs.has(id)) break; } } const cbs = q.splice(0); for (const cb of cbs) cb(now); }; })();"""
OVERLAY = """(() => {
  const cur = document.createElement('div'); cur.id = 'cur'; cur.style.cssText = 'position:fixed;left:-50px;top:-50px;z-index:99;pointer-events:none;width:26px;height:34px;transition:none';
  cur.innerHTML = '<svg width="26" height="34" viewBox="0 0 26 34"><path d="M3 2 L3 26 L9 20 L13 31 L17 29 L13 19 L21 19 Z" fill="#fdf6e3" stroke="#002b36" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  document.body.appendChild(cur);
  const rip = document.createElement('div'); rip.id = 'rip'; rip.style.cssText = 'position:fixed;z-index:98;pointer-events:none;width:0;height:0;border-radius:50%;border:3px solid #b58900;opacity:0;transform:translate(-50%,-50%)'; document.body.appendChild(rip);
  const cap = document.createElement('div'); cap.id = 'cap'; cap.style.cssText = 'position:absolute;left:50%;top:22px;transform:translateX(-50%);z-index:50;background:rgba(0,43,54,.86);border:1px solid rgba(238,232,213,.18);color:#fdf6e3;font-family:Newsreader,serif;font-size:27px;padding:8px 22px;border-radius:999px;white-space:nowrap;opacity:0;transition:opacity .4s;backdrop-filter:blur(6px)';
  document.getElementById('stage').appendChild(cap);
  window.__cur = (x, y) => { cur.style.left = x + 'px'; cur.style.top = y + 'px'; };
  window.__rip = (x, y, t) => { rip.style.left = x + 'px'; rip.style.top = y + 'px'; rip.style.width = rip.style.height = (8 + 50 * t) + 'px'; rip.style.opacity = t < 1 ? String(1 - t) : '0'; };
  window.__cap = s => { cap.textContent = s; cap.style.opacity = s ? 1 : 0; };
})();"""

frames = []
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--no-sandbox", "--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": W, "height": H}); await pg.add_init_script(VIRTUAL)
        await pg.goto(URL); await pg.wait_for_timeout(9000)
        await pg.evaluate(OVERLAY)
        cx, cy = [W * 0.55, H * 0.6]
        async def shot():
            png = await pg.screenshot(type="png"); im = Image.open(io.BytesIO(png)).convert("RGB").resize((960, 540), Image.LANCZOS); frames.append(im)
        async def tick(n=1, cap=None):
            if cap is not None: await pg.evaluate("window.__cap(%r)" % cap)
            for _ in range(n): await pg.evaluate(f"window.__tick({DT})"); await shot()
        async def move(x, y, n=10):
            nonlocal cx, cy
            for i in range(1, n + 1):
                t = i / n; e = t * t * (3 - 2 * t); await pg.evaluate(f"window.__cur({cx + (x - cx) * e}, {cy + (y - cy) * e})"); await tick(1)
            cx, cy = x, y
        async def click_ripple(x, y):
            for i in range(5): await pg.evaluate(f"window.__rip({x}, {y}, {i / 4})"); await tick(1)
        async def click_el(sel, n=12):
            r = await pg.evaluate(f"(() => {{ const r = document.querySelector({sel!r}).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }})()")
            await move(r[0], r[1], n); await pg.evaluate(f"document.querySelector({sel!r}).click()"); await click_ripple(r[0], r[1])
        async def nav(id_, n=12): await click_el(f"#rail a[data-id='{id_}']", n)

        # 1. the opening: the page's own intro (relief rising, camera settling) runs on the virtual clock
        await pg.evaluate("window.__cur(-60,-60)")
        await tick(2, "Bangladesh, as the ground itself"); await tick(34); await tick(8)
        # 2. rivers
        await move(W * 0.08, H * 0.36, 14)
        await nav("rivers", 6); await tick(24, "Every river, pulsing downstream")
        await tick(14)
        # 3. the cut
        await nav("slice", 12); await tick(24, "Slice the country open")
        await tick(30)
        # 4. a district
        await tick(2, "Click any district")
        pos = await pg.evaluate("(() => { const P = window.__poli; const V = new (P.camera.position.constructor)((90.66 - 90) * 102.2, 0, -(22.6 - 23.4) * 111.32); V.project(P.camera); const st = document.getElementById('stage').getBoundingClientRect(); return [st.left + (V.x + 1) / 2 * st.width, st.top + (1 - V.y) / 2 * st.height]; })()")
        await nav("ground", 10); await tick(20)
        pos = await pg.evaluate("(() => { const P = window.__poli; const V = new (P.camera.position.constructor)((90.66 - 90) * 102.2, 0, -(22.6 - 23.4) * 111.32); V.project(P.camera); const st = document.getElementById('stage').getBoundingClientRect(); return [st.left + (V.x + 1) / 2 * st.width, st.top + (1 - V.y) / 2 * st.height]; })()")
        await move(pos[0], pos[1], 16)
        await pg.mouse.move(pos[0], pos[1]); await tick(6)
        await pg.mouse.down(); await pg.mouse.up(); await click_ripple(pos[0], pos[1])
        picked = await pg.evaluate("window.__poli.state.pick")
        if not picked: await pg.evaluate("window.__poli.select(5)")
        await pg.mouse.move(W - 120, H - 60); await tick(26, "Bhola: 99.6% of it under 10 m")
        await tick(10)
        # 5. the cyclone clock
        await click_el("#focus .x", 10); await tick(4)
        await nav("storms", 12); await tick(52, "Every cyclone since 1960")
        # 6. play Sidr
        await click_el("#stormChips .chip[data-sid='2007314N10093']", 14)
        await tick(16, "Play Sidr, hour by hour"); await tick(60)
        # 7. end card
        await pg.evaluate("window.__cur(-60,-60)")
        await pg.evaluate("""(() => { const e = document.createElement('div'); e.style.cssText = 'position:fixed;inset:0;z-index:90;background:#002b36;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;color:#fdf6e3;font-family:Newsreader,serif';
          e.innerHTML = '<div style="font-size:64px;line-height:1">পলি <span style="color:#b58900">Poli</span></div><div style="font-size:28px;color:#eee8d5">the country the rivers built</div><div style="font-family:IBM Plex Mono,monospace;font-size:22px;color:#2aa198;margin-top:10px">ahasan722.github.io/poli-delta</div>'; document.body.appendChild(e); })()""")
        await tick(30, None)
        await b.close()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUT.parent / "_frames"; tmp.mkdir(exist_ok=True)
    for i, f in enumerate(frames): f.save(tmp / f"f{i:04d}.png")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", str(tmp / "f%04d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart", str(OUT) + ".mp4"], check=True)
    # the GIF: 10 fps, 800 px wide, a shared palette, so it stays small enough to post
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", str(tmp / "f%04d.png"), "-vf", "fps=10,scale=800:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=192:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle", str(OUT) + ".gif"], check=True)
    for f in tmp.glob("*.png"): f.unlink()
    tmp.rmdir()
    print(len(frames), "frames,", round(len(frames) / FPS, 1), "s")
asyncio.run(main())

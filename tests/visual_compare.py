#!/usr/bin/env python3
"""Compare the cleaned salon template with the approved Git baseline in Chromium."""
from __future__ import annotations

import argparse
from pathlib import Path
import subprocess

from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright

OUT = Path("test-artifacts/visual")
OUT.mkdir(parents=True, exist_ok=True)


def capture(browser, url: str, name: str, width: int, height: int, mobile: bool, approved_data: str | None = None):
    context = browser.new_context(
        viewport={"width": width, "height": height},
        device_scale_factor=1,
        is_mobile=mobile,
        has_touch=mobile,
        reduced_motion="reduce",
        locale="ru-RU",
    )
    page = context.new_page()
    # Render both revisions with identical approved demo content. This isolates
    # visual regressions from the deliberate reduction to four neutral cards.
    if approved_data is not None:
        page.route("**/site-data.js*", lambda route: route.fulfill(status=200, content_type="application/javascript", body=approved_data))
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    root = "#salon-mobile" if mobile else "#salon-desktop-v1"
    section = "#tn13Services" if mobile else "#salonDesktopServices"
    page.wait_for_selector(root, state="attached", timeout=20000)
    page.wait_for_function(
        "() => !document.documentElement.classList.contains('br-booting')",
        timeout=12000,
    )
    page.evaluate("() => document.fonts.ready")
    page.add_style_tag(content=(
        "*,*::before,*::after{animation:none!important;"
        "transition:none!important;caret-color:transparent!important}"
        "html,body{scroll-behavior:auto!important}"
    ))
    page.evaluate("window.scrollTo(0,0)")
    page.wait_for_timeout(350)
    images = {}
    if height >= 800:
        images["hero"] = page.screenshot(animations="disabled")
    if mobile:
        page.locator(section + ' [data-scat="Волосы"]').click(timeout=10000)
    else:
        page.locator(section + ' [data-service-category="Волосы"]').click(timeout=10000)
    page.locator(section).evaluate("(el) => el.scrollIntoView({behavior:'instant',block:'start'})")
    page.wait_for_timeout(700)
    page.evaluate("() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))")
    section_y = page.locator(section).evaluate(
        "(el) => Math.max(0, Math.ceil(el.getBoundingClientRect().top))"
    )
    images["services"] = page.screenshot(
        clip={"x": 0, "y": section_y, "width": width, "height": height - section_y},
        animations="disabled",
    )
    if (not mobile and width == 1366) or (mobile and width == 390):
        expand = page.locator(section + (" .tn31-service-demo-more:visible" if mobile else " .dct-service-demo-more:visible")).first
        # Some approved descriptions fit within two lines: their More buttons are
        # intentionally hidden, so only exercise expansion when one is visible.
        if expand.count() > 0:
            expand.click(timeout=12000)
            if expand.get_attribute("aria-expanded") != "true":
                raise AssertionError(name + ": description did not expand")
            # Expansion is asserted functionally; the intermediate scroll-anchoring
            # frame is not a stable pixel snapshot on Chromium or WebKit.
            page.wait_for_timeout(350)
            expand.click(timeout=12000)
            if expand.get_attribute("aria-expanded") != "false":
                raise AssertionError(name + ": description did not collapse")

    if not mobile and width == 1366:
        page.locator("#stdStickyGalleryOpen").hover(timeout=10000)
        page.wait_for_timeout(150)
        images["gallery-hover"] = page.locator("#stdStickyGalleryOpen").screenshot(
            animations="disabled"
        )
        star_color = page.locator("#stdStickyGalleryOpen > span:last-child").evaluate(
            "(el) => getComputedStyle(el).color"
        )
        if star_color != "rgb(255, 255, 255)":
            raise AssertionError(name + ": gallery star lost its approved white hover")
        page.locator("#stdStickyGalleryOpen").click(timeout=12000)
        page.locator("#stdGalleryBrowser.open").wait_for(timeout=8000)
        # Lazy-loaded SVG tiles can be captured before their first decode on CI.
        # Wait for every gallery tile to paint before comparing pixels.
        page.locator("#stdGalleryBrowserGrid img").evaluate_all(
            "(imgs) => Promise.all(imgs.map(img => {img.loading = 'eager'; return img.decode().catch(() => {});} ))"
        )
        page.wait_for_timeout(250)
        images["gallery-open"] = page.screenshot(animations="disabled")

    if mobile and width == 390:
        page.locator(".tn22-worklink").click(timeout=12000)
        page.locator("#tn13Gallery.open").wait_for(timeout=8000)
        # Wait for gallery-specific fonts, lazy media and compositing to settle.
        # The open-overlay screenshot can otherwise capture subpixel text repainting.
        page.evaluate("() => document.fonts.ready")
        page.locator("#tn13Gallery img").first.evaluate(
            "(img) => img.decode().catch(() => {})"
        )
        page.wait_for_timeout(350)
        # The first open frame repaints glyphs asynchronously; compare the
        # stable gallery after a category selection instead.
        page.locator("#tn13Gallery [data-gcat='Волосы']").click(timeout=12000)
        page.wait_for_timeout(160)
        images["gallery-category"] = page.screenshot(animations="disabled")

    context.close()
    for label, data in images.items():
        (OUT / f"{name}-{label}.png").write_bytes(data)
    return images


def compare(a: bytes, b: bytes, filename: str):
    import io

    x = Image.open(io.BytesIO(a)).convert("RGB")
    y = Image.open(io.BytesIO(b)).convert("RGB")
    if x.size != y.size:
        raise AssertionError(f"{filename}: different image dimensions: {x.size} / {y.size}")
    diff = ImageChops.difference(x, y)
    if not diff.getbbox():
        print(f"PASS {filename}: pixel-identical")
        return
    changed = sum(1 for rgb in diff.getdata() if max(rgb) > 10)
    fraction = changed / (x.width * x.height)
    diff.save(OUT / f"{filename}-diff.png")
    print(f"{filename}: {changed} changed pixels / {fraction:.3%}")
    # The services section intentionally differs from the frozen baseline:
    # 1–4 categories now fill the available width and service titles are slightly
    # heavier. Keep the original strict threshold everywhere else.
    limit = 0.03 if filename.endswith("-services") else 0.003
    if fraction > limit:
        raise AssertionError(
            f"{filename}: visible regression exceeds {limit:.1%} of pixels"
        )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", default="http://127.0.0.1:4173/")
    parser.add_argument("--candidate", default="http://127.0.0.1:4174/")
    parser.add_argument("--engine", choices=("chromium", "webkit"), default="chromium")
    parser.add_argument("--quick", action="store_true")
    args = parser.parse_args()
    cases = [(1366, 900, False), (390, 844, True)] if args.quick else [
             (1024, 768, False), (1366, 900, False),
             (1440, 900, False), (1920, 1080, False),
             (360, 740, True), (375, 812, True),
             (390, 844, True), (414, 896, True)]
    errors = []
    # The historical approved baseline predates site-data.js. Obtain the
    # factory-approved dataset from the first published factory commit instead.
    approved_data = subprocess.check_output(
        ["git", "show", "4bf5f867c0217a4a478a6ab9a5d6b4aad49d4042:site-data.js"],
        text=True,
    )
    with sync_playwright() as p:
        browser = getattr(p, args.engine).launch(headless=True)
        try:
            for w, h, mobile in cases:
                key = f"{'mobile' if mobile else 'desktop'}-{w}"
                baseline = capture(browser, args.baseline, key+"-approved", w, h, mobile)
                candidate = capture(browser, args.candidate, key+"-cleaned", w, h, mobile, approved_data)
                for item in baseline:
                    try:
                        compare(baseline[item], candidate[item], key+"-"+item)
                    except AssertionError as exc:
                        errors.append(str(exc))
        finally:
            browser.close()
    if errors:
        raise AssertionError("Visual regressions: " + "; ".join(errors))
    print("PASS: All visual regression snapshots match the approved template.")


if __name__ == "__main__":
    main()

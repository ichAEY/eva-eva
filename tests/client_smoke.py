#!/usr/bin/env python3
"""Smoke-test a *real* production site (not the Lumen test fixture) in Chromium or WebKit."""
import argparse
import os
import re

from playwright.sync_api import sync_playwright

HOST = os.environ.get("CLIENT_SITE_URL", "http://127.0.0.1:4176")


def must_equal(locator, expected, label):
    actual = (locator.first.text_content() or "").strip()
    assert actual == expected, f"{label}: {actual!r} instead of {expected!r}"


def check(browser, width, height, mobile, language):
    context = browser.new_context(
        viewport={"width": width, "height": height},
        is_mobile=mobile,
        has_touch=mobile,
        locale="ru-RU",
        reduced_motion="reduce",
    )
    page = context.new_page()
    errors = []
    failed_assets = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("response", lambda response: failed_assets.append(response.url)
            if response.status >= 400 and response.url.startswith(HOST)
            and re.search(r"\.(?:js|css|webp|png|jpe?g|svg)(?:\?|$)", response.url)
            else None)
    page.goto(HOST, wait_until="domcontentloaded", timeout=30000)
    data = page.evaluate("window.TANEM_SITE_DATA")
    assert data and data["mode"] == "production", "Site did not load production data"
    desktop = (width >= 1024) or not mobile
    root = "#salon-desktop-v1" if desktop else "#salon-mobile"
    page.locator(root).wait_for(state="visible", timeout=18000)
    page.wait_for_function("!document.documentElement.classList.contains('br-booting')")
    switch = f'[data-desktop-lang="{language}"]' if desktop else f'[data-lang="{language}"]'
    page.locator(switch).first.click(timeout=9000)
    page.wait_for_timeout(250)
    brand = ".std-header-brand-main" if desktop else ".tn22-title"
    if desktop and data.get("media", {}).get("logo"):
        brand_logo = page.locator(brand + " img")
        assert brand_logo.count() == 1, "Desktop header logo is missing"
        assert (brand_logo.first.get_attribute("alt") or "").strip() == data["salon"]["name"][language], "Desktop header logo alt is incorrect"
    else:
        must_equal(page.locator(brand), data["salon"]["name"][language], "brand")
    if desktop and data.get("media", {}).get("heroDesktop"):
        assert page.locator("#stdHeroMedia").first.get_attribute("src") == data["media"]["heroDesktop"], "Desktop hero did not use heroDesktop"
    assert data["salon"]["name"][language] in page.title(), "Incorrect page title"
    cards = page.locator("#stdServiceList .dct-service-card" if desktop
                         else "#tn13Services .tn31-service-row")
    assert 0 < cards.count() <= len(data["services"]), "Wrong number of service cards"
    for section, entries in [
        ("#salonDesktopTeam" if desktop else "#tn13Team", data["team"]),
        ("#salonDesktopPortfolio" if desktop else "#tn13Portfolio", data["media"]["portfolio"]),
        ("#salonDesktopReviews" if desktop else "#tn13Reviews", data["reviews"]),
    ]:
        if not entries:
            assert page.locator(section).is_hidden(), f"Empty section visible: {section}"
    sample = page.locator("#stdHeaderBookBtn" if desktop else ".tn22-cta")
    sample.click(timeout=9000)
    links = page.locator("#stdBookOverlay .std-book-options a" if desktop
                         else "#tn13BookSheet .tn50-book-option")
    assert links.count() > 0, "Booking actions are missing"
    for href in [link.get_attribute("href") for link in links.all()]:
        assert href and href != "#" and (
            href.startswith(("https://", "tel:", "tg:", "viber:", "whatsapp:"))
        ), f"Invalid booking destination: {href}"
    visible = page.locator("body").inner_text()
    assert not re.search(r"SALON NAME|(?:Услуга|Service)\s+\d{2}\b", visible), (
        "Demo labels remain visible on a production page")
    assert not errors, f"JavaScript errors: {errors}"
    assert not failed_assets, f"Missing site assets: {failed_assets}"
    context.close()
    print(f"PASS {width}x{height}, {'touch' if mobile else 'desktop'}, {language}: customer data, cards and booking")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--engine", choices=["chromium", "webkit"], default="chromium")
    args = parser.parse_args()
    with sync_playwright() as playwright:
        browser = getattr(playwright, args.engine).launch(headless=True)
        try:
            for case in [(1366, 900, False, "ru"), (1366, 900, False, "en"),
                         (1366, 900, False, "hy"), (390, 844, True, "ru"),
                         (390, 844, True, "en"), (390, 844, True, "hy"),
                         (1180, 820, True, "ru")]:
                check(browser, *case)
        finally:
            browser.close()
    print("PASS actual production site on desktop, phone and touch tablet")


if __name__ == "__main__":
    main()

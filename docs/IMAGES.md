# Product images

Owner decision 2026-10-22: use official press images with credit, and remove any on request. Scope: public
press kits and newsroom pages that download without a login. Apple and Beats are included after a direct owner approval the same day, although Apple's terms require written
permission. Login-gated or blocked hubs (Nintendo, Razer, Dell, MSI, Sony, Motorola, Nothing) are skipped.
The terms table below stays as the record of what each brand's pages actually say. Never use retailer, stock or review-site
images, and only use an image when it is clearly the exact model: otherwise the drawing stays.

Status: 56 of 84 products have a photo, the rest keep their drawing.

## How it works

- `Product.image` is optional: `{ src, thumb, alt, credit, sourceUrl }` (`src/lib/data-types.ts`).
- `ProductImage` (`src/components/product-cards/ProductImage.tsx`) renders the photo with explicit
  width and height on a light 3:4 tile (`object-contain`), lazy loaded, and falls back to `DeviceArt`
  when `image` is missing. The product page hero passes `priority` (eager, `fetchpriority=high`) and shows
  a small "Image: <credit>" line.
- `scripts/validate-data.js` fails the build if an image lacks `credit`, `alt` or an https `sourceUrl`,
  or if its WebP files are not in `public/images/products/`.
- Add one: `node scripts/add-product-image.js <slug> <image URL or file> --credit="Brand" --source=<brand page URL>`.
  It only resizes (800px and 300px wide) and converts to WebP. No cropping, no edits.
- Only run it for a brand marked ALLOWED below, and record the product's source URL in the table at the bottom.

## Terms check (read 2026-10-22)

Verdicts: ALLOWED = terms explicitly permit this use. UNCLEAR = silent, login-gated or "personal,
non-commercial use only". Where terms were missing or unreadable we kept the drawing.
"Credit" is the wording the brand requires; none of the others state one.

| Brand (products)          | Terms read                                                                                                     | Verdict and why                                                                                                                                                                                                                                                                                                     | Credit            |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Apple (19)                | https://www.apple.com/legal/intellectual-property/guidelinesfor3rdparties.html                                 | UNCLEAR, treated as no. "You must obtain express written permission from Apple before using any photograph owned or licensed by Apple."                                                                                                                                                                             | none              |
| Beats (1)                 | https://www.beatsbydre.com/company/legal (defers to Apple site terms)                                          | UNCLEAR, no. No copying or republishing "without Apple's express prior written consent".                                                                                                                                                                                                                            | none              |
| Samsung (16)              | https://news.samsung.com/global/terms, https://www.samsung.com/us/common/legal.html                            | UNCLEAR. Newsroom materials are for "personal, informational and non-commercial use". Media library: https://news.samsung.com/us/press-resources/media-library/                                                                                                                                                     | none              |
| Google (9)                | https://blog.google/image-library/                                                                             | ALLOWED but narrow. "Images on this page may be used for publication with credit: "Source: Google."" The library holds only older devices (Pixel 8, Pixel Fold, first Pixel Watch, Buds Pro). None of our 9 Google products is on it, and the grant covers images on that page only. Logos need a separate request. | `Source: Google.` |
| Sony (3)                  | sony.com blocked automated access (403); no terms read                                                         | UNCLEAR, no.                                                                                                                                                                                                                                                                                                        | none              |
| Amazon (1)                | https://press.aboutamazon.com/images-and-videos (no terms stated)                                              | UNCLEAR, no.                                                                                                                                                                                                                                                                                                        | none              |
| Bose (2)                  | https://www.bose.com/legal/terms-of-use                                                                        | UNCLEAR, no. Personal, non-commercial use; no press image hub found.                                                                                                                                                                                                                                                | none              |
| Nintendo (1)              | https://www.nintendo.com/us/terms-of-use/ ; press site needs a login                                           | UNCLEAR, no.                                                                                                                                                                                                                                                                                                        | none              |
| Valve (2)                 | https://www.steamdeck.com/en/press (public press kit, no terms stated); https://www.valvesoftware.com/en/legal | UNCLEAR. A public press kit suggests press use, but Valve's site terms bar posting materials elsewhere. Best candidate to ask.                                                                                                                                                                                      | none              |
| Meta (1), Oakley Meta (1) | https://www.meta.com/media-gallery/ (no image terms); brand centre covers logos only                           | UNCLEAR, no.                                                                                                                                                                                                                                                                                                        | none              |
| Razer (1)                 | https://www.razer.com/legal/general-terms-of-use-mobile ; press assets portal is login-gated                   | UNCLEAR, no.                                                                                                                                                                                                                                                                                                        | none              |
| Viture (1)                | https://www.viture.com/terms-of-service                                                                        | UNCLEAR, no. No press page.                                                                                                                                                                                                                                                                                         | none              |
| Even Realities (1)        | terms page blocked (403)                                                                                       | UNCLEAR, no.                                                                                                                                                                                                                                                                                                        | none              |
| Dell (2)                  | https://www.dell.com/en-us/legal/lp/site-terms-of-use-copyright                                                | UNCLEAR, no. Personal, non-commercial use; no press image terms.                                                                                                                                                                                                                                                    | none              |
| HP (1)                    | https://www.hp.com/us-en/terms-of-use.html (press.hp.com blocked)                                              | UNCLEAR, no. "you may link to, but may not copy, any Materials".                                                                                                                                                                                                                                                    | none              |
| Lenovo (2)                | https://www.lenovo.com/us/en/legal/ (StoryHub has no image terms)                                              | UNCLEAR, no.                                                                                                                                                                                                                                                                                                        | none              |
| Asus (5)                  | https://www.asus.com/Terms_of_Use_Notice_Privacy_Policy/Official-Site ; https://press.asus.com/media/photos/   | UNCLEAR, no. No right to use "images" without written agreement.                                                                                                                                                                                                                                                    | none              |
| MSI (1)                   | terms pages blocked (403)                                                                                      | UNCLEAR, no.                                                                                                                                                                                                                                                                                                        | none              |
| Motorola (4)              | https://www.motorola.com/us/en/legal/terms-of-use (motorolanews.com blocked)                                   | UNCLEAR, no. Other use needs "prior express written consent".                                                                                                                                                                                                                                                       | none              |
| OnePlus (2)               | https://www.oneplus.com/us/legal/copyright ; https://www.oneplus.com/global/press-photos                       | UNCLEAR, no. Press page has no license text and stops at older phones.                                                                                                                                                                                                                                              | none              |
| Nothing (3)               | https://nothing.tech/policies/terms-of-service                                                                 | UNCLEAR, no. No public press hub found.                                                                                                                                                                                                                                                                             | none              |
| Garmin (4)                | https://www.garmin.com/en-US/newsroom/press-kit/ ; https://www.garmin.com/en-US/legal/terms-of-use/            | UNCLEAR, no. Public press-kit zips, but no license; site terms are personal use.                                                                                                                                                                                                                                    | none              |
| Oura (1)                  | https://ouraring.com/newsroom ; https://ouraring.com/terms-and-conditions                                      | UNCLEAR, no. Press kit is a Google Drive folder with no stated terms.                                                                                                                                                                                                                                               | none              |

This is a reading of public pages by an automated check, not legal advice. The fix for UNCLEAR is
written permission: email each brand's press contact (for example press@google.com, press@oneplus.com,
press@nothing.tech, press@ouraring.com, press@beatsbydre.com, press@meta.com), say the use (a credited
product photo on a review page), and keep the reply. After that, flip the brand to ALLOWED here, with the
reply's wording as the credit and restrictions.

## Image processing

Default: resize to WebP only. Where a press image had empty margins, a black background or a cutout-friendly
subject, we changed only the background and framing, never the product:

- Trimmed empty margins (lossless crop, 6% breathing room): most products with a plain white background.
- Padded onto a 3:4 canvas in the photo's own background color: iPhone 18 Pro, iPhone 17 Pro, MacBook Pro 14-inch and
  Apple Watch Ultra 4 (dark backgrounds).
- Background removed (automatic segmentation, each result checked by eye, trimmed): iPad Pro M5, iPhone 17, Galaxy S26,
  S26+, S26 Ultra, Galaxy Z Flip 8, Oura Ring 5, Beats 360. Where removal damaged the product (iPhone 18 Pro, iPhone 17 Pro,
  MacBook Pro 14, Apple Watch Ultra 3 and 4) the original pixels are kept.
- Cropped to the device only (side text cut off): Pixel 11 Pro, Pixel Watch 5.

Brands whose terms forbid alteration would need these steps redone as resize-only.

## Source URLs per product

Same as `image.sourceUrl` in `data/products.json`. Products not listed use the drawing.

| Slug                       | Credit  | Brand page                                                                                                                                         |
| -------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| iphone-duo                 | Apple   | https://www.apple.com/newsroom/2026/09/apple-unveils-iphone-duo/                                                                                   |
| iphone-18-pro              | Apple   | https://www.apple.com/newsroom/2026/09/apple-debuts-iphone-18-pro-and-iphone-18-pro-max/                                                           |
| galaxy-z-fold-8            | Samsung | https://news.samsung.com/us/samsung-making-most-new-galaxy-z-fold8/                                                                                |
| iphone-17                  | Apple   | https://www.apple.com/newsroom/2025/09/apple-debuts-iphone-17/                                                                                     |
| iphone-17-pro              | Apple   | https://www.apple.com/newsroom/2025/09/apple-unveils-iphone-17-pro-and-iphone-17-pro-max/                                                          |
| iphone-air                 | Apple   | https://www.apple.com/newsroom/2025/09/introducing-iphone-air-a-powerful-new-iphone-with-a-breakthrough-design/                                    |
| galaxy-s26-ultra           | Samsung | https://news.samsung.com/us/samsung-unveils-galaxy-s26-series-most-intuitive-galaxy-ai-phone-yet/                                                  |
| pixel-11-pro               | Google  | https://blog.google/products-and-platforms/devices/pixel/made-by-google-2026/                                                                      |
| galaxy-z-flip-8            | Samsung | https://news.samsung.com/us/samsung-galaxy-z-fold8-ultra-fold8-flip8-foldables-perfected-every-way-of-living/                                      |
| apple-vision-pro-m5        | Apple   | https://www.apple.com/newsroom/2025/10/apple-vision-pro-upgraded-with-the-m5-chip-and-dual-knit-band/                                              |
| apple-watch-series-11      | Apple   | https://www.apple.com/newsroom/2025/09/apple-debuts-apple-watch-series-11-featuring-groundbreaking-health-insights/                                |
| apple-watch-ultra-3        | Apple   | https://www.apple.com/newsroom/2025/09/introducing-apple-watch-ultra-3/                                                                            |
| bose-qc-ultra-earbuds-2    | Bose    | https://www.bose.com/pressroom/bose-announces-the-quietcomfort-ultra-earbuds-2nd-gen                                                               |
| galaxy-s26                 | Samsung | https://news.samsung.com/us/samsung-unveils-galaxy-s26-series-most-intuitive-galaxy-ai-phone-yet/                                                  |
| ipad-pro-m5                | Apple   | https://www.apple.com/newsroom/2025/10/apple-introduces-the-powerful-new-ipad-pro-with-the-m5-chip/                                                |
| iphone-17e                 | Apple   | https://www.apple.com/newsroom/2026/03/apple-introduces-iphone-17e/                                                                                |
| macbook-air-m5             | Apple   | https://www.apple.com/newsroom/2026/03/apple-introduces-the-new-macbook-air-with-m5/                                                               |
| macbook-pro-14-m5          | Apple   | https://www.apple.com/newsroom/2025/10/apple-unveils-new-14-inch-macbook-pro-powered-by-the-m5-chip/                                               |
| oneplus-15                 | OnePlus | https://www.oneplus.com/us/oneplus-15                                                                                                              |
| pixel-watch-5              | Google  | https://blog.google/products-and-platforms/devices/pixel/made-by-google-2026/                                                                      |
| valve-steam-machine        | Valve   | https://store.steampowered.com/hardware/steammachine                                                                                               |
| galaxy-watch-9             | Samsung | https://news.samsung.com/us/samsung-whats-new-galaxy-watch9/                                                                                       |
| airpods-pro-3              | Apple   | https://www.apple.com/newsroom/2025/09/introducing-airpods-pro-3-the-ultimate-audio-experience/                                                    |
| pixel-11                   | Google  | https://blog.google/products-and-platforms/devices/pixel/google-pixel-11-pro-xl/                                                                   |
| meta-ray-ban-display       | Meta    | https://www.meta.com/ai-glasses/meta-ray-ban-display/                                                                                              |
| apple-watch-ultra-4        | Apple   | https://www.apple.com/newsroom/2026/09/apple-unveils-apple-watch-ultra-4/                                                                          |
| galaxy-s26-plus            | Samsung | https://news.samsung.com/us/samsung-unveils-galaxy-s26-series-most-intuitive-galaxy-ai-phone-yet/                                                  |
| galaxy-z-trifold           | Samsung | https://news.samsung.com/us/samsung-introducing-galaxy-z-trifold-shape-whats-next-mobile-innovation/                                               |
| pixel-10a                  | Google  | https://blog.google/products-and-platforms/devices/pixel/google-pixel-10a/                                                                         |
| pixel-10-pro-fold          | Google  | https://blog.google/products-and-platforms/devices/pixel/google-pixel-10-pro-fold/                                                                 |
| ipad-air-m4                | Apple   | https://www.apple.com/newsroom/2026/03/macbook-neo-iphone-17e-ipad-air-with-m4-and-more-are-now-available/                                         |
| hp-omnibook-ultra-14-2026  | HP      | https://www.hp.com/us-en/newsroom/press-kits/2026/hpatces.html                                                                                     |
| macbook-neo                | Apple   | https://www.apple.com/newsroom/2026/03/say-hello-to-macbook-neo/                                                                                   |
| galaxy-book6-pro           | Samsung | https://news.samsung.com/us/samsungs-powerful-galaxy-book6-series-available-march-11/                                                              |
| galaxy-buds-4              | Samsung | https://news.samsung.com/us/samsung-unveils-galaxy-buds4-series-best-hi-fi-sound-enhanced-comfort-fit/                                             |
| bose-qc-ultra-headphones-2 | Bose    | https://www.bose.com/pressroom/bose-unveils-the-next-generation-of-the-quietcomfort-ultra-headphones                                               |
| steam-frame                | Valve   | https://store.steampowered.com/hardware/steamframe                                                                                                 |
| rog-xbox-ally-x            | ASUS    | https://press.asus.com/news/press-releases/rog-xbox-ally-handheld-gaming/                                                                          |
| garmin-fenix-9-pro         | Garmin  | https://www.garmin.com/en-US/newsroom/press-release/outdoor/garmin-expands-its-flagship-performance-smartwatch-lineup-with-fenix9-and-fenix9-pro/  |
| rog-xbox-ally              | ASUS    | https://press.asus.com/news/press-releases/rog-xbox-ally-handheld-gaming/                                                                          |
| samsung-galaxy-xr          | Samsung | https://news.samsung.com/us/introducing-galaxy-xr-opening-new-worlds/                                                                              |
| galaxy-buds-4-pro          | Samsung | https://news.samsung.com/us/samsung-week-discover-new-ways-live-smarter-exclusive-deals-rewards/                                                   |
| lenovo-legion-go-2         | Lenovo  | https://news.lenovo.com/press-kits/innovation-world-2025/                                                                                          |
| oakley-meta-vanguard       | Meta    | https://www.meta.com/ai-glasses/oakley-meta-vanguard/                                                                                              |
| galaxy-watch-ultra-2       | Samsung | https://news.samsung.com/us/samsung-week-discover-new-ways-live-smarter-exclusive-deals-rewards/                                                   |
| garmin-forerunner-170      | Garmin  | https://www.garmin.com/en-US/p/1915560/                                                                                                            |
| garmin-forerunner-70       | Garmin  | https://www.garmin.com/en-US/p/1941179/                                                                                                            |
| pixel-buds-2a              | Google  | https://store.google.com/product/pixel_buds_2a                                                                                                     |
| thinkpad-x1-carbon-gen14   | Lenovo  | https://news.lenovo.com/press-kits/tech-world-ces-2026/                                                                                            |
| garmin-cirqa               | Garmin  | https://www.garmin.com/en-US/newsroom/press-release/wearables-health/meet-cirqa-smart-band-the-screen-free-health-and-fitness-tracker-from-garmin/ |
| pixel-11-pro-fold          | Google  | https://blog.google/products-and-platforms/devices/pixel/pixel-11-pro-fold/                                                                        |
| beats-360                  | Beats   | https://www.beatsbydre.com/company/press/beats-360                                                                                                 |
| oneplus-15r                | OnePlus | https://www.oneplus.com/us/oneplus-15r                                                                                                             |
| apple-watch-series-12      | Apple   | https://www.apple.com/newsroom/2026/09/introducing-apple-watch-series-12-with-the-all-new-health-sensing-system/                                   |
| oura-ring-5                | Oura    | https://ouraring.com/newsroom                                                                                                                      |
| airpods-5                  | Apple   | https://www.apple.com/newsroom/2026/09/apple-introduces-airpods-5-with-best-in-class-open-ear-active-noise-cancellation/                           |

Kept as drawings and why: Nintendo, Razer (login-gated); Dell, MSI, Sony, Motorola (press pages blocked);
Nothing, Viture, Even Realities (no public press kit); and products where only lifestyle shots, multi-model collages or
text banners were available (Galaxy S26 FE, A57, A37, Tab S12 Ultra, Fitbit Air, Zenbook A14 and A16, Zephyrus G14,
MacBook Pro 16-inch, Kindle Scribe Colorsoft). Photos for Garmin, Meta, Valve and OnePlus come from the brand's own
product pages when the newsroom had none; they are credited the same way.

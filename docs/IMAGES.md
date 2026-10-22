# Product images

Owner decision 2026-10-22: use official press images with credit, and remove any on request. Scope: public
press kits and newsroom pages that download without a login. Apple and Beats (Apple's terms require written
permission) are excluded, and so are login-gated or blocked hubs (Nintendo, Razer, Dell, MSI, Sony, Motorola, Nothing).
The terms table below stays as the record of what each brand's pages actually say. Never use retailer, stock or review-site
images, and only use an image when it is clearly the exact model: otherwise the drawing stays.

Status: 17 of 84 products have a photo, the rest keep their drawing.

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

## Source URLs per product

Same as `image.sourceUrl` in `data/products.json`. Products not listed use the drawing.

| Slug                       | Credit  | Brand page                                                                                                                                         |
| -------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| galaxy-z-fold-8            | Samsung | https://news.samsung.com/us/samsung-making-most-new-galaxy-z-fold8/                                                                                |
| bose-qc-ultra-earbuds-2    | Bose    | https://www.bose.com/pressroom/bose-announces-the-quietcomfort-ultra-earbuds-2nd-gen                                                               |
| galaxy-z-trifold           | Samsung | https://news.samsung.com/us/samsung-introducing-galaxy-z-trifold-shape-whats-next-mobile-innovation/                                               |
| pixel-10a                  | Google  | https://blog.google/products-and-platforms/devices/pixel/google-pixel-10a/                                                                         |
| pixel-10-pro-fold          | Google  | https://blog.google/products-and-platforms/devices/pixel/google-pixel-10-pro-fold/                                                                 |
| hp-omnibook-ultra-14-2026  | HP      | https://www.hp.com/us-en/newsroom/press-kits/2026/hpatces.html                                                                                     |
| bose-qc-ultra-headphones-2 | Bose    | https://www.bose.com/pressroom/bose-unveils-the-next-generation-of-the-quietcomfort-ultra-headphones                                               |
| rog-xbox-ally-x            | ASUS    | https://press.asus.com/news/press-releases/rog-xbox-ally-handheld-gaming/                                                                          |
| garmin-fenix-9-pro         | Garmin  | https://www.garmin.com/en-US/newsroom/press-release/outdoor/garmin-expands-its-flagship-performance-smartwatch-lineup-with-fenix9-and-fenix9-pro/  |
| rog-xbox-ally              | ASUS    | https://press.asus.com/news/press-releases/rog-xbox-ally-handheld-gaming/                                                                          |
| samsung-galaxy-xr          | Samsung | https://news.samsung.com/us/introducing-galaxy-xr-opening-new-worlds/                                                                              |
| lenovo-legion-go-2         | Lenovo  | https://news.lenovo.com/press-kits/innovation-world-2025/                                                                                          |
| galaxy-watch-ultra-2       | Samsung | https://news.samsung.com/us/samsung-week-discover-new-ways-live-smarter-exclusive-deals-rewards/                                                   |
| thinkpad-x1-carbon-gen14   | Lenovo  | https://news.lenovo.com/press-kits/tech-world-ces-2026/                                                                                            |
| garmin-cirqa               | Garmin  | https://www.garmin.com/en-US/newsroom/press-release/wearables-health/meet-cirqa-smart-band-the-screen-free-health-and-fitness-tracker-from-garmin/ |
| pixel-11-pro-fold          | Google  | https://blog.google/products-and-platforms/devices/pixel/pixel-11-pro-fold/                                                                        |
| oura-ring-5                | Oura    | https://ouraring.com/newsroom                                                                                                                      |

Kept as drawings and why: Apple and Beats (excluded); Nintendo, Razer (login-gated); Dell, MSI, Sony, Motorola
(press pages blocked); Nothing, Viture, Even Realities (no public press kit); Valve, OnePlus (press kits only cover older
products); and individual products where only lifestyle shots, multi-model collages or an unverifiable model were available
(most Samsung and Pixel phones and watches, Forerunner 70 and 170, Zenbooks, Zephyrus G14, Meta glasses, Kindle Scribe Colorsoft).

## Weekly refresh

`refresh.js` adds new products without an `image`, so they show the drawing, which is the safe default.
For a brand marked ALLOWED, after the refresh run `scripts/add-product-image.js` for each new product
(the image must come from that brand's own newsroom, per the table). This is manual on purpose: finding the
right press image for a new product needs a person to confirm it is the right model.

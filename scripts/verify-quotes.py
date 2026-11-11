#!/usr/bin/env python3
"""Check that every review excerpt appears word for word on the outlet's page.

Usage: python3 scripts/verify-quotes.py [product-id[,product-id] ...]   (default: all)
Prints FULL / MISS per review and exits 1 if any page loaded but lacks its quote.
Pages that block scripted fetches (403/429) are reported as BLOCKED, not failures;
check those by hand. Multi-page reviews (GSMArena ...p2.php to p9.php) are followed.
Run after scripts/import-product.js, before publishing.
"""
import html, json, os, re, subprocess, sys, unicodedata
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
QUOTES = {'’': "'", '‘': "'", '“': '"', '”': '"', '–': '-', '—': '-'}


def norm(s, page=False):
    if page:
        # Quotes must come from the article body, not metadata or related-article teasers.
        s = re.sub(r'<(script|style|noscript)\b.*?</\1>', ' ', s, flags=re.S | re.I)
        # Inline tags vanish (Pixel</a>'s stays one word); block tags become spaces.
        s = re.sub(r'</?(p|div|br|li|h[1-6]|section|article|blockquote|figure|figcaption|td|tr)\b[^>]*>', ' ', s, flags=re.I)
        s = re.sub(r'<[^>]+>', '', s)
    else:
        s = re.sub(r'<[^>]+>', ' ', s)
    s = unicodedata.normalize('NFKC', html.unescape(s))
    for a, b in QUOTES.items():
        s = s.replace(a, b)
    return re.sub(r'\s+', ' ', s.replace('\\"', '"')).strip().lower()


def fetch(url):
    out = subprocess.run(['curl', '-sL', '-A', UA, '-m', '30', '-w', '\n%{http_code}', url], capture_output=True, text=True, errors='ignore').stdout
    body, _, code = out.rpartition('\n')
    return code, norm(body, page=True)


def fetch_ladder(url):
    """The page as the paid fetch services or the Internet Archive read it (scripts/fetch-page.js), or None.
    A page the refresh already read that way is in the run's cache, so this costs nothing again."""
    try:
        alt = subprocess.run(['node', str(ROOT / 'scripts' / 'fetch-page.js'), url], capture_output=True, text=True, errors='ignore', timeout=200)
    except (subprocess.TimeoutExpired, OSError):
        return None
    return norm(alt.stdout, page=True) if alt.returncode == 0 and alt.stdout.strip() else None


# Reviews added in this run (productId/outletId lines of the file named by ADDED_FILE): only these can be dropped, so
# only these are worth a second look through a paid service. Without ADDED_FILE (a manual run) every review may be.
ADDED = None
if os.environ.get('ADDED_FILE') and Path(os.environ['ADDED_FILE']).exists():
    ADDED = set(Path(os.environ['ADDED_FILE']).read_text().split())


def candidates(url):
    yield url
    if 'gsmarena.com' in url and not re.search(r'p\d+\.php$', url):
        for n in range(2, 10):
            yield url.replace('.php', f'p{n}.php')


def check(r):
    want = norm(r['excerpt']).rstrip('.!?…')
    if len(re.findall(r'\w+', want)) < 3:
        # An empty or punctuation-only excerpt is "in" every page; never count it as found.
        return 'MISS', r, 'excerpt too short to verify'
    first_code = None
    for u in candidates(r['url']):
        code, page = fetch(u)
        first_code = first_code or code
        if want in page:
            return 'FULL', r, u
        if first_code != '200':
            break  # the first page could not be read: later pages of a multi-page review cannot be either
    # Not on the plain page (blocked, a bot wall, an empty shell): look at the copy the paid services or the Internet
    # Archive return. The quote still has to be on it word for word. Not for a page that does not exist.
    if first_code not in ('404', '410') and (ADDED is None or f"{r['productId']}/{r['outletId']}" in ADDED):
        for u in candidates(r['url']):
            page = fetch_ladder(u)
            if page is None:
                break
            if want in page:
                return 'FULL', r, u
    # 000 = timeout/connection failure: not evidence the quote is wrong.
    return ('BLOCKED' if first_code in ('000', '403', '429', '451', '503') else 'MISS'), r, first_code


def main():
    # Ids may be comma- or space-separated: "a,b", "a b" or "a,b c".
    ids = {i for arg in sys.argv[1:] for i in arg.split(',') if i} or None
    reviews = [r for r in json.loads((ROOT / 'data/reviews.json').read_text()) if not ids or r['productId'] in ids]
    with ThreadPoolExecutor(8) as pool:
        results = list(pool.map(check, reviews))
    counts = {}
    for status, r, where in results:
        counts[status] = counts.get(status, 0) + 1
        if status != 'FULL':
            print(f"{status:8} {r['productId']}/{r['outletId']} ({where}) {r['url']}")
    print(counts)
    sys.exit(1 if counts.get('MISS') else 0)


if __name__ == '__main__':
    main()

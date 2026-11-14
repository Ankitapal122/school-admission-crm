"""
Downloads real photos from each school's OWN website: logo, cover image and facility photos (laboratory, sports,
library, classroom, auditorium, ...), aiming for at least MIN_PER_SCHOOL photos per school, no duplicates.
Nothing is generated or edited. Safe to stop (Ctrl+C) and restart: schools already in images_log.csv are skipped.

    pip install requests beautifulsoup4 pillow
    python images.py

Output:  school_images/<state>/<school-id>_logo.png
         school_images/<state>/<school-id>_cover.jpg
         school_images/<state>/<school-id>_<facility>.jpg      (one folder per state, all its schools inside)
         images_log.csv                                         (school, facility, file, source image URL, page, note)
"""
import csv
import glob
import hashlib
import io
import json
import os
import re
import threading
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib import robotparser
from urllib.parse import urljoin, urlparse

import requests
import urllib3
from bs4 import BeautifulSoup
from PIL import Image

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# ----------------------------------------------------------------------------- settings
UA = 'Mozilla/5.0 (compatible; GurukulGatewayBot/1.0; +mailto:you@example.com)'   # put a real e-mail here
OUT = 'school_images'
TEST_LIMIT = None          # number of schools to process in this run; None = all remaining schools
WORKERS = 12             # schools processed at the same time
TIMEOUT = 10             # seconds per request
MIN_W, MIN_H = 500, 300  # smaller facility photos are ignored
COVER_MIN_W, COVER_MIN_H = 800, 400   # the cover image must be at least this big
LOGO_MIN = 48            # logo must be at least this many pixels wide and high (SVG logos are always accepted)
MAX_PAGES = 10           # homepage + up to 9 facility / gallery pages per school
MAX_DOWNLOADS = 150      # facility images checked per school
PER_CATEGORY = 2         # photos kept per facility in the first pass
GENERAL_MAX = 6          # photos that could not be matched to any facility (campus / building views)
MIN_PER_SCHOOL = 10      # aim for at least this many facility photos per school (logo and cover not counted)
MAX_PER_SCHOOL = 20      # never save more than this many facility photos per school
DUP_DISTANCE = 6         # images this similar (0-64) count as duplicates
GLOBAL_DEDUPE = False    # True = never reuse a photo across different schools (chain schools share photos)
RETRY_FAILED = False     # True = on restart, also retry schools that earlier got no photos

os.makedirs(OUT, exist_ok=True)

# order matters: the first match wins
CATEGORIES = [(n, re.compile(rx)) for n, rx in [
    ('computer_lab', r'computer|\bict\b'),
    ('laboratory', r'\blabs?\b|laborator|physics|chemistry|biology|science|robotic|tinkering|\bstem\b|\batal\b'),
    ('library', r'librar|reading room'),
    ('sports', r'sport|playground|football|cricket|basketball|swimming|\bpool\b|athletic|tennis|badminton|skating|'
               r'stadium|\bcourt\b|\bgym|yoga|archery|riding|\bfield\b|\bgrounds?\b'),
    ('dining', r'\bmess\b|dining|canteen|cafeteria|kitchen|refectory'),
    ('auditorium', r'auditorium|assembly|\bhall\b|theat|seminar|amphitheat|\bstage\b|conference'),
    ('classroom', r'classroom|class room|smart class|\bclass(es)?\b|lecture'),
    ('hostel', r'hostel|dormitor|\bdorm|boarding house|bedroom|residential'),
    ('art_music', r'\bart\b|craft|music|dance|studio|pottery|painting|drama'),
    ('medical', r'medical|infirmary|sick room|health'),
    ('campus', r'campus|building|infrastructure|facade|entrance|\bgate\b|aerial|garden|lawn'),
]]
SKIP = re.compile(r'logo|icon|sprite|favicon|avatar|placeholder|facebook|whatsapp|twitter|instagram|youtube|linkedin|'
                  r'arrow|button|loader|spinner|badge|\bqr\b|principal|director|chairman|founder|faculty|teacher|'
                  r'testimonial|alumni|topper|result', re.I)
LOGO_BAD = re.compile(r'cbse|icse|isc\b|affiliat|\biso\b|nirf|award|sponsor|partner|facebook|twitter|instagram|youtube|'
                      r'whatsapp|linkedin|google|play-?store|app-?store|ncert|digital-?india|swachh|g20|azadi|badge|ranking',
                      re.I)
PAGE_HINT = re.compile(r'facilit|infrastructure|campus|gallery|photo|life|lab|sport|librar|hostel|boarding|activit|'
                       r'amenit|about|tour|virtual', re.I)
IMG_EXT = re.compile(r'\.(jpe?g|png|webp)(\?|$)', re.I)
RETRY_REASONS = ('timed out', 'connection failed', 'SSL certificate error')
NAME_STOP = {'school', 'public', 'senior', 'secondary', 'higher', 'international', 'academy', 'college'}

LOCK = threading.Lock()
GLOBAL_HASHES = []


# ----------------------------------------------------------------------------- helpers
def safe(s):
    return re.sub(r'[^a-z0-9-]+', '-', (s or '').lower()).strip('-')


def norm(t):
    return ' ' + re.sub(r'[^a-z]+', ' ', (t or '').lower()) + ' '


def label(text):
    t = norm(text)
    for name, rx in CATEGORIES:
        if rx.search(t):
            return name
    return None


_ROBOTS = {}


def robots_ok(url):
    u = urlparse(url)
    if u.netloc not in _ROBOTS:
        rp = robotparser.RobotFileParser()
        try:
            r = requests.get(f'{u.scheme}://{u.netloc}/robots.txt', headers={'User-Agent': UA}, timeout=8)
            if r.status_code == 200:
                rp.parse(r.text.splitlines())
            else:
                rp = None
        except Exception:
            rp = None
        _ROBOTS[u.netloc] = rp
    rp = _ROBOTS[u.netloc]
    return True if rp is None else rp.can_fetch(UA, url)


def get_html(url):
    """-> ((html, final_url), '')  or  (None, reason)"""
    if not robots_ok(url):
        return None, 'robots.txt disallows bots'
    reason = 'connection failed'
    for verify in (True, False):                       # second try ignores a broken SSL certificate
        try:
            r = requests.get(url, headers={'User-Agent': UA}, timeout=TIMEOUT, verify=verify)
            if r.status_code != 200:
                return None, f'HTTP {r.status_code}'
            if 'html' not in r.headers.get('Content-Type', 'html'):
                return None, 'not a web page'
            return (r.text, r.url), ''
        except requests.exceptions.SSLError:
            reason = 'SSL certificate error'
        except requests.exceptions.Timeout:
            return None, 'timed out'
        except requests.RequestException:
            return None, 'connection failed'
    return None, reason


def site_variants(site):
    """The address as given, then https, then the www / non-www versions of both (max 4)."""
    if not site.startswith('http'):
        site = 'http://' + site
    u = urlparse(site)
    other = u.netloc[4:] if u.netloc.startswith('www.') else 'www.' + u.netloc
    path = u.path or '/'
    out = [f'{u.scheme}://{u.netloc}{path}', f'https://{u.netloc}{path}',
           f'{u.scheme}://{other}{path}', f'https://{other}{path}']
    return list(dict.fromkeys(out))


def open_site(site):
    """-> (home, working_url, reason).  home = (html, final_url) or None."""
    last = 'site not reachable'
    for url in site_variants(site):
        res, why = get_html(url)
        if res:
            return res, url, ''
        last = why
        if why not in RETRY_REASONS:                   # the site answered (403, robots...): other variants will not help
            break
    return None, site, last


def dhash(im):
    px = im.convert('L').resize((9, 8)).tobytes()
    bits = 0
    for r in range(8):
        for c in range(8):
            bits = (bits << 1) | (px[r * 9 + c] > px[r * 9 + c + 1])
    return bits


def dist(a, b):
    return bin(a ^ b).count('1')


def fetch_bytes(url):
    for verify in (True, False):
        try:
            r = requests.get(url, headers={'User-Agent': UA}, timeout=TIMEOUT, verify=verify)
            if r.status_code == 200 and len(r.content) < 15_000_000:
                return r.content
            return None
        except requests.exceptions.SSLError:
            continue
        except Exception:
            return None
    return None


def fetch_image(url):
    full = re.sub(r'-\d{2,4}x\d{2,4}(?=\.\w{3,4}(\?|$))', '', url)   # WordPress thumbnail -> full size
    for u in dict.fromkeys([full, url]):
        data = fetch_bytes(u)
        if data:
            try:
                return Image.open(io.BytesIO(data))
            except Exception:
                continue
    return None


def best_src(img, base):
    srcset = img.get('data-srcset') or img.get('srcset')
    if srcset:
        best, bw = None, -1
        for part in srcset.split(','):
            bits = part.strip().split()
            if not bits:
                continue
            w = int(bits[1][:-1]) if len(bits) > 1 and bits[1][:-1].isdigit() else 0
            if w > bw:
                best, bw = bits[0], w
        if best:
            return urljoin(base, best)
    for a in ('data-src', 'data-lazy-src', 'data-original', 'src'):
        v = img.get(a)
        if v and not v.startswith('data:'):
            return urljoin(base, v)
    return None


def page_images(html, page_url):
    """-> list of (image_url, own_text, nearest_heading, page_text)"""
    soup = BeautifulSoup(html, 'html.parser')
    page_text = (soup.title.get_text(' ') if soup.title else '') + ' ' + urlparse(page_url).path
    out = []
    og = soup.find('meta', property='og:image')
    if og and og.get('content'):
        out.append((urljoin(page_url, og['content']), os.path.basename(og['content']), '', ''))
    for img in soup.find_all('img'):
        src = best_src(img, page_url)
        a = img.find_parent('a', href=True)
        if a and IMG_EXT.search(a['href']):          # gallery thumbnails usually link to the big photo
            src = urljoin(page_url, a['href'])
        if not src:
            continue
        fig = img.find_parent('figure')
        cap = fig.get_text(' ')[:150] if fig else ''
        own = ' '.join([os.path.basename(urlparse(src).path), img.get('alt') or '', img.get('title') or '', cap,
                        (a.get('title') or '') if a else ''])
        h = img.find_previous(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
        out.append((src, own, h.get_text(' ')[:100] if h else '', page_text))
    return out


def find_pages(html, base):
    soup = BeautifulSoup(html, 'html.parser')
    host = urlparse(base).netloc.replace('www.', '')
    scored = {}
    for a in soup.find_all('a', href=True):
        href = urljoin(base, a['href']).split('#')[0]
        p = urlparse(href)
        if p.scheme not in ('http', 'https') or p.netloc.replace('www.', '') != host:
            continue
        if re.search(r'\.(pdf|jpe?g|png|zip|docx?)$', p.path, re.I) or href.rstrip('/') == base.rstrip('/'):
            continue
        text = a.get_text(' ') + ' ' + p.path
        n = len(PAGE_HINT.findall(text))
        if n:
            scored[href] = max(scored.get(href, 0), n + (2 if re.search(r'facilit|infrastructure|gallery', text, re.I) else 0))
    return [u for u, _ in sorted(scored.items(), key=lambda kv: -kv[1])]


# ----------------------------------------------------------------------------- logo
def find_logos(html, page_url, name):
    """Possible logo addresses on the homepage, best first (max 5)."""
    soup = BeautifulSoup(html, 'html.parser')
    tokens = [t for t in re.findall(r'[a-z]{4,}', (name or '').lower()) if t not in NAME_STOP]
    scored = {}

    def add(url, score):
        if url and not url.startswith('data:'):
            scored[url] = max(scored.get(url, -99), score)

    for tag in soup.find_all('script', type='application/ld+json'):     # the school's own "logo" declaration
        try:
            data = json.loads(tag.string or tag.get_text() or '')
        except Exception:
            continue
        stack = [data]
        while stack:
            x = stack.pop()
            if isinstance(x, dict):
                lg = x.get('logo')
                if isinstance(lg, dict):
                    lg = lg.get('url')
                if isinstance(lg, str):
                    add(urljoin(page_url, lg), 6)
                stack.extend(x.values())
            elif isinstance(x, list):
                stack.extend(x)
    for img in soup.find_all('img'):
        src = best_src(img, page_url)
        if not src:
            continue
        meta = ' '.join([src, img.get('alt') or '', ' '.join(img.get('class') or []), img.get('id') or ''])
        if not re.search(r'logo|brand|crest|emblem', meta, re.I):
            continue
        score = 2
        if img.find_parent(['header', 'nav']):
            score += 3
        if any(t in meta.lower() for t in tokens):
            score += 2
        if LOGO_BAD.search(meta):
            score -= 5
        add(src, score)
    for link in soup.find_all('link', rel=True, href=True):
        if 'apple-touch-icon' in ' '.join(link['rel']).lower():
            add(urljoin(page_url, link['href']), 1)
    return [u for u, s in sorted(scored.items(), key=lambda kv: -kv[1]) if s > 0][:5]


def save_logo(urls, folder, slug):
    """-> (file_name, source_url) or None. SVG logos are saved as they are, others as PNG (transparency kept)."""
    for u in urls:
        data = fetch_bytes(u)
        if not data:
            continue
        if b'<svg' in data[:2000].lower():
            fname = f'{slug}_logo.svg'
            with open(os.path.join(folder, fname), 'wb') as f:
                f.write(data)
            return fname, u
        try:
            im = Image.open(io.BytesIO(data))
            if im.width < LOGO_MIN or im.height < LOGO_MIN:
                continue
            im = im.convert('RGBA') if im.mode in ('P', 'LA', 'RGBA') else im.convert('RGB')
            fname = f'{slug}_logo.png'
            im.save(os.path.join(folder, fname))
            return fname, u
        except Exception:
            continue
    return None


# ----------------------------------------------------------------------------- one school
def do_school(r):
    site = (r.get('website') or '').strip()
    slug = r.get('uid') or safe(r.get('slug') or r.get('name'))
    state_dir = r.get('state_dir') or 'unknown'
    if not site or not slug:
        return slug, site, [], 'no website'

    folder = os.path.join(OUT, state_dir)                       # one folder per state
    os.makedirs(folder, exist_ok=True)

    def rel(fname):
        return f'{state_dir}/{fname}'

    for old in glob.glob(os.path.join(folder, f'{slug}_*')):    # remove half-finished files from a stopped run
        try:
            os.remove(old)
        except OSError:
            pass

    home, site, why = open_site(site)
    if not home:
        return slug, site, [], why

    items, notes = [], []                                        # logo + cover go here, facility photos in `saved`

    # --- logo
    logo = save_logo(find_logos(home[0], home[1], r.get('name')), folder, slug)
    if logo:
        items.append(('logo', rel(logo[0]), logo[1], home[1]))
    else:
        notes.append('logo not found')

    # --- facility photo candidates from the homepage and the facility / gallery pages
    pages = [home] + [res for res in (get_html(u)[0] for u in find_pages(*home)[:MAX_PAGES - 1]) if res]
    cands = {}   # url -> (rank, category, page)     rank: 0 = image's own text, 1 = heading, 2 = page, 3 = unknown
    for html, purl in pages:
        for src, own, head, ptext in page_images(html, purl):
            path = urlparse(src).path                    # skip-words are checked in the path only, never the domain
            if SKIP.search(path) or path.lower().endswith(('.svg', '.gif')):
                continue
            cat, rank = label(own), 0
            if not cat:
                cat, rank = label(head), 1
            if not cat:
                cat, rank = label(ptext), 2
            if not cat:
                cat, rank = 'general', 3
            if src not in cands or rank < cands[src][0]:
                cands[src] = (rank, cat, purl)

    saved, counts, hashes, downloads, tried = [], Counter(), [], 0, set()

    # --- cover image: the first big landscape photo on the homepage (the og:image comes first)
    tries = 0
    for src, own, head, ptext in page_images(*home):
        path = urlparse(src).path
        if SKIP.search(path) or path.lower().endswith(('.svg', '.gif')):
            continue
        if tries >= 12:
            break
        tries += 1
        im = fetch_image(src)
        if im is None or im.width < COVER_MIN_W or im.height < COVER_MIN_H:
            continue
        if not (1.2 <= im.width / im.height <= 3.2):
            continue
        try:
            fname = f'{slug}_cover.jpg'
            im.convert('RGB').save(os.path.join(folder, fname), quality=92)
            hashes.append(dhash(im))                       # so the same picture is not saved again as a facility photo
        except Exception:
            continue
        tried.add(src)
        items.append(('cover', rel(fname), src, home[1]))
        break
    else:
        notes.append('cover not found')
    if tries == 0 and not any(c == 'cover' for c, *_ in items) and 'cover not found' not in notes:
        notes.append('cover not found')

    ordered = sorted(cands.items(), key=lambda kv: kv[1][0])

    def try_save(url, cat, purl):
        nonlocal downloads
        tried.add(url)
        downloads += 1
        im = fetch_image(url)
        if im is None or im.width < MIN_W or im.height < MIN_H:
            return
        ratio = im.width / im.height
        if ratio > 3 or ratio < 0.5:                    # banners / strips
            return
        try:
            h = dhash(im)
        except Exception:
            return
        if any(dist(h, x) <= DUP_DISTANCE for x in hashes):
            return
        if GLOBAL_DEDUPE:
            with LOCK:
                if any(dist(h, x) <= DUP_DISTANCE for x in GLOBAL_HASHES):
                    return
                GLOBAL_HASHES.append(h)
        n = counts[cat] + 1
        fname = f'{slug}_{cat}.jpg' if n == 1 else f'{slug}_{cat}_{n}.jpg'
        try:
            im.convert('RGB').save(os.path.join(folder, fname), quality=92)
        except Exception:
            return
        counts[cat] += 1
        hashes.append(h)
        saved.append((cat, rel(fname), url, purl))

    # pass 1: a spread across facilities (up to PER_CATEGORY each)
    for url, (rank, cat, purl) in ordered:
        if len(saved) >= MAX_PER_SCHOOL or downloads >= MAX_DOWNLOADS:
            break
        if url in tried or counts[cat] >= (GENERAL_MAX if cat == 'general' else PER_CATEGORY):
            continue
        try_save(url, cat, purl)

    # pass 2: still under the target -> take the remaining real photos, whatever their facility
    if len(saved) < MIN_PER_SCHOOL:
        for url, (rank, cat, purl) in ordered:
            if len(saved) >= MIN_PER_SCHOOL or downloads >= MAX_DOWNLOADS:
                break
            if url not in tried:
                try_save(url, cat, purl)

    if not saved:
        notes.insert(0, 'no usable facility photos (photos too small, or loaded by JavaScript)')
    elif len(saved) < MIN_PER_SCHOOL:
        notes.insert(0, f'only {len(saved)} usable photos on the site')
    return slug, site, items + saved, '; '.join(notes)


# ----------------------------------------------------------------------------- load schools and run
def pick_states(by_state):
    """Show the states found in the JSON files and ask which one(s) to process."""
    states = sorted(by_state)
    print('\nStates available (schools with a website):')
    for i, s in enumerate(states, 1):
        print(f'  {i:>2}. {s} ({len(by_state[s])})')
    while True:
        ans = input('\nWhich state? Type the name or number (several separated by commas, or "all"): ').strip().lower()
        if not ans:
            continue
        if ans == 'all':
            return states
        chosen, ok = [], True
        for part in [x.strip() for x in ans.split(',') if x.strip()]:
            if part.isdigit() and 1 <= int(part) <= len(states):
                chosen.append(states[int(part) - 1])
                continue
            exact = [s for s in states if s.lower() == part]
            partial = [s for s in states if part in s.lower()]
            hit = exact or partial
            if len(hit) == 1:
                chosen.append(hit[0])
            else:
                ok = False
                print(f'  "{part}": ' + ('no such state in the list' if not hit else 'matches several: ' + ', '.join(hit)))
        if ok and chosen:
            return list(dict.fromkeys(chosen))


if __name__ == '__main__':
    by_state, seen = {}, set()
    files = sorted(set(glob.glob('*.json') + glob.glob('**/*.json', recursive=True)))
    files = [f for f in files if 'scraped_index' not in f]
    print('Running in:', os.getcwd())
    print('JSON files found:', len(files))
    for p in files:
        try:
            d = json.load(open(p, encoding='utf-8'))
        except Exception as e:
            print('  cannot read', p, e)
            continue
        if isinstance(d, dict):
            d = next((v for v in d.values() if isinstance(v, list)), [])
        stem = os.path.splitext(os.path.basename(p))[0]
        file_state = re.sub(r'^scrape_ezy_(?:boarding|school|play)_', '', stem).replace('-', ' ').replace('_', ' ').title()
        for r in d:
            if isinstance(r, dict):
                key = r.get('source_url') or r.get('slug') or r.get('name')
                if key and key not in seen:
                    seen.add(key)
                    if r.get('website'):
                        r['state_dir'] = safe(file_state) or 'unknown'
                        by_state.setdefault(file_state, []).append(r)
    if not by_state:
        raise SystemExit('No schools with a website found in the JSON files.')

    # unique id per school: the slug, plus a short code only where several schools share the same slug
    all_rows = [r for lst in by_state.values() for r in lst]
    slug_count = Counter(safe(r.get('slug') or r.get('name')) for r in all_rows)
    for r in all_rows:
        base = safe(r.get('slug') or r.get('name'))
        r['uid'] = base if slug_count[base] == 1 else \
            f"{base}-{hashlib.md5((r.get('source_url') or '').encode()).hexdigest()[:6]}"

    chosen_states = pick_states(by_state)
    rows = [r for s in chosen_states for r in by_state[s]]
    print('\nSelected:', ', '.join(chosen_states), f'({len(rows)} schools with a website)')

    LOG = 'images_log.csv'
    HEADER = ['slug', 'website', 'facility', 'saved_file', 'source_image_url', 'found_on_page', 'note']

    # schools already finished in an earlier run
    done = set()
    if os.path.exists(LOG):
        with open(LOG, encoding='utf-8', newline='') as f:
            for r in csv.DictReader(f):
                if r.get('saved_file') or not RETRY_FAILED:
                    done.add(r.get('slug'))
    pending = [r for r in rows if r['uid'] not in done]
    todo = pending[:TEST_LIMIT] if TEST_LIMIT else pending
    print(f'Schools with a website: {len(rows)} | already done: {len(rows) - len(pending)} '
          f'| remaining: {len(pending)} | processing now: {len(todo)}')

    if GLOBAL_DEDUPE:                                   # remember photos saved in earlier runs
        for p in glob.glob(os.path.join(OUT, '**', '*.jpg'), recursive=True):
            try:
                GLOBAL_HASHES.append(dhash(Image.open(p)))
            except Exception:
                pass

    new_file = not os.path.exists(LOG) or os.path.getsize(LOG) == 0
    totals, got = Counter(), 0
    ex = ThreadPoolExecutor(WORKERS)
    futs = [ex.submit(do_school, r) for r in todo]
    try:
        with open(LOG, 'a', newline='', encoding='utf-8') as f:
            w = csv.writer(f)
            if new_file:
                w.writerow(HEADER)
            for i, fu in enumerate(as_completed(futs), 1):
                try:
                    slug, site, items, note = fu.result()
                except Exception as e:
                    print(f'[{i}/{len(todo)}] error: {str(e)[:100]}')
                    continue
                if items:
                    for cat, fname, url, purl in items:
                        w.writerow([slug, site, cat, fname, url, purl, note])
                        totals[cat] += 1
                else:
                    w.writerow([slug, site, '', '', '', '', note])
                f.flush()
                photos = [x for x in items if x[0] not in ('logo', 'cover')]
                if photos:
                    got += 1
                has = lambda k: 'yes' if any(x[0] == k for x in items) else 'no'
                print(f'[{i}/{len(todo)}] {slug}: {len(photos)} photos, logo {has("logo")}, cover {has("cover")}'
                      + (f' | {note}' if note else ''))
        print(f'\nDone. {got} of {len(todo)} schools got facility photos in this run.')
        print('Files saved per type:', dict(totals))
    except KeyboardInterrupt:
        print('\nStopping... schools already in progress will finish in a few seconds. Run again to continue.')
    finally:
        ex.shutdown(wait=False, cancel_futures=True)
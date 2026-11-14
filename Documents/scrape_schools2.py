#!/usr/bin/env python3
"""
School scraper -> JSON/CSV/XLSX shaped like your Django `School` model.
    pip install requests beautifulsoup4 openpyxl playwright   then once:   playwright install chromium

RULE: a field is filled ONLY when it is read from an explicit place on the school's own page (and passes a format
check). Anything not found stays empty (null / [] / {}). Every school has  mongo_extra.sources  (where each value came
from) and  warnings  (what was missing / dropped / inconsistent), so any value can be checked against the page.

WHAT CHANGED IN THIS VERSION (v3)
  * ADDRESS      : the header address is cut at the "Call School" button (it used to be glued onto the address, which
                   also made the PIN code come out empty). City / state / PIN are validated against each other.
  * AREA/LOCALITY: boarding pages have the breadcrumb  Home > India > <City> > <School>  - "India" is no longer taken as
                   an area. area/locality now come from the breadcrumb (day schools) or from the address text that sits
                   before the city (boarding schools); the source is written in mongo_extra.sources.
  * FEE SESSION  : the page heading ("Fees Structure 2027-28") is NOT a fee session. A class gets a fee_session only when
                   the page says so ("fees mentioned below are for the session X") or when it was read after clicking that
                   session button in the browser. Fees are never labelled with a guessed year. The "Fees Comparison"
                   calculator (all zeros) is ignored. fee_min / fee_max use the NEWEST fee session only, and the listing
                   card's own fee range is cross-checked (mismatch -> warning).
  * ENQUIRY FEES : the "Fill Admission Form" table (class, session, application date, status, APPLICATION FEE) is read for
                   every session -> row['admissions'] (+ a separate CSV/Excel sheet).
  * BOARDING KINDS: every boarding kind is kept (Full / Day-cum-Boarding / Day / Weekly) in row['boarding_type'];
                   filter with --boarding-types.
  * COMPLETE LIST: the "Load All Schools" button is clicked in a headless browser (retried), the count is compared with the
                   "N Schools" number printed on the listing, and every school that was found but not saved is listed
                   with the reason. City / board sub-listings are walked too, so a school (e.g. Birla Open Minds,
                   Hoshiarpur) cannot be missed.
  * MORE SECTIONS: rating+reviews, campus size, languages taught, facilities grouped by section, food options, last
                   updated date, "verified by school".

    python scrape_schools.py                         # menu
    python scrape_schools.py --selftest              # check one real school page (Birla Open Minds) field by field
    python scrape_schools.py --selftest --url https://ezyschooling.com/school/<slug>
    python scrape_schools.py --site ezy --types boarding --state Punjab                      # all boarding kinds
    python scrape_schools.py --site ezy --types boarding --state Punjab --boarding-types daycum day
    python scrape_schools.py --site ezy --types school play --city Delhi --limit 10
    python scrape_schools.py --site generic --url https://example.com/schools-in-pune --limit 20
"""
import argparse
import atexit
import csv
import json
import os
import re
import sys
import time
from collections import Counter, deque
from datetime import date, datetime
from urllib import robotparser
from urllib.parse import parse_qs, unquote, urljoin, urlparse

import requests
from bs4 import BeautifulSoup

BASE = 'https://ezyschooling.com'
UA = 'Mozilla/5.0 (compatible; GurukulGatewayBot/1.0; +mailto:you@example.com)'  # put a real contact here
DELAY = 2.0  # seconds between requests

PROFILE_PATH = re.compile(r'^/school/[^/]+$')
LISTING_PATH = re.compile(r'^/admissions/(?:[a-z0-9-]+?-)?school-admission-in-[^/]+$')   # also cbse-/ib-board-... filters
CRUMB_PATH = re.compile(r'^/admissions/school-admission-in-[^/]+$')                      # breadcrumb links only
FACT_LABELS = ['Board', 'Gender', 'Classes', 'Academic Session', 'Medium', 'Student Teacher Ratio', 'Day/Boarding',
               'Campus Size']
PLAY_END = {'kg', 'lkg', 'ukg', 'nursery', 'pre nursery', 'toddler'}
OWN_PHONES = ('8766340464', '9899362226')  # Ezyschooling's own numbers (footer / help box), never the school's
SOCIAL_HOSTS = ('facebook.com', 'instagram.com', 'youtube.com', 'youtu.be', 'twitter.com', 'x.com', 'linkedin.com')
BLOCKED_HOSTS = SOCIAL_HOSTS + ('ezyschooling.com', 'google.com', 'goo.gl', 'maps.app.goo.gl', 'wa.me', 'whatsapp.com',
                                'bit.ly', 'apple.com', 'play.google.com')
GENDER_MAP = {'coed': 'Co-ed', 'co-ed': 'Co-ed', 'co-educational': 'Co-ed', 'coeducational': 'Co-ed',
              'girls': 'Girls', 'girl': 'Girls', 'boys': 'Boys', 'boy': 'Boys'}
BOARDING_KINDS = {'full boarding': 'Full Boarding', 'day cum boarding': 'Day Cum Boarding', 'day-cum-boarding': 'Day Cum Boarding',
                  'day boarding': 'Day Boarding', 'weekly boarding': 'Weekly Boarding', 'day school': 'Day School'}
BTYPE_CHOICES = {'full': 'Full Boarding', 'daycum': 'Day Cum Boarding', 'day': 'Day Boarding', 'weekly': 'Weekly Boarding'}
INDIAN_STATES = {s.lower(): s for s in (
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat',
    'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
    'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim',
    'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Puducherry', 'Ladakh', 'Singapore')}
PIN_PREFIX = {  # only used to WARN when a PIN code does not belong to the state printed next to it
    'Punjab': ('14', '15', '16'), 'Haryana': ('12', '13'), 'Delhi': ('11',), 'Himachal Pradesh': ('17',), 'Chandigarh': ('16',),
    'Rajasthan': ('30', '31', '32', '33', '34'), 'Gujarat': ('36', '37', '38', '39'), 'Maharashtra': ('40', '41', '42', '43', '44'),
    'Karnataka': ('56', '57', '58', '59'), 'Tamil Nadu': ('60', '61', '62', '63', '64'), 'Kerala': ('67', '68', '69'),
    'Telangana': ('50',), 'West Bengal': ('70', '71', '72', '73', '74'), 'Uttarakhand': ('24', '25', '26'),
    'Uttar Pradesh': ('20', '21', '22', '23', '24', '25', '26', '27', '28')}

http = requests.Session()
http.headers.update({'User-Agent': UA, 'Accept-Language': 'en-IN,en;q=0.9'})


def clean(s):
    return re.sub(r'\s+', ' ', (s or '').replace('\xa0', ' ')).strip()


def path_of(href, base=BASE):
    return urlparse(urljoin(base, href)).path.rstrip('/')


def slugify(s):
    return re.sub(r'[^a-z0-9]+', '-', (s or '').lower()).strip('-')


def host_in(host, domains):
    host = (host or '').lower().split(':')[0]
    return any(host == d or host.endswith('.' + d) for d in domains)


def norm_session(s):
    """'2027-28' / '2027 - 2028' -> '2027-2028'. Anything else -> None."""
    m = re.search(r'(\d{4})\s*-\s*(\d{2,4})', s or '')
    if not m:
        return None
    a, b = m.group(1), m.group(2)
    if len(b) == 2:
        b = a[:2] + b
    return f'{a}-{b}'


def latest_session(sessions):
    ok = [s for s in sessions if s and re.fullmatch(r'\d{4}-\d{4}', s)]
    return max(ok, key=lambda s: int(s[:4])) if ok else None


# ----------------------------------------------------------------------------- polite fetching (robots.txt per host)
_ROBOTS = {}


def allowed(url):
    host = urlparse(url).netloc
    if host not in _ROBOTS:
        rp = robotparser.RobotFileParser()
        try:
            rp.set_url(f'{urlparse(url).scheme}://{host}/robots.txt')
            rp.read()
        except Exception:
            rp = None
        _ROBOTS[host] = rp
    rp = _ROBOTS[host]
    try:
        return True if rp is None else rp.can_fetch(UA, url)
    except Exception:
        return True


_CACHE = {}  # listing pages fetched with keep=True
_delay = DELAY  # pause between requests: grows after HTTP 429, shrinks again while pages load fine


def get(url, retries=6, keep=False):
    global _delay
    if keep and url in _CACHE:
        return _CACHE[url]
    if not allowed(url):
        print(f'  [robots.txt disallows] {url}', file=sys.stderr)
        return None
    for i in range(retries):
        try:
            time.sleep(_delay)
            r = http.get(url, timeout=30)
            if r.status_code == 200:
                _delay = max(DELAY, _delay * 0.95)
                if keep:
                    _CACHE[url] = r.text
                return r.text
            if r.status_code in (404, 410):
                return None
            if r.status_code == 429:
                ra = str(r.headers.get('Retry-After', ''))
                wait = min(int(ra) if ra.isdigit() else 15 * (2 ** i), 300)
                _delay = min(_delay * 1.5, 15)
                print(f'  HTTP 429 (too many requests) - waiting {wait}s, now {_delay:.1f}s between requests: {url}', file=sys.stderr)
                time.sleep(wait)
                continue
            print(f'  HTTP {r.status_code} for {url}', file=sys.stderr)
        except requests.RequestException as e:
            print(f'  retry {i + 1}: {e}', file=sys.stderr)
        time.sleep(3 * (i + 1))
    return None


def dump_debug(url, html):
    """Keep the raw page of a school whose fees could not be read, so the parser can be fixed for that layout."""
    try:
        os.makedirs('debug_html', exist_ok=True)
        with open(os.path.join('debug_html', url.rstrip('/').rsplit('/', 1)[-1] + '.html'), 'w', encoding='utf-8') as f:
            f.write(html)
    except OSError:
        pass


# ----------------------------------------------------------------------------- headless browser (one shared instance)
SESSION_LIST_JS = """() => {
  const re = /^\\s*\\d{4}\\s*-\\s*\\d{2,4}\\s*$/, seen = [];
  for (const e of document.querySelectorAll('button,[role=tab],[role=radio],label,li,span,div,a')) {
    if (e.closest('table') || e.children.length > 0) continue;
    const t = (e.textContent || '').trim();
    if (re.test(t) && !seen.includes(t)) seen.push(t);
  }
  return seen;
}"""
SESSION_CLICK_JS = """(lab) => {
  for (const e of document.querySelectorAll('button,[role=tab],[role=radio],label,li,span,div,a')) {
    if (e.closest('table') || e.children.length > 0) continue;
    if ((e.textContent || '').trim() === lab) { e.click(); return true; }
  }
  return false;
}"""
COUNT_JS = """() => new Set([...document.querySelectorAll('a[href]')]
    .map(a => new URL(a.href, location.href).pathname.replace(/\\/$/, ''))
    .filter(h => /^\\/school\\/[^\\/]+$/.test(h))).size"""


class Browser:
    """Lazy, shared headless Chromium. .ok is None (not tried), True, or False (playwright / chromium missing)."""

    def __init__(self):
        self.ok, self.pw, self.br = None, None, None

    def start(self):
        if self.ok is not None:
            return self.ok
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            self.ok = False
            print('  [!] playwright is not installed: schools behind "Load All Schools" and the other fee / admission\n'
                  '      sessions cannot be loaded.   One-time setup:  pip install playwright   then   playwright install chromium',
                  file=sys.stderr)
            return False
        try:
            self.pw = sync_playwright().start()
            self.br = self.pw.chromium.launch(headless=True)
            self.ok = True
        except Exception as e:
            self.ok = False
            print(f'  [!] could not start the browser: {str(e)[:200]}\n      Run:  playwright install chromium', file=sys.stderr)
        return self.ok

    def close(self):
        try:
            if self.br:
                self.br.close()
            if self.pw:
                self.pw.stop()
        except Exception:
            pass
        self.br = self.pw = None

    def render_variants(self, url):
        """Open a school page, then click every session button (e.g. 2026-2027 / 2027-2028) that is NOT inside a table.
        -> list of (session_label | None, html). The first item is the page as first rendered (label None)."""
        if not allowed(url) or not self.start():
            return None
        time.sleep(_delay)
        pg = self.br.new_page(user_agent=UA, locale='en-IN')
        out = []
        try:
            pg.goto(url, wait_until='domcontentloaded', timeout=60000)
            try:
                pg.wait_for_load_state('networkidle', timeout=15000)
            except Exception:
                pass
            pg.wait_for_timeout(1200)
            out.append((None, pg.content()))
            for lab in pg.evaluate(SESSION_LIST_JS):
                if pg.evaluate(SESSION_CLICK_JS, lab):
                    pg.wait_for_timeout(1200)
                    out.append((norm_session(lab), pg.content()))
        except Exception as e:
            print(f'  [!] browser step failed for {url}: {str(e)[:160]}', file=sys.stderr)
        finally:
            try:
                pg.close()
            except Exception:
                pass
        return out or None


BROWSER = Browser()
atexit.register(BROWSER.close)


def browser_html(url, claimed=None):
    """A listing page holds only its first ~27 schools in the HTML; the rest appear after 'Load All Schools' is clicked.
    Opens the page, clicks until no more schools appear (retries once with a fresh page), returns the fullest HTML."""
    if not allowed(url) or not BROWSER.start():
        return None
    best = None
    for attempt in range(2):
        pg = BROWSER.br.new_page(user_agent=UA, locale='en-IN')
        html, n = None, 0
        try:
            pg.goto(url, wait_until='domcontentloaded', timeout=60000)
            pg.wait_for_timeout(3000)
            stale = 0
            for _ in range(80):
                before = pg.evaluate(COUNT_JS)
                btn = pg.get_by_text(re.compile(r'load\s+(all|more)', re.I))
                clicked = False
                if btn.count():
                    try:
                        btn.first.scroll_into_view_if_needed(timeout=3000)
                        btn.first.click(timeout=5000)
                        clicked = True
                    except Exception:
                        pass
                if not clicked:
                    pg.mouse.wheel(0, 30000)
                try:
                    pg.wait_for_load_state('networkidle', timeout=8000)
                except Exception:
                    pass
                pg.wait_for_timeout(1500 + 700 * attempt)
                after = pg.evaluate(COUNT_JS)
                stale = stale + 1 if after <= before else 0
                if stale >= (3 + attempt):
                    break
            html, n = pg.content(), pg.evaluate(COUNT_JS)
        except Exception as e:
            print(f'  [!] browser step failed: {str(e)[:200]}', file=sys.stderr)
        finally:
            try:
                pg.close()
            except Exception:
                pass
        if html and (best is None or n > best[0]):
            best = (n, html)
        if best and (not claimed or best[0] >= claimed):
            break
        if attempt == 0:
            print(f'  [!] browser loaded {best[0] if best else 0} of {claimed or "?"} schools - trying once more ...')
    return best[1] if best else None


# ----------------------------------------------------------------------------- duplicates
INDEX_FILE = 'scraped_index.json'


def school_keys(name, address=None, pin=None, url=None):
    keys, n = set(), slugify(name)
    if url:
        keys.add('url:' + url.rstrip('/').lower())
    if n and pin:
        keys.add(f'np:{n}|{pin}')
    if n and address:
        keys.add(f'na:{n}|{slugify(address)[:60]}')
    return keys


class Seen:
    def __init__(self):
        self.history, self.session, self.use_history = set(), set(), True
        try:
            with open(INDEX_FILE, encoding='utf-8') as f:
                self.history = set(json.load(f))
        except Exception:
            pass

    def has(self, keys):
        return bool(keys & (self.session | (self.history if self.use_history else set())))

    def add(self, keys):
        self.session |= keys

    def save(self):
        with open(INDEX_FILE, 'w', encoding='utf-8') as f:
            json.dump(sorted(self.history | self.session), f)


SEEN = Seen()


# ----------------------------------------------------------------------------- the one row shape every site must produce
def new_row(**kw):
    row = {
        'name': None, 'slug': None,
        'city': None, 'state': None, 'area': None, 'locality': None, 'pincode': None,
        'type': None, 'boarding_type': None, 'boards': [], 'classes': None, 'gender': None,
        'description': None, 'about': None, 'hostel': None,
        'rating': None, 'reviews': None, 'fee_min': None, 'fee_max': None,
        'address': None, 'lat': None, 'lng': None,
        'phone': None, 'email': None, 'website': None, 'social': {},
        'logo': None, 'images': [], 'facilities': [], 'facility_groups': {},
        'founded': None, 'medium': None, 'academic_session': None, 'student_teacher_ratio': None,
        'campus_size': None, 'languages': [], 'food_options': None, 'verified': None, 'page_last_updated': None,
        'affiliation_no': None, 'school_timing': None, 'student_count': None, 'teacher_count': None,
        'source_site': None, 'source_url': None,
        'latest_fee_session': None, 'current_admission_session': None,
        'class_fees': [], 'admissions': [], 'warnings': [], 'mongo_extra': {},
    }
    base_extra = kw.pop('mongo_extra', {})
    row.update(kw)
    row['mongo_extra'] = {'scraped_at': time.strftime('%Y-%m-%d'), **base_extra}
    row['mongo_extra'].setdefault('sources', {})
    return row


# ----------------------------------------------------------------------------- validation
def valid_email(s):
    s = clean(s).lower().strip('<>')
    if re.fullmatch(r'[a-z0-9._%+\-]+@[a-z0-9\-]+(?:\.[a-z0-9\-]+)+', s) and not s.endswith(
            ('@example.com', '@ezyschooling.com', '.png', '.jpg', '.webp', '.gif')):
        return s
    return None


def valid_phone(s):
    d = re.sub(r'\D', '', s or '')
    if len(d) == 12 and d.startswith('91'):
        d = d[2:]
    elif len(d) == 11 and d.startswith('0'):
        d = d[1:]
    if len(d) != 10 or d[0] == '0' or d in OWN_PHONES or len(set(d)) < 3:
        return None
    return '+91-' + d


def valid_url(s):
    s = clean(s)
    u = urlparse(s)
    if u.scheme not in ('http', 'https') or '.' not in u.netloc or host_in(u.netloc, BLOCKED_HOSTS):
        return None
    return s


def finalize(row):
    """Last gate before saving: every field must pass its format check or it is dropped (and the drop is written to
    warnings). Safe to call more than once."""
    w = row['warnings']

    def warn(msg):
        if msg not in w:
            w.append(msg)

    def bad(field, why):
        warn(f'{field} dropped ({why}): {str(row[field])[:60]}')
        row[field] = [] if isinstance(row[field], list) else {} if isinstance(row[field], dict) else None

    for k, v in list(row.items()):
        if isinstance(v, str) and not clean(v):
            row[k] = None
        elif isinstance(v, str):
            row[k] = clean(v)
    if row['email'] and not valid_email(row['email']):
        bad('email', 'not an e-mail address')
    elif row['email']:
        row['email'] = valid_email(row['email'])
    if row['phone'] and not valid_phone(row['phone']):
        bad('phone', 'not an Indian number')
    elif row['phone']:
        row['phone'] = valid_phone(row['phone'])
    if row['website'] and not valid_url(row['website']):
        bad('website', 'not a school website')
    if row['pincode'] and not re.fullmatch(r'[1-9]\d{5}', str(row['pincode'])):
        bad('pincode', 'not a 6-digit PIN')
    if row['pincode'] and row['address'] and str(row['pincode']) not in row['address']:
        bad('pincode', 'not in the address')
    if row['pincode'] and row['state'] in PIN_PREFIX and not str(row['pincode']).startswith(PIN_PREFIX[row['state']]):
        warn(f'PIN {row["pincode"]} does not look like a {row["state"]} PIN code (check the school address on the site)')
    if row['address'] and re.search(r'(?i)\b(call school|enquiry|compare)\s*$', row['address']):
        row['address'] = re.sub(r'(?i)\s*\b(call school|enquiry|compare)\s*$', '', row['address']).strip()
    if (row['lat'] is None) != (row['lng'] is None):
        row['lat'] = row['lng'] = None
    if row['lat'] is not None:
        try:
            row['lat'], row['lng'] = float(row['lat']), float(row['lng'])
            if not (6.0 <= row['lat'] <= 37.5 and 68.0 <= row['lng'] <= 98.0):
                warn(f'lat/lng dropped (outside India): {row["lat"]},{row["lng"]}')
                row['lat'] = row['lng'] = None
        except (TypeError, ValueError):
            row['lat'] = row['lng'] = None
    if row['founded'] is not None and not (isinstance(row['founded'], int) and 1800 <= row['founded'] <= date.today().year):
        bad('founded', 'not a year')
    if row['rating'] is not None and not (isinstance(row['rating'], (int, float)) and 0 < row['rating'] <= 5):
        bad('rating', 'not 0-5')
    if row['reviews'] is not None and not (isinstance(row['reviews'], int) and row['reviews'] >= 0):
        bad('reviews', 'not a count')
    for f in ('fee_min', 'fee_max'):
        if row[f] is not None and not (isinstance(row[f], int) and 1000 <= row[f] <= 5000000):
            bad(f, 'outside 1,000 - 50,00,000')
    if row['fee_min'] is not None and row['fee_max'] is not None and row['fee_min'] > row['fee_max']:
        bad('fee_min', 'larger than fee_max')
        bad('fee_max', 'smaller than fee_min')
    if row['gender'] is not None and row['gender'] not in ('Co-ed', 'Girls', 'Boys'):
        bad('gender', 'unknown value')
    if row['type'] is not None and row['type'] not in ('Day School', 'Play School', 'Boarding School'):
        bad('type', 'unknown value')
    if row['boarding_type'] is not None and row['boarding_type'] not in set(BOARDING_KINDS.values()):
        bad('boarding_type', 'unknown value')
    if row['campus_size'] and not re.fullmatch(r'\d+(?:\.\d+)?\s*(?:acres?|sq\.?\s*(?:ft|m|yards?)|hectares?|bigha|kanal)s?', row['campus_size'], re.I):
        bad('campus_size', 'not a size')
    if row['student_teacher_ratio'] and not re.fullmatch(r'\d{1,3}\s*:\s*\d{1,3}', row['student_teacher_ratio']):
        bad('student_teacher_ratio', 'not a ratio')
    for f in ('latest_fee_session', 'current_admission_session'):
        if row[f] and not re.fullmatch(r'\d{4}-\d{4}', row[f]):
            bad(f, 'not a session')
    row['boards'] = [b for b in row['boards'] if re.fullmatch(r'[A-Za-z0-9 ,()/&.\-]{2,40}', b)]
    row['facilities'] = [f for f in row['facilities'] if 2 <= len(f) <= 60 and not re.match(r'(?i)no\s', f)]
    row['languages'] = [x for x in row['languages'] if re.fullmatch(r'[A-Za-z ]{2,25}', x)]
    row['images'] = list(dict.fromkeys(i for i in row['images'] if str(i).startswith(('http://', 'https://'))))[:15]
    if row['logo'] and not str(row['logo']).startswith(('http://', 'https://')):
        bad('logo', 'not a URL')
    for cf in row['class_fees']:
        for k in ('monthly_fee', 'annual_fee', 'one_time_fee', 'first_year_total'):
            if cf.get(k) is not None and not (isinstance(cf[k], int) and 0 < cf[k] <= 5000000):
                cf[k] = None
        if cf.get('fee_session') and not re.fullmatch(r'\d{4}-\d{4}', cf['fee_session']):
            cf['fee_session'] = None
    for ad in row['admissions']:
        if ad.get('application_fee') is not None and not (isinstance(ad['application_fee'], int) and 0 < ad['application_fee'] <= 500000):
            ad['application_fee'] = None
    return row


# ============================================================================= SITE 1: ezyschooling.com
def want_listing(path, cfg):
    if cfg.get('nofollow'):
        return False
    if not LISTING_PATH.match(path):
        return False
    if not cfg.get('boarding') and not path.startswith('/admissions/school-admission-in-'):
        return False  # day-school runs do not walk the board-filter pages
    return cfg['hint'] in path and not any(x in path for x in cfg['exclude'])


TYPE_NAMES = {'school': 'Day School', 'play': 'Play School', 'boarding': 'Boarding School'}
STATE_OF = {
    'delhi': 'Delhi', 'mumbai': 'Maharashtra', 'pune': 'Maharashtra', 'thane': 'Maharashtra', 'nagpur': 'Maharashtra',
    'bangalore': 'Karnataka', 'gurugram': 'Haryana', 'faridabad': 'Haryana', 'noida': 'Uttar Pradesh',
    'ghaziabad': 'Uttar Pradesh', 'greater-noida': 'Uttar Pradesh', 'lucknow': 'Uttar Pradesh', 'kolkata': 'West Bengal',
    'hyderabad': 'Telangana', 'chennai': 'Tamil Nadu', 'jaipur': 'Rajasthan', 'ahmedabad': 'Gujarat',
    'indore': 'Madhya Pradesh', 'bhopal': 'Madhya Pradesh',
}
URL_ALIAS = {'gurgaon': 'gurugram', 'bengaluru': 'bangalore', 'bombay': 'mumbai', 'calcutta': 'kolkata'}
STATE_ALIAS = {'uttrakhand': 'uttarakhand', 'orissa': 'odisha'}
SAME_CITY = [{'gurgaon', 'gurugram'}, {'bangalore', 'bengaluru'}, {'mumbai', 'bombay'}, {'kolkata', 'calcutta'}]


def same_city(a, b):
    a, b = slugify(a), slugify(b)
    return a == b or any(a in g and b in g for g in SAME_CITY)


def city_cfg(name, need):
    slug = URL_ALIAS.get(slugify(name), slugify(name))
    exclude = ('boarding', 'greater-' + slug, 'navi-' + slug) if slug != 'mumbai' else ('boarding', 'navi-mumbai')
    return {'site': 'ezy', 'label': name.strip().title(), 'city': name.strip().title(), 'slug': slug,
            'state': STATE_OF.get(slug), 'url': f'{BASE}/admissions/school-admission-in-{slug}', 'hint': slug,
            'exclude': exclude, 'need': set(need)}


def boarding_cfg(state='', btypes=None):
    slug = STATE_ALIAS.get(slugify(state), slugify(state))
    url = f'{BASE}/admissions/school-admission-in-{slug}-boarding-schools' if slug else f'{BASE}/admissions/school-admission-in-boarding-schools'
    return {'site': 'ezy', 'label': f'Boarding / {state.strip().title() or "All India"}', 'boarding': True, 'city': None,
            'state': state.strip().title() or None, 'slug': slug, 'url': url,
            'hint': f'{slug}-boarding-schools' if slug else 'boarding-schools', 'exclude': (), 'need': {'Boarding School'},
            'btypes': set(btypes) if btypes else None}


def custom_cfg(url, need, btypes=None):
    path = urlparse(url).path.rstrip('/')
    boarding = 'boarding-schools' in path
    return {'site': 'ezy', 'label': 'Link ' + path.rsplit('/', 1)[-1][:40], 'custom': True, 'nofollow': True,
            'boarding': boarding, 'city': None, 'state': None, 'slug': '', 'url': url.rstrip('/'), 'hint': '',
            'exclude': (), 'need': {'Boarding School'} if boarding else set(need),
            'btypes': set(btypes) if btypes else None}


def check_listing(cfg):
    return bool(get(cfg['url'], keep=True))


def card_type(card, cfg):
    if cfg.get('boarding'):
        return 'Boarding School'
    c = re.sub(r'\s*Class\s*$', '', (card or {}).get('classes') or '', flags=re.I)
    if not c:
        return None
    return 'Play School' if c.split('-')[-1].strip().lower() in PLAY_END else 'Day School'


def money_short(num, unit):
    """'4.44' + 'L' -> 444000 ; '41.80' + 'K' -> 41800 ; '1.2' + 'Cr' -> 12000000"""
    try:
        v = float(num.replace(',', ''))
    except ValueError:
        return None
    return int(round(v * {'L': 100000, 'K': 1000, 'Cr': 10000000}.get(unit or '', 1)))


CARD_FEE_RE = re.compile(r'(Annual|Monthly)\s+Fees?\s*\u20b9\s*([\d.,]+)\s*(Cr|L|K)?(?:\s*-\s*([\d.,]+)\s*(Cr|L|K)?)?')


def parse_listing(html, cfg):
    soup = BeautifulSoup(html, 'html.parser')
    profiles, listings, cards = {}, set(), {}
    for a in soup.find_all('a', href=True):
        p = path_of(a['href'])
        if PROFILE_PATH.match(p):
            profiles.setdefault(BASE + p, None)
        elif want_listing(p, cfg):
            listings.add(BASE + p)
    for h3 in soup.find_all('h3'):
        a = h3.find('a', href=True)
        if not a or not PROFILE_PATH.match(path_of(a['href'])):
            continue
        url, node, txt = BASE + path_of(a['href']), h3, ''
        for _ in range(8):  # climb to the card that also holds the "Compare" button
            node = node.parent
            if node is None:
                break
            txt = node.get_text('\n')
            if 'Compare' in txt:
                break
        if node is None or 'Compare' not in txt or len(txt) > 5000:
            continue
        lines = [clean(l) for l in txt.split('\n') if clean(l)]
        joined = ' '.join(lines)
        info = {'name': clean(a.get_text())}
        anchors = h3.find_all('a', href=True)
        if len(anchors) > 1:  # boarding cards: second link in the heading is "City, State"
            info['location'] = clean(anchors[1].get_text())
        m = re.search(r'(?<![\d.])(\d\.\d)\s*(\d+)\s+Reviews?\b', joined)
        if m:
            info['rating'], info['reviews'] = float(m.group(1)), int(m.group(2))
        fm = CARD_FEE_RE.search(joined)
        if fm:
            lo = money_short(fm.group(2), fm.group(3))
            hi = money_short(fm.group(4), fm.group(5) or fm.group(3)) if fm.group(4) else lo
            if lo and hi:
                info['fee_range'] = (fm.group(1).lower(), min(lo, hi), max(lo, hi))
        longest = [l for l in lines if len(l) > 80 and not l.startswith(('Board:', 'Classes:', 'Session:', 'Monthly'))
                   and not re.search(r'\u20b9|Reviews?\b|Compare|Apply|Enquir', l)]
        info['description'] = max(longest, key=len) if longest else None
        cl = next((l for l in lines if l.startswith('Classes:')), '')
        info['classes'] = re.sub(r'\s*Class\s*$', '', cl[8:].strip(), flags=re.I) or None
        cards[url] = info
    text = clean(soup.get_text(' '))
    ms = list(re.finditer(r'(\d+)\s+Schools\b(.{0,40})', text))
    near = next((m for m in ms if 'Updated' in m.group(2)), None) or (ms[0] if ms else None)
    return cards, list(profiles), listings, (int(near.group(1)) if near else None)


def to_int_rupees(s):
    return int(s.replace(',', ''))


# ----------------------------------------------------------------------------- ezyschooling: header, quick facts
FACT_OK = {
    'Board': lambda v: bool(re.fullmatch(r'[A-Za-z0-9 ,()/&.\-]{2,60}', v)) and not re.search(r'fee|structure|quick|session', v, re.I),
    'Gender': lambda v: v.lower() in GENDER_MAP,
    'Classes': lambda v: len(v) < 40 and bool(re.search(r'nursery|kg|toddler|\d', v, re.I)),
    'Academic Session': lambda v: bool(re.search(r'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec', v, re.I)) and len(v) < 40,
    'Medium': lambda v: bool(re.fullmatch(r'[A-Za-z ,/&\-]{3,50}', v)),
    'Student Teacher Ratio': lambda v: bool(re.fullmatch(r'\d{1,3}\s*:\s*\d{1,3}', v)),
    'Day/Boarding': lambda v: len(v) < 40 and bool(re.search(r'day|board|residential', v, re.I)),
    'Campus Size': lambda v: bool(re.fullmatch(r'\d+(?:\.\d+)?\s*(?:acres?|sq\.?\s*(?:ft|m|yards?)|hectares?|bigha|kanal)s?', v, re.I)),
}
ICON_TEXT = re.compile(r'^[a-z]+(?:_[a-z0-9]+)+$')  # material-icon words such as location_on, local_library
ADDR_STOP = {'Enquiry', 'Compare', 'Share', 'Call School', 'Call', 'Admissions Ongoing', 'Admissions Open', 'Apply Now'}


def quick_facts(lines):
    """Only the 18 lines right after the 'Quick Facts' heading; each value must pass its own format check."""
    if 'Quick Facts' not in lines:
        return {}
    start = lines.index('Quick Facts')
    facts = {}
    window = lines[start + 1:start + 19]
    for i, l in enumerate(window[:-1]):
        if l in FACT_LABELS and l not in facts and window[i + 1] not in FACT_LABELS and FACT_OK[l](window[i + 1]):
            facts[l] = window[i + 1]
    return facts


def ezy_address(strs):
    """Address = the text right after the location_on icon in the page header, up to the next icon / button.
    The 'Call School' / 'Enquiry' buttons are NOT part of the address."""
    out, started = [], False
    for t in strs:
        if not started:
            if t == 'location_on':
                started = True
            elif t.startswith('location_on'):
                started = True
                rest = t[len('location_on'):].strip()
                if rest:
                    out.append(rest)
            continue
        if ICON_TEXT.match(t) or t in ADDR_STOP:
            break
        out.append(t)
    addr = re.sub(r'\s+,', ',', clean(' '.join(out)))
    addr = re.sub(r'(?i)\s*\b(call school|enquiry|compare|share)\s*$', '', addr).strip(' ,')
    return addr if 10 <= len(addr) <= 300 else None


def state_from_address(address):
    m = re.search(r',\s*([A-Za-z][A-Za-z &]+?)\s*-\s*\d{6}\s*$', address or '')
    return INDIAN_STATES.get(m.group(1).strip().lower()) if m else None


def split_address(address, city, state):
    """Address segments that are neither the city nor the state (PIN removed): the street / locality part."""
    if not address:
        return []
    a = re.sub(r'\s*[-\u2013]\s*\d{6}\s*$', '', address)
    drop = {x.casefold() for x in (city, state) if x}
    return [s.strip() for s in a.split(',') if s.strip() and s.strip().casefold() not in drop]


def real_url(src):
    src = (src or '').strip()
    if not src or src.startswith('data:'):
        return ''
    u = urlparse(src)
    if u.path in ('/image', '/_next/image'):
        q = parse_qs(u.query).get('url')
        if q:
            return q[0]
    return src


def ezy_media(soup, name):
    logo, photos, key = None, [], (name or '').lower()
    og = soup.find('meta', property='og:image')
    if og and og.get('content') and 'cloudfront.net/schools/cover/' in og['content']:
        photos.append(og['content'])
    if key:
        for img in soup.find_all('img'):
            real = real_url(img.get('src') or img.get('data-src'))
            alt = clean(img.get('alt') or '').lower()
            if 'cloudfront.net/schools/' not in real or '/schools/city/' in real or not alt.startswith(key):
                continue
            if '/schools/logos/' in real:
                logo = logo or real
            else:
                photos.append(real)
    return logo, list(dict.fromkeys(photos))[:15]


def ezy_geo(html):
    m = re.search(r'maps/embed/v1/place\?(?:[^"\'\s<>]*?&)?q=(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)', html.replace('&amp;', '&'))
    return (float(m.group(1)), float(m.group(2))) if m else (None, None)


def parse_facilities(soup):
    """Facility icons carry section + yes/no in their address (.../school-features/image/<Section>/yes|no/...svg).
    -> (names the school HAS, names it does NOT have, {section: [names it has]})."""
    yes, no, groups = [], [], {}
    for img in soup.find_all('img'):
        src = unquote(real_url(img.get('src') or img.get('data-src')))
        m = re.search(r'/school-features/image/([^/]+)/(yes|no)/', src)
        if not m:
            continue
        name = clean(img.get('title') or '') or clean(re.sub(r'\s*Logo\s*$', '', img.get('alt') or ''))
        if not name:
            continue
        if m.group(2) == 'yes':
            if name not in yes:
                yes.append(name)
            groups.setdefault(m.group(1), [])
            if name not in groups[m.group(1)]:
                groups[m.group(1)].append(name)
        elif name not in no:
            no.append(name)
    return yes, no, groups


KNOWN_LANGS = ['English', 'Hindi', 'Punjabi', 'French', 'German', 'Spanish', 'Sanskrit', 'Urdu', 'Tamil', 'Telugu', 'Kannada',
               'Malayalam', 'Marathi', 'Bengali', 'Gujarati', 'Odia', 'Assamese', 'Japanese', 'Mandarin', 'Chinese', 'Arabic',
               'Russian', 'Nepali', 'Kashmiri', 'Sindhi', 'Italian', 'Korean', 'Bhutia', 'Lepcha', 'Konkani', 'Manipuri', 'Dogri']


def parse_languages(soup):
    head = next((h for h in soup.find_all(['h2', 'h3']) if clean(h.get_text()).lower() == 'languages taught'), None)
    if not head:
        return []
    out = []
    for n, el in enumerate(head.find_all_next()):
        if n > 60 or el.name in ('h1', 'h2'):
            break
        for t in el.find_all(string=True, recursive=False):
            v = clean(t)
            for lang in KNOWN_LANGS:  # the icon letter is glued to the name ("AEnglish"), so match the ending
                if v == lang or (v.endswith(lang) and len(v) <= len(lang) + 2):
                    if lang not in out:
                        out.append(lang)
                    break
    return out


# ----------------------------------------------------------------------------- ezyschooling: fees
CLASS_RE = re.compile(r'^(?:pre[\s-]?nursery|nursery|playgroup|toddler|lkg|ukg|kg|class\s*\d{1,2}|grade\s*\d{1,2}|\d{1,2}(?:st|nd|rd|th)?)$', re.I)
FEE_SENT = r'estimated\s+(?:monthly|yearly|annual|quarterly)\s+(?:school\s+)?cost for (.{1,30}?) at '
SUMMARY_RE = re.compile(r'estimated\s+(monthly|yearly|annual|quarterly)\s+(?:school\s+)?cost for (.{1,30}?) at '
                        r'[^\u20b9]{1,250}? is \u20b9\s*([\d,]+)', re.I)


def table_class(t):
    prev = ' '.join(reversed([clean(s) for s in t.find_all_previous(string=True, limit=150)]))
    ms = list(re.finditer(FEE_SENT, prev, re.I))
    if ms:
        return clean(ms[-1].group(1))
    head = t.find_previous(['h2', 'h3', 'h4'])
    if head and CLASS_RE.match(clean(head.get_text())):
        return clean(head.get_text())
    return None


def parse_fee_tables(soup):
    """Real fee tables only: header 'Fee type | Frequency | Amount'. The 'Fees Comparison' calculator (Year 1 / Year 2
    columns, all zeros) and any 'Total' line are ignored."""
    out = {}
    for t in soup.find_all('table'):
        rows = [[clean(c.get_text(' ')) for c in tr.find_all(['th', 'td'])] for tr in t.find_all('tr')]
        if not rows:
            continue
        head = [c.lower() for c in rows[0]]
        if not any('fee type' in c for c in head) or any('year 1' in c or 'year 2' in c for c in head):
            continue
        hd = t.find_previous(['h2', 'h3'])
        if hd and 'comparison' in clean(hd.get_text()).lower():
            continue
        cls = table_class(t)
        if not cls:
            continue
        items = []
        for r in rows[1:]:
            m = re.search(r'\u20b9\s*([\d,]+)', r[2]) if len(r) >= 3 else None
            if m and r[0].strip().lower() != 'total' and to_int_rupees(m.group(1)) > 0:
                refundable = False if re.search(r'non[\s-]?refundable', r[2], re.I) else \
                    True if re.search(r'refundable', r[2], re.I) else None
                items.append({'fee_type': r[0], 'frequency': r[1], 'amount': to_int_rupees(m.group(1)), 'refundable': refundable})
        if items:
            out.setdefault(cls.lower(), {'class_name': cls, 'items': items})
    return out


def parse_class_fees(flat, soup, hint_session=None):
    """One entry per class using ONLY numbers the site prints for that class. fee_session = the session the page states
    for that class's numbers; if it states none, the session button that was clicked (hint_session); else None.
    The page HEADING year is never used."""
    ms = list(SUMMARY_RE.finditer(flat))
    first, order = {}, []
    for m in ms:
        c = clean(m.group(2))
        if c.lower() not in first:
            first[c.lower()] = (c, m)
            order.append(c.lower())
    tables = parse_fee_tables(soup)
    fees = []
    for i, key in enumerate(order):
        c, m = first[key]
        end = first[order[i + 1]][1].start() if i + 1 < len(order) else len(flat)
        block = flat[m.start():end]

        def num(pat):
            mm = re.search(pat, block, re.I)
            return to_int_rupees(mm.group(1)) if mm else None
        period, summary_amt = m.group(1).lower(), to_int_rupees(m.group(3))
        if summary_amt <= 0:
            continue
        monthly = summary_amt if period == 'monthly' else None
        annual = num(r'Estimated annual (?:school )?fees?:?\s*\u20b9\s*([\d,]+)')
        if annual is None and period in ('yearly', 'annual'):
            annual = summary_amt
        sess = re.search(r'fees mentioned below are for the session ([\d-]+)', block, re.I)
        fees.append({'class_name': c, 'monthly_fee': monthly, 'annual_fee': annual,
                     'one_time_fee': num(r'One-time admission fee:?\s*\u20b9\s*([\d,]+)'),
                     'first_year_total': num(r'Estimated total cost for first year:?\s*\u20b9\s*([\d,]+)'),
                     'fee_session': norm_session(sess.group(1)) if sess else norm_session(hint_session),
                     'items': tables.get(key, {}).get('items', [])})
    for key, t in tables.items():
        if key not in first:
            fees.append({'class_name': t['class_name'], 'monthly_fee': None, 'annual_fee': None, 'one_time_fee': None,
                         'first_year_total': None, 'fee_session': norm_session(hint_session), 'items': t['items']})
    return fees


def merge_fees(fees):
    """One entry per (class, session); entries with nothing in them are dropped; an entry without a session that is
    identical to a labelled one is dropped."""
    best = {}
    for c in fees:
        k = (c['class_name'].lower(), c['fee_session'])
        score = sum(v is not None for v in (c['monthly_fee'], c['annual_fee'], c['one_time_fee'], c['first_year_total'])) + len(c['items'])
        if k not in best or score > best[k][0]:
            best[k] = (score, c)
    out = [c for _, c in best.values() if any(c[x] for x in ('monthly_fee', 'annual_fee', 'one_time_fee', 'first_year_total')) or c['items']]
    drop = set()
    for c in out:
        if c['fee_session'] is None:
            for d in out:
                if d is not c and d['fee_session'] and d['class_name'].lower() == c['class_name'].lower() \
                        and (d['annual_fee'], d['monthly_fee'], d['first_year_total']) == (c['annual_fee'], c['monthly_fee'], c['first_year_total']):
                    drop.add(id(c))
    out = [c for c in out if id(c) not in drop]
    return sorted(out, key=lambda c: (class_sort_key(c['class_name']), c['fee_session'] or ''))


# ----------------------------------------------------------------------------- ezyschooling: admissions / application ("enquiry") fees
def parse_date(s):
    for f in ('%b %d, %Y', '%B %d, %Y', '%d %b %Y', '%d %B %Y', '%d-%m-%Y'):
        try:
            return datetime.strptime(s.strip(), f).date().isoformat()
        except ValueError:
            continue
    return None


def parse_admissions(soup):
    """The 'Fill Admission Form' table: Class | Session | Application Date | Status | Application Fee | Action."""
    out = []
    for t in soup.find_all('table'):
        rows = [[clean(c.get_text(' ')) for c in tr.find_all(['th', 'td'])] for tr in t.find_all('tr')]
        if not rows:
            continue
        head = [c.lower() for c in rows[0]]
        if 'class' not in head or 'session' not in head or not any('application fee' in h for h in head):
            continue
        ix = {h: i for i, h in enumerate(head)}
        fee_i = next(i for i, h in enumerate(head) if 'application fee' in h)
        date_i = next((i for i, h in enumerate(head) if 'application date' in h), None)
        for r in rows[1:]:
            if len(r) <= max(ix['class'], ix['session'], fee_i):
                continue
            sess = norm_session(r[ix['session']])
            if not r[ix['class']] or not sess:
                continue
            dtype, dtext = None, None
            if date_i is not None and len(r) > date_i:
                m = re.match(r'^(Last Date|Application Date|Start Date|Starts?|Opens?|Closes?)\s*(.*)$', r[date_i], re.I)
                dtype, dtext = (m.group(1), clean(m.group(2))) if m else (None, r[date_i])
            fm = re.search(r'\u20b9\s*([\d,]+)', r[fee_i])
            fee = to_int_rupees(fm.group(1)) if fm else None
            out.append({'class_name': r[ix['class']], 'session': sess, 'date_type': dtype, 'date_text': dtext,
                        'date_iso': parse_date(dtext or ''), 'status': r[ix['status']] if 'status' in ix and len(r) > ix['status'] else None,
                        'application_fee': fee if fee else None, 'application_fee_text': fm.group(0) if fm else None})
    seen, uniq = set(), []
    for a in out:
        k = (a['class_name'].lower(), a['session'])
        if k not in seen:
            seen.add(k)
            uniq.append(a)
    return sorted(uniq, key=lambda a: (a['session'], class_sort_key(a['class_name'])))


# ----------------------------------------------------------------------------- ezyschooling: one school (fees-structure page)
def parse_school(url, html, cfg, card=None, variants=None):
    """-> (row | None, set_of_profile_links_on_page, skip_reason).  variants = [(session_label|None, html), ...] when the
    session buttons were clicked in the browser; the first item must be (None, html)."""
    soup = BeautifulSoup(html, 'html.parser')
    lines = [clean(l) for l in soup.get_text('\n').split('\n') if clean(l)]
    flat = ' '.join(lines)
    links = {BASE + path_of(a['href']) for a in soup.find_all('a', href=True) if PROFILE_PATH.match(path_of(a['href']))}
    card = card or {}

    h1 = soup.find('h1')
    if not h1:
        return None, links, 'no <h1> (page layout changed or blocked)'
    src = {}

    crumbs = []  # (text, path), top level first
    for a in h1.find_all_previous('a', href=True, limit=30):
        p = path_of(a['href'])
        if CRUMB_PATH.match(p):
            crumbs.append((clean(a.get_text()), p))
        elif crumbs:
            break
    crumbs.reverse()
    boarding = bool(cfg.get('boarding') or any('boarding-schools' in p for _, p in crumbs))
    crumbs = [(t, p) for t, p in crumbs if not p.endswith('school-admission-in-boarding-schools') and t.lower() not in ('india', 'all india')]
    crumbs = [(t, p) for i, (t, p) in enumerate(crumbs) if not (boarding and i < len(crumbs) - 1 and t.lower() in INDIAN_STATES)]
    crumb_txt = [t for t, _ in crumbs]
    if not boarding and not cfg.get('custom') and crumb_txt and not (same_city(crumb_txt[0], cfg['city']) or same_city(crumb_txt[0], cfg['slug'])):
        return None, links, f'other city ({crumb_txt[0]})'

    title = re.sub(r':\s*(Fees? Structure|Photos|Reviews|Overview)\s*$', '', clean(h1.get_text()))
    parts = re.split(r',\s+', title)
    loc_parts = [x.strip() for x in card.get('location', '').split(',') if x.strip()]
    known = {c.casefold() for c in crumb_txt} | {x.casefold() for x in loc_parts}
    while len(parts) > 1 and parts[-1].casefold() in known:
        parts.pop()
    name = ', '.join(parts)
    src['name'] = 'page heading'
    if cfg.get('boarding') and card.get('name'):
        name, src['name'] = card['name'], 'listing card'

    strs = [clean(t) for t in h1.find_all_next(string=True, limit=90) if clean(t) and h1 not in t.parents]
    address = ezy_address(strs)
    pin = (re.search(r'(?<!\d)(\d{6})\s*$', address) or [None, None])[1] if address else None
    header = ' '.join(strs[:40])
    founded = (re.search(r'Estd\.?\s*((?:18|19|20)\d{2})\b', header) or [None, None])[1]

    # city / state
    if boarding:
        city_v = crumb_txt[0] if crumb_txt else (loc_parts[0] if loc_parts else None)
        state_v = loc_parts[-1] if len(loc_parts) > 1 else None
        src['city'] = 'breadcrumb' if crumb_txt else 'listing card'
        if state_v:
            src['state'] = 'listing card'
    else:
        city_v, state_v = (crumb_txt[0] if crumb_txt else cfg['city']), cfg['state']
        src['city'] = 'breadcrumb' if crumb_txt else 'your input'
        if state_v:
            src['state'] = 'built-in city->state table (not on the page)'
    addr_state = state_from_address(address)
    if not state_v and addr_state:
        state_v, src['state'] = addr_state, 'address'
    warnings = []
    if state_v and addr_state and state_v.casefold() != addr_state.casefold():
        warnings.append(f'state {state_v!r} differs from the state in the address ({addr_state!r})')

    # area / locality
    area = locality = None
    if len(crumb_txt) > 1:
        area, locality = ', '.join(reversed(crumb_txt[1:])), crumb_txt[-1]
        src['area'] = src['locality'] = 'breadcrumb'
    else:
        kept = split_address(address, city_v, state_v)
        if kept:
            locality, area = kept[-1], ', '.join(kept[-2:])
            src['area'] = src['locality'] = 'address: text before the city (the page has no separate area field)'

    facts = quick_facts(lines)
    classes = re.sub(r'\s*Class\s*$', '', facts.get('Classes', ''), flags=re.I) or None
    if not classes and 'local_library' in strs:
        v = strs[strs.index('local_library') + 1] if strs.index('local_library') + 1 < len(strs) else ''
        if FACT_OK['Classes'](v):
            classes, src['classes'] = re.sub(r'\s*Class\s*$', '', v, flags=re.I), 'page header'
    boards_txt = facts.get('Board', '')
    boards = [] if boards_txt.lower() in ('', 'no board') else [b.strip() for b in boards_txt.split(',') if b.strip()]
    gender = GENDER_MAP.get(facts.get('Gender', '').lower())
    dayb = facts.get('Day/Boarding')
    boarding_type = BOARDING_KINDS.get(re.sub(r'\s+', ' ', (dayb or '').lower()).strip())
    if dayb and not boarding_type:
        warnings.append(f'unknown Day/Boarding value: {dayb!r}')
    stype = None
    if dayb:
        stype = 'Boarding School' if re.search(r'board|residential', dayb, re.I) else 'Day School'
        src['type'] = 'Quick Facts: Day/Boarding'
    elif boarding:
        stype, src['type'] = 'Boarding School', 'came from a boarding listing'
    elif card_type(card, cfg):
        stype, src['type'] = card_type(card, cfg), 'listing card class range'
    if boarding:
        if stype == 'Day School':
            warnings.append('Quick Facts says "Day School" but the school is listed under boarding schools')
        stype = 'Boarding School'
    if classes and stype == 'Day School' and classes.split('-')[-1].strip().lower() in PLAY_END:
        stype, src['type'] = 'Play School', 'class range ends at nursery/KG'
    if boarding_type:
        src['boarding_type'] = 'Quick Facts: Day/Boarding'

    # rating (page header first, listing card as fallback)
    rating, reviews = None, None
    rm = re.search(r'(\d\.\d)\s*\(\s*(\d+)\s+Reviews?\s*\)', ' '.join(lines[:200]))
    if rm:
        rating, reviews, src['rating'] = float(rm.group(1)), int(rm.group(2)), 'page header'
    elif card.get('rating'):
        rating, reviews, src['rating'] = card['rating'], card.get('reviews'), 'listing card'

    # fees + admissions (every variant = every session button that was clicked)
    heading_txt = clean((soup.title.string if soup.title and soup.title.string else '') + ' ' + h1.get_text())
    hm = re.search(r'Fees? Structure(?: for)? (\d{4}-\d{2,4})', heading_txt)
    page_heading_session = norm_session(hm.group(1)) if hm else None
    all_fees, all_adm = [], []
    for label, h in (variants or [(None, html)]):
        s2 = soup if h is html else BeautifulSoup(h, 'html.parser')
        fl = ' '.join(clean(l) for l in s2.get_text('\n').split('\n') if clean(l))
        all_fees += parse_class_fees(fl, s2, label)
        all_adm += parse_admissions(s2)
    class_fees = merge_fees(all_fees)
    admissions = merge_adm(all_adm)
    cur_adm = latest_session(a['session'] for a in admissions)
    latest = latest_session(c['fee_session'] for c in class_fees if c['annual_fee'])
    annual = [c['annual_fee'] for c in class_fees if c['annual_fee'] and c['fee_session'] == latest]
    sessions = sorted({c['fee_session'] for c in class_fees if c['fee_session']})
    unlabelled = [c['class_name'] for c in class_fees if c['annual_fee'] and not c['fee_session']]

    fee_min, fee_max = (min(annual), max(annual)) if annual else (None, None)
    fr = card.get('fee_range')
    if fr and fr[0] == 'annual':
        if annual:
            tol = lambda x: max(0.01 * x, 1000)
            if abs(fee_min - fr[1]) > tol(fr[1]) or abs(fee_max - fr[2]) > tol(fr[2]):
                warnings.append(f'fee range on the listing card ({fr[1]}-{fr[2]}) differs from the fees page ({fee_min}-{fee_max}, session {latest})')
        else:
            fee_min, fee_max = fr[1], fr[2]
            src['fee_min'] = src['fee_max'] = 'listing card (class-wise fees are not published on the page)'
            warnings.append('class-wise fees not published; fee_min/fee_max come from the listing card')

    for label, val in (('address', address), ('classes', classes), ('gender', gender), ('type', stype)):
        if not val:
            warnings.append(f'no {label} on the page')
    if not class_fees:
        warnings.append('no fees published')
    if unlabelled:
        warnings.append(f'fee rows without a stated session (not used for fee_min/max): {", ".join(unlabelled[:6])}')
    if latest and cur_adm and int(latest[:4]) < int(cur_adm[:4]):
        warnings.append(f'fees are for session {latest}, but admissions are open for {cur_adm} (site has not updated its fees)')
    if not admissions:
        warnings.append('no admission / application-fee table on the page')
    if not card.get('description'):
        warnings.append('no description on the listing card')

    for k, v in (('address', address), ('pincode', pin), ('classes', classes if classes and 'classes' not in src else None),
                 ('boards', boards or None), ('gender', gender), ('medium', facts.get('Medium')),
                 ('academic_session', facts.get('Academic Session')), ('student_teacher_ratio', facts.get('Student Teacher Ratio')),
                 ('founded', founded)):
        if v and k not in src:
            src[k] = 'page header' if k in ('address', 'pincode', 'founded') else 'Quick Facts'
    if class_fees:
        src['class_fees'] = 'fees-structure page (site-printed numbers; fee_session = session stated by the page or clicked button)'
    if annual:
        src['fee_min'] = src['fee_max'] = f'lowest / highest annual fee of the newest fee session ({latest})'
    if admissions:
        src['admissions'] = 'Fill Admission Form table (per session)'
    if card.get('description'):
        src['description'] = 'listing card'
    verified = True if 'Verified by School' in flat else None

    row = new_row(
        name=name, city=city_v, state=state_v, area=area, locality=locality, pincode=pin,
        type=stype, boarding_type=boarding_type, boards=boards, classes=classes, gender=gender,
        description=card.get('description'), rating=rating, reviews=reviews,
        fee_min=fee_min, fee_max=fee_max, address=address, founded=int(founded) if founded else None,
        medium=facts.get('Medium'), academic_session=facts.get('Academic Session'),
        student_teacher_ratio=facts.get('Student Teacher Ratio'), campus_size=facts.get('Campus Size'), verified=verified,
        latest_fee_session=latest, current_admission_session=cur_adm,
        source_site='ezyschooling.com', source_url=url, class_fees=class_fees, admissions=admissions, warnings=warnings,
        mongo_extra={'scraped_from': 'ezyschooling.com', 'ezy_slug': url.rsplit('/', 1)[-1],
                     'fee_data_sessions': sessions or None, 'page_heading_session': page_heading_session,
                     'listing_fee_range': list(fr) if fr else None, 'boarding_type_raw': dayb,
                     'sessions_clicked': [v[0] for v in (variants or []) if v[0]] or None,
                     'all_facts': facts, 'sources': src})
    return finalize(row), links, None


def merge_adm(rows):
    seen, out = set(), []
    for a in rows:
        k = (a['class_name'].lower(), a['session'])
        if k not in seen:
            seen.add(k)
            out.append(a)
    return sorted(out, key=lambda a: (a['session'], class_sort_key(a['class_name'])))


# ----------------------------------------------------------------------------- ezyschooling: overview page
def parse_contact(soup):
    out = {'phone': None, 'email': None, 'website': None, 'social': {}}
    head = next((h for h in soup.find_all(['h2', 'h3']) if 'address and contact' in clean(h.get_text()).lower()), None)
    if not head:
        return out
    texts, hrefs = [], []
    for n, el in enumerate(head.find_all_next()):
        if n > 150 or el.name in ('h1', 'h2'):
            break
        if el.name == 'a' and el.get('href'):
            hrefs.append(el['href'].strip())
        texts += [clean(t) for t in el.find_all(string=True, recursive=False) if clean(t)]
    for h in hrefs:
        low = h.lower()
        if low.startswith('mailto:'):
            out['email'] = out['email'] or valid_email(h[7:].split('?')[0])
        elif low.startswith('tel:'):
            out['phone'] = out['phone'] or valid_phone(h[4:])
        elif low.startswith('http'):
            host = urlparse(h).netloc
            if host_in(host, SOCIAL_HOSTS) and 'ezyschooling' not in h.lower():
                out['social'].setdefault(host.replace('www.', '').split('.')[0], h)
            elif valid_url(h):
                out['website'] = out['website'] or valid_url(h)
    if not out['email']:
        out['email'] = next((valid_email(e) for e in re.findall(r'[\w.+-]+@[\w-]+(?:\.[\w-]+)+', ' '.join(texts)) if valid_email(e)), None)
    if not out['website']:
        out['website'] = next((valid_url(w) for w in re.findall(r'https?://[^\s<>"]+', ' '.join(texts)) if valid_url(w)), None)
    return out


def phone_near_email(html, email):
    if not email:
        return None
    for m in re.finditer(re.escape(email), html, re.I):
        win = html[max(0, m.start() - 900): m.end() + 900]
        for pm in re.finditer(r'\\?"(?:phone|mobile|telephone|contact_?(?:no|number)?)[A-Za-z_]*\\?"\s*:\s*\\?"(\+?\d[\d\s\-]{8,16}\d)\\?"', win, re.I):
            p = valid_phone(pm.group(1))
            if p:
                return p
    return None


def parse_about(soup):
    head = next((h for h in soup.find_all('h2') if clean(h.get_text()).lower() == 'about us'), None)
    if not head:
        return None
    texts = []
    for n, el in enumerate(head.find_all_next()):
        if n > 60 or el.name in ('h1', 'h2', 'h3'):
            break
        texts += [clean(t) for t in el.find_all(string=True, recursive=False) if clean(t)]
    return ' '.join(dict.fromkeys(texts)) or None


def fetch_overview(u, row):
    """One extra request per school: email, website, phone (if printed), About Us, facilities (+sections), map position,
    photos, campus size, languages, food options, last-updated date, travel info."""
    h = get(u)
    if not h:
        row['warnings'].append('overview page not fetched')
        return row
    soup = BeautifulSoup(h, 'html.parser')
    lines = [clean(l) for l in soup.get_text('\n').split('\n') if clean(l)]
    flat = ' '.join(lines)
    src = row['mongo_extra']['sources']
    c = parse_contact(soup)
    row['email'], row['website'], row['social'] = c['email'], c['website'], c['social']
    row['phone'] = c['phone'] or phone_near_email(h, c['email'])
    for k in ('email', 'website', 'phone'):
        if row[k]:
            src[k] = 'Address And Contact block' if (k != 'phone' or c['phone']) else 'page data next to the e-mail'
    about = parse_about(soup)
    row['about'] = about
    if about:
        src['about'] = 'About Us section'
    if about and not row['description']:
        row['description'], src['description'] = about, 'About Us section'
        if 'no description on the listing card' in row['warnings']:
            row['warnings'].remove('no description on the listing card')
    yes, no, groups = parse_facilities(soup)
    row['facilities'], row['facility_groups'] = yes, groups
    row['mongo_extra']['facilities_not_available'] = no
    if yes:
        src['facilities'] = src['facility_groups'] = 'Facilities icons marked yes (grouped by the page section)'
    hostel_yes = [f for f in yes if 'hostel' in f.lower()]
    hostel_no = [f for f in no if 'hostel' in f.lower()]
    row['hostel'] = True if hostel_yes else (False if hostel_no else None)
    if row['hostel'] is not None:
        src['hostel'] = 'Facilities icons (Boys/Girls Hostel)'
    elif row['boarding_type'] in ('Full Boarding', 'Weekly Boarding'):
        row['hostel'], src['hostel'] = True, 'Quick Facts: Day/Boarding = ' + row['boarding_type']
    lat, lng = ezy_geo(h)
    if lat is not None:
        row['lat'], row['lng'], src['lat_lng'] = lat, lng, "school's own Google-Maps embed"
    logo, photos = ezy_media(soup, row['name'])
    row['logo'], row['images'] = logo, photos
    if logo:
        src['logo'] = 'image with alt "<school> Logo"'
    if photos:
        src['images'] = 'cover + "<school> Gallery" images'
    facts = quick_facts(lines)
    if facts.get('Campus Size') and not row['campus_size']:
        row['campus_size'], src['campus_size'] = facts['Campus Size'], 'Quick Facts'
    row['languages'] = parse_languages(soup)
    if row['languages']:
        src['languages'] = 'Languages Taught section'
    fm = re.search(r'provides ([A-Za-z, /&\-]+?) meals for its students', flat)
    if fm:
        row['food_options'], src['food_options'] = clean(fm.group(1)), 'FAQ: food options'
    um = re.search(r'Last Updated At\s*:\s*(\d{2}-[A-Za-z]{3}-\d{4})', flat)
    if um:
        try:
            row['page_last_updated'] = datetime.strptime(um.group(1), '%d-%b-%Y').date().isoformat()
            src['page_last_updated'] = 'page footer'
        except ValueError:
            pass
    if 'Travel Info' in lines and 'Rating and Reviews' in lines:
        i, j = lines.index('Travel Info'), lines.index('Rating and Reviews')
        if i < j:
            row['mongo_extra']['travel_info_raw'] = lines[i + 1:j][:20]
    if not row['admissions']:
        adm = merge_adm(parse_admissions(soup))
        if adm:
            row['admissions'], src['admissions'] = adm, 'Fill Admission Form table (overview page)'
            row['current_admission_session'] = latest_session(a['session'] for a in adm)
            if 'no admission / application-fee table on the page' in row['warnings']:
                row['warnings'].remove('no admission / application-fee table on the page')
    for k in ('phone', 'email', 'website'):
        if not row[k]:
            row['warnings'].append(f'no {k} on the overview page')
    if not row['rating'] and not row['reviews']:
        rm = re.search(r'(\d\.\d)\s*\(\s*(\d+)\s+Reviews?\s*\)', flat)
        if rm:
            row['rating'], row['reviews'], src['rating'] = float(rm.group(1)), int(rm.group(2)), 'page header'
    return finalize(row)


def fees_variants(u, a=None):
    """-> (static_html, variants). variants[0] = (None, static_html); further items = one per clicked session button."""
    page = u + '/fees-structure'
    html = get(page)
    if not html:
        return None, None
    variants = [(None, html)]
    if not (a and getattr(a, 'no_browser', False)) and BROWSER.ok is not False:
        rendered = BROWSER.render_variants(page)
        if rendered:
            variants += [(lab, h) for lab, h in rendered if lab]
    return html, variants


def crawl_ezy(cfg, a, rows):
    label, need = cfg['label'], cfg['need']
    cards, profiles, seen_l = {}, {}, set()
    q = deque([cfg['url']] if (cfg.get('boarding') or cfg.get('custom')) else [cfg['url'], cfg['url'] + '/areas'])
    n = 0
    main_total = None
    if getattr(a, 'no_browser', False):
        BROWSER.ok = False
    if cfg.get('boarding') and BROWSER.start() is False:
        print(f'[{label}] WARNING: no browser -> only the first ~27 schools of each listing can be read. City / board sub-listings '
              'will be walked to find more, but install playwright to be sure to get all of them.')

    def enough():
        if not a.limit:
            return False
        c = Counter(card_type(cards.get(u), cfg) for u in profiles if not SEEN.has({'url:' + u.rstrip('/').lower()}))
        return all(c[t] + c[None] >= a.limit + 10 for t in need)

    while q and n < a.max_listings and not enough():
        u = q.popleft()
        if u in seen_l:
            continue
        seen_l.add(u)
        html = get(u, keep=True)
        if not html:
            continue
        n += 1
        c, p, l, total = parse_listing(html, cfg)
        expanded = False
        has_load_btn = bool(re.search(r'load\s+(all|more)', html, re.I))
        if (not total or len(p) < total or has_load_btn) and BROWSER.ok is not False:
            print(f'[{label}] page shows {len(p)} schools (site says {total}) - loading ALL of them in a browser ...')
            full = browser_html(u, total)
            if full:
                c3, p3, l3, t3 = parse_listing(full, cfg)
                if len(p3) > len(p):
                    c, p, l, total, html, expanded = c3, p3, set(l) | set(l3), (t3 or total), full, True
                    _CACHE[u] = full
        for k, v in c.items():
            cards.setdefault(k, v)
        for x in p:
            profiles.setdefault(x, None)
        q.extend(x for x in l if x not in seen_l)
        print(f'[{label}] listing {n}: {len(c)} cards ({total} claimed), {len(profiles)} schools known, {len(q)} listings queued')
        if u == cfg['url']:
            main_total = total
            if expanded and total and len(profiles) >= total:
                q.clear()  # the complete list is already here
            for pg in range(2, 60):
                if expanded or enough():
                    break
                h2 = get(f"{u}{'&' if '?' in u else '?'}page={pg}")
                if not h2:
                    break
                c2, p2, l2, _ = parse_listing(h2, cfg)
                if not [x for x in p2 if x not in profiles]:
                    break
                for k, v in c2.items():
                    cards.setdefault(k, v)
                for x in p2:
                    profiles.setdefault(x, None)
                q.extend(x for x in l2 if x not in seen_l)
                print(f'[{label}]   ?page={pg}: now {len(profiles)} schools known')

    done, skipped, got, dups, saved = set(), {}, Counter(), 0, set()
    todo = deque(profiles)

    def finished():
        return bool(a.limit) and all(got[t] >= a.limit for t in need)

    for attempt in (1, 2):
        while todo and not finished():
            u = todo.popleft()
            if u in done:
                continue
            done.add(u)
            if SEEN.has({'url:' + u.rstrip('/').lower()}):
                dups += 1
                skipped[u] = 'already scraped in an earlier run (--skip-old)'
                continue
            ct = card_type(cards.get(u), cfg)
            if ct and (ct not in need or (a.limit and got[ct] >= a.limit)):
                skipped[u] = 'type not wanted / limit reached'
                continue
            html, variants = fees_variants(u, a)
            if not html:
                skipped[u] = 'fetch failed'
                continue
            row, links, why = parse_school(u, html, cfg, cards.get(u), variants)
            if not row:
                skipped[u] = why
                continue
            if not row['class_fees'] and '\u20b9' in html:
                dump_debug(u, html)
                row['warnings'].append('page shows rupee amounts but none were read: HTML saved in debug_html/')
            keys = school_keys(row['name'], row['address'], row['pincode'], u)
            if SEEN.has(keys):
                dups += 1
                skipped[u] = 'duplicate'
                print(f'  [{label}] duplicate, not added: {(row["name"] or "")[:50]!r}')
                continue
            if row['type'] not in need or (a.limit and got[row['type']] >= a.limit):
                skipped[u] = f"type {row['type']} not wanted"
                continue
            if cfg.get('btypes') and row['boarding_type'] and row['boarding_type'] not in cfg['btypes']:
                skipped[u] = f"boarding kind {row['boarding_type']} not selected"
                continue
            SEEN.add(keys)
            got[row['type']] += 1
            saved.add(u)
            rows.append(row)
            fetch_overview(u, row)
            print(f'  [{label}] {len(rows)} ({len(todo)} queued) {row["boarding_type"] or row["type"]}: {(row["name"] or "")[:45]!r} '
                  f'fees {row["fee_min"] or "-"}-{row["fee_max"] or "-"} ({row["latest_fee_session"] or "no session"}) '
                  f'apply-fee rows {len(row["admissions"])} {row["warnings"][:2] or ""}')
            if len(rows) % 25 == 0:
                with open(a.out + '.partial', 'w', encoding='utf-8') as f:
                    json.dump(rows, f, ensure_ascii=False, indent=1)
        failed = [u for u, why in skipped.items() if why == 'fetch failed']
        if attempt == 1 and failed and not finished():
            print(f'[{label}] {len(failed)} pages could not be loaded (rate limit?). Cooling down 60s, then retrying them once ...')
            time.sleep(60)
            for u in failed:
                skipped.pop(u)
                done.discard(u)
                todo.append(u)
        else:
            break
    missing = [r for r in rows if 'overview page not fetched' in r['warnings']]
    if missing:
        print(f'[{label}] retrying {len(missing)} overview pages that failed ...')
        time.sleep(30)
        for r in missing:
            r['warnings'].remove('overview page not fetched')
            fetch_overview(r['source_url'], r)
    print(f'[{label}] done: {dict(got)}, {dups} duplicates, {sum(1 for w in skipped.values() if w != "duplicate")} pages skipped')
    # ---- reconciliation: nothing may disappear silently
    unsaved = [u for u in profiles if u not in saved]
    if main_total:
        print(f'[{label}] the listing says {main_total} schools; {len(profiles)} were found; {len(saved)} saved now.')
        if len(profiles) < main_total:
            print(f'[{label}] WARNING: {main_total - len(profiles)} school(s) were NOT found on the listing pages. '
                  'They load behind "Load All Schools": run with the browser installed (pip install playwright ; playwright install chromium).')
    if unsaved:
        print(f'[{label}] found but not saved ({len(unsaved)}):')
        for u in unsaved[:60]:
            print(f'    - {u.rsplit("/", 1)[-1]}: {skipped.get(u, "not visited (limit reached or filtered)")}')
    return rows


# ============================================================================= SITE 2: any other website (generic, conservative)
JUNK_PATH = re.compile(r'(login|signin|signup|register|contact|about|privacy|terms|blog|news|career|faq|sitemap|tag|category|cart|account|search|compare|wp-content|\.(jpg|png|pdf|css|js|svg))', re.I)
SCHOOL_LD = {'school', 'educationalorganization', 'collegeoruniversity', 'preschool', 'elementaryschool', 'highschool',
             'middleschool', 'childcare', 'daycare'}
BOARD_NAMES = r'(?:CBSE|CISCE|ICSE|ISC|IB|IGCSE|Cambridge|State Board|NIOS)'


def jsonld_objects(soup):
    out = []

    def walk(o):
        if isinstance(o, list):
            for x in o:
                walk(x)
        elif isinstance(o, dict):
            out.append(o)
            if isinstance(o.get('@graph'), list):
                walk(o['@graph'])
    for s in soup.find_all('script', type='application/ld+json'):
        try:
            walk(json.loads(s.string or s.get_text() or ''))
        except Exception:
            continue
    return out


def find_school_ld(objs):
    def types(o):
        t = o.get('@type')
        return {str(x).lower() for x in (t if isinstance(t, list) else [t or ''])}
    for o in objs:
        if types(o) & SCHOOL_LD and o.get('name'):
            return o
    for o in objs:
        if 'localbusiness' in types(o) and o.get('name') and o.get('address'):
            return o
    return None


def ld_text(v):
    if isinstance(v, dict):
        v = v.get('url') or v.get('@id') or v.get('contentUrl')
    return clean(str(v)) if v else None


def generic_cfg(url, pattern=None):
    u = urlparse(url)
    return {'site': 'generic', 'label': u.netloc, 'url': url.strip(), 'host': u.netloc,
            'pattern': re.compile(pattern) if pattern else None, 'need': {'Day School', 'Play School', 'Boarding School'}}


def generic_links(html, cfg, listing_url):
    soup = BeautifulSoup(html, 'html.parser')
    out = {}
    lpath = urlparse(listing_url).path.rstrip('/')
    for a in soup.find_all('a', href=True):
        full = urljoin(listing_url, a['href'].split('#')[0])
        u = urlparse(full)
        if u.netloc != cfg['host'] or u.scheme not in ('http', 'https'):
            continue
        p = u.path.rstrip('/')
        if not p or p == lpath or ('?' in a['href'] and not cfg['pattern']):
            continue
        if cfg['pattern']:
            if not cfg['pattern'].search(p):
                continue
        elif JUNK_PATH.search(p) or p.count('/') < 1 or 'school' not in p.lower():
            continue
        out.setdefault(f'{u.scheme}://{u.netloc}{p}', None)
    return list(out)


def generic_geo(html):
    h = html.replace('&amp;', '&')
    m = re.search(r'maps/embed/v1/place\?(?:[^"\'\s<>]*?&)?q=(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)', h)
    if m:
        return float(m.group(1)), float(m.group(2))
    m = re.search(r'google\.[a-z.]+/maps/embed\?[^"\'\s<>]*!2d(-?\d{1,3}\.\d+)!3d(-?\d{1,2}\.\d+)', h)
    return (float(m.group(2)), float(m.group(1))) if m else (None, None)


def section_items(soup, keywords, max_items=60):
    out = []
    for h in soup.find_all(['h2', 'h3']):
        t = clean(h.get_text()).lower()
        if not any(k in t for k in keywords):
            continue
        stop = ('h1', 'h2') if h.name == 'h2' else ('h1', 'h2', 'h3')
        for n, el in enumerate(h.find_all_next()):
            if n > 150 or el.name in stop:
                break
            if el.name == 'li':
                v = clean(el.get_text(' '))
            else:
                continue
            if 2 < len(v) < 45 and ':' not in v and v not in out:
                out.append(v)
            if len(out) >= max_items:
                break
        if out:
            break
    return out


def labelled_extras(flat):
    d = {}
    m = re.search(r'Affiliation\s*(?:No\.?|Number|Code)\s*:\s*([A-Za-z0-9/-]{4,20})', flat, re.I)
    d['affiliation_no'] = m.group(1) if m else None
    m = re.search(r'School\s+Timings?\s*:\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?\s*(?:to|-|\u2013)\s*\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)', flat, re.I)
    d['school_timing'] = clean(m.group(1)) if m else None
    m = re.search(r'(?:Total\s+)?Students\s*:\s*([\d,]{2,7})\b', flat, re.I)
    d['student_count'] = int(m.group(1).replace(',', '')) if m else None
    m = re.search(r'(?:Total\s+)?Teachers\s*:\s*([\d,]{2,6})\b', flat, re.I)
    d['teacher_count'] = int(m.group(1).replace(',', '')) if m else None
    return d


def parse_generic(url, html):
    soup = BeautifulSoup(html, 'html.parser')
    flat = clean(soup.get_text(' '))
    org = find_school_ld(jsonld_objects(soup)) or {}
    src = {}
    h1 = soup.find('h1')
    name = clean(org.get('name') or (h1.get_text() if h1 else ''))
    if not name:
        return None
    src['name'] = 'JSON-LD' if org.get('name') else 'page heading'

    addr = org.get('address') or {}
    if isinstance(addr, str):
        addr = {'streetAddress': addr}
    street, city = clean(addr.get('streetAddress', '')), clean(addr.get('addressLocality', ''))
    state, pin = clean(addr.get('addressRegion', '')), clean(str(addr.get('postalCode', '')))
    address = ', '.join(x for x in (street, city, state, pin) if x) or None
    if address:
        src['address'] = 'JSON-LD'
    else:
        tag = soup.find('address')
        txt = clean(tag.get_text(' ')) if tag else ''
        if 10 <= len(txt) <= 300:
            address, src['address'] = txt, '<address> tag'
    if not pin and address:
        m = re.search(r'(?<!\d)(\d{6})\s*$', address)
        pin = m.group(1) if m else None

    geo = org.get('geo') or {}
    lat, lng = geo.get('latitude'), geo.get('longitude')
    if lat is not None:
        src['lat_lng'] = 'JSON-LD'
    else:
        lat, lng = generic_geo(html)
        if lat is not None:
            src['lat_lng'] = 'Google-Maps embed'

    phone = valid_phone(str(org.get('telephone', '')))
    email = valid_email(str(org.get('email', '')))
    for a in soup.find_all('a', href=True):
        h = a['href'].strip()
        if h.lower().startswith('tel:') and not phone:
            phone = valid_phone(h[4:])
            src['phone'] = 'tel: link'
        elif h.lower().startswith('mailto:') and not email:
            email = valid_email(h[7:].split('?')[0])
            src['email'] = 'mailto: link'
    if phone and 'phone' not in src:
        src['phone'] = 'JSON-LD'
    if email and 'email' not in src:
        src['email'] = 'JSON-LD'

    rating = org.get('aggregateRating') or {}
    try:
        r_val = float(rating.get('ratingValue')) if rating.get('ratingValue') else None
        r_cnt = int(float(rating.get('reviewCount') or rating.get('ratingCount'))) if (rating.get('reviewCount') or rating.get('ratingCount')) else None
    except (TypeError, ValueError):
        r_val = r_cnt = None

    bm = re.search(rf'\b(?:Board|Affiliated\s+to|Curriculum)\s*:?\s*({BOARD_NAMES}(?:\s*[,/&]\s*{BOARD_NAMES})*)', flat)
    boards = [b.strip() for b in re.split(r'[,/&]', bm.group(1)) if b.strip()] if bm else []
    gm = re.search(r'\bGender\s*:\s*(Co-?ed|Co-?educational|Girls|Boys)\b', flat, re.I)
    gender = GENDER_MAP.get(gm.group(1).lower().replace(' ', '')) if gm else None
    cl = re.search(r'\b(?:Classes|Grades?)\s*:\s*((?:Pre[- ]?)?(?:Nursery|KG|LKG|Class\s*\d+|\d{1,2}(?:st|nd|rd|th)?)\s*(?:to|-|\u2013)\s*(?:Class\s*)?\d{1,2}(?:st|nd|rd|th)?)', flat, re.I)
    fy = re.search(r'\b(?:Estd\.?|Established(?:\s+in)?|Founded(?:\s+in)?)\s*:?\s*((?:18|19|20)\d{2})\b', flat, re.I)
    founded = fy.group(1) if fy else (re.search(r'(?:18|19|20)\d{2}', str(org.get('foundingDate', ''))) or [None])[0]

    desc_meta = soup.find('meta', attrs={'name': 'description'})
    description = clean(org.get('description') or '') or None
    if description:
        src['description'] = 'JSON-LD'
    elif desc_meta and desc_meta.get('content') and len(clean(desc_meta['content'])) >= 40:
        description, src['description'] = clean(desc_meta['content']), 'meta description'

    og = soup.find('meta', property='og:image')
    images = [ld_text(i) for i in (org.get('image') if isinstance(org.get('image'), list) else [org.get('image')]) if i]
    if og and og.get('content'):
        images.append(urljoin(url, og['content']))
    logo = ld_text(org.get('logo'))
    social = {}
    for s in org.get('sameAs', []) if isinstance(org.get('sameAs'), list) else []:
        host = urlparse(s).netloc.lower()
        for k in SOCIAL_HOSTS:
            if host_in(host, (k,)):
                social.setdefault(k.split('.')[0], s)
    website = valid_url(org['url']) if isinstance(org.get('url'), str) and urlparse(org['url']).netloc != urlparse(url).netloc else None

    t = org.get('@type')
    ts = ' '.join(str(x) for x in (t if isinstance(t, list) else [t or ''])).lower()
    probe = f'{name} {ts}'.lower()
    stype = 'Boarding School' if re.search(r'boarding|residential', probe) else \
        'Play School' if re.search(r'play\s*school|pre-?school|nursery school|day\s*care', probe) else None
    ex = labelled_extras(flat)

    warnings = [f'no {k} found' for k, v in (('address', address), ('phone', phone), ('email', email)) if not v]
    warnings.append('fees are not read by the generic parser')
    row = new_row(
        name=name, city=city or None, state=state or None, pincode=pin or None, type=stype, boards=boards,
        classes=clean(cl.group(1)) if cl else None, gender=gender, description=description,
        rating=r_val, reviews=r_cnt, address=address, lat=lat, lng=lng, phone=phone, email=email, website=website,
        social=social, logo=logo, images=images, facilities=section_items(soup, ('facilit', 'amenit', 'infrastructure')),
        founded=int(founded) if founded else None, affiliation_no=ex['affiliation_no'], school_timing=ex['school_timing'],
        student_count=ex['student_count'], teacher_count=ex['teacher_count'],
        source_site=urlparse(url).netloc, source_url=url, warnings=warnings,
        mongo_extra={'scraped_from': urlparse(url).netloc, 'had_jsonld': bool(org), 'sources': src})
    return finalize(row)


def crawl_generic(cfg, a, rows):
    label = cfg['label']
    cand, tried = {}, set()
    page, skipped, dups = 1, 0, 0
    print(f'[{label}] reading listing {cfg["url"]}')
    while page <= a.max_listings:
        u = cfg['url'] if page == 1 else f"{cfg['url']}{'&' if '?' in cfg['url'] else '?'}page={page}"
        html = get(u, keep=True)
        if not html:
            break
        new = [x for x in generic_links(html, cfg, cfg['url']) if x not in cand]
        if not new:
            break
        for x in new:
            cand[x] = None
        print(f'[{label}] page {page}: {len(new)} new links ({len(cand)} total)')
        if a.limit and len(cand) >= a.limit * 3:
            break
        page += 1
    if not cand:
        print(f'[{label}] no school links found on that page. Try --pattern "<regex for a school page path>".')
        return rows
    for u in cand:
        if a.limit and len(rows) >= a.limit:
            break
        if u in tried:
            continue
        tried.add(u)
        if SEEN.has({'url:' + u.rstrip('/').lower()}):
            dups += 1
            continue
        html = get(u)
        row = parse_generic(u, html) if html else None
        if not row or (not row['address'] and not row['phone'] and not row['mongo_extra'].get('had_jsonld')):
            skipped += 1
            continue
        keys = school_keys(row['name'], row['address'], row['pincode'], u)
        if SEEN.has(keys):
            dups += 1
            print(f'  [{label}] duplicate, not added: {row["name"][:50]!r}')
            continue
        SEEN.add(keys)
        rows.append(row)
        print(f'  [{label}] {len(rows)} {row["type"] or "-"}: {row["name"][:45]!r} {row["city"] or ""} {row["warnings"] or ""}')
        if len(rows) % 25 == 0:
            with open(a.out + '.partial', 'w', encoding='utf-8') as f:
                json.dump(rows, f, ensure_ascii=False, indent=1)
    print(f'[{label}] done: {len(rows)} schools, {dups} duplicates not added, {skipped} pages skipped')
    return rows


# ============================================================================= self test
DELHI_TEST = f'{BASE}/school/delhi-city-school-rohini-north-west-delhi'
DELHI_EXPECTED = {
    'name': 'Delhi City School', 'city': 'Delhi', 'area': 'Sector 8, Rohini', 'locality': 'Sector 8', 'pincode': '110085',
    'address': 'Pocket C-8, Sector 8, Madhuban Chowk, Rohini, North West Delhi, Delhi - 110085',
    'type': 'Day School', 'boards': ['CBSE'], 'classes': 'Nursery - 12', 'gender': 'Co-ed', 'medium': 'English',
    'academic_session': 'April to March', 'student_teacher_ratio': '24:1', 'founded': 1992,
    'email': 'info@delhicityschool.com', 'website': 'http://www.delhicityschool.com/', 'hostel': False,
}
# Boarding example read from the live pages on 27 Oct 2026 (Birla Open Minds, Hoshiarpur: no fees published, admissions table, 7 acres)
DEFAULT_TEST = f'{BASE}/school/birla-open-minds-international-school-hoshiarpur-punjab'
BIRLA_EXPECTED = {
    'name': 'Birla Open Minds International School', 'city': 'Hoshiarpur', 'state': 'Punjab', 'pincode': '146001',
    'address': 'Village-Lohar Kangna, Tanda Road, Hoshiarpur, Punjab - 146001',
    'area': 'Village-Lohar Kangna, Tanda Road', 'locality': 'Tanda Road',
    'type': 'Boarding School', 'boarding_type': 'Day Cum Boarding', 'boards': ['CBSE'], 'classes': '4 - 12', 'gender': 'Co-ed',
    'medium': 'English', 'academic_session': 'April to March', 'student_teacher_ratio': '30:1', 'founded': 2019,
    'campus_size': '7 Acres', 'email': 'chhabra.ruchika80@gmail.com', 'website': 'https://www.birlaopenminds.com/',
    'hostel': True, 'fee_min': None, 'fee_max': None, 'class_fees': [],
}
BOARDING_TEST = f'{BASE}/school/the-aga-khan-academy-hyderabad'
BOARDING_FEES = {
    'Class 6': (1600700, 450000, 2050700, 3), 'Class 7': (1600700, 450000, 2050700, 3),
    'Class 8': (1600700, 450000, 2050700, 3), 'Class 9': (1631400, 450000, 2081400, 3),
    'Class 10': (1631400, 450000, 2081400, 3), 'Class 11': (1991800, 450000, 2441800, 3),
    'Class 12': (1991800, 450000, 2441800, 3),
}
SHOW = ['name', 'city', 'state', 'area', 'locality', 'pincode', 'address', 'type', 'boarding_type', 'boards', 'classes', 'gender',
        'medium', 'academic_session', 'student_teacher_ratio', 'campus_size', 'founded', 'fee_min', 'fee_max',
        'latest_fee_session', 'current_admission_session', 'rating', 'reviews', 'phone', 'email', 'website', 'lat', 'lng',
        'hostel', 'languages', 'food_options', 'verified', 'page_last_updated', 'logo', 'social']


def selftest(url=None, a=None):
    url = (url or DEFAULT_TEST).split('#')[0].rstrip('/')
    url = re.sub(r'/(fees-structure|photos|reviews|admission)$', '', url)
    html, variants = fees_variants(url, a)
    if not html:
        print('Could not load', url + '/fees-structure')
        return
    row, _, why = parse_school(url, html, custom_cfg(url, {'Day School', 'Play School', 'Boarding School'}), None, variants)
    if not row:
        print('Parser failed:', why)
        return
    fetch_overview(url, row)
    src = row['mongo_extra']['sources']
    print(f'\nSchool: {row["name"]}   ({url})\n' + '-' * 78)
    print(f'(session buttons clicked in the browser: {row["mongo_extra"].get("sessions_clicked") or "none / browser not used"})')
    for k in SHOW:
        where = src.get(k) or (src.get('lat_lng') if k in ('lat', 'lng') else None) or ('(empty: not on the page)' if row.get(k) in (None, [], {}) else '')
        print(f'{k:26} {repr(row.get(k))[:62]:64} <- {where}')
    print(f'{"facilities":26} {len(row["facilities"])} yes, sections: { {g: len(v) for g, v in row["facility_groups"].items()} }')
    print(f'{"not available":26} {row["mongo_extra"].get("facilities_not_available")}')
    print(f'{"images":26} {len(row["images"])} school photos')
    print(f'{"about":26} {(row["about"] or "")[:90]!r}')
    print('\nclass fees (numbers exactly as the site prints them; session = stated by the page / clicked button):')
    for c in row['class_fees']:
        print(f'  {c["class_name"]:9} session={c["fee_session"]} monthly={c["monthly_fee"]} annual={c["annual_fee"]} '
              f'one-time={c["one_time_fee"]} first-year={c["first_year_total"]} lines={len(c["items"])}')
        for it in c['items']:
            print(f'      - {it["fee_type"]:28} {it["frequency"]:12} {it["amount"]:>10}  refundable={it.get("refundable")}')
    print('\nadmission / application fees (the "Fill Admission Form" table):')
    for ad in row['admissions']:
        print(f'  {ad["class_name"]:9} {ad["session"]}  {ad["date_type"] or "-"}: {ad["date_text"] or "-"} ({ad["date_iso"] or "-"})  '
              f'{ad["status"] or "-":14} application fee={ad["application_fee"]}')
    print('\nwarnings:', row['warnings'])
    if url == BOARDING_TEST:
        print('\n--- checks against the live page (Aga Khan Academy, Hyderabad - boarding layout) ---')
        ok = True
        by = {c['class_name']: c for c in row['class_fees']}
        for cls, (ann, one, first_y, nlines) in BOARDING_FEES.items():
            c = by.get(cls, {})
            good = (c.get('annual_fee') == ann and c.get('one_time_fee') == one and c.get('first_year_total') == first_y and len(c.get('items', [])) == nlines)
            ok &= good
            print(f'{"PASS" if good else "FAIL"}  {cls:9} annual={c.get("annual_fee")} one-time={c.get("one_time_fee")} '
                  f'first-year={c.get("first_year_total")} lines={len(c.get("items", []))}')
        print('\nALL PASS' if ok else '\nSome checks FAILED: fee numbers may have been updated on the site, or the layout changed.')
        return
    expected = BIRLA_EXPECTED if url == DEFAULT_TEST else DELHI_EXPECTED if url == DELHI_TEST else None
    if not expected:
        print('\nCompare the values above with the school page in your browser (the "<-" column says where each came from).')
        return
    print(f'\n--- checks against the live page ({row["name"]}) ---')
    ok = True
    for k, want in expected.items():
        good = row.get(k) == want
        ok &= good
        print(f'{"PASS" if good else "FAIL"}  {k:22} got={row.get(k)!r}  expected={want!r}')
    extra = {'"Call School" is not part of the address': 'call school' not in (row['address'] or '').lower(),
             'area/locality is not "India"': 'india' not in f'{row["area"]} {row["locality"]}'.lower()}
    if url == DEFAULT_TEST:
        adm = {(x['class_name'], x['session']): x for x in row['admissions']}
        extra.update({
            'map position': row['lat'] is not None and abs(row['lat'] - 31.55633) < 1e-3 and abs(row['lng'] - 75.83456) < 1e-3,
            'admissions: Class 4..12 for 2027-2028': all((f'Class {i}', '2027-2028') in adm for i in range(4, 13)),
            'application fee Class 4 = 2100': adm.get(('Class 4', '2027-2028'), {}).get('application_fee') == 2100,
            'application fee Class 10 not published': adm.get(('Class 10', '2027-2028'), {}).get('application_fee') is None,
            'no fake fee session from the page heading': not row['class_fees'],
            'languages include English, Hindi, Punjabi, French': all(x in row['languages'] for x in ('English', 'Hindi', 'Punjabi', 'French')),
            'facility sections present': 'Boarding' in row['facility_groups'] and 'Lab' in row['facility_groups'],
            'rating 5.0 / 2 reviews': row['rating'] == 5.0 and row['reviews'] == 2,
            'food options Vegetarian': row['food_options'] == 'Vegetarian',
        })
    for k, good in extra.items():
        ok &= good
        print(f'{"PASS" if good else "FAIL"}  {k}')
    print('\nALL PASS' if ok else '\nSome checks FAILED: the site may have changed (fees and dates get updated), or the layout did. Send me this output.')


# ============================================================================= menu
SITES = [('ezy', 'ezyschooling.com   (dedicated parser: fees, admissions, boards, facilities, contacts ...)'),
         ('generic', 'Any other website  (paste a listing link; reads JSON-LD / <address> / tel: / mailto: only)')]
MENU = [('school', 'Schools only     (regular day schools, asks for a CITY)'),
        ('play', 'Play schools     (nursery / KG level, asks for a CITY)'),
        ('boarding', 'Boarding schools (all kinds: Full / Day-cum-Boarding / Day / Weekly; asks for a STATE)')]
SHORT = {'Day School': 'school', 'Play School': 'play', 'Boarding School': 'boarding'}


def ask_site():
    print('\n' + '=' * 60 + '\nWhich WEBSITE do you want to scrape?')
    for i, (_, text) in enumerate(SITES, 1):
        print(f'  {i}) {text}')
    while True:
        raw = input('Choose 1 or 2 (or paste a website link directly, q = quit): ').strip()
        if raw.lower() in ('q', 'quit'):
            sys.exit(0)
        if raw in ('1', '2'):
            return SITES[int(raw) - 1][0], None
        if raw.lower().startswith('http'):
            return ('ezy' if urlparse(raw).netloc.lower().endswith('ezyschooling.com') else 'generic'), raw
        print('  Please type 1 or 2, or paste a link starting with http.')


def ask_types():
    print('\n' + '=' * 60 + '\nWhat do you want to scrape?')
    for i, (_, text) in enumerate(MENU, 1):
        print(f'  {i}) {text}')
    print('  A) All of the above')
    while True:
        raw = input('Choose one or more, e.g. "1" or "1 3" or "A" (q = quit): ').strip().lower()
        if raw in ('q', 'quit'):
            sys.exit(0)
        if raw in ('a', 'all'):
            return [k for k, _ in MENU]
        picks = re.split(r'[\s,]+', raw)
        if raw and all(p in ('1', '2', '3') for p in picks):
            return [MENU[int(p) - 1][0] for p in dict.fromkeys(picks)]
        print('  Please type numbers 1-3 (for example "1 3") or A.')


def ask_btypes():
    print('\nWhich BOARDING kinds?  1) Full boarding   2) Day-cum-boarding   3) Day boarding   4) Weekly boarding')
    raw = input('Choose e.g. "1 2", or press Enter for ALL kinds: ').strip()
    keys = ['full', 'daycum', 'day', 'weekly']
    picks = [keys[int(p) - 1] for p in re.split(r'[\s,]+', raw) if p in ('1', '2', '3', '4')]
    return {BTYPE_CHOICES[k] for k in picks} or None


def link_cfg(url, need, boarding_expected=None, btypes=None):
    url = url.strip().split('#')[0]
    if not urlparse(url).netloc.lower().endswith('ezyschooling.com'):
        print('  That is not an ezyschooling.com link. Go back and choose "Any other website" for other sites.')
        return None
    is_boarding = 'boarding-schools' in urlparse(url).path
    if boarding_expected is True and not is_boarding:
        print('  That is not a boarding-schools link (its address should contain "boarding-schools").')
        return None
    if boarding_expected is False and is_boarding:
        print('  That is a boarding-schools link: choose "Boarding schools" in the menu to use it.')
        return None
    cfg = custom_cfg(url, need, btypes)
    if not check_listing(cfg):
        print(f'  Could not open {cfg["url"]}')
        return None
    return cfg


def ask_city(need):
    while True:
        name = input('\nEnter the CITY (e.g. Delhi, Mumbai, Bangalore, Pune)\n   or paste an ezyschooling.com listing LINK (q = quit): ').strip()
        if name.lower() in ('q', 'quit'):
            sys.exit(0)
        if not name:
            continue
        if name.lower().startswith('http'):
            cfg = link_cfg(name, need, boarding_expected=False)
            if cfg:
                return cfg
            continue
        cfg = city_cfg(name, need)
        if check_listing(cfg):
            return cfg
        print(f"  Could not open {cfg['url']}\n  Check the spelling (use the name as written on ezyschooling.com) and try again.")


def ask_state():
    while True:
        name = input('\nEnter the STATE for boarding schools (e.g. Punjab, Uttarakhand),\n   press Enter for all India, or paste an ezyschooling.com boarding LINK (q = quit): ').strip()
        if name.lower() in ('q', 'quit'):
            sys.exit(0)
        bt = ask_btypes()
        if name.lower().startswith('http'):
            cfg = link_cfg(name, {'Boarding School'}, boarding_expected=True, btypes=bt)
            if cfg:
                return cfg
            continue
        cfg = boarding_cfg(name, bt)
        if check_listing(cfg):
            return cfg
        print(f"  Could not open {cfg['url']}\n  Check the spelling of the state and try again.")


def ask_generic(first_url=None):
    while True:
        url = first_url or input('\nPaste the LISTING page link of the website (a page that lists many schools; q = quit): ').strip()
        first_url = None
        if url.lower() in ('q', 'quit'):
            sys.exit(0)
        if not url.lower().startswith('http'):
            print('  The link must start with http:// or https://')
            continue
        pat = input('Optional: regex for the school-page paths (e.g. /school/[^/]+$) - press Enter to auto-detect: ').strip() or None
        try:
            cfg = generic_cfg(url, pat)
        except re.error as e:
            print(f'  Bad regex: {e}')
            continue
        if get(cfg['url'], keep=True):
            return cfg
        print(f'  Could not open {url}')


def ask_where(site, types, first_url=None):
    if site == 'generic':
        return [ask_generic(first_url)]
    if first_url:
        cfg = link_cfg(first_url, {TYPE_NAMES[t] for t in types if t != 'boarding'} or {'Day School'})
        if cfg:
            return [cfg]
    cfgs = []
    kinds = [t for t in types if t in ('school', 'play')]
    if kinds:
        cfgs.append(ask_city({TYPE_NAMES[t] for t in kinds}))
    if 'boarding' in types:
        cfgs.append(ask_state())
    return cfgs


def ask_limit():
    raw = input('\nHow many schools of EACH type do you want? (press Enter for ALL, e.g. 100): ').strip()
    return int(raw) if raw.isdigit() else 0


def ask_batch(last):
    d = last or 100
    raw = input(f'\nHow many MORE new schools of EACH type for the next batch? (Enter = {d}): ').strip()
    return int(raw) if raw.isdigit() and int(raw) > 0 else d


def ask_next():
    print('\n' + '-' * 60 + '\nDone. What next?')
    print('  M) More        - NEXT batch: other schools from the same place, none repeated (new files)')
    print('  S) Same kind   - another city / state / link on the same website')
    print('  N) New website - back to the website menu')
    print('  Q) Quit')
    while True:
        c = input('Choose M, S, N or Q: ').strip().lower()
        if c in ('m', 's', 'n', 'q'):
            return c


# ============================================================================= run + save
def unique(path):
    base, ext = os.path.splitext(path)
    p, n = path, 2
    while os.path.exists(p):
        p, n = f'{base}_{n}{ext}', n + 1
    return p


def auto_name(cfgs):
    parts = ['scrape']
    for c in cfgs:
        if c['site'] == 'generic':
            parts += [slugify(c['host']), slugify(urlparse(c['url']).path)[:30] or 'home']
        elif c.get('custom'):
            parts += ['ezy', 'link', slugify(urlparse(c['url']).path.rsplit('/', 1)[-1])[:40]]
        elif c.get('boarding'):
            parts += ['ezy', 'boarding', c['slug'] or 'india']
        else:
            parts += ['ezy', c['slug']] + sorted(SHORT[t] for t in c['need'])
    return '_'.join(p for p in parts if p) + '.json'


SCHOOL_COLS = ['name', 'type', 'boarding_type', 'city', 'state', 'area', 'locality', 'pincode', 'boards', 'classes', 'gender',
               'medium', 'academic_session', 'student_teacher_ratio', 'campus_size', 'founded', 'fee_min', 'fee_max',
               'latest_fee_session', 'current_admission_session', 'address', 'lat', 'lng', 'phone', 'email', 'website', 'social',
               'logo', 'images', 'facilities', 'facility_groups', 'hostel', 'languages', 'food_options', 'verified',
               'page_last_updated', 'affiliation_no', 'school_timing', 'student_count', 'teacher_count', 'rating', 'reviews',
               'description', 'about', 'source_site', 'source_url']


def class_sort_key(name):
    n = name.lower().strip()
    order = {'toddler': 0, 'playgroup': 1, 'pre nursery': 2, 'pre-nursery': 2, 'nursery': 3, 'lkg': 4, 'kg': 4, 'ukg': 5}
    if n in order:
        return (order[n], 0, n)
    m = re.search(r'\d+', n)
    return (6, int(m.group()) if m else 99, n)


def run(cfgs, a, base_out=None):
    a.out = unique(base_out or auto_name(cfgs))
    print(f'\nWill scrape: {", ".join(c["label"] for c in cfgs)}  | per type: {a.limit or "all"}  | output: {a.out}\n')
    rows = []
    try:
        for cfg in cfgs:
            (crawl_generic if cfg['site'] == 'generic' else crawl_ezy)(cfg, a, rows)
    except KeyboardInterrupt:
        print('\nStopped with Ctrl+C - saving the schools collected so far ...')
    if not rows:
        print('\nNothing new to save (every school found was already scraped before: run without --skip-old to fetch them again).')
        return rows
    with open(a.out, 'w', encoding='utf-8') as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)

    base = a.out.replace('.json', '')
    classes = sorted({c['class_name'] for r in rows for c in r['class_fees']}, key=class_sort_key)
    fee_cols = [f'{c} - {lab}' for c in classes for lab in ('monthly', 'annual', 'one-time', 'first year')]

    def school_values(r):
        vals = []
        for c in SCHOOL_COLS:
            v = r.get(c)
            vals.append(', '.join(v) if isinstance(v, list) else json.dumps(v, ensure_ascii=False) if isinstance(v, dict) else v)
        newest = {c['class_name']: c for c in r['class_fees'] if c['fee_session'] == r['latest_fee_session']}
        for c in classes:  # the per-class columns show the NEWEST fee session; every session is in the _class_fees sheet
            f = newest.get(c, {})
            vals += [f.get('monthly_fee'), f.get('annual_fee'), f.get('one_time_fee'), f.get('first_year_total')]
        return vals

    fee_head = ['school', 'type', 'boarding_type', 'city', 'area', 'class', 'fee_session', 'monthly_fee', 'annual_fee',
                'one_time_fee', 'first_year_total', 'source_url']
    line_head = ['school', 'type', 'city', 'class', 'fee_session', 'fee_type', 'frequency', 'amount', 'refundable', 'source_url']
    adm_head = ['school', 'type', 'boarding_type', 'city', 'class', 'session', 'date_type', 'date_text', 'date_iso', 'status',
                'application_fee', 'source_url']
    fee_rows, line_rows, adm_rows = [], [], []
    for r in rows:
        for c in r['class_fees']:
            fee_rows.append([r['name'], r['type'], r['boarding_type'], r['city'], r['area'], c['class_name'], c.get('fee_session'),
                             c.get('monthly_fee'), c.get('annual_fee'), c.get('one_time_fee'), c.get('first_year_total'), r['source_url']])
            for it in c.get('items', []):
                line_rows.append([r['name'], r['type'], r['city'], c['class_name'], c.get('fee_session'), it['fee_type'],
                                  it['frequency'], it['amount'], it.get('refundable'), r['source_url']])
        for ad in r['admissions']:
            adm_rows.append([r['name'], r['type'], r['boarding_type'], r['city'], ad['class_name'], ad['session'], ad['date_type'],
                             ad['date_text'], ad['date_iso'], ad['status'], ad['application_fee'], r['source_url']])
    sheets = {'Schools': [SCHOOL_COLS + fee_cols] + [school_values(r) for r in rows],
              'Class fees': [fee_head] + fee_rows, 'Fee lines': [line_head] + line_rows, 'Admissions': [adm_head] + adm_rows}
    files = []
    for suffix, table in (('_schools.csv', sheets['Schools']), ('_class_fees.csv', sheets['Class fees']),
                          ('_fee_lines.csv', sheets['Fee lines']), ('_admissions.csv', sheets['Admissions'])):
        with open(base + suffix, 'w', newline='', encoding='utf-8-sig') as f:
            csv.writer(f).writerows(table)
        files.append(base + suffix)
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font
        wb = Workbook()
        wb.remove(wb.active)
        for title, table in sheets.items():
            ws = wb.create_sheet(title)
            for row in table:
                ws.append([x if isinstance(x, (int, float, str, type(None))) else str(x) for x in row])
            for cell in ws[1]:
                cell.font = Font(bold=True)
            ws.freeze_panes = 'B2'
        wb.save(base + '.xlsx')
        files.append(base + '.xlsx')
    except ImportError:
        print('  (for an Excel file too: pip install openpyxl)')
    no_fee = [r for r in rows if not r['class_fees']]
    print(f'\nClass fees: {len(fee_rows)} class entries and {len(line_rows)} fee lines for {len(rows) - len(no_fee)} of {len(rows)} schools'
          + (f'  ({len(no_fee)} schools publish no class-wise fees)' if no_fee else ''))
    print(f'Admission / application fees: {len(adm_rows)} rows for {sum(1 for r in rows if r["admissions"])} schools')
    stale = [r for r in rows if any('site has not updated its fees' in w for w in r['warnings'])]
    if stale:
        print(f'{len(stale)} schools show fees of an OLDER session than their open admissions (see warnings):')
        for r in stale[:15]:
            print(f'   {r["name"]}: fees {r["latest_fee_session"]}, admissions {r["current_admission_session"]}')
    for r in no_fee:
        print(f'   no class-wise fees: {r["name"]}  {r["source_url"]}/fees-structure')
    if no_fee and os.path.isdir('debug_html'):
        print('   (pages that showed rupee amounts but could not be read are saved in the debug_html folder)')

    miss = sum(1 for r in rows if r['warnings'])
    by_type = Counter(r['boarding_type'] or r['type'] for r in rows)
    print(f'\nSaved {len(rows)} schools {dict(by_type)}  ({miss} with warnings, see the "warnings" field). Files:\n  ' + '\n  '.join([a.out] + files))
    SEEN.save()
    return rows


def cfgs_from_args(site, types, a, ap):
    if site == 'generic':
        if not a.url:
            ap.error('--url (listing page link) is required for --site generic')
        try:
            cfg = generic_cfg(a.url, a.pattern)
        except re.error as e:
            ap.error(f'bad --pattern: {e}')
        if not get(cfg['url'], keep=True):
            ap.error(f'could not open {a.url}')
        return [cfg]
    btypes = None
    if a.boarding_types and 'all' not in a.boarding_types:
        btypes = {BTYPE_CHOICES[k] for k in a.boarding_types}
    cfgs = []
    kinds = [t for t in types if t in ('school', 'play')]
    if kinds:
        need = {TYPE_NAMES[t] for t in kinds}
        if a.url and 'boarding-schools' not in a.url:
            cfg = link_cfg(a.url, need, boarding_expected=False)
        elif a.city:
            cfg = city_cfg(a.city, need)
            cfg = cfg if check_listing(cfg) else None
        else:
            ap.error('--city (or --url) is required for school / play')
        if not cfg:
            ap.error('could not open the listing for school / play')
        cfgs.append(cfg)
    if 'boarding' in types:
        if a.url and 'boarding-schools' in a.url:
            cfg = link_cfg(a.url, {'Boarding School'}, boarding_expected=True, btypes=btypes)
        else:
            cfg = boarding_cfg(a.state or '', btypes)
            cfg = cfg if check_listing(cfg) else None
        if not cfg:
            ap.error('could not open the boarding listing (check --state / --url)')
        cfgs.append(cfg)
    return cfgs


def main():
    ap = argparse.ArgumentParser(description='Scrape school websites. Run with no options to get a menu (website first).')
    ap.add_argument('--site', choices=['ezy', 'generic'], help='website: ezy = ezyschooling.com, generic = any other site (needs --url)')
    ap.add_argument('--types', nargs='+', choices=['school', 'play', 'boarding', 'all'], help='ezy only: what to scrape')
    ap.add_argument('--boarding-types', nargs='+', choices=['full', 'daycum', 'day', 'weekly', 'all'],
                    help='boarding only: which kinds to keep (default: all kinds)')
    ap.add_argument('--city', help='ezy: city for school / play (e.g. Delhi)')
    ap.add_argument('--state', help='ezy: state for boarding (e.g. Punjab); leave out for all India')
    ap.add_argument('--url', help='a listing link (required for --site generic; optional for ezy); with --selftest: a school page to check')
    ap.add_argument('--pattern', help='generic: regex matching the PATH of individual school pages, e.g. "/school/[^/]+$"')
    ap.add_argument('--limit', type=int, default=None, help='max schools per type (0 = all)')
    ap.add_argument('--max-listings', type=int, default=400, help='max listing pages to read')
    ap.add_argument('--out', default=None, help='output file (default is built from your choices)')
    ap.add_argument('--fresh', action='store_true', help='(default) fetch all schools, even those saved by earlier runs')
    ap.add_argument('--skip-old', action='store_true', help='skip schools already saved by earlier runs (scraped_index.json)')
    ap.add_argument('--no-browser', action='store_true',
                    help='do not use the headless browser (schools behind "Load All Schools" and the 2nd fee/admission session will be missed)')
    ap.add_argument('--selftest', action='store_true', help='read one real ezyschooling school page and print every field with its source')
    a = ap.parse_args()
    SEEN.use_history = bool(a.skip_old)
    if a.no_browser:
        BROWSER.ok = False
    if a.selftest:
        return selftest(a.url or None, a)

    if a.site or a.types is not None or a.url:
        site = a.site or ('generic' if a.url and not urlparse(a.url).netloc.lower().endswith('ezyschooling.com') else 'ezy')
        types = [k for k, _ in MENU] if (a.types is None or 'all' in a.types) else list(dict.fromkeys(a.types))
        a.limit = a.limit or 0
        run(cfgs_from_args(site, types, a, ap), a, a.out)
        return

    if not sys.stdin.isatty():
        ap.error('no terminal to ask questions in: pass --site ezy|generic (and --types / --city / --state / --url)')
    user_out = a.out
    while True:
        site, first_url = ask_site()
        types = ask_types() if (site == 'ezy' and not first_url) else ['school', 'play']
        while True:
            cfgs = ask_where(site, types, first_url)
            first_url = None
            a.limit = ask_limit()
            while True:
                run(cfgs, a, user_out)
                nxt = ask_next()
                if nxt != 'm':
                    break
                a.limit = ask_batch(a.limit)
            if nxt == 'q':
                return
            if nxt == 'n':
                break


if __name__ == '__main__':
    main()
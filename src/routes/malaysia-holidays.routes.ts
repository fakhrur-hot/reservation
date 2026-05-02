/**
 * Malaysia Holidays Proxy
 *
 * Scrapes officeholidays.com (the data source used by afiqiqmal/MalaysiaHoliday)
 * and returns normalised holiday data in Nager.Date-compatible format.
 *
 * Endpoints:
 *   GET /api/admin/v1/holidays/MY?year=2026&state=MY-14
 *
 * - Without state: returns only nationwide (country-class) rows from the national page.
 * - With state code: additionally fetches the state page and appends state-specific rows.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../config/logger.js';

// ─── State code → officeholidays.com URL slug ─────────────────────────────────

const STATE_SLUGS: Record<string, string> = {
  'MY-01': 'johor',
  'MY-02': 'kedah',
  'MY-03': 'kelantan',
  'MY-04': 'malacca',
  'MY-05': 'negeri-sembilan',
  'MY-06': 'pahang',
  'MY-07': 'pulau-pinang',
  'MY-08': 'perak',
  'MY-09': 'perlis',
  'MY-10': 'selangor',
  'MY-11': 'terengganu',
  'MY-12': 'sabah',
  'MY-13': 'sarawak',
  'MY-14': 'kuala-lumpur',
  'MY-15': 'labuan',
  'MY-16': 'putrajaya',
};

// ─── Returned holiday shape (Nager.Date-compatible) ───────────────────────────

interface HolidayResult {
  date: string;
  name: string;
  localName: string;
  global: boolean;
  counties: string[] | null;
  types: string[];
}

// ─── Simple in-memory cache (data changes at most once a year) ───────────────

interface CacheEntry { data: HolidayResult[]; expires: number; }
const cache = new Map<string, CacheEntry>();

function cacheGet(key: string): HolidayResult[] | null {
  const e = cache.get(key);
  if (!e || Date.now() > e.expires) { cache.delete(key); return null; }
  return e.data;
}
function cacheSet(key: string, data: HolidayResult[]) {
  cache.set(key, { data, expires: Date.now() + 24 * 60 * 60 * 1000 });
}

// ─── HTML helpers ─────────────────────────────────────────────────────────────

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface RawRow { date: string; name: string; isNational: boolean; }

/**
 * Parse holiday rows from the officeholidays.com HTML.
 * Uses the .country-table CSS class, <time datetime="YYYY-MM-DD">, and 3rd <td>.
 */
function parseRows(html: string): RawRow[] {
  const rows: RawRow[] = [];

  // Find the first <table class="country-table"> block
  const tableStart = html.indexOf('<table class="country-table">');
  if (tableStart === -1) return rows;
  const tableEnd = html.indexOf('</table>', tableStart);
  if (tableEnd === -1) return rows;
  const tableHtml = html.slice(tableStart, tableEnd + 8);

  // Match each <tr class="..."> row
  const trRe = /<tr[^>]+class="([^"]*)"[^>]*>([\s\S]*?)<\/tr>/gi;
  let trM: RegExpExecArray | null;

  while ((trM = trRe.exec(tableHtml)) !== null) {
    const cls = trM[1];
    const content = trM[2];

    const isNational = /\bcountry\b/.test(cls);
    const isRegion   = /\bregion\b/.test(cls);
    if (!isNational && !isRegion) continue;

    // Date: <time itemprop="startDate" datetime="YYYY-MM-DD">
    const dateM = content.match(/datetime="(\d{4}-\d{2}-\d{2})"/);
    if (!dateM) continue;

    // Name: 3rd <td> (index 2), strip all inner HTML
    const tds = [...content.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
    if (tds.length < 3) continue;
    const name = decodeHtml(tds[2][1].replace(/<[^>]+>/g, ''));
    if (!name) continue;

    rows.push({ date: dateM[1], name, isNational });
  }

  return rows;
}

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; SejiwaBot/1.0)',
      'Accept': 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`officeholidays.com returned HTTP ${res.status}`);
  return res.text();
}

// ─── Route ────────────────────────────────────────────────────────────────────

interface MYQuery { year?: string; state?: string; }

export async function malaysiaHolidaysRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: MYQuery }>(
    '/api/admin/v1/holidays/MY',
    async (request: FastifyRequest<{ Querystring: MYQuery }>, reply: FastifyReply) => {
      const year = parseInt(request.query.year ?? String(new Date().getFullYear()), 10);
      if (isNaN(year) || year < 2020 || year > 2035) {
        return reply.status(400).send({ error: 'Invalid year (2020–2035)' });
      }

      const stateCode = (request.query.state ?? '').trim() || null;
      const cacheKey = `MY:${year}:${stateCode ?? 'national'}`;

      const cached = cacheGet(cacheKey);
      if (cached) {
        return reply.send({ holidays: cached, year, stateCode, source: 'cache' });
      }

      try {
        // Step 1 — fetch national page, collect "country" rows (truly nationwide)
        const nationalHtml = await fetchPage(
          `https://www.officeholidays.com/countries/malaysia/${year}`
        );
        const nationalRows = parseRows(nationalHtml);

        const result: HolidayResult[] = [];
        const nationwideDates = new Set<string>();

        for (const r of nationalRows) {
          if (r.isNational && !nationwideDates.has(r.date)) {
            nationwideDates.add(r.date);
            result.push({
              date: r.date,
              name: r.name,
              localName: r.name,
              global: true,
              counties: null,
              types: ['Public'],
            });
          }
        }

        // Step 2 — if state requested, fetch state page for state-specific additions
        if (stateCode && STATE_SLUGS[stateCode]) {
          const slug = STATE_SLUGS[stateCode];
          const stateHtml = await fetchPage(
            `https://www.officeholidays.com/countries/malaysia/${slug}/${year}`
          );
          const stateRows = parseRows(stateHtml);

          const seen = new Set(result.map(h => h.date));
          for (const r of stateRows) {
            if (!seen.has(r.date)) {
              seen.add(r.date);
              result.push({
                date: r.date,
                name: r.name,
                localName: r.name,
                global: false,
                counties: [stateCode],
                types: ['Public'],
              });
            }
          }
        }

        result.sort((a, b) => a.date.localeCompare(b.date));
        cacheSet(cacheKey, result);

        logger.info(
          { year, stateCode, count: result.length },
          'Malaysia holidays fetched from officeholidays.com'
        );

        return reply.send({ holidays: result, year, stateCode, source: 'live' });
      } catch (err: any) {
        logger.error({ err, year, stateCode }, 'Failed to fetch Malaysia holidays');
        return reply.status(502).send({ error: err.message || 'Failed to fetch Malaysia holidays' });
      }
    }
  );
}

/**
 * Seasons & Stars - Athas utilities
 *
 * Provides King's Age calculations and year-name lookup for the Dark Sun calendar
 * loaded via Seasons & Stars. Does not modify dsr-calendar; only references it for logic parity.
 */

/* global Hooks, game, fetch */

(() => {
  // Make a global container early so console access before 'ready' doesn't throw
  if (typeof window !== 'undefined') {
    window.SSAthas = window.SSAthas || {};
  }
  /**
   * Return a mathematically safe modulo result (always non-negative).
   * @param {number} value - The dividend
   * @param {number} modulus - The divisor (cycle length)
   * @returns {number} The positive remainder in [0, modulus)
   */
  const safeMod = (value, modulus) => ((value % modulus) + modulus) % modulus;

  // No anchors needed: King's Ages repeat every 77 years starting at Year 1.

  /**
   * Get the active S&S calendar object if available.
   * @returns {any|null}
   */
  function getActiveCalendar() {
    return game.seasonsStars?.manager?.getActiveCalendar?.() || null;
  }

  /**
   * Resolve the current year from S&S if no explicit year is provided.
   * @returns {number|null}
   */
  function getCurrentYearFromSS() {
    try {
      const date = game.seasonsStars?.manager?.timeConverter?.getCurrentDate?.();
      return typeof date?.year === 'number' ? date.year : null;
    } catch (_e) {
      return null;
    }
  }

  /**
   * Attempt to read the named-year list from the active calendar; if unavailable,
   * fall back to fetching this module's calendar JSON.
   * @returns {Promise<string[]>}
   */
  
    
//Cycle names
const endlean = [
  "Ral",
  "Friend",
  "Desert",
  "Priest",
  "Wind",
  "Dragon",
  "Mountain",
  "King",
  "Silt",
  "Enemy",
  "Guthay"
];

// Cycle 2: 7 names
const seofean = [
  "Fury",
  "Contemplation",
  "Vengeance",
  "Slumber",
  "Defiance",
  "Reverence",
  "Agitation"
];

// Function to compute King's Age, year-in-age, and year name (single API)
function getYearInfo(year) {
  const y = typeof year === 'number' ? year : getCurrentYearFromSS();
  if (typeof y !== 'number') return null;

  // Align so 14656 -> KA 190, Year 27
  const kingsAge = Math.floor((y - 1) / 77) + 1;
  const yearInAge = ((y - 1) % 77) + 1;

  const endleanIndex = (yearInAge - 1) % endlean.length;
  const seofeanIndex = (yearInAge - 1) % seofean.length;
  const yearName = endlean[endleanIndex] + "’s " + seofean[seofeanIndex];

  return {
    year: y,                           // absolute year (1-based)
    kingsAge,                          // 1..∞
    yearInAge,                         // 1..77
    yearName,
  };
}

  // ===== Moon utilities =====
  function buildCalendarMeta(calendar) {
    const months = Array.isArray(calendar?.months) ? calendar.months : [];
    const intercalary = Array.isArray(calendar?.intercalary) ? calendar.intercalary : [];
    const monthStarts = [];
    let running = 0;
    for (let i = 0; i < months.length; i++) {
      monthStarts[i] = running;
      running += (months[i]?.days || 0);
      const afterName = months[i]?.name;
      for (const ic of intercalary) {
        if (ic?.after === afterName) running += (ic?.days || 0);
      }
    }
    const daysPerYear = running;
    return { months, intercalary, monthStarts, daysPerYear };
  }

  function getDayOfYear(calendar, year, monthIndex, day) {
    const meta = buildCalendarMeta(calendar);
    return (meta.monthStarts[monthIndex] || 0) + (day - 1) + 1; // 1-based DOY
  }

  function toAbsoluteDay(calendar, date) {
    const meta = buildCalendarMeta(calendar);
    const doy = getDayOfYear(calendar, date.year, date.month, date.day);
    return (date.year - 1) * meta.daysPerYear + (doy - 1);
  }

  function fromAbsoluteDay(calendar, abs) {
    const meta = buildCalendarMeta(calendar);
    const year = Math.floor(abs / meta.daysPerYear) + 1;
    let doy0 = abs % meta.daysPerYear; // 0-based
    let month = 0;
    for (let i = meta.monthStarts.length - 1; i >= 0; i--) {
      if (doy0 >= meta.monthStarts[i]) { month = i; break; }
    }
    const day = (doy0 - meta.monthStarts[month]) + 1;
    return { year, month, day };
  }

  function computeMoonPhase(calendar, date, moon) {
    if (!moon) return null;
    const cycle = Number(moon.cycleLength) || 0;
    if (cycle <= 0) return null;
    const ref = moon.firstNewMoon;
    const refAbs = toAbsoluteDay(calendar, { year: ref.year, month: (ref.month - 1), day: ref.day });
    const abs = toAbsoluteDay(calendar, date);
    const age = safeMod(abs - refAbs, cycle); // 0..cycle-1 (or fractional-friendly integer)
    const phases = Array.isArray(moon.phases) ? moon.phases : [];
    let accum = 0;
    let phaseIndex = 0;
    let segmentStart = 0;
    for (let i = 0; i < phases.length; i++) {
      const segLen = Number(phases[i]?.length) || 0;
      if (age < accum + segLen) { phaseIndex = i; segmentStart = accum; break; }
      accum += segLen;
    }
    const phase = phases[phaseIndex] || null;
    const posInSegment = age - segmentStart;
    function daysUntilPhase(targetLower) {
      if (!phases.length) return null;
      let d = 0;
      let idx = phaseIndex;
      let pos = posInSegment;
      for (let step = 0; step <= cycle + phases.length; step++) {
        const name = (phases[idx]?.name || '').toLowerCase();
        const len = Number(phases[idx]?.length) || 0;
        if (name === targetLower) return d + (len - pos);
        d += (len - pos);
        pos = 0;
        idx = (idx + 1) % phases.length;
      }
      return null;
    }
    return {
      name: moon.name,
      cycleLength: cycle,
      age,
      phaseName: phase?.name || null,
      phaseIndex,
      daysUntilNew: daysUntilPhase('new moon'),
      daysUntilFull: daysUntilPhase('full moon'),
    };
  }

  function getMoonPhasesForDate(date) {
    const calendar = getActiveCalendar();
    if (!calendar) return [];
    const moons = Array.isArray(calendar.moons) ? calendar.moons : [];
    return moons.map(m => computeMoonPhase(calendar, date, m)).filter(Boolean);
  }

  function parseYMD(arg) {
    const m = String(arg || '').match(/^(\d{1,6})-(\d{1,2})-(\d{1,2})$/);
    if (!m) return null;
    const year = Number(m[1]);
    const month = Number(m[2]) - 1;
    const day = Number(m[3]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    return { year, month, day };
  }

  function formatDate(calendar, date) {
    // Avoid relying on inner-scoped helpers; resolve month name directly here
    const monthName = (function () {
      try { return calendar?.months?.[date.month]?.name || `Month ${date.month + 1}`; } catch { return `Month ${Number(date?.month ?? 0) + 1}`; }
    })();
    return `${monthName} ${date.day}, ${date.year}`;
  }

  function makeDate0(date) {
    // Normalize possibly 1-based month to 0-based for internal calculations
    return {
      year: Number(date.year),
      month: Math.max(0, (Number(date.month ?? 1) - 1)),
      day: Number(date.day ?? 1),
      weekday: date.weekday,
      time: date.time,
    };
  }

  function getWeekdayName(calendar, date) {
    try {
      const weekdays = calendar?.weekdays || [];
      const direct = date.weekday ?? date.weekdayIndex ?? date.dayOfWeek;
      if (typeof direct === 'number' && weekdays[direct]?.name) return weekdays[direct].name;
      const months = Array.isArray(calendar?.months) ? calendar.months : [];
      const startDay = Number(calendar?.year?.startDay) || 0;
      let progress = 0;
      for (let i = 0; i < Math.max(0, (date.month ?? 1) - 1); i++) progress += (months[i]?.days || 0);
      progress += ((date.day || 1) - 1);
      const idx = safeMod(startDay + progress, weekdays.length || 7);
      return weekdays[idx]?.name || `Day ${idx + 1}`;
    } catch (_e) {
      return null;
    }
  }
  

    

  /**
   * Initialize offsets and register API once Foundry and S&S are ready.
   */
  Hooks.once('ready', async () => {
    // Ensure a global exists for early/console access
    if (typeof window !== 'undefined') {
      window.SSAthas = window.SSAthas || {};
    }
    // --- Conjunction/Eclipse scanners ---
    function degDiff(a, b) {
      const norm = (x) => ((x % 360) + 360) % 360;
      let d = Math.abs(norm(a) - norm(b));
      if (d > 180) d = 360 - d;
      return d;
    }
    function scanConjunctionsRange(fromDate, toDate, tolDeg = 5) {
      try {
        const cal = getActiveCalendarSafe();
        if (!cal) return [];
        const f0 = makeDate0(fromDate);
        const t0 = makeDate0(toDate);
        let a = toAbsoluteDay(cal, f0);
        let b = toAbsoluteDay(cal, t0);
        if (b < a) { const tmp = a; a = b; b = tmp; }
        const results = [];
        for (let abs = a; abs <= b; abs++) {
          const d = fromAbsoluteDay(cal, abs);
          const phases = getAthasMoonPhases({ year: d.year, month: d.month + 1, day: d.day });
          if (!Array.isArray(phases) || phases.length < 2) continue;
          const r = phases.find(p => (p.name||'') === 'Ral') || phases[0];
          const g = phases.find(p => (p.name||'') === 'Guthay') || phases[1];
          const fr = (Number(r.age)||0) / (Number(r.cycleLength)||1);
          const fg = (Number(g.age)||0) / (Number(g.cycleLength)||1);
          const delta = degDiff(360 * fr, 360 * fg);
          if (delta <= tolDeg) {
            const visible = (fr > 0.25 && fr < 0.75) || (fg > 0.25 && fg < 0.75);
            results.push({ date: { year: d.year, month: d.month + 1, day: d.day }, sepDeg: delta, visible, phases });
          }
        }
        return results;
      } catch (_e) { return []; }
    }
    function scanEclipsesRange(fromDate, toDate) {
      try {
        const cal = getActiveCalendarSafe();
        if (!cal) return [];
        const f0 = makeDate0(fromDate);
        const t0 = makeDate0(toDate);
        let a = toAbsoluteDay(cal, f0);
        let b = toAbsoluteDay(cal, t0);
        if (b < a) { const tmp = a; a = b; b = tmp; }
        const out = [];
        for (let abs = a; abs <= b; abs++) {
          const d = fromAbsoluteDay(cal, abs);
          const phases = getAthasMoonPhases({ year: d.year, month: d.month + 1, day: d.day });
          if (!Array.isArray(phases) || phases.length < 2) continue;
          const bothNew = phases.every(p => (p.phaseName||'').toLowerCase() === 'new moon');
          const bothFull = phases.every(p => (p.phaseName||'').toLowerCase() === 'full moon');
          if (bothNew || bothFull) out.push({ date: { year: d.year, month: d.month + 1, day: d.day }, type: bothFull ? 'Brightest' : 'Darkest', phases });
        }
        return out;
      } catch (_e) { return []; }
    }
    function findLandmark(fromDate, type, direction, maxYears = 12) {
      try {
        const cal = getActiveCalendarSafe(); if (!cal) return null;
        const start = makeDate0(fromDate); const startAbs = toAbsoluteDay(cal, start);
        const meta = buildCalendarMeta(cal); const step = direction === 'prev' ? -1 : 1; const maxScan = Math.max(1, Math.floor(meta.daysPerYear * maxYears));
        for (let i = 0; i <= maxScan; i++) {
          const abs = startAbs + i * step; const d = fromAbsoluteDay(cal, abs);
          const phases = getAthasMoonPhases({ year: d.year, month: d.month + 1, day: d.day }); if (!Array.isArray(phases) || phases.length < 2) continue;
          const bothNew = phases.every(p => (p.phaseName||'').toLowerCase() === 'new moon'); const bothFull = phases.every(p => (p.phaseName||'').toLowerCase() === 'full moon');
          if ((type === 'Brightest' && bothFull) || (type === 'Darkest' && bothNew)) return { date: { year: d.year, month: d.month + 1, day: d.day }, type };
        }
      } catch (_e) {}
      return null;
    }

    const api = {
      /**
       * Get King's Age info for a given year (or current S&S year if omitted).
       * @param {number} [year]
       * @returns {{year:number,kingsAge:number,yearInAge:number,yearName:string}|null}
       */
      getYearInfo,
      /** Get moon phases. If no valid date is provided, use the current date. */
      getMoonPhases: (date) => {
        try {
          const hasValidYear = Number.isFinite(Number(date?.year));
          const src = hasValidYear ? date : getCurrentDateSafe();
          if (!src) return [];
          const d0 = makeDate0(src);
          return getAthasMoonPhases({ year: d0.year, month: d0.month + 1, day: d0.day });
        } catch (_e) {
          return [];
        }
      },
      getConjunctions: (fromDate, toDate) => { try { return scanConjunctionsRange(fromDate, toDate) || []; } catch { return []; } },
      getEclipses: (fromDate, toDate) => { try { return scanEclipsesRange(fromDate, toDate) || []; } catch { return []; } },
      // If any argument is provided, assume current date as the starting point
      getNextBrightest: (fromDate) => {
        try {
          const hasValidYear = Number.isFinite(Number(fromDate?.year));
          const src = hasValidYear ? fromDate : getCurrentDateSafe();
          if (!src) return null;
          return findLandmark(src, 'Brightest', 'next');
        } catch (_e) { return null; }
      },
      getNextDarkest: (fromDate) => {
        try {
          const hasValidYear = Number.isFinite(Number(fromDate?.year));
          const src = hasValidYear ? fromDate : getCurrentDateSafe();
          if (!src) return null;
          return findLandmark(src, 'Darkest', 'next');
        } catch (_e) { return null; }
      },
    };

    // Expose API via module registry and global for macro usage
    try {
      const mod = game.modules.get('seasons-and-stars-athas');
      if (mod) mod.api = api;
    } catch (_e) {
      // ignore
    }
    // Also provide a global for easy console/macro access
    window.SSAthas = api;

    // Register Handlebars helpers for dateFormats integration
    try {
      // {{ss-ka part="ka"|"year"}} or default returns "KA.Year"
      Handlebars.registerHelper('ss-ka', function (...args) {
        const options = args[args.length - 1];
        const part = options?.hash?.part;
        const year = options?.hash?.year ?? options?.data?.root?.year;
        const info = window.SSAthas?.getYearInfo(year);
        if (!info) return '';
        if (part === 'ka') return info.kingsAge;
        if (part === 'year') return info.yearInAge;
        return `${info.kingsAge}.${info.yearInAge}`;
      });
      // {{ss-yearName}} or {{ss-yearName year=14656}}
      Handlebars.registerHelper('ss-yearName', function (...args) {
        const options = args[args.length - 1];
        const year = options?.hash?.year ?? options?.data?.root?.year;
        const info = window.SSAthas?.getYearInfo(year);
        return info?.yearName || '';
      });
      // 12-hour clock and AM/PM helpers
      Handlebars.registerHelper('ss-hour12', function (...args) {
        const options = args[args.length - 1];
        let hour = args.length > 1 && args[0] !== undefined && args[0] !== null
          ? Number(args[0])
          : Number(options?.data?.root?.hour);
        if (!Number.isFinite(hour)) hour = 0;
        let h12 = ((hour % 12) + 12) % 12;
        if (h12 === 0) h12 = 12;
        const pad = options?.hash?.pad === true;
        return pad ? String(h12).padStart(2, '0') : h12;
      });
      Handlebars.registerHelper('ss-amPm', function (...args) {
        const options = args[args.length - 1];
        let hour = args.length > 1 && args[0] !== undefined && args[0] !== null
          ? Number(args[0])
          : Number(options?.data?.root?.hour);
        if (!Number.isFinite(hour)) hour = 0;
        return hour >= 12 ? 'PM' : 'AM';
      });
    } catch (_e) {
      // ignore
    }

    // Use Chat Commander if available
    function getCurrentDateSafe() {
      try { return game.seasonsStars?.manager?.timeConverter?.getCurrentDate?.() || null; } catch { return null; }
    }
    function getActiveCalendarSafe() {
      try { return game.seasonsStars?.manager?.getActiveCalendar?.() || null; } catch { return null; }
    }
    function getMonthName(calendar, monthIndex) {
      try { return calendar?.months?.[monthIndex]?.name || `Month ${monthIndex + 1}`; } catch { return `Month ${monthIndex + 1}`; }
    }
    function getSeasonName(calendar, monthIndex) {
      try {
        const seasons = calendar?.seasons || []; const m1 = monthIndex + 1;
        for (const s of seasons) { if (s.startMonth <= s.endMonth ? (m1 >= s.startMonth && m1 <= s.endMonth) : (m1 >= s.startMonth || m1 <= s.endMonth)) return s.name; }
      } catch {}
      return null;
    }

    function getZodiacSign(calendar, monthIndex) {
      try {
        const zodiac = calendar?.zodiac;
        if (Array.isArray(zodiac) && zodiac.length) return zodiac[monthIndex] || null;
      } catch {}
      return null;
    }

    // Determine the named time period for a given hour using calendar canonical hours or fallback mapping
    function getTimePeriodName(calendar, hour, minute = 0) {
      try {
        const blocks = Array.isArray(calendar?.canonicalHours) ? calendar.canonicalHours : null;
        if (blocks && blocks.length) {
          const h = Number(hour) + (Number(minute) / 60);
          for (const b of blocks) {
            const start = Number(b?.startHour) || 0;
            const end = Number(b?.endHour);
            if (!Number.isFinite(end)) continue;
            if (h >= start && h < end) return String(b?.name || '');
            // Handle end at 24 or wrap edge inclusively
            if (end >= 24 && h >= start && h < 24) return String(b?.name || '');
          }
        }
      } catch {}
      // Fallback by hour of day
      const h = Number(hour) || 0;
      if (h >= 0 && h < 3) return '2nd Watch';
      if (h >= 3 && h < 6) return '3rd Watch';
      if (h >= 7 && h < 10  ) return 'Morning';
      if (h >= 10 && h < 17) return 'Midday';
      if (h >= 17 && h < 21) return 'Evening';
      return '1st Watch';
    }


    // Determine if the given date is a solstice or equinox
    function getSolarEventName(calendar, date) {
      try {
        const idx = Math.max(0, (date?.month ?? 1) - 1);
        const name = String(calendar?.months?.[idx]?.name || '').toLowerCase();
        const day = Number(date?.day) || 1;
        if (name === 'scorch' && day === 1) return 'High Sun (Summer Solstice)';
        if (name === 'bloom' && day === 3) return 'Low Sun (Winter Solstice)';
        if (name === 'wind' && day === 2) return 'Descending Equinox';
        if (name === 'gather' && day === 4) return 'Ascending Equinox';
      } catch (_e) {}
      return null;
    }

    // Determine eclipse (both moons New = Darkest, both Full = Brightest) for a given date
    function getEclipseInfo(date) {
      try {
        const phases = getAthasMoonPhases({ year: Number(date?.year), month: Number(date?.month ?? 1), day: Number(date?.day ?? 1) }) || [];
        if (!Array.isArray(phases) || phases.length < 2) return null;
        const bothNew = phases.every(p => String(p?.phaseName || '').toLowerCase() === 'new moon');
        const bothFull = phases.every(p => String(p?.phaseName || '').toLowerCase() === 'full moon');
        if (bothNew) return { type: 'Darkest (both New)' };
        if (bothFull) return { type: 'Brightest (both Full)' };
        return null;
      } catch (_e) { return null; }
    }

    // Determine conjunction on a given date using phase angle separation
    function getConjunctionInfo(date, tolDeg = 5) {
      try {
        const phases = getAthasMoonPhases({ year: Number(date?.year), month: Number(date?.month ?? 1), day: Number(date?.day ?? 1) }) || [];
        if (!Array.isArray(phases) || phases.length < 2) return null;
        const r = phases.find(p => (p.name||'') === 'Ral') || phases[0];
        const g = phases.find(p => (p.name||'') === 'Guthay') || phases[1];
        const fr = (Number(r.age)||0) / Math.max(1, Number(r.cycleLength)||1);
        const fg = (Number(g.age)||0) / Math.max(1, Number(g.cycleLength)||1);
        const norm = (x) => ((x % 360) + 360) % 360;
        let d = Math.abs(norm(360*fr) - norm(360*fg)); if (d > 180) d = 360 - d;
        if (d <= Number(tolDeg)) {
          const visible = (fr > 0.25 && fr < 0.75) || (fg > 0.25 && fg < 0.75);
          return { sepDeg: d, visible };
        }
        return null;
      } catch (_e) { return null; }
    }

    // Approximate moon rise/set hours by phase name (heuristic mapping)
    function getApproxRiseSetByPhase(phaseName) {
      const p = String(phaseName || '').toLowerCase();
      // hours in 24h local time
      if (p === 'new moon') return { rise: 6, set: 18 };
      if (p === 'waxing crescent') return { rise: 9, set: 21 };
      if (p === 'first quarter') return { rise: 12, set: 24 };
      if (p === 'waxing gibbous') return { rise: 15, set: 3 };
      if (p === 'full moon') return { rise: 18, set: 6 };
      if (p === 'waning gibbous') return { rise: 21, set: 9 };
      if (p === 'last quarter') return { rise: 24, set: 12 };
      if (p === 'waning crescent') return { rise: 3, set: 15 };
      return { rise: 0, set: 12 };
    }

    function formatHour12(h) {
      let hour = Number(h) || 0; hour = ((hour % 24) + 24) % 24;
      const ampm = hour >= 12 ? 'PM' : 'AM';
      let h12 = hour % 12; if (h12 === 0) h12 = 12;
      return `${String(h12).padStart(2, '0')}:00 ${ampm}`;
    }

    // Build combined background style using placeholder images with an overlay gradient
    function getBackgroundStyleForPeriod(periodName) {
      const p = String(periodName || '').toLowerCase();
      let slug = 'noon';
      if (p.includes('2nd watch')) slug = '2nd-watch';
      else if (p.includes('3rd watch')) slug = '3rd-watch';
      else if (p.includes('morning')) slug = 'morning';
      else if (p.includes('noon')) slug = 'noon';
      else if (p.includes('evening')) slug = 'evening';
      else if (p.includes('1st watch')) slug = '1st-watch';


      const url = `url('modules/seasons-and-stars-athas/assets/backgrounds/${slug}.svg')`;
      return `background: ${url}; background-size: cover; background-position: center; background-repeat: no-repeat;`;
    }

    // Local fallback formatters (used if S&S named formats are unavailable)
    function formatAthasDateLocal(calendar, plainDate) {
      if (!calendar || !plainDate) return '';
      const monthIdx0 = Math.max(0, (plainDate.month ?? 1) - 1);
      const monthName = calendar?.months?.[monthIdx0]?.name || `Month ${monthIdx0 + 1}`;
      const weekdayName = getWeekdayName(calendar, { year: plainDate.year, month: plainDate.month, day: plainDate.day, weekday: plainDate.weekday });
      const info = api.getYearInfo(plainDate.year);
      const kaStr = info ? `${info.kingsAge}.${info.yearInAge}` : '';
      const yearNameStr = info?.yearName || '';
      const head = `${weekdayName ? `${weekdayName}, ` : ''}${monthName} ${plainDate.day}`;
      return `${head} KA ${kaStr}${yearNameStr ? ` (Year of ${yearNameStr})` : ''}`;
    }

    function formatAthasTimeLocal(plainDate) {
      const hour = Number(plainDate?.time?.hour ?? plainDate?.hour);
      const minute = Number(plainDate?.time?.minute ?? plainDate?.minute);
      if (!Number.isFinite(hour) || !Number.isFinite(minute)) return '';
      let h12 = ((hour % 12) + 12) % 12; if (h12 === 0) h12 = 12;
      const ampm = hour >= 12 ? 'PM' : 'AM';
      return `${String(h12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${ampm}`;
    }

    function registerAthasChatCommands(commands) {
      const moduleId = 'seasons-and-stars-athas';
      // Removed: /kings-age (/ka) and /year (redundant; handled by /day)

      commands.register({
        module: moduleId,
        name: '/day',
        aliases: ['/ds-day'],
        description: 'Show current date with King\'s Age, moons, zodiac (Athas)',
        callback: () => {
try {
  const plain = getCurrentDateSafe();
  const cal = getActiveCalendarSafe();
  if (!plain || !cal) return { content: '<p>Active calendar/date not available.</p>' };

  const info = api.getYearInfo(plain.year);
  const monthIdx0 = Math.max(0, (plain.month ?? 1) - 1);
  const monthName = cal?.months?.[monthIdx0]?.name || `Month ${monthIdx0 + 1}`;
  const seasonName = getSeasonName(cal, monthIdx0);
  const zodiac = getZodiacSign(cal, monthIdx0);
  const weekdayName = getWeekdayName(cal, { year: plain.year, month: plain.month, day: plain.day, weekday: plain.weekday });

    
  // Use S&S CalendarDate for JSON format resolution if available; otherwise fallback
const calDate = game.seasonsStars?.manager?.getCurrentDate?.();
let formattedHeader = '';
let timeText = '';
if (calDate?.formatter?.formatNamed) {
  formattedHeader = calDate.formatter.formatNamed(calDate, 'athas-date');
  timeText = calDate.formatter.formatNamed(calDate, 'mixed');
} else {
  formattedHeader = formatAthasDateLocal(cal, plain);
  timeText = formatAthasTimeLocal(plain);
}
    const timeText2 = (calDate?.formatter?.formatNamed)
      ? calDate.formatter.formatNamed(calDate, 'athas-time-12h')
      : formatAthasTimeLocal(plain)

    // Compute gradient background for current period
    const curHour = Number(plain?.time?.hour ?? calDate?.time?.hour ?? 0);
    const curMin = Number(plain?.time?.minute ?? calDate?.time?.minute ?? 0);
    const periodName = getTimePeriodName(cal, curHour, curMin);
    const backgroundCss = getBackgroundStyleForPeriod(periodName);
    const isLightPeriod = /morning|noon|evening/i.test(periodName || '');
    const textColor = isLightPeriod ? '#1e140b' : '#f0e0c8';
    const minorTitleColor = isLightPeriod ? '#7a3b0c' : '#dea76a';
    const textShadow = isLightPeriod ? 'none' : '0 1px 2px rgba(0,0,0,.8)';
    const containerStyle = `border:1px solid #7a3b0c;${backgroundCss}color:${textColor};text-shadow:${textShadow};padding:10px 12px;border-radius:6px;box-shadow:0 0 10px rgba(122,59,12,.45);`;

  const showMoons = /\b(1st|2nd|3rd)\s+Watch\b/i.test(String(periodName || ''));
  function phaseSvg(phase) {
    const age = Number(phase?.age)||0; const cyc = Math.max(1, Number(phase?.cycleLength)||1);
    const frac = Math.max(0, Math.min(1, age / cyc));
    const color = (phase?.name||phase?.moon||'')==='Ral' ? '#8de715' : '#e7dd15';
    // Shift the lit circle horizontally based on phase fraction (0=new → +6, 0.5=full → 0, 1=new → -6)
    const shift = (0.5 - frac) * 12; // range ~[-6, +6]
    const svg = `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
      <defs><clipPath id="cut"><circle cx="14" cy="14" r="12"/></clipPath></defs>
      <circle cx="14" cy="14" r="12" fill="rgba(0,0,0,0.65)"/>
      <g clip-path="url(#cut)">
        <rect x="0" y="0" width="28" height="28" fill="transparent"/>
        <circle cx="${14 + shift}" cy="14" r="12" fill="${color}"/>
      </g>
      <circle cx="14" cy="14" r="12" stroke="${color}" stroke-width="1" fill="none"/>
    </svg>`;
    const uri = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
    return `<img src="${uri}" width="28" height="28" style="vertical-align:middle"/>`;
  }
  let headerBadge = '';
  let moonHtml = '';
  if (showMoons) {
    const moonPhases = getAthasMoonPhases({ year: plain.year, month: (plain.month ?? 1), day: plain.day });
    if (Array.isArray(moonPhases) && moonPhases.length) {
    // Ensure order: Ral then Guthay
    const sorted = [...moonPhases].sort((a,b)=>String(a.name).localeCompare(String(b.name)));
    // Build top-right moon badges (no labels); Ral smaller than Guthay
    const badges = sorted.map(m => {
      const size = m.name==='Ral' ? 22 : 32;
      const svg = (function(){
        const age = Number(m?.age)||0; const cyc = Math.max(1, Number(m?.cycleLength)||1);
        const frac = Math.max(0, Math.min(1, age / cyc));
        const color = (m?.name||m?.moon||'')==='Ral' ? '#8de715' : '#e7dd15';
        const shift = (0.5 - frac) * 12;
        const s = `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
          <defs><clipPath id="cut"><circle cx="14" cy="14" r="12"/></clipPath></defs>
          <circle cx="14" cy="14" r="12" fill="rgba(0,0,0,0.65)"/>
          <g clip-path="url(#cut)"><rect x="0" y="0" width="28" height="28" fill="transparent"/>
            <circle cx="${14 + shift}" cy="14" r="12" fill="${color}"/>
          </g>
          <circle cx="14" cy="14" r="12" stroke="${color}" stroke-width="1" fill="none"/>
        </svg>`; return 'data:image/svg+xml;utf8,' + encodeURIComponent(s);
      })();
      return `<img src="${svg}" width="${size}" height="${size}" style="display:block"/>`;
    }).join('');
    const badgeWrap = ``;

    // Build concise lines under header per spec
    const lines = sorted.map(m => {
      const rs = getApproxRiseSetByPhase(m.phaseName);
      const rise = formatHour12(rs.rise); const set = formatHour12(rs.set);
      const illum = (m.illumination!=null) ? ` (${m.illumination}%)` : '';
      return `<div><span style=\"color:#d67f3a;\"><strong>${m.name}</strong></span>: ${m.phaseName}${illum} <i class=\"fas fa-arrow-up\" title=\"Moonrise\" aria-hidden=\"true\"></i>${rise} / ${set}<i class=\"fas fa-arrow-down\" title=\"Moonset\" aria-hidden=\"true\"></i></div>`;
    }).join('');
    moonHtml = `<div style="margin-top:-36px;padding-top:6px;display:flex;">${lines}</div>`;

    // Moon graphics disabled per request
      headerBadge = '';
    }
  }

    const html =
    `<div style="${containerStyle}">
      <div style="position:relative;">
        <div style="font-size:18px;font-weight:700;color:${textColor};margin:22px 0 6px;font-family:'Packard Antique Bold','Packard Antique','Times New Roman',serif;">${formattedHeader}</div>
        ${headerBadge}
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;line-height:1.2;font-size:13px;margin:12px 0px 48px 0px;">
        <div><span style="color:#d67f3a;"><strong>Time</strong></span>: ${timeText} (${timeText2})</div>
        <div><span style="color:#d67f3a;"><strong>Season</strong></span>: ${seasonName || '—'}</div>
        ${(() => { const s = getSolarEventName(cal, plain); return s ? `<div><span style=\"color:#d67f3a;\"><strong>Solar</strong></span>: ${s}</div>` : '' })()}
        ${(() => { const e = getEclipseInfo({year:plain.year,month:(plain.month??1),day:plain.day}); return e ? `<div><span style=\"color:#d67f3a;\"><strong>Eclipse</strong></span>: ${e.type}</div>` : '' })()}
        ${(() => { const c = getConjunctionInfo({year:plain.year,month:(plain.month??1),day:plain.day}); return c ? `<div><span style=\"color:#d67f3a;\"><strong>Conjunction</strong></span>: Δ${c.sepDeg.toFixed(1)}°${c.visible?' (visible)':''}</div>` : '' })()}
      </div>
      ${moonHtml}
    </div>`;

  const clean = String(html).replace(/\n\s*/g, '');
  return { content: clean };
} catch (e) {
  console.error('SS-Athas /day error:', e);
  return { content: `<p>Error rendering /day: ${e?.message || e}</p>` };
}
        }
      });

      // Removed: /time (redundant; handled by /day)

      commands.register({
        module: moduleId,
        name: '/moons',
        description: 'Show moon phases (optional date YYYY-M-D)',
        callback: (_chat, parameters) => {
          const cal = getActiveCalendarSafe();
          if (!cal) return { content: '<p>Active calendar not available.</p>' };
          const arg = parameters?.trim();
          const dateArg = arg ? parseYMD(arg) : null;
          const raw = dateArg || getCurrentDateSafe();
          if (!raw) return { content: '<p>No current date available.</p>' };
          const date0 = makeDate0(raw);
          const phases = getAthasMoonPhases({ year: date0.year, month: date0.month + 1, day: date0.day });
          if (!phases.length) return { content: '<p>No moon data available.</p>' };
          let html = `<p><strong>Moons — ${formatDate(cal, date0)}</strong></p>`;
          for (const p of phases) {
            const fullStr = p.daysUntilFull===0 ? ', next Full today' : (p.daysUntilFull!=null?`, next Full in ${p.daysUntilFull}d`:'');
            const newStr = p.daysUntilNew===0 ? ', next New today' : (p.daysUntilNew!=null?`, next New in ${p.daysUntilNew}d`:'');
            html += `<p><strong>${p.name}:</strong> ${p.phaseName || '—'} (age ${p.age}/${p.cycleLength})${fullStr}${newStr}</p>`;
          }
          return { content: html };
        }
      });

      // Day-of-year (/doy) and absolute-day (/abs)
      commands.register({
        module: moduleId,
        name: '/doy',
        description: 'Show day-of-year (optional date YYYY-M-D)',
        callback: (_chat, parameters) => {
          const cal = getActiveCalendarSafe();
          if (!cal) return { content: '<p>Active calendar not available.</p>' };
          const arg = parameters?.trim();
          const dateArg = arg ? parseYMD(arg) : null;
          const raw = dateArg || getCurrentDateSafe();
          if (!raw) return { content: '<p>No current date available.</p>' };
          const d0 = makeDate0(raw);
          const doy = getDayOfYear(cal, d0.year, d0.month, d0.day);
          return { content: `<p><strong>Day of Year:</strong> ${doy}</p>` };
        }
      });

      commands.register({
        module: moduleId,
        name: '/abs',
        description: 'Show absolute day (optional date YYYY-M-D)',
        callback: (_chat, parameters) => {
          const cal = getActiveCalendarSafe();
          if (!cal) return { content: '<p>Active calendar not available.</p>' };
          const arg = parameters?.trim();
          const dateArg = arg ? parseYMD(arg) : null;
          const raw = dateArg || getCurrentDateSafe();
          if (!raw) return { content: '<p>No current date available.</p>' };
          const d0 = makeDate0(raw);
          const abs = toAbsoluteDay(cal, d0);
          return { content: `<p><strong>Absolute Day:</strong> ${abs}</p>` };
        }
      });

      commands.register({
        module: moduleId,
        name: '/eclipse',
        description: 'Find next/previous eclipse window',
        callback: (_chat, parameters) => {
          const cal = getActiveCalendarSafe();
          if (!cal) return { content: '<p>Active calendar not available.</p>' };
          const dir = (parameters?.trim() || 'next').toLowerCase();
          const raw = getCurrentDateSafe();
          if (!raw) return { content: '<p>No current date available.</p>' };
          const date0 = makeDate0(raw);
          const meta = buildCalendarMeta(cal);
          let startAbs = toAbsoluteDay(cal, date0);
          const step = dir.startsWith('prev') ? -1 : 1;
          const maxScan = meta.daysPerYear * 10;
          let found = null;
          for (let i = 0; i < maxScan; i++) {
            const abs = startAbs + i * step;
            const d = fromAbsoluteDay(cal, abs);
            const phases = getMoonPhasesForDate(d);
            const isNewBoth = phases.length >= 2 && phases.every(m => (m?.phaseName || '').toLowerCase() === 'new moon');
            if (isNewBoth) { found = d; break; }
          }
          if (!found) return { content: '<p>No eclipse window found in scan range.</p>' };
          return { content: `<p><strong>Eclipse window:</strong> ${formatDate(cal, found)}</p>` };
        }
      });
    }

    // Register via Chat Commander hook
    Hooks.on('chatCommandsReady', (commands) => { try { registerAthasChatCommands(commands); } catch (e) { console.warn(e); } });
    // If already available, register immediately
    if (game.chatCommands?.register) { try { registerAthasChatCommands(game.chatCommands); } catch (e) { console.warn(e); } }
  });
})();


// Public helper: compute Athasian moon phases mathematically from cycle and first-new anchors
function getAthasMoonPhases(date) {
  try {
    const cal = game.seasonsStars?.manager?.getActiveCalendar?.();
    if (!cal) return [];
    const months = Array.isArray(cal?.months) ? cal.months : [];
    const inter = Array.isArray(cal?.intercalary) ? cal.intercalary : [];
    const starts = []; let run = 0;
    for (let i = 0; i < months.length; i++) {
      starts[i] = run; run += (months[i]?.days || 0);
      const after = months[i]?.name;
      for (const ic of inter) { if (ic?.after === after) run += (ic?.days || 0); }
    }
    const daysPerYear = run || 375;
    const toAbs = (d) => {
      const doy = (starts[d.month] || 0) + (d.day - 1) + 1;
      return (d.year - 1) * daysPerYear + (doy - 1);
    };
    // Resolve source date: prefer provided; if invalid, fall back to current S&S date
    let src = date;
    if (!Number.isFinite(Number(src?.year))) {
      try {
        const now = game.seasonsStars?.manager?.timeConverter?.getCurrentDate?.();
        if (now && Number.isFinite(Number(now.year))) {
          const month1 = Number.isFinite(Number(now.month)) ? Number(now.month) + 1 : 1;
          const day = Number.isFinite(Number(now.day)) ? Number(now.day) : 1;
          src = { year: Number(now.year), month: month1, day };
        }
      } catch (_e) {}
    }
    const date0 = {
      year: Number(src?.year),
      month: Math.max(0, Number(src?.month ?? 1) - 1),
      day: Number(src?.day ?? 1)
    };
    const abs = toAbs(date0);
    const moons = Array.isArray(cal.moons) ? cal.moons : [];
    const eps = 1e-3;
    const out = [];
    for (const m of moons) {
      const cycle = Number(m?.cycleLength) || 0; if (cycle <= 0) continue;
      const ref = m.firstNewMoon; if (!ref) continue;
      const refAbs = toAbs({ year: ref.year, month: (ref.month - 1), day: ref.day });
      const ageDays = ((abs - refAbs) % cycle + cycle) % cycle;
      const frac = ageDays / cycle;
      const illumination = Math.round(50 * (1 + Math.cos(2 * Math.PI * (frac - 0.5))));
      let phaseName = 'Waning Crescent';
      if (frac < 1/8) phaseName = 'New Moon';
      else if (frac < 1/4) phaseName = 'Waxing Crescent';
      else if (frac < 3/8) phaseName = 'First Quarter';
      else if (frac < 1/2) phaseName = 'Waxing Gibbous';
      else if (frac < 5/8) phaseName = 'Full Moon';
      else if (frac < 3/4) phaseName = 'Waning Gibbous';
      else if (frac < 7/8) phaseName = 'Last Quarter';
      const daysUntilFull = Math.abs(frac - 0.5) < eps ? 0 : Math.ceil(((frac < 0.5 ? 0.5 - frac : 1.5 - frac) * cycle));
      const daysUntilNew = (frac < eps || frac > 1 - eps) ? 0 : Math.ceil(((1 - frac) * cycle));
      out.push({
        name: m.name,
        cycleLength: cycle,
        age: ageDays,
        phaseName,
        illumination,
        daysUntilFull,
        daysUntilNew
      });
    }
    return out;
  } catch (_e) { return []; }
}

// Fallback: handle /moons and /eclipse even if Chat Commander is missing or not ready
Hooks.on('chatMessage', (_log, content, _chatData) => {
  try {
    const txt = String(content || '').trim();
    if (!txt.startsWith('/')) return;
    const [cmd, ...rest] = txt.split(/\s+/);
    const params = rest.join(' ').trim();

    // Local helpers mirrored from above
    function reply(html) { ChatMessage.create({ content: html }); }
    function safeCal() { try { return game.seasonsStars?.manager?.getActiveCalendar?.() || null; } catch { return null; } }
    function safeNow() { try { return game.seasonsStars?.manager?.timeConverter?.getCurrentDate?.() || null; } catch { return null; } }

    if (cmd === '/moons') {
      const cal = safeCal();
      if (!cal) { reply('<p>Active calendar not available.</p>'); return false; }
      const arg = params;
      const dateArg = arg ? (function(a){ const m=String(a||'').match(/^(\d{1,6})-(\d{1,2})-(\d{1,2})$/); if(!m) return null; const y=Number(m[1]); const mo=Number(m[2])-1; const d=Number(m[3]); return (Number.isFinite(y)&&Number.isFinite(mo)&&Number.isFinite(d))?{year:y,month:mo,day:d}:null; })(arg) : null;
      const raw = dateArg || safeNow();
      if (!raw) { reply('<p>No current date available.</p>'); return false; }
      const date0 = { year: Number(raw.year), month: Math.max(0,(Number(raw.month??1)-1)), day: Number(raw.day??1), weekday: raw.weekday, time: raw.time };
      const phases = getAthasMoonPhases({ year: date0.year, month: date0.month + 1, day: date0.day });
      if (!phases.length) { reply('<p>No moon data available.</p>'); return false; }
      let html = `<p><strong>Moons — ${cal?.months?.[date0.month]?.name||`Month ${date0.month+1}`} ${date0.day}, ${date0.year}</strong></p>`;
      for (const p of phases) { const fullStr = p.daysUntilFull===0 ? ', next Full today' : (p.daysUntilFull!=null?`, next Full in ${p.daysUntilFull}d`:''); const newStr = p.daysUntilNew===0 ? ', next New today' : (p.daysUntilNew!=null?`, next New in ${p.daysUntilNew}d`:''); html += `<p><strong>${p.name}:</strong> ${p.phaseName || '—'} (age ${p.age}/${p.cycleLength})${fullStr}${newStr}</p>`; }
      reply(html); return false;
    }

    if (cmd === '/doy') {
      const cal = safeCal(); if (!cal) { reply('<p>Active calendar not available.</p>'); return false; }
      const arg = params; const m=String(arg||'').match(/^(\d{1,6})-(\d{1,2})-(\d{1,2})$/); const dArg = m?{year:Number(m[1]),month:Number(m[2])-1,day:Number(m[3])}:null; const raw = dArg || safeNow(); if (!raw) { reply('<p>No current date available.</p>'); return false; }
      // compute DOY
      const months = Array.isArray(cal?.months)?cal.months:[]; const inter = Array.isArray(cal?.intercalary)?cal.intercalary:[]; const starts=[]; let run=0; for(let i=0;i<months.length;i++){ starts[i]=run; run+=(months[i]?.days||0); const after=months[i]?.name; for(const ic of inter){ if(ic?.after===after) run+=(ic?.days||0); } }
      const monthIdx = Math.max(0,(Number(raw.month??1)-1)); const doy = (starts[monthIdx]||0) + (Number(raw.day??1)-1) + 1;
      reply(`<p><strong>Day of Year:</strong> ${doy}</p>`); return false;
    }

    if (cmd === '/abs') {
      const cal = safeCal(); if (!cal) { reply('<p>Active calendar not available.</p>'); return false; }
      const arg = params; const m=String(arg||'').match(/^(\d{1,6})-(\d{1,2})-(\d{1,2})$/); const dArg = m?{year:Number(m[1]),month:Number(m[2])-1,day:Number(m[3])}:null; const raw = dArg || safeNow(); if (!raw) { reply('<p>No current date available.</p>'); return false; }
      const months = Array.isArray(cal?.months)?cal.months:[]; const inter = Array.isArray(cal?.intercalary)?cal.intercalary:[]; const starts=[]; let run=0; for(let i=0;i<months.length;i++){ starts[i]=run; run+=(months[i]?.days||0); const after=months[i]?.name; for(const ic of inter){ if(ic?.after===after) run+=(ic?.days||0); } }
      const daysPerYear = run || 375; const monthIdx = Math.max(0,(Number(raw.month??1)-1)); const doy = (starts[monthIdx]||0) + (Number(raw.day??1)-1) + 1; const abs = (Number(raw.year)-1)*daysPerYear + (doy-1);
      reply(`<p><strong>Absolute Day:</strong> ${abs}</p>`); return false;
    }

    if (cmd === '/eclipse') {
      const cal = safeCal();
      if (!cal) { reply('<p>Active calendar not available.</p>'); return false; }
      const dir = (params || 'next').toLowerCase();
      const raw = safeNow();
      if (!raw) { reply('<p>No current date available.</p>'); return false; }
      const date0 = { year: Number(raw.year), month: Math.max(0,(Number(raw.month??1)-1)), day: Number(raw.day??1) };
      const months = Array.isArray(cal?.months)?cal.months:[];
      const inter = Array.isArray(cal?.intercalary)?cal.intercalary:[];
      const starts=[]; let run=0; for(let i=0;i<months.length;i++){ starts[i]=run; run+=(months[i]?.days||0); const after=months[i]?.name; for(const ic of inter){ if(ic?.after===after) run+=(ic?.days||0); } }
      const daysPerYear = run;
      const toAbs = (d)=>{ const doy=(starts[d.month]||0)+(d.day-1)+1; return (d.year-1)*daysPerYear+(doy-1); };
      const fromAbs = (abs)=>{ const year=Math.floor(abs/daysPerYear)+1; let doy0=abs%daysPerYear; let m=0; for(let i=starts.length-1;i>=0;i--){ if(doy0>=starts[i]){ m=i; break; } } const day=(doy0-starts[m])+1; return {year,month:m,day}; };
      const startAbs = toAbs(date0);
      const step = dir.startsWith('prev') ? -1 : 1;
      const maxScan = daysPerYear * 10;
      let found = null;
      function phasesFor(d){ const mns=Array.isArray(cal.moons)?cal.moons:[]; function phaseName(m){ const cycle=Number(m?.cycleLength)||0; if(cycle<=0) return null; const ref=m.firstNewMoon; const refAbs=toAbs({year:ref.year,month:(ref.month-1),day:ref.day}); const age=((d-refAbs)%cycle+cycle)%cycle; const ph=m.phases||[]; let acc=0; for(const seg of ph){ const len=Number(seg?.length)||0; if(age<acc+len) return seg?.name||null; acc+=len; } return null; }
        return mns.map(m=>phaseName(m)); }
      for (let i=0;i<maxScan;i++){
        const abs = startAbs + i*step;
        const p = phasesFor(abs);
        const isNewBoth = p.length>=2 && p.every(n=>String(n||'').toLowerCase()==='new moon');
        if (isNewBoth){ found = fromAbs(abs); break; }
      }
      if (!found) { reply('<p>No eclipse window found in scan range.</p>'); return false; }
      const monthName = cal?.months?.[found.month]?.name || `Month ${found.month+1}`;
      reply(`<p><strong>Eclipse window:</strong> ${monthName} ${found.day}, ${found.year}</p>`);
      return false;
    }
  } catch (e) {
    // swallow and allow default processing
  }
});


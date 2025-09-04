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
  const yearName = endlean[endleanIndex] + "'s " + seofean[seofeanIndex];

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
    const monthName = getMonthName(calendar, date.month);
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
    const api = {
      /**
       * Get King's Age info for a given year (or current S&S year if omitted).
       * @param {number} [year]
       * @returns {{year:number,kingsAge:number,yearInAge:number,yearName:string}|null}
       */
      getYearInfo,
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

    function registerAthasChatCommands(commands) {
      const moduleId = 'seasons-and-stars-athas';
      // Removed: /kings-age (/ka) and /year (redundant; handled by /day)

      commands.register({
        module: moduleId,
        name: '/day',
        aliases: ['/ds-day'],
        description: 'Show current date with King\'s Age (Athas)',
        callback: () => {
          const date = getCurrentDateSafe();
          const cal = getActiveCalendarSafe(); if (!date || !cal) return {};
          const info = api.getYearInfo(date.year);
          const monthIdx0 = Math.max(0, (date.month ?? 1) - 1);
          const monthName = getMonthName(cal, monthIdx0);
          const seasonName = getSeasonName(cal, monthIdx0);
          const weekdayName = getWeekdayName(cal, { year: date.year, month: date.month, day: date.day, weekday: date.weekday });
          const t = date.time || {}; const hh = String(t.hour ?? 0).padStart(2, '0'); const mm = String(t.minute ?? 0).padStart(2, '0'); const ss = String(t.second ?? 0).padStart(2, '0');
          const html = `
<div style="border:1px solid #7a3b0c;background:#180d08;color:#f0e0c8;padding:10px 12px;border-radius:6px;box-shadow:0 0 10px rgba(122,59,12,.45);">
  <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#dea76a;">Dark Sun — Calendar of Tyr</div>
  <div style="font-size:18px;font-weight:700;color:#e8d7a9;margin:2px 0 6px;">${weekdayName || ''}${weekdayName ? ', ' : ''}${monthName} ${date.day}, Year ${date.year}</div>
  <div style="display:flex;flex-wrap:wrap;gap:14px;font-size:13px;">
    <div><span style=\"color:#d67f3a;\">Time</span>: ${hh}:${mm}:${ss}</div>
    <div><span style=\"color:#d67f3a;\">Season</span>: ${seasonName || '—'}</div>
    <div><span style=\"color:#d67f3a;\">King's Age</span>: ${info.kingsAge}, Year ${info.yearInAge}</div>
    <div><span style=\"color:#d67f3a;\">Year of</span>: ${info.yearName || '—'}</div>
  </div>
</div>`;
          return { content: html };
        }
      });

      // Removed: /time (redundant; handled by /day)

      commands.register({
        module: moduleId,
        name: '/season',
        description: 'Show current season',
        callback: () => {
          const date = getCurrentDateSafe(); const cal = getActiveCalendarSafe(); if (!date || !cal) return {};
          const monthIdx0 = Math.max(0, (date.month ?? 1) - 1);
          const seasonName = getSeasonName(cal, monthIdx0);
          return { content: `<p><strong>Season:</strong> ${seasonName || '—'}</p>` };
        }
      });

      commands.register({
        module: moduleId,
        name: '/moons',
        description: 'Show moon phases (optional date YYYY-M-D)',
        callback: (_chat, parameters) => {
          const cal = getActiveCalendarSafe(); if (!cal) return {};
          const arg = parameters?.trim();
          const dateArg = arg ? parseYMD(arg) : null;
          const raw = dateArg || getCurrentDateSafe(); if (!raw) return {};
          const date0 = makeDate0(raw);
          const phases = getMoonPhasesForDate(date0); if (!phases.length) return { content: '<p>No moon data available.</p>' };
          let html = `<p><strong>Moons — ${formatDate(cal, date0)}</strong></p>`;
          for (const p of phases) {
            html += `<p><strong>${p.name}:</strong> ${p.phaseName || '—'} (age ${p.age}/${p.cycleLength})` +
                    `${p.daysUntilFull != null ? `, next Full in ${p.daysUntilFull}d` : ''}` +
                    `${p.daysUntilNew != null ? `, next New in ${p.daysUntilNew}d` : ''}` +
                    `</p>`;
          }
          return { content: html };
        }
      });

      commands.register({
        module: moduleId,
        name: '/eclipse',
        description: 'Find next/previous eclipse window',
        callback: (_chat, parameters) => {
          const cal = getActiveCalendarSafe(); if (!cal) return {};
          const dir = (parameters?.trim() || 'next').toLowerCase();
          const raw = getCurrentDateSafe(); if (!raw) return {};
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



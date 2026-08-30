const HOLIDAY_CACHE_PREFIX = "solarvisitPhotovoltaics.holidays";
const LEGACY_HOLIDAY_CACHE_PREFIX = ["pv", "Vi", "sit", "Planner.holidays"].join("");
const HOLIDAY_CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

/**
 * Επιστρέφει τοπική λίστα αργιών.
 * Για την Κύπρο χρησιμοποιούμε δικό μας υπολογισμό,
 * ώστε να περιλαμβάνονται σωστά και οι κινητές αργίες.
 */
export function getFallbackHolidays(country, year) {
  if (country === "none") return [];

  if (country === "cyprus") {
    return getCyprusHolidays(year);
  }

  const common = [
    { date: `${year}-01-01`, name: "New Year's Day" },
    { date: `${year}-01-06`, name: "Epiphany" },
    { date: `${year}-03-25`, name: "Greek Independence Day" },
    { date: `${year}-05-01`, name: "Labour Day" },
    { date: `${year}-08-15`, name: "Assumption Day" },
    { date: `${year}-10-28`, name: "Ohi Day" },
    { date: `${year}-12-25`, name: "Christmas Day" },
    { date: `${year}-12-26`, name: "Boxing Day" }
  ];

  return common.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Φορτώνει τις δημόσιες αργίες.
 *
 * Για την Κύπρο χρησιμοποιούμε την τοπική λίστα,
 * επειδή περιέχει τις σωστές κινητές αργίες.
 *
 * Για την Ελλάδα συνεχίζουμε να χρησιμοποιούμε
 * το Nager.Date API με fallback την τοπική λίστα.
 */
export async function loadPublicHolidays(country, year) {
  if (country === "none") {
    return {
      holidays: [],
      warning: ""
    };
  }

  if (country === "cyprus") {
    return {
      holidays: getCyprusHolidays(year),
      warning: ""
    };
  }

  const countryCode = country === "greece" ? "GR" : "CY";
  const cached = readHolidayCache(countryCode, year);

  if (cached) {
    return {
      holidays: cached,
      warning: ""
    };
  }

  try {
    const response = await fetch(
      `https://date.nager.at/api/v4/Holidays/${countryCode}/${year}`
    );

    if (!response.ok) {
      throw new Error(
        `Nager.Date request failed with status ${response.status}`
      );
    }

    const payload = await response.json();

    const holidays = payload.map((holiday) =>
      normalizeHoliday({
        date: holiday.date,
        name: holiday.localName || holiday.name
      })
    );

    writeHolidayCache(countryCode, year, holidays);

    return {
      holidays,
      warning: ""
    };
  } catch (error) {
    return {
      holidays: getFallbackHolidays(country, year),
      warning: `Could not load public holidays from Nager.Date. Showing fallback holidays for ${year}.`
    };
  }
}

/**
 * Ενώνει τις δημόσιες αργίες με τις αργίες
 * που πρόσθεσε χειροκίνητα ο χρήστης.
 */
export function getActiveHolidays(settings, publicHolidays = []) {
  const custom = Array.isArray(settings.customHolidays)
    ? settings.customHolidays
    : [];

  return dedupeHolidays([...publicHolidays, ...custom]).sort((a, b) =>
    a.date.localeCompare(b.date)
  );
}

/**
 * Βρίσκει αν μια συγκεκριμένη ημερομηνία είναι αργία.
 */
export function findHolidayForDate(
  settings,
  date,
  publicHolidays = []
) {
  if (!date) return null;

  return (
    getActiveHolidays(settings, publicHolidays).find(
      (holiday) => holiday.date === date
    ) || null
  );
}

/**
 * Καθαρίζει τη μορφή μιας αργίας.
 */
export function normalizeHoliday(holiday) {
  return {
    date: holiday.date || "",
    name: (holiday.name || "").trim() || "Holiday"
  };
}

/**
 * Δημιουργεί όλες τις επίσημες αργίες της Κύπρου.
 */
function getCyprusHolidays(year) {
  const easterSunday = getOrthodoxEasterSunday(year);

  const cleanMonday = addDays(easterSunday, -48);
  const goodFriday = addDays(easterSunday, -2);
  const easterMonday = addDays(easterSunday, 1);
  const pentecostMonday = addDays(easterSunday, 50);

  return [
    {
      date: `${year}-01-01`,
      name: "Πρωτοχρονιά"
    },
    {
      date: `${year}-01-06`,
      name: "Θεοφάνια"
    },
    {
      date: toIsoDate(cleanMonday),
      name: "Καθαρά Δευτέρα"
    },
    {
      date: `${year}-03-25`,
      name: "Εθνική Επέτειος 25ης Μαρτίου"
    },
    {
      date: `${year}-04-01`,
      name: "Εθνική Επέτειος 1ης Απριλίου"
    },
    {
      date: toIsoDate(goodFriday),
      name: "Μεγάλη Παρασκευή"
    },
    {
      date: toIsoDate(easterSunday),
      name: "Κυριακή του Πάσχα"
    },
    {
      date: toIsoDate(easterMonday),
      name: "Δευτέρα του Πάσχα"
    },
    {
      date: `${year}-05-01`,
      name: "Εργατική Πρωτομαγιά"
    },
    {
      date: toIsoDate(pentecostMonday),
      name: "Κατακλυσμός – Δευτέρα του Αγίου Πνεύματος"
    },
    {
      date: `${year}-08-15`,
      name: "Κοίμηση της Θεοτόκου"
    },
    {
      date: `${year}-10-01`,
      name: "Ημέρα Ανεξαρτησίας της Κύπρου"
    },
    {
      date: `${year}-10-28`,
      name: "Εθνική Επέτειος 28ης Οκτωβρίου"
    },
    {
      date: `${year}-12-25`,
      name: "Χριστούγεννα"
    },
    {
      date: `${year}-12-26`,
      name: "Σύναξη της Υπεραγίας Θεοτόκου"
    }
  ].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Υπολογίζει την ημερομηνία του Ορθόδοξου Πάσχα.
 */
function getOrthodoxEasterSunday(year) {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;

  const julianMonth = Math.floor((d + e + 114) / 31);
  const julianDay = ((d + e + 114) % 31) + 1;

  /*
   * Διαφορά Ιουλιανού και Γρηγοριανού ημερολογίου.
   * Για το 1900–2099 είναι 13 ημέρες, αλλά ο τύπος
   * συνεχίζει να λειτουργεί και μετά το 2100.
   */
  const calendarDifference =
    Math.floor(year / 100) -
    Math.floor(year / 400) -
    2;

  return new Date(
    Date.UTC(
      year,
      julianMonth - 1,
      julianDay + calendarDifference
    )
  );
}

/**
 * Προσθέτει ή αφαιρεί ημέρες χωρίς προβλήματα timezone.
 */
function addDays(date, numberOfDays) {
  const result = new Date(date);

  result.setUTCDate(result.getUTCDate() + numberOfDays);

  return result;
}

/**
 * Μετατρέπει μια ημερομηνία στη μορφή YYYY-MM-DD.
 */
function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function readHolidayCache(countryCode, year) {
  try {
    const raw =
      localStorage.getItem(
        getHolidayCacheKey(countryCode, year)
      ) ||
      localStorage.getItem(
        getLegacyHolidayCacheKey(countryCode, year)
      );

    if (!raw) return null;

    const cached = JSON.parse(raw);

    if (
      !cached.savedAt ||
      Date.now() - cached.savedAt >
        HOLIDAY_CACHE_MAX_AGE_MS
    ) {
      return null;
    }

    return Array.isArray(cached.holidays)
      ? cached.holidays.map(normalizeHoliday)
      : null;
  } catch {
    return null;
  }
}

function writeHolidayCache(countryCode, year, holidays) {
  try {
    localStorage.setItem(
      getHolidayCacheKey(countryCode, year),
      JSON.stringify({
        savedAt: Date.now(),
        holidays: holidays.map(normalizeHoliday)
      })
    );
  } catch {
    // Η εφαρμογή συνεχίζει να λειτουργεί ακόμη
    // και αν το localStorage δεν είναι διαθέσιμο.
  }
}

function getHolidayCacheKey(countryCode, year) {
  return `${HOLIDAY_CACHE_PREFIX}.${countryCode}.${year}`;
}

function getLegacyHolidayCacheKey(countryCode, year) {
  return `${LEGACY_HOLIDAY_CACHE_PREFIX}.${countryCode}.${year}`;
}

function dedupeHolidays(holidays) {
  const byDateAndName = new Map();

  holidays
    .map(normalizeHoliday)
    .forEach((holiday) => {
      if (!holiday.date) return;

      byDateAndName.set(
        `${holiday.date}:${holiday.name.toLowerCase()}`,
        holiday
      );
    });

  return [...byDateAndName.values()];
}
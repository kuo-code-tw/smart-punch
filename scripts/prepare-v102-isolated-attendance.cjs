'use strict';

const { apply } = require('./apply-gas-stale-open-checkin.cjs');

function prepareAttendanceValidation(source, yearIds) {
  if (!/const API_VERSION = '2026\.11\.06\.V102-LINKED-COVER-NOSHOW';/.test(source)) {
    throw new Error('Expected the V102 backup');
  }
  const official = source.match(/const P79_OFFICIAL_VERIFIED_YEAR_FILE_IDS = \{([^}]+)\};/);
  if (!official) throw new Error('Missing official year map');
  const officialIds = new Set([...official[1].matchAll(/'\d{3}'\s*:\s*'([^']+)'/g)].map(match => match[1]));
  if (officialIds.size !== 3) throw new Error('Unexpected official year map');
  const entries = Object.entries(yearIds);
  if (!entries.length || new Set(entries.map(([, id]) => id)).size !== entries.length ||
      entries.some(([year, id]) => !/^\d{3}$/.test(year) ||
        typeof id !== 'string' || !/^[\w-]{25,}$/.test(id) ||
        officialIds.has(id) || source.includes(id))) {
    throw new Error('Supply distinct test-only year IDs absent from the V102 backup');
  }

  const signature = 'function getAttendanceYearSpreadsheet_(monthKey, createIfMissing) {';
  const start = source.indexOf(signature);
  if (start < 0 || start !== source.lastIndexOf(signature)) {
    throw new Error('Unexpected annual attendance resolver');
  }
  // Compile only in memory. Other V102 routes still require separate isolation.
  const candidate = apply(source + '\nfunction fixtureEndMarker_() {}\n');
  const resolvedStart = candidate.indexOf(signature);
  const end = candidate.indexOf('\nfunction cleanupAttendanceYearDefaultSheets_', resolvedStart);
  if (end < 0) throw new Error('Unexpected end of annual attendance resolver');
  const resolver = `function getAttendanceYearSpreadsheet_(monthKey, createIfMissing) {
  const year = String(attendanceRocYearFromMonthKey_(monthKey));
  const id = ${JSON.stringify(Object.fromEntries(entries))}[year];
  if (!id) throw new Error('No isolated attendance file for year ' + year);
  const book = SpreadsheetApp.openById(id);
  if (!book || book.getId() !== id) throw new Error('Isolated attendance file mismatch');
  return book;
}`;
  return candidate.slice(0, resolvedStart) + resolver + candidate.slice(end);
}

module.exports = { prepareAttendanceValidation };

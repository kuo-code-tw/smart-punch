'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const pages = ['attendance', 'work-hours', 'leave', 'schedule', 'hr'];
for (const page of pages) {
  const html = fs.readFileSync(page + '/index.html', 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*src=["']([^"']+)["']/g)]
    .map(match => match[1])
    .filter(src => /port79-(attendance-overtime|overtime-report)\.js/.test(src));
  assert(scripts.length, page + ' loads a reporting entry');
  for (const src of scripts) {
    const url = new URL(src, 'https://fixture.invalid/' + page + '/');
    assert.equal(url.searchParams.get('reportingPair'), '20261126-v3', page + ' loads the current pairing implementation');
    assert(fs.existsSync(url.pathname.slice(1)), page + ' references an existing asset');
  }
}
console.log('PASS reporting assets bypass old browser cache in attendance, workhours, leave, schedule and HR');

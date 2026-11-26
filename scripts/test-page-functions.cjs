'use strict';

const vm = require('node:vm');
const assert = require('node:assert/strict');

function functionSource(source, name) {
  const declaration = new RegExp('^([ \\t]*)(?:async )?function ' + name + '\\(', 'm');
  const match = declaration.exec(source);
  assert(match, 'Page function exists: ' + name);
  const start = match.index;
  const lines = source.slice(start).split('\n');
  let candidate = '';
  for (const line of lines) {
    candidate += line + '\n';
    if (!line.includes('}')) continue;
    try {
      new vm.Script(candidate);
      return candidate;
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
  }
  throw Error('Unable to extract complete page function: ' + name);
}

function loadFunctions(context, source, names) {
  for (const name of names) vm.runInContext(functionSource(source, name), context);
}

module.exports = { functionSource, loadFunctions };

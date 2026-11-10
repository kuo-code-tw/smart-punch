'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const html = fs.readFileSync('attendance/index.html', 'utf8');
function extract(name, isAsync = false) {
    const start = html.indexOf('        ' + (isAsync ? 'async ' : '') + 'function ' + name + '(');
    assert(start >= 0, name + ' exists');
    const end = html.indexOf('\n        }', start);
    assert(end > start, name + ' closes');
    return html.slice(start, end + '\n        }'.length);
}
const base = {locationName: '79號碼頭', lat: 22.557128, lng: 120.337712, radius: 100};
const nearAdditional = {name: '新增作業區', lat: 22.61, lng: 120.41, radius: 120};
const context = {
    JSON, Math, Number, String, Array, Error, console, Date, Promise,
    sysConfig: {...base, extraLocations:[nearAdditional]},
    defaultConfig: {...base},
    LEGACY_PRIMARY_LOCATION_NAMES: ['79號碼頭', '高雄港萬海79號碼頭', '高雄港高海79號碼頭'],
    getActiveGasUrl: () => 'https://script.google.com/macros/s/example/exec',
    fetchGasJsonWithRetry: async () => ({ok:true, config:{...base, extraLocations:[nearAdditional]}}),
    saveConfig: () => {},
    window: {isSecureContext:true},
    setTimeout, clearTimeout,
    showToast: () => {},
    navigator: {},
    document: {getElementById: () => ({textContent:''})}
};
vm.createContext(context);
for (const name of [
    'normalizeExtraLocations','getConfiguredPunchLocations','findAllowedPunchLocation',
    'calculateDistance','formatAttendanceLocationDisplay','requestLocationPermission'
]) vm.runInContext(extract(name), context);
vm.runInContext('let p79LocationConfigReadPromise=null;\n'+extract('refreshPunchLocationConfig', true), context);

// The configured name, not the historic fixed text, is the current displayed name.
for (const old of ['79號碼頭','高雄港萬海79號碼頭','高雄港高海79號碼頭',
                   '79號碼頭/31m (範圍內)']) {
    assert.equal(context.formatAttendanceLocationDisplay(old), '79號碼頭');
}
assert.equal(context.formatAttendanceLocationDisplay('新增作業區'), '新增作業區');
assert.equal(context.formatAttendanceLocationDisplay('工地 A/12m (範圍內)'), '工地 A/12m (範圍內)');
context.sysConfig.locationName = '新的主要碼頭名稱';
assert.equal(context.formatAttendanceLocationDisplay('高雄港萬海79號碼頭'), '新的主要碼頭名稱');
assert.equal(context.formatAttendanceLocationDisplay('79號碼頭/31m (範圍內)'), '新的主要碼頭名稱');

// Both the primary location and newly added locations enforce their own GPS radius.
const primary = context.findAllowedPunchLocation(22.557128, 120.337712);
const extra = context.findAllowedPunchLocation(22.61, 120.41);
assert.equal(primary.name, '新的主要碼頭名稱');
assert.equal(primary.primary, true);
assert.equal(extra.name, '新增作業區');
assert.equal(extra.primary, false);
assert(extra.distance <= extra.radius, 'additional site is permitted');
const farAway = context.findAllowedPunchLocation(24, 121);
assert(farAway.distance > farAway.radius, 'no geofence bypass for outside device');

// Legacy GAS responses may encode additional sites as JSON text.
assert.equal(context.normalizeExtraLocations(JSON.stringify([nearAdditional]))[0].name, '新增作業區');
assert.equal(context.normalizeExtraLocations('{broken')[0].name, '');
assert.equal(context.normalizeExtraLocations([{name:'',lat:null,lng:null}])[0].lat, null);

// The real GPS request identifies the newly configured site on the device.
let gpsCalls = 0;
context.navigator.geolocation = {
    getCurrentPosition: success => {
        gpsCalls += 1;
        success({coords: {latitude:22.61, longitude:120.41, accuracy:8}});
    }
};
let accepted;
context.requestLocationPermission((ok, distance, location) => {
    accepted = {ok, distance, location};
});
assert.equal(accepted?.ok, true);
assert.equal(accepted?.location?.name, '新增作業區');
assert(accepted.distance <= 120);
assert.equal(gpsCalls,1,'fast fix in configured site does not require a slow fallback');

(async () => {
    context.getAttendanceEmployeeMasterToken=()=> 'EMPLOYEE-TEST';
    let capturedUrl='';
    context.fetchGasJsonWithRetry = async url => {
        capturedUrl=url;
        return {ok:true,config:{...base, locationName:'新名稱', extraLocations:[nearAdditional]}};
    };
    assert.equal(await context.refreshPunchLocationConfig(),true);
    assert.equal(context.sysConfig.locationName,'新名稱');
    assert.equal(context.sysConfig.extraLocations[0].name,'新增作業區');
    assert(capturedUrl.includes('action=getGpsConfig'),'uses lightweight authoritative GPS read');
    assert(capturedUrl.includes('token=EMPLOYEE-TEST'),'uses employee token without requiring management permission');

    // Outdated backend missing an extra site cannot silently certify old settings.
    context.fetchGasJsonWithRetry=async()=>({ok:true,config:{...base}});
    await assert.rejects(context.refreshPunchLocationConfig(),/額外打卡地點資料/);

    // Actual punch and export paths keep using the common display function,
    // without changing any row count, company-export columns or raw record.
    assert(html.includes('execPunch(statusText,location.name);'));
    assert(!html.includes('PRIMARY_IN_RANGE_LOCATION_LABEL'));
    assert(html.includes("if (f.key === 'location') val = formatAttendanceLocationDisplay(r.location)"));
    assert(html.includes('const sheetRows = [selectedFields.map(f => f.label)]'));
    console.log('PASS: primary-name aliases, new GPS locations, cloud validation, and company export format');
})().catch(error=>{console.error(error);process.exitCode=1;});

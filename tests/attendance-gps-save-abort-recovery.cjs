'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const html = fs.readFileSync('attendance/index.html','utf8');
function extract(name,isAsync=false) {
    const start=html.indexOf('        '+(isAsync?'async ':'')+'function '+name+'(');
    assert(start>=0,name+' must exist');
    const end=html.indexOf('\n        }',start);
    assert(end>start,name+' must close');
    return html.slice(start,end+'\n        }'.length);
}
const base={
    companyName:'亞太國際物流',locationName:'79號碼頭',
    lat:22.557128,lng:120.337712,radius:100,
    gasUrl:'https://script.google.com/macros/s/example/exec',extraLocations:[]
};
const site={name:'空櫃堆高機',lat:22.555499,lng:120.337724,radius:100};

function setup(mode) {
    let cloud=null,posts=0,reads=0,closes=0,message='';
    const button={innerHTML:'儲存系統設定',disabled:false};
    const inputs={
        cfgExtraLocationName1:{value:site.name},
        cfgExtraLocationLat1:{value:String(site.lat)},
        cfgExtraLocationLng1:{value:String(site.lng)},
        cfgExtraLocationRadius1:{value:String(site.radius)},
        btnSaveSystemSettings:button
    };
    const context={
        JSON,Math,Number,String,Array,Error,Promise,Date,TextEncoder,console,
        setTimeout:(callback)=>{callback();return 1},
        sysConfig:JSON.parse(JSON.stringify(base)),defaultConfig:base,
        cloudDirectWriteBusy:0,
        document:{getElementById:id=>inputs[id]||null},
        getActiveGasUrl:()=>base.gasUrl,
        normalizeGasWebAppUrl:x=>x,isValidGasWebAppUrl:()=>true,
        normalizeAdminIds:ids=>ids,requireAdminAction:()=>true,
        p79SettingsSaveFeedback:text=>{message=text},
        saveConfig:()=>{},setCloudSyncStatus:()=>{},removeQueuedCloudOperation:()=>0,
        showToast:()=>{},applySysConfigUI:()=>{},
        closeSystemSettings:()=>{closes++},
        fetchGasJsonWithRetry:async()=>{
            reads++;
            return {ok:true,config:cloud||base};
        },
        performCloudRequest:async payload=>{
            posts++;
            if(mode!=='timeout-unsaved') {
                cloud=JSON.parse(JSON.stringify(payload.config));
                if(mode==='outdated-gas')delete cloud.extraLocations;
            }
            if(mode.startsWith('timeout'))throw new Error('signal is aborted without reason');
            return {ok:true};
        }
    };
    vm.createContext(context);
    for(const name of ['normalizeExtraLocations','p79IsAbortLikeError','p79GpsCloudMismatchReason','p79GpsConfigMatchesCloud'])
        vm.runInContext(extract(name),context);
    vm.runInContext(extract('p79ReadBackSavedGpsConfig',true),context);
    vm.runInContext('let p79SystemSettingsSaveBusy=false;\n'+extract('saveSystemSettings',true),context);
    return {
        context,
        run:()=>context.saveSystemSettings(),
        stats:()=>({posts,reads,closes,message,button,cloud})
    };
}
(async()=>{
    for(const [mode,expectSuccess] of [
        ['success',true],['timeout-committed',true],
        ['timeout-unsaved',false],['outdated-gas',false]
    ]) {
        const test=setup(mode);
        const result=await test.run(),state=test.stats();
        assert.equal(result.ok,expectSuccess,mode+' response');
        assert.equal(state.closes,expectSuccess?1:0,mode+' modal');
        assert.equal(state.posts,1,mode+' must not create duplicate cloud writes');
        assert(state.reads>=1,mode+' must check authoritative cloud');
        assert.equal(state.button.disabled,false,mode+' button should recover');
        if(expectSuccess) {
            assert.equal(state.cloud.extraLocations[0].name,site.name);
            assert.equal(test.context.sysConfig.extraLocations[0].lat,site.lat);
        } else {
            assert.match(state.message,/尚未確認儲存/);
            assert.equal(test.context.sysConfig.extraLocations.length,0,
                mode+' must not activate unconfirmed GPS sites in local configuration');
            assert.equal(test.context.sysConfig.locationName,'79號碼頭');
            if(mode==='outdated-gas')assert.match(state.message,/extraLocations/);
            if(mode==='timeout-unsaved')assert.match(state.message,/遭中止或逾時/);
        }
    }
    // A malformed or older GAS deployment must not certify missing extra sites.
    const test=setup('outdated-gas');
    assert.equal(test.context.p79GpsConfigMatchesCloud(
        {...base}, {...base,extraLocations:[site]}),false);
    assert.match(test.context.p79GpsCloudMismatchReason(
        {...base}, {...base,extraLocations:[site]}),/extraLocations/);
    console.log('PASS: GPS save success, aborted-write recovery, failed-write retention, old GAS rejection');
})().catch(err=>{console.error(err);process.exitCode=1});

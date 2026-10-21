(function(g){
'use strict';
g.P79AttendanceEditCompare=function(a,b){
            const canonical=value=>{
                const text=String(value??'').replace('T',' ').trim();
                const m=text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
                return m?m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0')+' '+m[4].padStart(2,'0')+':'+m[5].padStart(2,'0')+':'+String(m[6]||'0').padStart(2,'0'):text;
            };
            const note=r=>/^(管理員手動補刷|管理員手動補卡)$/.test(String(r?.note||'').trim())?'':String(r?.note||'').trim();
            return canonical(a.timeStr)===canonical(b.timeStr)&&String(a.status||'').trim()===String(b.status||'').trim()&&note(a)===note(b);
        };
})(window);

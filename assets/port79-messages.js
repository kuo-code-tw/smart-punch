(function(global){
'use strict';
function error(value){
 let text=String(value?.message??value??'').trim();if(!text)return '處理未完成，請重新讀取後再試。';
 const rules=[
 [/Failed to fetch|NetworkError(?: when attempting to fetch resource)?|Load failed|Network request failed/gi,'網路連線失敗，請確認網路後重新讀取；儲存結果尚未確認'],
 [/signal is aborted without reason|The operation was aborted\.?|This operation was aborted\.?|AbortError/gi,'連線已中止或逾時，請重新讀取核對結果'],
 [/TimeoutError|timed? ?out|timeout/gi,'連線逾時，請重新讀取核對結果'],
 [/Unexpected token[^\n]*|Unexpected end of JSON input|JSON Parse error[^\n]*/gi,'雲端回傳格式不正確，請重新讀取；若持續出現請聯絡管理員確認服務'],
 [/Session expired|Invalid token|Unauthorized|authentication required/gi,'登入已失效，請重新登入'],
 [/Permission denied|Access denied|Forbidden/gi,'沒有此操作權限，請聯絡管理員確認授權'],
 [/HTTP\s*(401|403)/gi,'登入驗證或操作權限不足，請重新登入並確認授權'],
 [/HTTP\s*429/gi,'目前請求較多，請稍候再試'],
 [/HTTP\s*5\d\d/gi,'雲端服務暫時無法使用，請稍候重新讀取'],
 [/Cannot read properties of (?:undefined|null)[^\n]*/gi,'畫面資料尚未完整載入，請重新讀取後再操作'],
 [/[A-Za-z_$][\w$]*(?:\.[\w$]+)* is not (?:defined|a function)/gi,'功能未完整載入，請重新整理頁面後再試']
 ];
 for(const [pattern,label] of rules)text=text.replace(pattern,label);
 text=text.replace(/\b(?:Error|TypeError|ReferenceError|SyntaxError):\s*/g,'');
 if(!/[\u3400-\u9fff]/.test(text)&&/[A-Za-z]/.test(text))return '系統處理未完成，請重新讀取後再試；若再次出現，請保留畫面聯絡管理員。';
 return text.replace(/\bGAS\b/g,'雲端服務').replace(/\bJSON\b/g,'資料格式').replace(/\bWeb App\b/g,'網頁服務').replace(/\bID\b/g,'編號');
}
function source(value){
 const raw=String(value||'').trim(),key=raw.toLowerCase();
 const labels={'manual-pair-recovery':'人工補卡紀錄（系統恢復）','manual-admin':'管理員補卡','manual-punch':'人工補卡','excel-import':'試算表匯入','employee-punch':'員工刷卡','mobile-punch':'手機刷卡','local-punch':'本機刷卡','sync-import':'雲端同步','system-confirmed':'系統確認'};
 return labels[key]||(/[\u3400-\u9fff]/.test(raw)?raw:raw?'其他系統紀錄':'來源未標示');
}
function operation(value){
 const text=String(value||'');if(/[\u3400-\u9fff]/.test(text))return text;
 const names={updateRecord:'修改考勤紀錄',editRecord:'修改考勤紀錄',addRecord:'新增打卡紀錄',deleteRecord:'刪除考勤紀錄',getAttendanceMainDirect:'核對正式考勤',getAttendanceDelta:'同步考勤異動',syncConfig:'儲存系統設定',saveConfig:'儲存共用設定',syncSchedules:'儲存班表',hrUpsertEmployee:'儲存人資資料',hrSaveOrgSettings:'儲存組織設定'};
 if(names[text])return names[text];
 if(/schedule/i.test(text))return '讀取或更新排班資料';
 if(/attendance|punch/i.test(text))return '讀取或更新考勤資料';
 if(/leave/i.test(text))return '讀取或更新請假資料';
 if(/overtime/i.test(text))return '讀取或更新加班資料';
 if(/employee|^hr/i.test(text))return '讀取或更新人資資料';
 if(/^gc|ship|vessel/i.test(text))return '讀取或更新船舶資料';
 return '處理雲端資料';
}
global.P79Messages={error,source,operation};
const alert=global.alert;
if(typeof alert==='function')global.alert=message=>alert.call(global,error(message));
function boot(){
 const toast=global.showToast;if(typeof toast==='function'&&!toast.p79Chinese){const wrapped=function(message,...rest){return toast.call(this,error(message),...rest)};wrapped.p79Chinese=true;global.showToast=wrapped;}
 const selectors='[role="status"],[role="alert"],#status,.status,.error';
 const technical=/Failed to fetch|NetworkError|Load failed|AbortError|TimeoutError|timed? ?out|Unexpected token|Unexpected end of JSON|JSON Parse error|Session expired|Invalid token|Unauthorized|Permission denied|Access denied|Forbidden|HTTP\s*[45]\d\d|Cannot read properties|is not defined|is not a function/i;
 function translate(node){
  if(node.nodeType===3){if(node.parentElement?.closest(selectors)&&technical.test(node.nodeValue||'')){const next=error(node.nodeValue);if(next!==node.nodeValue)node.nodeValue=next;}return;}
  if(node.nodeType!==1)return;
  const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let child;while((child=walker.nextNode()))translate(child);
 }
 translate(document.body);
 new MutationObserver(changes=>changes.forEach(change=>{if(change.type==='characterData')translate(change.target);else change.addedNodes.forEach(translate);})).observe(document.body,{subtree:true,childList:true,characterData:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(window);

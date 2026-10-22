/* Numeric ship columns may arrive as Date objects after a sheet import applied
 * a date format. Convert spreadsheet dates back to day serials, never epoch ms.
 * Also recognize epoch values already produced by the old Number(Date) reader.
 * This is a read-time conversion only; it does not rewrite source sheets. */
function p79GcQuantityNumber_(value){
  if(value===undefined||value===null||String(value).trim()==='')return 0;
  if(typeof value==='string'&&/^\s*\d{1,3}(?:,\d{3})+(?:\.\d+)?\s*$/.test(value))value=value.replace(/,/g,'');
  const date=value instanceof Date?value:typeof value==='number'&&value< -1e11?new Date(value):null;
  if(date){
    const serial=(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate())-Date.UTC(1899,11,30))/86400000;
    if(Number.isFinite(serial)&&serial>=0&&date.getUTCFullYear()<1970)return serial;
    throw Error('船舶數量欄誤存日期，無法安全還原');
  }
  if(typeof value==='string'&&!/^\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)\s*$/.test(value)&&value.trim())throw Error('船舶數量格式異常：'+value);
  const n=Number(value);if(!Number.isFinite(n)||n<0)throw Error('船舶數量必須為非負數');return n;
}

importScripts('./vendor/exceljs.min.js');
// Read cached cell values only. Never execute workbook formulae or render embedded content.
const cellText=v=>v==null?'':typeof v==='object'?(v.richText?v.richText.map(x=>x.text).join(''):v.result!==undefined?String(v.result):v.text||''):String(v);
self.onmessage=async ({data})=>{try{
 const w=new ExcelJS.Workbook();await w.xlsx.load(data);
 const sheets=[];let total=0;
 for(const sheet of w.worksheets){
  if(sheet.rowCount>25000 || sheet.columnCount>250)throw Error('Workbook sheet is too large. Export only the project table to a smaller XLSX.');
  const rows=[];sheet.eachRow((row,n)=>{const values=row.values.slice(1).map(cellText);total+=values.join('').length;if(total>10000000)throw Error('Workbook contains too much text. Select a smaller project table.');rows.push({number:n,values});});
  if(rows.length)sheets.push({name:sheet.name,rows});
 }
 self.postMessage({ok:true,sheets});
}catch(e){self.postMessage({ok:false,error:e.message});}};

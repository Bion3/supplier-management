import {parseBookingWorkbook} from './booking-import.js';
self.onmessage=({data})=>{try{importScripts('/src/vendor/xlsx.full.min.js');const book=self.XLSX.read(data,{type:'array',cellDates:false,sheetRows:200});self.postMessage({ok:true,...parseBookingWorkbook(book)});}catch(e){self.postMessage({ok:false,error:e.message||'读取失败，请检查文件是否损坏或加密。'});}};

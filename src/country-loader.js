import {cloudRequest,currentUser} from './cloud.js';
import {setCountryCatalog} from './country-catalog.js';
let pending=null;const key='eurasiago-country-catalog';
export async function loadCountryCatalog(){if(!currentUser())return false;try{const saved=JSON.parse(sessionStorage.getItem(key)||'null');if(saved&&Date.now()-saved.at<300000&&saved.version===(localStorage.getItem('country-catalog-version')||'')&&saved.rows.length){setCountryCatalog(saved.rows);return true;}}catch{}
 if(!pending)pending=(async()=>{try{const rows=await cloudRequest('freight_countries?select=*&order=sort_order,iso2&limit=1000',{signal:AbortSignal.timeout(5000)});if(rows.length){setCountryCatalog(rows);try{sessionStorage.setItem(key,JSON.stringify({rows,at:Date.now(),version:localStorage.getItem('country-catalog-version')||''}));}catch{}return true;}return false;}catch{return false;}finally{pending=null;}})();return pending;}

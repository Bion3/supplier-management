import {chinaDate} from './crm-model.js';
function shiftDate(date,days){return new Date(Date.parse(date+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);}
export function contactAddedRange(mode,date='',today=chinaDate()){
 if(!mode)return {};
 const end=mode==='date'?date:mode==='yesterday'?shiftDate(today,-1):today;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(end))return {};
 return {contact_added_from:mode==='week'?shiftDate(today,-6):end,contact_added_to:end};
}
export function contactAddedLabel(dates=[],filters={},today=chinaDate()){
 const values=(dates||[]).filter(d=>(!filters.contact_added_from||d>=filters.contact_added_from)&&(!filters.contact_added_to||d<=filters.contact_added_to)).sort();
 const latest=values.at(-1);if(!latest)return '';
 return latest===today?'今日新增联系方式':'新增联系方式 · '+latest;
}

export const TRAIN_TYPES=['普线','快线','时刻表','专列','定制','其他'];
export const DIRECTIONS=['去程','回程','境外段'];
export const LINE_GROUPS=['欧线','俄线','中亚','中东','东南亚','其他'];
export function railClassification(row){
 const q=row.quote||{},service=q.service||'',group=q.source?.lineGroup||'';
 const trainType=q.trainType??(/时刻/.test(service)?'时刻表':service==='快线'?'快线':service==='普线'||service==='公班'?'普线':/专列|专班/.test(service)?'专列':service==='定制'?'定制':'');
 const lineGroup=q.lineGroup??(/俄/.test(group)?'俄线':/欧/.test(group)?'欧线':group==='中亚'?'中亚':/东盟|东南亚/.test(group)?'东南亚':group==='中东'?'中东':'');
 return {trainType,direction:q.direction||'',lineGroup};
}
export function matchesRailClassification(row,filters){const c=railClassification(row);return Object.entries(filters).every(([key,value])=>!value||(value==='unknown'?!c[key]:c[key]===value));}

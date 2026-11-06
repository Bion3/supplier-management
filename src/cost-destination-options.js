// Group destination labels from internal purchase-price libraries without
// inventing a country for locations that are not reliably identifiable.
const groups=[
 ['欧洲','德国',/汉堡|杜伊斯堡|慕尼黑|不来梅|莱比锡|纽伦堡|法兰克福|柏林|曼海姆/],
 ['欧洲','波兰',/波兰|马拉|马拉舍维奇|华沙|卡托维兹|格但斯克|罗兹|波兹南/],
 ['欧洲','捷克',/布拉格|俄斯特拉发|捷克/],
 ['欧洲','匈牙利',/布达佩斯|匈牙利/],
 ['欧洲','意大利',/米兰|维罗纳|布伦代|意大利/],
 ['欧洲','法国',/巴黎|里昂|法国/],
 ['欧洲','荷兰',/鹿特丹|蒂尔堡|荷兰/],
 ['欧洲','比利时',/列日|比利时/],
 ['欧洲','英国',/伦敦|Tilbury|英国|曼彻斯特/],
 ['欧洲','奥地利',/维也纳|萨尔茨堡|奥地利/],
 ['欧洲','罗马尼亚',/蒂米什瓦拉|布加勒斯特|罗马尼亚/],
 ['欧洲','塞尔维亚',/贝尔格莱德|塞尔维亚/],
 ['欧洲','立陶宛',/维尔纽斯|立陶宛/],
 ['欧洲','斯洛伐克',/科希策|斯洛伐克/],
 ['欧洲','西班牙',/巴塞罗那|马德里|西班牙/],
 ['欧洲','瑞典',/赫尔辛堡|瑞典/],
 ['欧洲','白俄罗斯',/明斯克|布列斯特|白俄罗斯/],
 ['俄罗斯及独联体','俄罗斯',/俄罗斯|莫斯科|圣彼得堡|叶卡捷琳堡|新西伯利亚|克列西哈|喀山|后贝加尔|沃尔西诺|切尔尼科夫卡/],
 ['中亚','哈萨克斯坦',/哈萨克斯坦|阿拉木图|库斯塔奈|卡拉干达|阿腾科里|多斯特克|热特苏|梅杰乌|霍尔果斯|山口/],
 ['中亚','乌兹别克斯坦',/乌兹别克斯坦|塔什干|丘库尔赛|谢尔盖利|乌尔陶尔|吉扎克/],
 ['中亚','土库曼斯坦',/土库曼斯坦|阿什哈巴德|格普贾克/],
 ['西亚及高加索','阿塞拜疆',/阿塞拜疆|巴库|阿布歇隆/],
 ['西亚及高加索','格鲁吉亚',/格鲁吉亚|第比利斯|波季/],
 ['西亚及高加索','土耳其',/土耳其|伊兹密特|伊兹密尔|安卡拉|梅尔辛/],
 ['东南亚','老挝',/老挝|万象|琅勃拉邦|纳堆/],
 ['中国境内','中国',/郑州|西安|阿拉山口|满洲里|阳平|果斯/]
];
export function classifyQuoteDestination(raw){
 const name=String(raw||'').trim();
 if(!name)return {region:'未分类',country:'待核实'};
 // Mixed-country/multi-stop records need human classification, not an invented country.
 if(/[\/／]/.test(name)&&!(/莫斯科|塔什干|阿拉木图/.test(name)))return {region:'未分类',country:'待核实'};
 const m=groups.find(([region,country,re])=>re.test(name));
 return m?{region:m[0],country:m[1]}:{region:'未分类',country:'待核实'};
}
export function destinationChoices(rows,kind,{region='',country=''}={}){
 const discarded=new Set((rows||[]).filter(x=>x.supersedes_id).map(x=>x.supersedes_id));
 const names=new Set();
 for(const row of rows||[]){
  if(discarded.has(row.id)||row.status!=='confirmed')continue;
  const d=String(row.destination||'').trim().replace(/\s*\n\s*/g,' ');
  if(!d||/^(境外段|目的站待定|待定)$/.test(d))continue;
  const info=classifyQuoteDestination(d);
  if(region&&info.region!==region||country&&info.country!==country)continue;
  names.add(d);
 }
 return [...names].sort((a,b)=>a.localeCompare(b,'zh-CN'));
}

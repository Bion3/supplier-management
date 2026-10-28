export const exhibitionCategories=['待分类','物流与供应链','工业机械','汽配与交通','家居与家具','建材与五金','消费品与礼品','食品与农业','纺织与服装','医疗与健康','能源与环保','科技与电子','包装与印刷','综合贸易','其他'];
export const exhibitionTypes=['待分类','专业贸易展','综合贸易展','消费公众展','会议及展览'];
export const exhibitionTiers=['待评估','A大型展','B中型展','C小型展'];
export const classificationFields={category:'行业大类',exhibition_type:'展会类型',tier:'展会级别（系统评估）',tier_basis:'级别依据',tier_source_url:'级别依据来源',certification:'认证或官方认定',certification_url:'认证来源链接',source_platform:'采集来源平台',discovery_url:'平台收录链接'};
export const tierGuide='A大型展：当届或明确注明年份的历史届次≥1000家展商；B中型展：300–999家；C小型展：已核实1–299家。无可靠规模数据为待评估。级别是系统筛选参考，不是官方评级；历史规模不代表下一届实际规模。认证单独记录并须提供依据链接。';
export const exhibitionSources=[['中国贸促会展览公共服务网','https://exhibition.ccpit.org','官方出展目录'],['和展网 AndExpo','https://www.andexpo.com/','国内及历史展会'],['云展网','https://www.yunfair.com/','国内展会线索'],['全球会展网','https://fair.ccn.com/','工业及综合线索'],['会展中国','https://expo.ce.cn/','会展资讯'],['10times','https://10times.com/','全球展会线索'],['EventsEye','https://www.eventseye.com/','全球行业及地区目录'],['TradeFairDates','https://www.tradefairdates.com/','展期与场馆目录'],['AUMA','https://www.auma.de/','展会统计与德国展会'],['UFI','https://www.ufi.org/','认证核实来源']];
export function validateClassification(row){
 for(const [key,values] of [['category',exhibitionCategories],['exhibition_type',exhibitionTypes],['tier',exhibitionTiers]]){if(row[key]&&!values.includes(row[key]))throw Error('分类值无效：'+classificationFields[key]);}
 if(row.tier&&row.tier!=='待评估'&&(!row.tier_basis||!row.tier_source_url))throw Error('评定展会级别须填写依据和来源链接。');
 if(row.certification&&!row.certification_url)throw Error('认证或官方认定须提供来源链接。');return row;
}

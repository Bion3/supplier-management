// Business regions classify the supplier's registered location, not its service routes.
export const regions = ['东亚','东南亚','南亚','中亚','中东','欧洲','非洲','北美洲','拉丁美洲','大洋洲','其他'];
export const countries = [
 ['China','中国','东亚','CN'],['Japan','日本','东亚','JP'],['South Korea','韩国','东亚','KR'],['Mongolia','蒙古','东亚','MN'],
 ['Singapore','新加坡','东南亚','SG'],['Vietnam','越南','东南亚','VN'],['Thailand','泰国','东南亚','TH'],['Malaysia','马来西亚','东南亚','MY'],['Indonesia','印度尼西亚','东南亚','ID'],['Philippines','菲律宾','东南亚','PH'],
 ['India','印度','南亚','IN'],['Pakistan','巴基斯坦','南亚','PK'],['Bangladesh','孟加拉国','南亚','BD'],
 ['Kazakhstan','哈萨克斯坦','中亚','KZ'],['Uzbekistan','乌兹别克斯坦','中亚','UZ'],['Kyrgyzstan','吉尔吉斯斯坦','中亚','KG'],['Tajikistan','塔吉克斯坦','中亚','TJ'],['Turkmenistan','土库曼斯坦','中亚','TM'],
 ['Iran','伊朗','中东','IR'],['Turkey','土耳其','中东','TR'],['United Arab Emirates','阿联酋','中东','AE'],['Saudi Arabia','沙特阿拉伯','中东','SA'],['Iraq','伊拉克','中东','IQ'],['Israel','以色列','中东','IL'],
 ['Poland','波兰','欧洲','PL'],['Germany','德国','欧洲','DE'],['Netherlands','荷兰','欧洲','NL'],['Belgium','比利时','欧洲','BE'],['France','法国','欧洲','FR'],['Italy','意大利','欧洲','IT'],['Spain','西班牙','欧洲','ES'],['Portugal','葡萄牙','欧洲','PT'],['United Kingdom','英国','欧洲','GB'],['Ireland','爱尔兰','欧洲','IE'],['Czechia','捷克','欧洲','CZ'],['Slovakia','斯洛伐克','欧洲','SK'],['Hungary','匈牙利','欧洲','HU'],['Austria','奥地利','欧洲','AT'],['Switzerland','瑞士','欧洲','CH'],['Sweden','瑞典','欧洲','SE'],['Norway','挪威','欧洲','NO'],['Denmark','丹麦','欧洲','DK'],['Finland','芬兰','欧洲','FI'],['Lithuania','立陶宛','欧洲','LT'],['Latvia','拉脱维亚','欧洲','LV'],['Estonia','爱沙尼亚','欧洲','EE'],['Romania','罗马尼亚','欧洲','RO'],['Bulgaria','保加利亚','欧洲','BG'],['Greece','希腊','欧洲','GR'],['Serbia','塞尔维亚','欧洲','RS'],['Croatia','克罗地亚','欧洲','HR'],['Slovenia','斯洛文尼亚','欧洲','SI'],['Belarus','白俄罗斯','欧洲','BY'],['Ukraine','乌克兰','欧洲','UA'],['Russia','俄罗斯','欧洲','RU'],
 ['United States','美国','北美洲','US'],['Canada','加拿大','北美洲','CA'],['Mexico','墨西哥','拉丁美洲','MX'],['Brazil','巴西','拉丁美洲','BR'],['Chile','智利','拉丁美洲','CL'],['Argentina','阿根廷','拉丁美洲','AR'],
 ['Egypt','埃及','非洲','EG'],['South Africa','南非','非洲','ZA'],['Morocco','摩洛哥','非洲','MA'],['Kenya','肯尼亚','非洲','KE'],['Australia','澳大利亚','大洋洲','AU'],['New Zealand','新西兰','大洋洲','NZ']
];
export function countryInfo(value='') {
 const text=String(value).trim().toLowerCase();
 const aliases={'czech republic':'Czechia','uk':'United Kingdom','usa':'United States','uae':'United Arab Emirates','prc':'China'};
 const key=(aliases[text]||text).toLowerCase();
 return countries.find(([name,label,,code])=>[name,label,code,`${label} / ${name}`].some(v=>v.toLowerCase()===key));
}
export function normalizeCountry(value='') {return countryInfo(value)?.[0]||String(value).trim();}
export function countryLabel(value='') {const info=countryInfo(value);return info?`${info[1]} / ${info[0]}`:value;}
export function supplierRegion(s) {return s.region||countryInfo(s.country)?.[2]||'';}

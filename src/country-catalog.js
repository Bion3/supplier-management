import {countrySeed} from './country-seed.js';
export const businessRegions=['东亚','东南亚','南亚','中亚','中东','欧洲','非洲','北美洲','拉丁美洲','大洋洲','其他'];
export const countryCatalog=countrySeed.map(r=>({...r}));
const listeners=[];
export function onCountryChange(fn){listeners.push(fn);}
export function setCountryCatalog(rows){countryCatalog.splice(0,countryCatalog.length,...rows);lookup=null;for(const fn of listeners)fn();}
const aliases={uk:'GB',usa:'US',uae:'AE',prc:'CN','czech republic':'CZ',czechia:'CZ','捷克':'CZ','阿联酋':'AE','沙特':'SA','russian federation':'RU','türkiye':'TR',turkiye:'TR','republic of korea':'KR'};
const en=new Intl.DisplayNames(['en'],{type:'region'}),zh=new Intl.DisplayNames(['zh-CN'],{type:'region'});
let lookup=null;
function indexCountries(){const index=new Map();for(const r of countryCatalog){for(const v of [r.iso2,r.iso3,r.name_zh,r.name_en,r.canonical_name,`${r.name_zh} / ${r.name_en}`,`${r.name_zh}/${r.name_en}`,en.of(r.iso2),zh.of(r.iso2),...(r.aliases||[])])if(v)index.set(String(v).trim().toLowerCase(),r);}for(const [alias,code] of Object.entries(aliases)){const r=countryCatalog.find(c=>c.iso2===code);if(r)index.set(alias,r);}return index;}
export function findCountry(value){if(!lookup)lookup=indexCountries();return lookup.get(String(value??'').trim().toLowerCase())||null;}
export function normalizeCountry(value){return findCountry(value)?.canonical_name||String(value??'').trim();}
export function countryLabel(value){const r=findCountry(value);return r?`${r.name_zh} / ${r.name_en}`:String(value??'');}
export function countryBusinessRegion(value){return findCountry(value)?.business_region||'';}
export function locationLabel(value){return findCountry(value)?countryLabel(value):String(value??'');}
export const regionTree=Object.fromEntries([...new Set(countrySeed.map(r=>r.region).filter(Boolean))].map(region=>[region,[...new Set(countrySeed.filter(r=>r.region===region).map(r=>r.subregion).filter(Boolean))]]));
export function validateCountry(value){const r={};for(const k of ['iso2','name_zh','name_en','iso3','numeric_code','dial_code','currency','currency_symbol','region','subregion','business_region','notes'])r[k]=String(value[k]??'').trim();
 for(const k of ['iso2','iso3','currency'])r[k]=r[k].toUpperCase();
 if(!/^[A-Z]{2}$/.test(r.iso2)||!r.name_zh||!r.name_en)throw Error('请填写两位国家代码及中英文名称');
 if(r.iso3&&!/^[A-Z]{3}$/.test(r.iso3))throw Error('ISO3 必须为三位字母');
 if(r.numeric_code&&!/^\d{3}$/.test(r.numeric_code))throw Error('数字编码必须为三位，保留前导零');
 if(r.currency&&!/^[A-Z]{3}$/.test(r.currency))throw Error('币种代码必须为三位字母');
 if(r.region&&!Object.hasOwn(regionTree,r.region))throw Error('请选择地理区域');
 if(r.subregion&&!(regionTree[r.region]||[]).includes(r.subregion))throw Error('子区域与地理区域不匹配');
 if(!businessRegions.includes(r.business_region))throw Error('请选择业务区域');
 r.aliases=[...new Set(String(value.aliases||'').split(/[\n,，;；]/).map(s=>s.trim()).filter(Boolean))];r.sort_order=Number(value.sort_order||0);if(!Number.isInteger(r.sort_order)||Math.abs(r.sort_order)>100000)throw Error('排序必须为 -100000 至 100000 的整数');
 r.enabled=value.enabled===true||value.enabled==='true';return r;
}

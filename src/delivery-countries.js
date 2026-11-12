// Canonical English values retain compatibility with existing supplier quotations.
const codes='HU BG DE PL CZ SK AT RO SI HR RS BA ME MK AL GR IT FR ES PT NL BE LU CH GB IE DK SE NO FI EE LV LT UA BY MD RU TR GE AM AZ KZ UZ TM KG TJ IR AF CN MN JP KR IN AE SA US CA AU NZ CY MT IS'.split(' ');
const en=new Intl.DisplayNames(['en'],{type:'region'}),zh=new Intl.DisplayNames(['zh-CN'],{type:'region'});
export const deliveryCountries=codes.map(code=>({code,value:en.of(code),label:zh.of(code)}));
export function normalizeCountry(value){const v=String(value??'').trim();return deliveryCountries.find(c=>[c.code,c.value,c.label,`${c.label} / ${c.value}`].some(s=>s.toLowerCase()===v.toLowerCase()))?.value||v;}
export function countryLabel(value){const v=normalizeCountry(value);const c=deliveryCountries.find(c=>c.value===v);return c?`${c.label} / ${c.value}`:v;}

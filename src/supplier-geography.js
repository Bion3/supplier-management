import {countryCatalog,onCountryChange,findCountry,countryBusinessRegion,businessRegions} from './country-catalog.js';
export {normalizeCountry,countryLabel} from './country-catalog.js';
export const regions=businessRegions;
export const countries=[];
function refresh(){countries.splice(0,countries.length,...countryCatalog.filter(r=>r.enabled).map(r=>[r.canonical_name,r.name_zh,r.business_region,r.iso2]));}refresh();onCountryChange(refresh);
export function countryInfo(value=''){const r=findCountry(value);return r?[r.canonical_name,r.name_zh,r.business_region,r.iso2]:undefined;}
export function supplierRegion(s){return countryBusinessRegion(s.country)||s.region||'';}

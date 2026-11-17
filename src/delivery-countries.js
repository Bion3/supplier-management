import {countryCatalog,onCountryChange} from './country-catalog.js';
export {normalizeCountry,countryLabel} from './country-catalog.js';
export const deliveryCountries=[];
function refresh(){deliveryCountries.splice(0,deliveryCountries.length,...countryCatalog.filter(r=>r.enabled).map(r=>({code:r.iso2,value:r.canonical_name,label:r.name_zh})));}refresh();onCountryChange(refresh);

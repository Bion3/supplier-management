export function pickupCities(quote={}){
 const raw=Array.isArray(quote.pickupPlaces)?quote.pickupPlaces:[quote.pickupPlace||''];
 return [...new Set(raw.flatMap(v=>String(v).split(/[,，、/;；\n]+/)).map(v=>v.trim()).filter(Boolean))];
}

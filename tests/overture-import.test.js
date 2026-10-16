import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeOverturePlace,parseOvertureText} from '../src/overture-import.js';
const id='99003ee6-e75b-4dd6-8a8a-53a5a716c50d';
const sample={id,names:{primary:'Example Freight GmbH'},taxonomy:{primary:'freight_forwarder'},websites:['https://example.com'],emails:['info@example.com'],phones:['+4930123456'],addresses:[{freeform:'Hamburg, Germany'}],sources:[{dataset:'sample',license:'ODbL'}]};
test('normalizes 2026 Overture Places schema',()=>{const a=normalizeOverturePlace(sample);assert.equal(a.id,id);assert.equal(a.name,'Example Freight GmbH');assert.equal(a.website,'https://example.com');assert.equal(a.category,'freight_forwarder');assert.equal(a.sources[0].license,'ODbL');});
test('GeoJSON feature collection supports properties and deduplication',()=>{const geo={type:'FeatureCollection',features:[{type:'Feature',properties:sample},{type:'Feature',properties:sample}]};const result=parseOvertureText(JSON.stringify(geo),'hamburg.geojson');assert.equal(result.rows.length,1);assert.equal(result.duplicate,1);});
test('NDJSON rejects missing identifiers and counts malformed leads',()=>{const result=parseOvertureText([JSON.stringify(sample),JSON.stringify({names:{primary:'Unknown'}})].join('\n'),'places.ndjson');assert.equal(result.rows.length,1);assert.equal(result.invalid,1);});
test('rejects arbitrary file extension',()=>assert.throws(()=>parseOvertureText('{}','x.xlsx'),/仅支持/));

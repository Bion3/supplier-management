import test from 'node:test';
import assert from 'node:assert/strict';
import {distance,normalize,parseGeoText,classify} from '../src/lead-map-model.js';
const id='11111111-2222-4333-8444-555555555555';
test('Haversine returns zero at center and realistic 50 km distances',()=>{
 assert.equal(distance(53.5511,9.9937,53.5511,9.9937),0);
 const km=distance(53.5511,9.9937,53.99,9.9937);
 assert.ok(km>48&&km<50);
});
test('GeoJSON geometry Point yields trusted coordinates',()=>{
 const row=normalize({type:'Feature',geometry:{type:'Point',coordinates:[10.002,53.56]},properties:{id,names:{primary:'Hamburg Freight GmbH'},taxonomy:{primary:'freight_forwarding_agency'}}},'file');
 assert.equal(row.lng,10.002);assert.equal(row.lat,53.56);assert.equal(row.type,'freight');
});
test('missing geometry never makes false zero-zero points',()=>{
 assert.equal(normalize({id,name:'No Coordinates'},'file'),null);
 assert.equal(normalize({id,name:'Broken',lat:111,lng:10},'file'),null);
});
test('import parser deduplicates coordinates and rejects invalid rows',()=>{
 const lines=[
 {id,name:'Hamburg Cargo',lat:53.6,lng:10,category:'freight_and_cargo_service'},
 {id,name:'Hamburg Cargo',lat:53.6,lng:10,category:'freight_and_cargo_service'},
 {id:'22222222-2222-4222-8222-222222222222',name:'Lost Coordinates'}
 ];
 const result=parseGeoText(lines.map(x=>JSON.stringify(x)).join('\n'),'x.ndjson');
 assert.equal(result.original,3);assert.equal(result.rows.length,1);assert.equal(result.missing,1);
});
test('industry search categories are distinct',()=>{
 assert.equal(classify({name:'Example Import Export',category:'import_export_service'}),'trade');
 assert.equal(classify({name:'Wholesale Supplies',category:'wholesaler'}),'wholesale');
 assert.equal(classify({name:'Baltic Spedition',category:''}),'freight');
});

test('map page ships complete Leaflet CSS locally and build has matching stylesheet asset',async()=>{
 const {readFile}=await import('node:fs/promises');
 const html=await readFile(new URL('../lead-map.html',import.meta.url),'utf8');
 const stylesheet=await readFile(new URL('../src/vendor/leaflet.css',import.meta.url),'utf8');
 assert.match(html,/href="\/src\/vendor\/leaflet\.css"/);
 assert.doesNotMatch(html,/href="https:\/\/unpkg\.com\/leaflet/);
 assert.match(stylesheet,/\.leaflet-tile\s*,/);
 assert.match(stylesheet,/\.leaflet-map-pane/);
 assert.ok(stylesheet.length>10000,'full vendor CSS not fallback-only');
});

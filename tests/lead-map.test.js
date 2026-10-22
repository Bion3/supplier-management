import test from 'node:test';
import assert from 'node:assert/strict';
import {distance,normalize,parseGeoText,classify,contactChannels,contactFilterMatches,contactPriority} from '../src/lead-map-model.js';
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

test('map normalization retains stored contacts and database row identity',()=>{
 const row=normalize({id,dbId:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  name:'Hamburg Forwarding GmbH',lat:53.55,lng:9.99,
  contacts:[{type:'email',value:'office@example.org',source_url:'https://example.org/contact'}],
  verification_status:'pending'},'database');
 assert.equal(row.dbId,'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
 assert.equal(row.contacts[0].value,'office@example.org');
 assert.equal(row.verificationStatus,'pending');
});
test('map HTML includes contact channels and explicit website verification',async()=>{
 const {readFile}=await import('node:fs/promises');
 const html=await readFile(new URL('../lead-map.html',import.meta.url),'utf8');
 const js=await readFile(new URL('../src/lead-map.js',import.meta.url),'utf8');
 assert.match(html,/<th>邮箱<\/th><th>电话<\/th><th>核实状态<\/th>/);
 assert.match(html,/id="map-verify"/);
 assert.match(js,/\/api\/lead-batch/);
 assert.match(js,/contacts,verification_status/);
});

test('contact-first sorting and absence filter reflect actual stored channels',()=>{
 const empty={contacts:[]};
 const email={contacts:[{type:'email',value:'sales@example.com'}]};
 const phone={contacts:[{type:'phone',value:'+49 40 1234567'}]};
 const both={contacts:[...email.contacts,...phone.contacts]};
 assert.deepEqual([empty,phone,email,both].map(contactPriority),[0,1,2,3]);
 assert.equal(contactFilterMatches(empty,'none'),true);
 assert.equal(contactFilterMatches(empty,'has_contact'),false);
 assert.equal(contactFilterMatches(email,'email'),true);
 assert.equal(contactFilterMatches(phone,'phone'),true);
 assert.equal(contactFilterMatches(both,'both'),true);
 assert.equal(contactFilterMatches(phone,'both'),false);
 assert.equal(contactChannels({contacts:[{type:'email',value:'nonsense'}]}).email,false);
});
test('map contact filter controls are present and default preserves all leads',async()=>{
 const {readFile}=await import('node:fs/promises');
 const html=await readFile(new URL('../lead-map.html',import.meta.url),'utf8');
 assert.match(html,/id="map-contact-filter"/);
 assert.match(html,/value="any" selected/);
 assert.match(html,/id="map-hide-no-contact"/);
 assert.match(html,/id="map-sort"/);
});

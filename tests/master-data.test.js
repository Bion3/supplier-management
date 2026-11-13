import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMaster,resolveLocation,locationChoices,masterMatches} from '../src/master-data-model.js';
const base={kind:'location',code:'cn-wuhan',name_zh:'武汉',name_en:'Wuhan',category:'city',country:'China',city:'武汉',roles:['origin','destination'],aliases:['武汉市'],enabled:true};
test('master data validates stable codes, roles and categories',()=>{
 assert.equal(validateMaster(base).code,'CN-WUHAN');
 assert.throws(()=>validateMaster({...base,code:'武汉'}));
 assert.throws(()=>validateMaster({...base,roles:[]}));
 assert.throws(()=>validateMaster({...base,category:'invented'}));
 assert.deepEqual(validateMaster({...base,aliases:'武汉市，武汉市\nWuhan City'}).aliases,['武汉市','Wuhan City']);
});
test('disabled locations and ambiguous aliases never auto-resolve',()=>{
 const rows=[base,{...base,code:'CN-OLD',enabled:false}];
 assert.equal(locationChoices(rows,'origin').length,1);
 assert.equal(resolveLocation(rows,'Wuhan','origin').code,'cn-wuhan');
 assert.equal(resolveLocation([...rows,{...base,code:'CN-OTHER'}],'武汉','origin'),null);
 assert.equal(resolveLocation(rows,'武汉','transit'),null);
 assert.equal(masterMatches(base,'china'),true);
});
test('charge definitions carry no rate amount and no location roles',()=>{
 const row=validateMaster({...base,kind:'charge',category:'customs',name_zh:'报关费',unit:'票',price:300});
 assert.deepEqual(row.roles,[]);assert.equal(row.country,'');assert.equal('price' in row,false);assert.equal(row.unit,'票');
});

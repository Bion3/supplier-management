import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {blankRental,validateRental,rentalVersion,latestRental} from '../src/container-rental-model.js';
import {prepareCostEnable} from '../src/cost-enable-model.js';
const row=()=>({id:'one',origin:'西安',destination:'汉堡',supplier_id:'supplier',status:'draft',quote:{...blankRental(),container:'40HQ',currency:'USD',price:1800}});
test('unknown supplier/currency/box remain draft and cannot activate',()=>{
 for(const key of ['supplier_id','currency','container','price']){const r=row();if(key==='supplier_id')r[key]=null;else r.quote[key]=key==='price'?null:'';validateRental(r);assert.throws(()=>rentalVersion(r,{status:'confirmed'}));}
});
test('versions retain source and rental conditions without modifying original',()=>{const r=row();r.quote.source={cell:'R1C10'};r.quote.lossAfterDays=90;r.quote.lossAmount=7500;r.quote.lossCurrency='USD';const next=rentalVersion(r,{status:'confirmed'});assert.equal(next.supersedes_id,'one');assert.deepEqual(next.quote,r.quote);next.quote.source.cell='other';assert.equal(r.quote.source.cell,'R1C10');assert.equal(latestRental([r,{...next,id:'two'}])[0].id,'two');});
test('bulk activation skips incomplete records',()=>{const a=row(),b=row();b.id='two';b.quote.currency='';const p=prepareCostEnable([a,b],'rental');assert.equal(p.ready.length,1);assert.equal(p.skipped.length,1);});
test('rental numeric and validity checks',()=>{for(const patch of [{freeDays:1.5},{overdueDaily:-1},{lossAmount:7500,lossCurrency:''},{validFrom:'2026-11-01',validUntil:'2026-10-31'}]){const r=row();Object.assign(r.quote,patch);assert.throws(()=>validateRental(r));}});
test('source matrix preserves all 110 prices and separates Xi’an uses',()=>{const data=JSON.parse(readFileSync(new URL('../database/container_rental_seed.json',import.meta.url)));const seed=data.entries.map(e=>({origin:e.origin,destination:e.destination,supplier_id:null,status:'draft',quote:{...data.quote,price:e.price,service:e.service,source:{...data.source,cell:e.cell}}}));assert.equal(seed.length,110);seed.forEach(validateRental);assert.equal(new Set(seed.map(r=>r.quote.source.cell)).size,110);const xa=seed.filter(r=>r.origin==='西安'&&r.destination==='汉堡');assert.deepEqual(xa.map(r=>[r.quote.service,r.quote.price]),[['整柜',1800],['拼箱',1700]]);assert(seed.every(r=>r.quote.freeDays===null&&r.quote.lossAfterDays===90&&r.quote.lossAmount===7500&&r.quote.lossCurrency==='USD'&&r.status==='draft'));});

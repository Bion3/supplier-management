import test from 'node:test';
import assert from 'node:assert/strict';
import {chinaDay,rangeStart,normalizeRun,dailyStats,isStale} from '../src/daily-dashboard-model.js';
test('Beijing day and timezone boundaries use UTC+8 not browser local timezone',()=>{
 assert.equal(chinaDay('2026-10-29T16:00:00Z'),'2026-10-30');
 assert.equal(rangeStart('today',new Date('2026-10-30T08:00:00Z')).toISOString(),'2026-10-29T16:00:00.000Z');
 assert.equal(rangeStart('7d',new Date('2026-10-30T08:00:00Z')).toISOString(),'2026-10-23T16:00:00.000Z');
});
test('real task families normalize status and workload correctly',()=>{
 const map=normalizeRun('map',{id:'a',city:'Hamburg',keyword:'freight',radius_km:50,status:'completed',processed:500,inserted:120,created_at:'2026-10-30T00:00:00Z'});
 const expo=normalizeRun('exhibition',{id:'b',status:'partial',scanned:30,added:8,started_at:'2026-10-30T00:00:00Z'});
 const enrich=normalizeRun('enrich',{id:'c',status:'running',added_count:2,checked_pages:3,started_at:'2026-10-30T00:00:00Z'});
 assert.equal(map.phase,'completed');assert.equal(expo.phase,'attention');assert.equal(enrich.phase,'running');
 assert.deepEqual(dailyStats([map,expo,enrich]),{total:3,running:1,completed:2,attention:1,leads:120,contacts:2});
 assert.equal(isStale(enrich,new Date('2026-10-30T05:01:00Z')),true);
});

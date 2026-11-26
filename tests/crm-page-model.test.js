import test from 'node:test';import assert from 'node:assert/strict';
import {crmViewFilters,mergeRows,pageRequest,pageCount} from '../src/crm-page-model.js';
test('key customer view ignores ordinary filters and the peer scope',()=>{
 const filters={query:'Bari',role:'同行',stage:'待开发',contact:'missing-email',priority:'high'};
 assert.deepEqual(crmViewFilters('key',filters),{focus:'key'});
 assert.deepEqual(crmViewFilters('all',filters),filters);
 assert.deepEqual(crmViewFilters('peers',{...filters,role:'直客'}),filters);
});
test('server page requests remain bounded and preserve literal filters',()=>{assert.deepEqual(pageRequest({query:"O'Reilly%_",stage:'待开发'},3,30),{p_filters:{query:"O'Reilly%_",stage:'待开发'},p_offset:60,p_limit:30});assert.equal(pageCount(61,30),3);assert.equal(pageCount(0,30),1);});
test('cross-page cache retains selection data and full details while updating current rows',()=>{const before=[{id:'a',notes:'keep detail',development_stage:'待开发'},{id:'b',company_name:'cross page'}];const next=mergeRows(before,[{id:'a',development_stage:'开发中'},{id:'c',company_name:'new page'}]);assert.equal(next.length,3);assert.equal(next[0].notes,'keep detail');assert.equal(next[0].development_stage,'开发中');assert.equal(before[0].development_stage,'待开发');assert.equal(next[1].company_name,'cross page');});

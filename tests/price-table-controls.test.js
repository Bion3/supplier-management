import test from 'node:test';
import assert from 'node:assert/strict';
import {CONTAINER_OPTIONS,containerChoices,equipmentChoices,validateBatchPriceTargets,buildBatchVersions} from '../src/price-table-controls.js';
import {fclVersion} from '../src/fcl-rail-model.js';
const rate=(id,currency='USD',unit='柜')=>({id,origin:'西安',destination:'汉堡',supplier_id:'supplier-1',status:'confirmed',quote:{price:9000,currency,unit,container:'40尺',equipment:'SOC',scope:'站到站',validFrom:'2026-11-01',validUntil:'2026-11-30',fees:[]}});
test('container options have fixed standard choices with temporary legacy compatibility',()=>{
 assert.deepEqual(CONTAINER_OPTIONS,['20尺','40尺','40HQ','45HQ','2×20尺']);
 assert.equal(containerChoices('40HQ').filter(([v])=>v==='40HQ').length,1);
 assert.equal(containerChoices('40尺冷柜').at(-1)[0],'40尺冷柜');
 assert.deepEqual(equipmentChoices('SOC').map(([v])=>v),['待确认','SOC','COC']);
});
test('batch price override refuses mixed currencies and units',()=>{
 assert.doesNotThrow(()=>validateBatchPriceTargets([rate('a'),rate('b')],10500));
 assert.throws(()=>validateBatchPriceTargets([rate('a'),rate('b','CNY')],10500),/币种/);
 assert.throws(()=>validateBatchPriceTargets([rate('a'),rate('b','USD','组')],10500),/计价单位/);
 assert.throws(()=>validateBatchPriceTargets([rate('a')],0),/单价/);
 assert.doesNotThrow(()=>validateBatchPriceTargets([rate('a'),rate('b','CNY','组')],null));
});
test('batch edits create draft versions and preserve original rate',()=>{
 const source=rate('rail-1');const before=structuredClone(source);
 const updated=buildBatchVersions([source],{container:'40HQ',equipment:'COC',price:12000,validUntil:'2026-11-30',supplier:''},fclVersion)[0];
 assert.equal(updated.supersedes_id,'rail-1');
 assert.equal(updated.status,'draft');
 assert.equal(updated.quote.container,'40HQ');
 assert.equal(updated.quote.equipment,'COC');
 assert.equal(updated.quote.price,12000);
 assert.deepEqual(source,before);
 assert.throws(()=>buildBatchVersions([source],{container:'40HQ',price:null,validFrom:'2026-12-01'},fclVersion),/有效期/);
});

import {costRouteGroup,filterCostRoutes} from '../src/price-table-controls.js';
test('route groups use destination, preserve unknowns and domestic categories',()=>{
 assert.equal(costRouteGroup({origin:'莫斯科',destination:'汉堡'}),'欧洲');
 assert.equal(costRouteGroup({destination:'明斯克'}),'俄罗斯 / 白俄罗斯');
 assert.equal(costRouteGroup({destination:'阿拉木图'}),'中亚');
 assert.equal(costRouteGroup({destination:'德黑兰'}),'伊朗 / 中东');
 assert.equal(costRouteGroup({destination:'未识别站'}),'其他 / 未归类');
 assert.equal(costRouteGroup({destination:'西安'},'trucking'),'国内运输');
});
test('route and station selection selects all matching supplier rows without changing costs',()=>{
 const rows=[rate('1'),rate('2'),{...rate('3'),origin:'郑州'},{...rate('4'),destination:'莫斯科'}];
 const snapshot=structuredClone(rows);
 assert.deepEqual(filterCostRoutes(rows,{group:'欧洲',origin:'西安'}).map(r=>r.id),['1','2']);
 assert.equal(filterCostRoutes(rows,{destination:'莫斯科'}).length,1);
 assert.equal(filterCostRoutes(rows,{}).length,4);
 assert.deepEqual(rows,snapshot);
});

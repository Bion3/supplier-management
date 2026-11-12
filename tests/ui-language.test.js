import test from 'node:test';
import assert from 'node:assert/strict';
import {translateUI} from '../src/ui-terms.js';
import {matchesRailClassification} from '../src/rail-classification.js';
test('UI terminology uses logistics English and standard Chinese names',()=>{
 assert.equal(translateUI('整箱铁路运费','zh-CN'),'整柜铁路运费');
 assert.equal(translateUI('  整箱铁路运费  ','en'),'  FCL Rail Freight  ');
 assert.equal(translateUI('时刻表','en'),'Scheduled Service');
 assert.equal(translateUI('有效期至','en'),'Valid Until');
});
test('unknown supplier terms and source text are preserved',()=>{
 for(const value of ['中国铁路物资有限公司','武汉','CNY 53088 /40HQ','T1 145USD/票'])assert.equal(translateUI(value,'en'),value);
});
test('translated labels leave canonical classification contracts intact',()=>{
 const row={quote:{trainType:'普线',direction:'去程',lineGroup:'欧线'}};
 assert.equal(translateUI(row.quote.trainType,'en'),'Standard Service');
 assert.equal(matchesRailClassification(row,{trainType:'普线',direction:'去程',lineGroup:'欧线'}),true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {contactAddedRange,contactAddedLabel} from '../src/crm-contact-dates.js';
test('daily ranges cross month and year boundaries and include exactly seven dates',()=>{
 assert.deepEqual(contactAddedRange('yesterday','','2026-11-01'),{contact_added_from:'2026-10-31',contact_added_to:'2026-10-31'});
 assert.deepEqual(contactAddedRange('week','','2027-01-02'),{contact_added_from:'2026-12-27',contact_added_to:'2027-01-02'});
 assert.deepEqual(contactAddedRange('date','2026-10-31','2026-11-02'),{contact_added_from:'2026-10-31',contact_added_to:'2026-10-31'});
 assert.deepEqual(contactAddedRange(''),{});
});
test('labels preserve historical additions and show the selected day instead of a newer addition',()=>{
 const dates=['2026-10-31','2026-11-02'];
 assert.equal(contactAddedLabel(dates,{},'2026-11-02'),'今日新增联系方式');
 assert.equal(contactAddedLabel(dates,contactAddedRange('date','2026-10-31'),'2026-11-02'),'新增联系方式 · 2026-10-31');
 assert.equal(contactAddedLabel([],{},'2026-11-02'),'');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {extractWebsiteContactsForTest} from '../server/lead-website-research.js';

test('extracts public mailto, tel and schema.org organization contacts with source links',()=>{
 const html=`<html><a href="mailto:sales@freight.example">Email</a><a href="tel:+49401234567">Call</a>
 <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","email":"info@freight.example","telephone":"+49 40 9876543","contactPoint":{"@type":"ContactPoint","email":"office@freight.example"}}</script></html>`;
 const c=extractWebsiteContactsForTest(html,'https://freight.example/kontakt');
 assert.ok(c.some(x=>x.type==='email'&&x.value==='sales@freight.example'));
 assert.ok(c.some(x=>x.type==='email'&&x.value==='info@freight.example'&&x.source_type==='official_website_structured_data'));
 assert.ok(c.some(x=>x.type==='phone'&&x.value==='+49401234567'));
 assert.ok(c.every(x=>x.source_url==='https://freight.example/kontakt'&&x.verification==='unverified'));
});
test('ignores invalid structured contact values',()=>{
 const html='<script type="application/ld+json">{"@type":"Organization","email":"not-an-email","telephone":"123"}</script>';
 assert.deepEqual(extractWebsiteContactsForTest(html,'https://freight.example'),[]);
});

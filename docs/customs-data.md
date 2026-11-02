# Customs data workspace

The customs page queries HMRC public importer activity and saves selected pages through the existing team-scoped directory ingestion RPC. It reuses `/api/discovery-search` with `source: HMRC`; no extra Vercel Function or database grants are required. The handler verifies the CRM team before requesting the fixed HMRC host, rejects redirects, and limits downloads to 2MB and 20 seconds. Captcha, rate-limit and access failures stop collection.

The HMRC source must exist in `freight_industry_directories` with code `HMRC`, enabled and collection mode `每日增量`; see the seed file. Existing directory automation can discover this source. The current UI performs collection on demand; it does not create a separate schedule.

`node scripts/resources/collect-hmrc.mjs 854143 2026 1` prints the first 50 enterprise/address groups. Subsequent pages use the final argument. Submit only the `entries` array to `freight_directory_ingest` using the caller's authenticated Supabase session. Existing RLS restricts all directory and CRM tables to the existing team. Do not use a service-role key in the browser.

Record unique activity months, full returned commodity descriptions, the original trade-registration address and source URLs. Source identity includes company, postcode, year and queried commodity, preserving different years and products. This is monthly trade activity, never a count of shipments. No trade partner country, value, quantity, Chinese sourcing or rail demand is inferred. UK trade registration does not establish that the enterprise's headquarters are in the UK. Matching by exact name and region is a preliminary CRM association; legal entity identity remains unconfirmed. Existing contacts, classifications and routes are preserved. Website contact collection requires separate public evidence and does not validate mailbox deliverability.

Validate with `node --test tests/hmrc.test.js`; the production build also runs these tests.

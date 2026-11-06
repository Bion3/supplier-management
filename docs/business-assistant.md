# Rule-based business assistant

`/assistant.html` runs in the existing authenticated static frontend. There is no model SDK, model API, new serverless function, model key, database migration or inference process.

Customer queries use the existing `freight_crm_page` RPC with the current user's JWT/RLS, up to 10 rows per country spelling. Supported keywords include country, development stage, contactable/missing email and ENF/WCA/WIFFA. Bilingual country counts remain separate because records may overlap; rendered companies are deduplicated. Importer/distributor classification is not inferred. Company links open existing CRM records.

Task summaries read the four existing task sources independently for today or the last seven China calendar days. Each source reads at most 101 rows to identify a 100-row display cap. Failed sources are reported as unavailable, not zero. The dashboard remains the detailed source for task errors. Cost questions link to the existing calculator and procurement workspace; no separate price calculation is added.

Six editable email templates (three purposes in Chinese/English) fill explicitly entered company, route and cargo fields. Drafts are kept in sessionStorage under the current user ID for the current browser tab. They can be copied, cleared and edited; nothing is sent or written to the email database. `assistant-model.js` contains the supported keywords and template text; `assistant-data.js` contains bounded read-only queries.

Website quick FAQ responses are maintained in `src/lib/businessAssistant.js` in the website repository. Shipment parsing and published-rate calculation retain their existing code paths. Unknown questions direct users to the normal quote/inquiry form.

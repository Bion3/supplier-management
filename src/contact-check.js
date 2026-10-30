// Only input clues affect this key; research output and contact edits do not.
export function contactClueKey(row){
 const sources=(row.source_evidence||[]).filter(e=>!e.checked_at&&!e.contact_check).map(e=>e.url||e.source_url||'').filter(Boolean).sort();
 return JSON.stringify([String(row.website||'').trim().replace(/\/$/,''),row.source_url||'',...sources]);
}
export function contactCheckMarker(row){return '[contact-check:'+encodeURIComponent(contactClueKey(row))+']';}
export function contactAlreadyChecked(row){return String(row.notes||'').includes(contactCheckMarker(row))||(row.source_evidence||[]).some(e=>e.contact_check===contactClueKey(row));}

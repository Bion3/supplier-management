export function classifyWebsiteError(error){
 const text=String(error||'');
 if(/certificat|self.signed|issuer|altnames|CERT_|证书/i.test(text))return 'tls_certificate';
 if(/getaddrinfo|EBUSY|ENOTFOUND|EAI_AGAIN|DNS|域名/i.test(text))return 'dns_error';
 if(/EPROTO|ssl3_|alert internal error|TLS/i.test(text))return 'tls_handshake';
 if(/timeout|timed out|超时|ETIMEDOUT/i.test(text))return 'timeout';
 if(/size limit|too large|过大|大小限制/i.test(text))return 'page_too_large';
 if(/HTTP (403|429)|robot|captcha|机器人|forbidden|限制访问/i.test(text))return 'access_restricted';
 if(/HTTP|网页未返回200/i.test(text))return 'http_error';
 if(/网站地址不符合安全访问要求|安全访问|内网/i.test(text))return 'unsafe_website';
 return 'site_unreachable';
}
export const contactOutcomeLabels={
 not_started:'尚未补全',in_progress:'正在检查',new_contacts:'已补全新联系方式',
 no_new_contacts:'已检查，无新增联系方式',dns_error:'域名 / DNS 故障',
 tls_certificate:'网站证书异常',tls_handshake:'TLS 连接异常',timeout:'网站超时',
 page_too_large:'网页内容过大',access_restricted:'网站限制访问',
 http_error:'HTTP 页面错误',unsafe_website:'网站地址需人工核实',
 site_unreachable:'网站无法读取',unclassified:'待进一步分类'};
export function orderUntriedLeads(rows){
 const missing=lead=>{
  const c=Array.isArray(lead.contacts)?lead.contacts:[];
  const email=c.some(x=>x.type==='email'&&x.value);
  const phone=c.some(x=>x.type==='phone'&&x.value);
  return Number(!email)+Number(!phone);
 };
 return rows.filter(x=>x.website?.startsWith('https://')&&x.review_status!=='rejected'&&!x.crm_company_id)
 .sort((a,b)=>Number(Boolean(a.enrichment_checked_at||a.enrichment_result_category))-Number(Boolean(b.enrichment_checked_at||b.enrichment_result_category))||
  missing(b)-missing(a));
}

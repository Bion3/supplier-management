import {normalizeCountry,countryLabel,supplierRegion,regions} from './supplier-geography.js';
export const STORAGE_KEY = 'supplier-hub:v1';
export const categories = ['铁路运输', '公路运输', '仓储服务', '清关服务', '综合物流', '其他'];
export const statuses = ['待评估', '合作中', '暂停合作'];
export function validateSupplier(input) {
  const limits = {name:120, contact:60, phone:40, email:120, routes:240, notes:1000, country:80, region:40, city:120};
  const result = {};
  for (const [key, max] of Object.entries(limits)) {
    result[key] = String(input[key] ?? '').trim();
    if (result[key].length > max) throw new Error(`${key} 超出长度限制`);
  }
  if (!result.name || !result.contact) throw new Error('请填写公司名称和联系人。');
  if (result.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) throw new Error('请输入有效的邮箱地址。');
  if (!categories.includes(input.category) || !statuses.includes(input.status)) throw new Error('供应商类别或合作状态无效。');
  result.country=normalizeCountry(result.country);
  result.region=supplierRegion(result);
  if(result.region&&!regions.includes(result.region)) throw new Error('请选择有效的区域分类。');
  return {...result, category:input.category, status:input.status};
}
export function decodeSuppliers(raw) {
  if (!raw) return [];
  const data = JSON.parse(raw);
  if (data.version !== 1 || !Array.isArray(data.suppliers)) throw new Error('数据格式无效');
  const ids = new Set();
  return data.suppliers.map(s => {
    if (typeof s.id !== 'string' || !s.id || ids.has(s.id) || !Number.isFinite(Date.parse(s.createdAt)) || !Number.isFinite(Date.parse(s.updatedAt))) throw new Error('供应商数据无效');
    ids.add(s.id);
    return {...validateSupplier(s), id:s.id, createdAt:s.createdAt, updatedAt:s.updatedAt};
  });
}
export function encodeSuppliers(suppliers) { return JSON.stringify({version:1,suppliers}); }
export function filterSuppliers(suppliers, query='', status='', geography={}) {
  const q = query.trim().toLocaleLowerCase();
  return suppliers.filter(s => (!status || s.status === status) && (!geography.region || supplierRegion(s)===geography.region) && (!geography.country || normalizeCountry(s.country)===normalizeCountry(geography.country)) && [s.name,s.contact,s.routes,s.category,s.phone,s.email,countryLabel(s.country),s.city,supplierRegion(s)].some(v => String(v||'').toLocaleLowerCase().includes(q)));
}

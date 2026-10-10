import {STORAGE_KEY, validateSupplier, decodeSuppliers, encodeSuppliers, filterSuppliers} from './suppliers.js';
const $ = id => document.getElementById(id);
let suppliers = [], editingId = null, storageReadable = true;
try { suppliers = decodeSuppliers(localStorage.getItem(STORAGE_KEY)); }
catch { storageReadable = false; $('notice').textContent = '本地数据读取失败。为保护原始数据，已停用保存；请检查浏览器存储或联系维护人员。'; }
function cell(text) { const td = document.createElement('td'); td.textContent = text; return td; }
function render() {
  $('total').textContent = suppliers.length;
  $('active').textContent = suppliers.filter(s => s.status === '合作中').length;
  $('pending').textContent = suppliers.filter(s => s.status === '待评估').length;
  const visible = filterSuppliers(suppliers, $('search').value, $('filter').value);
  $('count').textContent = `显示 ${visible.length} 条`;
  $('rows').replaceChildren();
  for (const s of visible) {
    const tr = document.createElement('tr');
    const name = cell(s.name), category = document.createElement('small'); category.textContent = s.category; name.append(category);
    const contact = cell(s.contact), detail = document.createElement('small'); detail.textContent = [s.phone, s.email].filter(Boolean).join(' · ') || '未填写联系方式'; contact.append(detail);
    const status = cell(''), badge = document.createElement('span'); badge.className = `badge ${s.status === '合作中' ? 'green' : ''}`; badge.textContent = s.status; status.append(badge);
    const action = cell(''), button = document.createElement('button'); button.className = 'secondary'; button.textContent = '编辑'; button.setAttribute('aria-label', `编辑 ${s.name}`); button.addEventListener('click', () => openEditor(s)); action.append(button);
    tr.append(name, contact, cell(s.routes || '—'), status, action); $('rows').append(tr);
  }
  $('empty').hidden = visible.length > 0;
  $('empty').textContent = suppliers.length ? '没有匹配的供应商，请调整搜索条件。' : '暂无供应商，点击“新增供应商”开始录入。';
}
function openEditor(s) {
  editingId = s?.id ?? null; $('supplier-form').reset(); $('form-error').textContent = '';
  $('form-title').textContent = s ? '编辑供应商' : '新增供应商';
  if(s) for(const [key, value] of Object.entries(s)) { const field = $('supplier-form').elements.namedItem(key); if(field) field.value = value; }
  $('editor').showModal();
}
$('add').addEventListener('click', () => openEditor());
for(const id of ['close','cancel']) $(id).addEventListener('click', () => $('editor').close());
$('search').addEventListener('input', render); $('filter').addEventListener('change', render);
$('supplier-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    if (!storageReadable) throw new Error('本地数据无法读取，暂不能保存。');
    const data = validateSupplier(Object.fromEntries(new FormData(event.currentTarget)));
    const now = new Date().toISOString(), existing = suppliers.find(s => s.id === editingId);
    const supplier = {...data, id:existing?.id ?? crypto.randomUUID(), createdAt:existing?.createdAt ?? now, updatedAt:now};
    const next = existing ? suppliers.map(s => s.id === editingId ? supplier : s) : [supplier, ...suppliers];
    try { localStorage.setItem(STORAGE_KEY, encodeSuppliers(next)); } catch { throw new Error('保存失败：浏览器存储不可用或空间不足，请保留表单内容后重试。'); }
    suppliers = next; render(); $('editor').close(); $('notice').textContent = '供应商已保存。';
  } catch(error) { $('form-error').textContent = error.message; }
});
render();

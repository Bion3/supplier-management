export function websiteQuoteDraft(selected, snapshotId = null) {
  if (!selected?.result?.complete) throw Error('费用未完整，不能发布官网价格');
  const input = selected.inputs;
  const quantity = input.transport === 'lcl' ? selected.result.railQty : input.quantity;
  if (!Number.isFinite(quantity) || quantity <= 0) throw Error('官网计价数量无效');
  const range = input.webRange ?? 5;
  if (!Number.isFinite(range) || range < 0 || range > 30) throw Error('官网价格区间须为0–30%');
  if (!Number.isFinite(input.webMinimum) || input.webMinimum < 0) throw Error('官网最低收费须为非负数');
  const unitPrice = selected.result.price / quantity;
  return {
    origin: input.origin,
    station: input.station || null,
    destination: input.destination,
    transport: input.transport,
    service_scope: input.scope || 'door',
    container: input.transport === 'fcl' ? input.box : null,
    currency: 'USD',
    unit: input.transport === 'lcl' ? 'billable_cbm' : 'container',
    unit_price_low: Number((unitPrice * (1 - range / 100)).toFixed(2)),
    unit_price_high: Number((unitPrice * (1 + range / 100)).toFixed(2)),
    minimum_charge: input.webMinimum,
    ratio: input.transport === 'lcl' ? (input.railUnitCost?.ratio || input.railRatio || 500) : null,
    valid_from: input.date || null,
    valid_until: input.webValidUntil || null,
    status: 'draft',
    public_note: 'Indicative rail price. Final quotation is subject to cargo, schedule, customs and delivery confirmation.',
    pricing_meta: {
      profitMode: input.profitMode,
      profit: input.profit,
      cost: selected.result.cost,
      targetPrice: selected.result.price,
      rangePercent: range,
    },
    source_snapshot_id: snapshotId,
  };
}

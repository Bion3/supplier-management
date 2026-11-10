import {bookingTotals,type Booking} from './booking-form';
export type Fee={name:string;qty:number;price:number;currency?:string};
export type Order={booking:Booking;id:string;ref:string;customer:string;destination:string;origin:string;cargo:string;pieces:number;weight:number;volume:number;date:string;status:string;owner:string;todo:string;fees:Fee[];logs?:string[];version?:number};
export const bookingForOrder=(o:Order)=>o.booking;
export function orderPatch(b:Booking){const t=bookingTotals(b);return {booking:structuredClone(b),customer:b.customer,ref:b.reference,origin:b.origin,destination:b.destination,cargo:b.cargo.map(r=>r.cn||r.en).filter(Boolean).join(' / ')||'待补充',pieces:t.pieces,weight:t.weight,volume:Number(t.volume.toFixed(3)),date:b.departureDate}}

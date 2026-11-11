// Business date follows the team's China timezone, independent of the browser timezone.
export function newOrderNumber(now=new Date(),uuid=crypto.randomUUID()){
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now).replaceAll('-','');
 const code=(BigInt('0x'+uuid.replaceAll('-','').slice(0,12))%2176782336n).toString(36).toUpperCase().padStart(6,'0');
 return `Eurasiago-${date.slice(2)}-${code}`;
}

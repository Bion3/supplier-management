// Business date follows the team's China timezone, independent of the browser timezone.
export function newOrderNumber(now=new Date(),uuid=crypto.randomUUID()){
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now).replaceAll('-','');
 return `Eurasiago-${date}-${uuid.replaceAll('-','').slice(0,16).toUpperCase()}`;
}

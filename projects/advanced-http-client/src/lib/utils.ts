import { HttpHeaders, HttpParams } from '@angular/common/http';

export function toHeaders(h?:Record<string,string>|HttpHeaders):HttpHeaders|undefined{
  if(!h)return undefined;return h instanceof HttpHeaders?h:new HttpHeaders(h);
}
export function toParams(p?:Record<string,any>|HttpParams):HttpParams|undefined{
  if(!p)return undefined;if(p instanceof HttpParams)return p;let hp=new HttpParams();Object.entries(p).forEach(([k,v])=>{if(v===null||v===undefined)return;hp=hp.set(k,String(v));});return hp;
}
export function backoffDelay(attempt:number,base:number,type:'linear'|'exponential'|'jitter',max?:number):number{
  let d=base;if(type==='linear')d=base*attempt;else if(type==='exponential')d=base*Math.pow(2,attempt-1);else d=base*Math.pow(2,attempt-1)+Math.floor(Math.random()*base);
  return max?Math.min(d,max):d;
}
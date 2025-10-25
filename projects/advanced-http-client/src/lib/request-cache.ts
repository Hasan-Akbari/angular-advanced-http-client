export class MemoryCache<T>{
  private map=new Map<string,{value:T;expiresAt:number}>();
  set(key:string,value:T,durationMs:number){this.map.set(key,{value,expiresAt:Date.now()+durationMs});}
  get(key:string){const e=this.map.get(key);if(!e)return undefined;if(e.expiresAt<=Date.now()){this.map.delete(key);return undefined;}return e.value;}
  delete(key:string){this.map.delete(key);} 
  clear(){this.map.clear();}
  cleanup(){const now=Date.now();for(const [k,e] of this.map.entries())if(e.expiresAt<=now)this.map.delete(k);} 
  keys(){return Array.from(this.map.keys());}
}

export function stableStringify(obj:any):string{
  if(obj===null||obj===undefined)return String(obj);
  if(typeof obj!=='object')return JSON.stringify(obj);
  if(Array.isArray(obj))return `[${obj.map(stableStringify).join(',')}]`;
  const keys=Object.keys(obj).sort();
  return `{${keys.map(k=>`"${k}":${stableStringify(obj[k])}`).join(',')}}`;
}
import { ReplaySubject, Observable } from 'rxjs';
import { catchError } from 'rxjs/operators';

interface BatchBufferItem { payload:any; sub: ReplaySubject<any>; }
interface BatchBuffer { items: BatchBufferItem[]; timer?: any; opts: any; }

export class RequestBatcher{
  private buffers=new Map<string,BatchBuffer>();
  enqueue<T>(key:string,payload:any,options:any,perform:(combined:any,endpoint:string)=>Observable<any>,endpoint:string):Observable<T>{
    const buf=this.buffers.get(key)??{items:[],opts:{...options}};
    this.buffers.set(key,buf);
    const pKey=JSON.stringify(payload);
    const existing=buf.items.find(i=>JSON.stringify(i.payload)===pKey);
    if(existing)return existing.sub.asObservable();

    const sub=new ReplaySubject<T>(1);
    buf.items.push({payload,sub});

    const size=options.size??10;
    const intervalMs=options.intervalMs??50;
    const flush=()=>{const items=buf.items.splice(0,buf.items.length);clearTimeout((buf as any).timer);(buf as any).timer=undefined;
      const payloads=items.map(i=>i.payload);
      const combined=(options.combine??((arr:any[])=>arr))(payloads);
      const ep=options.endpoint??endpoint;
      perform(combined,ep).pipe(
        catchError(err=>{items.forEach(i=>i.sub.error(err));throw err;})
      ).subscribe(resp=>{
        items.forEach((i,idx)=>{const selector=options.selector??((r:any,_p:any,ix:number)=>Array.isArray(r)?r[ix]:r);
          try{i.sub.next(selector(resp,i.payload,idx));i.sub.complete();}catch(e){i.sub.error(e);}
        });
      });
    };
    const anyBuf=buf as any;
    if(buf.items.length>=size)flush();else{if(anyBuf.timer)clearTimeout(anyBuf.timer);anyBuf.timer=setTimeout(flush,intervalMs);} 
    return sub.asObservable();
  }
}
import { Observable, defer, from } from 'rxjs';
import { switchMap, finalize } from 'rxjs/operators';

export class RequestQueue{
  private active=0;
  private waiting:Array<{pr:number;resolve:()=>void}>=[];
  constructor(private concurrency:number=4){}
  private priorityToNumber(p:'high'|'normal'|'low'='normal'){return p==='high'?3:p==='normal'?2:1;}
  private acquire(priority:'high'|'normal'|'low'='normal'):Promise<void>{
    if(this.active<this.concurrency){this.active++;return Promise.resolve();}
    return new Promise<void>(resolve=>{this.waiting.push({pr:this.priorityToNumber(priority),resolve});this.waiting.sort((a,b)=>b.pr-a.pr);});
  }
  private release(){if(this.waiting.length>0){const next=this.waiting.shift();next?.resolve();}else{this.active=Math.max(0,this.active-1);}}
  execute<T>(factory:()=>Observable<T>,priority:'high'|'normal'|'low'='normal',concurrency?:number):Observable<T>{
    if(concurrency&&concurrency!==this.concurrency)this.concurrency=concurrency;
    return defer(()=>from(this.acquire(priority)).pipe(switchMap(()=>factory().pipe(finalize(()=>this.release())))));
  }
}
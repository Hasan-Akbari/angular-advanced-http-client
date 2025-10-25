import { Component, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdvancedHttpClientService, SendOptions } from 'advanced-http-client';
import { Subscription, tap, forkJoin } from 'rxjs';
import { HttpParams, HttpHeaders } from '@angular/common/http';

@Component({
  selector:'app-http-demo',
  standalone:true,
  imports:[CommonModule],
  template:`
    <h2>HTTP Client Demo (JSONPlaceholder)</h2>
    <button (click)="loadItems()">Load Posts</button>
    <pre *ngIf="items()">{{items()|json}}</pre>

    <button (click)="createItem()">Create Post</button>
    <pre *ngIf="createResult()">{{createResult()|json}}</pre>

    <button (click)="batchUsers()">Batch Users (ids=1,2,3)</button>
    <pre *ngIf="batchResult()">{{batchResult()|json}}</pre>

    <button (click)="startQueue()">Start Queue (todos 1..5)</button>
    <pre *ngIf="queueLog().length">{{queueLog()|json}}</pre>

    <button (click)="queueParallel()">Queue Parallel (comments)</button>
    <pre *ngIf="parallelLog().length">{{parallelLog()|json}}</pre>

    <button (click)="debounceDemo()">Debounced Posts</button>
    <pre *ngIf="debounceResult()">{{debounceResult()|json}}</pre>

    <button (click)="rateLimitDemo()">Rate Limited Posts</button>
    <pre *ngIf="rateResults().length">{{rateResults()|json}}</pre>

    <button (click)="logVerboseDemo()">Verbose Log Demo</button>
    <pre *ngIf="logResult()">{{logResult()|json}}</pre>

    <button (click)="headersParamsDemo()">Headers/Params Demo</button>
    <pre *ngIf="headerParamsResult()">{{headerParamsResult()|json}}</pre>

    <button (click)="headDemo()">HEAD Request</button>
    <pre *ngIf="headOk()">{{{status:'HEAD ok'}|json}}</pre>

    <button (click)="cancelLong()">Cancel Long (comments)</button>
    <button (click)="rawNoOptions()">Raw Request (no options)</button>
    <pre *ngIf="rawResult()">{{rawResult()|json}}</pre>
  `
})
export class HttpDemoComponent implements OnDestroy{
  private subs:Subscription[]=[];
  items=signal<any>(null);
  createResult=signal<any>(null);
  batchResult=signal<any>(null);
  queueLog=signal<any[]>([]);
  parallelLog=signal<any[]>([]);
  debounceResult=signal<any>(null);
  rateResults=signal<any[]>([]);
  logResult=signal<any>(null);
  headerParamsResult=signal<any>(null);
  headOk=signal<boolean>(false);
  rawResult=signal<any>(null);

  constructor(private client:AdvancedHttpClientService){}

  loadItems(){
    const sub=this.client.get<any>('https://jsonplaceholder.typicode.com/posts',{_limit:10,_page:1},{cacheDurationMs:30000,debounceMs:200,rateLimitMs:500,log:{enabled:true,level:'basic'}}).subscribe(r=>this.items.set(r));
    this.subs.push(sub);
  }

  createItem(){
    const sub=this.client.post<any>('https://jsonplaceholder.typicode.com/posts',{title:'new post',body:'demo content',userId:1},{retry:{attempts:3,backoff:'exponential',baseDelayMs:300,maxDelayMs:2000},timeoutMs:10000,log:{enabled:true,level:'verbose'}}).subscribe(r=>this.createResult.set(r));
    this.subs.push(sub);
  }

  batchUsers(){
    const o: SendOptions<any>={method:'GET',batch:{enabled:true,key:'users-batch',size:10,intervalMs:25,combine:(arr:any[])=>arr.map(p=>p.id),selector:(resp:any[],payload:any)=>resp.find(u=>u.id===payload.id)}};
    const r1$=this.client.send<any>('https://jsonplaceholder.typicode.com/users',{id:1},o);
    const r2$=this.client.send<any>('https://jsonplaceholder.typicode.com/users',{id:2},o);
    const r3$=this.client.send<any>('https://jsonplaceholder.typicode.com/users',{id:3},o);
    const sub=forkJoin([r1$,r2$,r3$]).subscribe(([a,b,c])=>this.batchResult.set([a,b,c]));
    this.subs.push(sub);
  }

  startQueue(){
    const log:any[]=[];this.queueLog.set(log);
    [1,2,3,4,5].forEach(i=>{
      const sub=this.client.get<any>(`https://jsonplaceholder.typicode.com/todos/${i}`,{},{queue:{enabled:true,mode:'sequential',priority:i===5?'high':'normal'}}).pipe(tap(()=>log.push(`done ${i}`))).subscribe();
      this.subs.push(sub);
    });
  }

  queueParallel(){
    const log:any[]=[];this.parallelLog.set(log);
    [1,2,3,4].forEach(postId=>{
      const sub=this.client.get<any[]>('https://jsonplaceholder.typicode.com/comments',{postId,_limit:3},{queue:{enabled:true,mode:'parallel',concurrency:2,priority:'high'}}).pipe(tap(()=>log.push(`par ${postId}`))).subscribe();
      this.subs.push(sub);
    });
  }

  debounceDemo(){
    const sub=this.client.get<any[]>('https://jsonplaceholder.typicode.com/posts',{q:'angular'},{debounceMs:300,log:{enabled:true,level:'basic'}}).subscribe(r=>this.debounceResult.set(r));
    this.subs.push(sub);
  }

  rateLimitDemo(){
    const arr:any[]=[];this.rateResults.set(arr);
    for(let i=0;i<3;i++){
      const sub=this.client.get<any[]>('https://jsonplaceholder.typicode.com/posts',{_limit:1,_page:i+1},{rateLimitMs:1000}).pipe(tap(r=>arr.push(r))).subscribe();
      this.subs.push(sub);
    }
  }

  logVerboseDemo(){
    const sub=this.client.get<any[]>('https://jsonplaceholder.typicode.com/posts',{_limit:3},{log:{enabled:true,level:'verbose',sendToServer:(log:any)=>console.log('sendLog',log)},debug:true}).subscribe(r=>this.logResult.set(r));
    this.subs.push(sub);
  }

  headersParamsDemo(){
    const params=new HttpParams().set('_limit','5').set('_page','2');
    const headers=new HttpHeaders({'X-Mode':'demo'});
    const sub=this.client.send<any[]>('https://jsonplaceholder.typicode.com/posts',undefined,{method:'GET',params,headers}).subscribe(r=>this.headerParamsResult.set(r));
    this.subs.push(sub);
  }

  headDemo(){
    const sub=this.client.head('https://jsonplaceholder.typicode.com/posts',{_limit:1}).subscribe({next:()=>this.headOk.set(true),error:()=>this.headOk.set(false)});
    this.subs.push(sub);
  }

  cancelLong(){
    const sub=this.client.get('https://jsonplaceholder.typicode.com/comments',{}, {timeoutMs:5000}).subscribe({next:()=>{},error:()=>{}});
    setTimeout(()=>sub.unsubscribe(),1000);
    this.subs.push(sub);
  }

  rawNoOptions(){
    const sub=this.client.get<any>('https://jsonplaceholder.typicode.com/posts/1',{}, {raw:true}).subscribe(r=>this.rawResult.set(r));
    this.subs.push(sub);
  }

  ngOnDestroy(){this.subs.forEach(s=>s.unsubscribe());}
}
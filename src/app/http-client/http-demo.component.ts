import { Component, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdvancedHttpClientService, SendOptions } from 'advanced-http-client';
import { Subscription, tap, forkJoin } from 'rxjs';
import { HttpParams, HttpHeaders } from '@angular/common/http';

@Component({
  selector:'app-http-demo',
  standalone:true,
  imports:[CommonModule],
  styles:[`
    :host{display:block}
    .demo{padding:1.5rem 1rem;}
    .hero{text-align:center;margin-bottom:1rem;}
    .hero h2{margin:0;font-size:1.6rem}
    .hero p{margin:.25rem 0 0;color:#555}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1rem}
    .card{background:color-mix(in srgb, #ffffff 75%, transparent);backdrop-filter:blur(8px);border:1px solid rgba(0,0,0,.06);border-radius:16px;padding:1rem;box-shadow:0 4px 18px rgba(0,0,0,.06);transition:transform .2s ease,box-shadow .2s ease}
    .card:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(0,0,0,.12)}
    .card h3{margin:0 0 .25rem;font-size:1.15rem;color:#0f172a}
    .card p{margin:0 0 .75rem;color:#334155}
    .btn{border:none;background:linear-gradient(90deg,#F0060B,#CC26D5 60%,#7702FF);color:#fff;padding:.5rem .9rem;border-radius:10px;cursor:pointer;font-weight:600;letter-spacing:.2px}
    .btn:hover{filter:brightness(1.05)}
    .btn.ghost{background:transparent;color:#7702FF;border:1px solid #7702FF}
    .btn-row{display:flex;gap:.5rem}
    .details{margin-top:.5rem}
    .details pre{max-height:180px;overflow:auto;background:#0f0f15;color:#e6f3ff;padding:.5rem;border-radius:12px}
    .meta{margin-top:.5rem;font-size:.85rem;color:#475569}
  `],
  template:`
    <div class="demo">
      <header class="hero">
        <h2>AdvancedHttpClient Playground</h2>
        <p>Explore caching, queueing, batching, retry, and more.</p>
        <p style="margin-top:.25rem;color:#94a3b8">Open your browser’s Network tab to see the requests.</p>
      </header>

      <section class="grid">
        <article class="card">
          <h3>Load Posts</h3>
          <p>Cache + Debounce + Rate-limit</p>
          <button class="btn" (click)="loadItems()">Run</button>
          <div class="meta" *ngIf="items()"><span>{{ (items()?.length || 0) }} items</span></div>
          <details class="details" *ngIf="items()">
            <summary>Result</summary>
            <pre>{{ items() | json }}</pre>
          </details>
        </article>

        <article class="card">
          <h3>Create Post</h3>
          <p>Retry + Timeout + Verbose Log</p>
          <button class="btn" (click)="createItem()">Run</button>
          <div class="meta" *ngIf="createResult()"><span>id: {{ createResult()?.id }}</span></div>
          <details class="details" *ngIf="createResult()">
            <summary>Result</summary>
            <pre>{{ createResult() | json }}</pre>
          </details>
        </article>

        <article class="card">
          <h3>Batch Users</h3>
          <p>ids = 1,2,3</p>
          <button class="btn" (click)="batchUsers()">Run</button>
          <details class="details" *ngIf="batchResult()">
            <summary>Result</summary>
            <pre>{{ batchResult() | json }}</pre>
          </details>
        </article>

        <article class="card">
          <h3>Queue Sequential</h3>
          <p>Todos 1..5</p>
          <button class="btn" (click)="startQueue()">Run</button>
          <div class="meta" *ngIf="queueLog().length"><span>{{ queueLog().length }} done</span></div>
          <details class="details" *ngIf="queueLog().length">
            <summary>Log</summary>
            <pre>{{ queueLog() | json }}</pre>
          </details>
        </article>

        <article class="card">
          <h3>Queue Parallel</h3>
          <p>Concurrency = 2</p>
          <button class="btn" (click)="queueParallel()">Run</button>
          <div class="meta" *ngIf="parallelLog().length"><span>{{ parallelLog().length }} done</span></div>
          <details class="details" *ngIf="parallelLog().length">
            <summary>Log</summary>
            <pre>{{ parallelLog() | json }}</pre>
          </details>
        </article>

        <article class="card">
          <h3>Debounce</h3>
          <p>Search Posts</p>
          <button class="btn" (click)="debounceDemo()">Run</button>
          <details class="details" *ngIf="debounceResult()">
            <summary>Result</summary>
            <pre>{{ debounceResult() | json }}</pre>
          </details>
        </article>

        <article class="card">
          <h3>Rate-limit</h3>
          <p>3 requests, 1s spacing</p>
          <button class="btn" (click)="rateLimitDemo()">Run</button>
          <div class="meta" *ngIf="rateResults().length"><span>{{ rateResults().length }} results</span></div>
          <details class="details" *ngIf="rateResults().length">
            <summary>Results</summary>
            <pre>{{ rateResults() | json }}</pre>
          </details>
        </article>

        <article class="card">
          <h3>HEAD Request</h3>
          <p>Status only</p>
          <button class="btn" (click)="headDemo()">Run</button>
          <div class="meta" *ngIf="headOk()"><span>OK</span></div>
        </article>

        <article class="card">
          <h3>Cancel & Raw</h3>
          <p>Cancel long; Independent duplicate</p>
          <div class="btn-row">
            <button class="btn" (click)="cancelLong()">Cancel Long</button>
            <button class="btn ghost" (click)="rawNoOptions()">Raw Request</button>
          </div>
          <details class="details" *ngIf="rawResult()">
            <summary>Raw Result</summary>
            <pre>{{ rawResult() | json }}</pre>
          </details>
        </article>
      </section>
    </div>
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
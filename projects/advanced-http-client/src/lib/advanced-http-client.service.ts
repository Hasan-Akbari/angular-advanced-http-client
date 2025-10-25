import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, throwError, timer } from 'rxjs';
import { catchError, delay, finalize, retryWhen, scan, shareReplay, switchMap, timeout, tap } from 'rxjs/operators';
import { MemoryCache, stableStringify } from './request-cache';
import { RequestQueue } from './request-queue';
import { RequestBatcher } from './request-batcher';
import { toHeaders, toParams, backoffDelay } from './utils';
import { SendOptions, HttpMethod } from './types';

@Injectable({providedIn:'root'})
export class AdvancedHttpClientService{
  private cache=new MemoryCache<any>();
  private inflight=new Map<string,Observable<any>>();
  private lastSent=new Map<string,number>();
  private queue=new RequestQueue(4);
  private batcher=new RequestBatcher();
  private cleanupHandle=setInterval(()=>this.cache.cleanup(),60000);
  constructor(private http:HttpClient){}

  send<T=any>(endpoint:string,payload?:any,options:SendOptions<T>={}):Observable<T>{
    const method:HttpMethod=options.method??'GET';
    const body=options.body??(method==='GET'||method==='HEAD'||method==='OPTIONS'?undefined:payload);
    const paramsObj=options.params??{}; const params=toParams(paramsObj); const headers=toHeaders(options.headers);
    const cacheKey=`${method} ${endpoint} :: ${stableStringify({params:paramsObj,body})}`;
    const raw=!!options.raw;
    const inflightKey=!raw ? (options.batch?.enabled?`${cacheKey} :: payload=${stableStringify(payload)}`:cacheKey) : undefined;

    if(options.cacheDurationMs&&options.cacheDurationMs>0){const c=this.cache.get(cacheKey);if(c!==undefined)return of(c as T);} 
    if(!raw){const ex=this.inflight.get(inflightKey!);if(ex)return ex as Observable<T>;}

    const logEnabled=!!options.log?.enabled;const logLevel=options.log?.level??'basic';
    const log:any=logEnabled?{key:inflightKey??cacheKey,method,endpoint,startedAt:Date.now()}:undefined;

    let stream=this.http.request<T>(method,endpoint,{body,headers,params,observe:'body',responseType:'json'});
    if(options.timeoutMs){stream=stream.pipe(timeout(options.timeoutMs));}
    if(options.retry?.attempts){
      stream=stream.pipe(retryWhen(errs=>errs.pipe(
        scan((acc,err)=>{const attempts=options.retry?.attempts??0;const should=options.retry?.shouldRetry?.(err)??true;if(!should||acc>=attempts)throw err;return acc+1;},0),
        switchMap(attempt=>timer(backoffDelay(attempt,options.retry?.baseDelayMs??250,options.retry?.backoff??'exponential',options.retry?.maxDelayMs)))
      )));
    }
    stream=stream.pipe(
      tap(res=>{if(options.cacheDurationMs&&options.cacheDurationMs>0)this.cache.set(cacheKey,res,options.cacheDurationMs);
        if(logEnabled&&logLevel!=='none'){log.status='ok';log.finishedAt=Date.now();if(logLevel==='verbose')log.meta={size:JSON.stringify(res).length};options.log?.sendToServer?.(log);if(options.debug)console.debug('[HTTP]',log);} }),
      catchError(err=>{if(options.retry?.fallbackValue!==undefined){const fv=typeof options.retry.fallbackValue==='function'?(options.retry.fallbackValue as any)():options.retry.fallbackValue;return of(fv as T);} 
        if(logEnabled&&logLevel!=='none'){log.status='error';log.finishedAt=Date.now();log.error=err;options.log?.sendToServer?.(log);if(options.debug)console.error('[HTTP]',log);} return throwError(()=>err);} ),
      finalize(()=>{if(!raw&&inflightKey)this.inflight.delete(inflightKey);if(!raw)this.lastSent.set(cacheKey,Date.now());})
    );
    if(!raw){stream=stream.pipe(shareReplay({bufferSize:1,refCount:true}));}

    const debounceMs=options.debounceMs??0;const minIntervalMs=options.rateLimitMs??0;
    const last=this.lastSent.get(cacheKey)??0;const needDelay=minIntervalMs>0?Math.max(0,minIntervalMs-(Date.now()-last)):0;
    const totalDelay=Math.max(debounceMs,needDelay);

    const exec$=(options.queue?.enabled)?this.queue.execute(()=>stream,options.queue.priority??'normal',options.queue.concurrency??(options.queue.mode==='parallel'?4:1)):stream;
    let scheduled$:Observable<T>;
    if(totalDelay>0){
      scheduled$=timer(totalDelay).pipe(switchMap(()=>exec$ as Observable<T>));
    }else{scheduled$=exec$;}

    let out$:Observable<T>;
    if(options.batch?.enabled && !raw){
      const bKey=options.batch.key??`${method}:${endpoint}`;
      let batchStream = this.batcher.enqueue<T>(bKey,payload,options.batch,(combined,ep)=>{
        const epWithQuery=(method==='GET'||method==='HEAD'||method==='OPTIONS')&&Array.isArray(combined)
          ? `${ep}?${combined.map((v:any)=>`id=${encodeURIComponent(v)}`).join('&')}`
          : ep;
        const bodyForMethod=(method==='GET'||method==='HEAD'||method==='OPTIONS')?undefined:combined;
        return this.http.request<T>(method,epWithQuery,{body:bodyForMethod,headers,params,observe:'body',responseType:'json'});
      },endpoint);
      if(options.timeoutMs){batchStream=batchStream.pipe(timeout(options.timeoutMs));}
      out$=batchStream.pipe(shareReplay({bufferSize:1,refCount:true}));
    }else{out$=scheduled$;}

    if(!raw&&inflightKey){this.inflight.set(inflightKey,out$);} 
    return out$;
  }

  get<T>(endpoint:string,params?:Record<string,any>,options:Omit<SendOptions<T>,'method'|'params'>={}){return this.send<T>(endpoint,undefined,{...options,method:'GET',params});}
  post<T>(endpoint:string,body?:any,options:Omit<SendOptions<T>,'method'|'body'>={}){return this.send<T>(endpoint,body,{...options,method:'POST',body});}
  put<T>(endpoint:string,body?:any,options:Omit<SendOptions<T>,'method'|'body'>={}){return this.send<T>(endpoint,body,{...options,method:'PUT',body});}
  patch<T>(endpoint:string,body?:any,options:Omit<SendOptions<T>,'method'|'body'>={}){return this.send<T>(endpoint,body,{...options,method:'PATCH',body});}
  delete<T>(endpoint:string,body?:any,options:Omit<SendOptions<T>,'method'|'body'>={}){return this.send<T>(endpoint,body,{...options,method:'DELETE',body});}
  head<T>(endpoint:string,params?:Record<string,any>,options:Omit<SendOptions<T>,'method'|'params'|'body'>={}){return this.send<T>(endpoint,undefined,{...options,method:'HEAD',params});}
  options<T>(endpoint:string,params?:Record<string,any>,options:Omit<SendOptions<T>,'method'|'params'|'body'>={}){return this.send<T>(endpoint,undefined,{...options,method:'OPTIONS',params});}

  clearCacheByKey(method:HttpMethod,endpoint:string,paramsOrBody?:any){const key=`${method} ${endpoint} :: ${stableStringify(paramsOrBody??{})}`;this.cache.delete(key);} 
  clearCacheByEndpoint(endpoint:string){for(const k of this.cache.keys())if(k.includes(` ${endpoint} :: `))this.cache.delete(k);} 
  clearAllCache(){this.cache.clear();}
  ngOnDestroy(){clearInterval(this.cleanupHandle);} 
}
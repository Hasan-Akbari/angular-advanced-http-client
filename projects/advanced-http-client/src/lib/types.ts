import { HttpHeaders, HttpParams } from '@angular/common/http';

export type HttpMethod = 'GET'|'POST'|'PUT'|'PATCH'|'DELETE'|'HEAD'|'OPTIONS';

export interface RetryOptions<T=any> {
  attempts?: number;
  backoff?: 'linear'|'exponential'|'jitter';
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error:any)=>boolean;
  fallbackValue?: T | (()=>T);
}

export interface BatchOptions<T=any> {
  enabled?: boolean;
  key?: string;
  size?: number;
  intervalMs?: number;
  combine?: (payloads:any[])=>any;
  endpoint?: string;
  selector?: (combined:any, payload:any, index:number)=>T;
}

export interface QueueOptions {
  enabled?: boolean;
  mode?: 'sequential'|'parallel';
  concurrency?: number;
  priority?: 'high'|'normal'|'low';
}

export interface LogOptions {
  enabled?: boolean;
  level?: 'none'|'basic'|'verbose';
  sendToServer?: (log: HttpLog)=>void;
}

export interface SendOptions<T=any> {
  method?: HttpMethod;
  headers?: Record<string,string>|HttpHeaders;
  params?: Record<string,any>|HttpParams;
  body?: any;
  raw?: boolean; // when true, disable inflight dedup and shareReplay
  debounceMs?: number;
  rateLimitMs?: number;
  cacheDurationMs?: number;
  retry?: RetryOptions<T>;
  timeoutMs?: number;
  batch?: BatchOptions<T>;
  queue?: QueueOptions;
  debug?: boolean;
  log?: LogOptions;
}

export interface HttpLog {
  key: string;
  method: HttpMethod;
  endpoint: string;
  startedAt: number;
  finishedAt?: number;
  status?: 'ok'|'error';
  error?: any;
  meta?: any;
}
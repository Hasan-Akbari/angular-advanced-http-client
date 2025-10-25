import { TestBed, fakeAsync, tick, flushMicrotasks } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { HttpHeaders, HttpParams } from '@angular/common/http';
import { AdvancedHttpClientService } from './advanced-http-client.service';

describe('AdvancedHttpClientService', () => {
  let service: AdvancedHttpClientService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule]
    });
    service = TestBed.inject(AdvancedHttpClientService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    service.ngOnDestroy?.();
  });

  it('should dedup inflight GET and share result across subscribers', () => {
    const r1$ = service.get<any>('https://jsonplaceholder.typicode.com/posts/1');
    const r2$ = service.get<any>('https://jsonplaceholder.typicode.com/posts/1');
    const results: string[] = [];
    r1$.subscribe(() => results.push('r1'));
    r2$.subscribe(() => results.push('r2'));
    const req = httpMock.expectOne('https://jsonplaceholder.typicode.com/posts/1');
    expect(req.request.method).toBe('GET');
    req.flush({ id: 1 });
    expect(results).toEqual(['r1', 'r2']);
  });

  it('raw:true should bypass inflight dedup and shareReplay', () => {
    service.get<any>('https://jsonplaceholder.typicode.com/posts/1', {}, { raw: true }).subscribe();
    service.get<any>('https://jsonplaceholder.typicode.com/posts/1', {}, { raw: true }).subscribe();
    const reqs = httpMock.match(r => r.method === 'GET' && r.url === 'https://jsonplaceholder.typicode.com/posts/1');
    expect(reqs.length).toBe(2);
    reqs[0].flush({ id: 1 });
    reqs[1].flush({ id: 1 });
  });

  it('should use cache when cacheDurationMs is set', () => {
    const obs1 = service.get<any>('https://jsonplaceholder.typicode.com/posts/2', {}, { cacheDurationMs: 30000 });
    const obs2 = service.get<any>('https://jsonplaceholder.typicode.com/posts/2', {}, { cacheDurationMs: 30000 });
    let v1: any, v2: any;
    obs1.subscribe(v => v1 = v);
    const req = httpMock.expectOne('https://jsonplaceholder.typicode.com/posts/2');
    req.flush({ id: 2 });
    obs2.subscribe(v => v2 = v);
    // No new request due to cache
    httpMock.expectNone('https://jsonplaceholder.typicode.com/posts/2');
    expect(v1).toEqual({ id: 2 });
    expect(v2).toEqual({ id: 2 });
  });

  it('should debounce rapid calls and send single request after delay', fakeAsync(() => {
    const o = { debounceMs: 300 } as const;
    const r1$ = service.get<any>('https://jsonplaceholder.typicode.com/posts', { _limit: 1 }, o);
    const r2$ = service.get<any>('https://jsonplaceholder.typicode.com/posts', { _limit: 1 }, o);
    const r3$ = service.get<any>('https://jsonplaceholder.typicode.com/posts', { _limit: 1 }, o);
    let count = 0;
    r1$.subscribe(() => count++);
    r2$.subscribe(() => count++);
    r3$.subscribe(() => count++);
    // Before debounce time, no request should be fired
    httpMock.expectNone('https://jsonplaceholder.typicode.com/posts');
    tick(301);
    flushMicrotasks();
    const req = httpMock.expectOne(r => r.method === 'GET' && r.url === 'https://jsonplaceholder.typicode.com/posts');
    req.flush([{ id: 1 }]);
    expect(count).toBe(3);
  }));

  it('should rate limit subsequent calls', fakeAsync(() => {
    const o = { rateLimitMs: 1000 } as const;
    const r1$ = service.get<any>('https://jsonplaceholder.typicode.com/rl-comments', {}, o);
    r1$.subscribe();
    // First request fires immediately
    const req1 = httpMock.expectOne('https://jsonplaceholder.typicode.com/rl-comments');
    expect(req1.request.method).toBe('GET');
    req1.flush([{ id: 1 }]);
    // Now issue a subsequent call; it should be delayed by rateLimitMs since lastSent is set on finalize
    const r2$ = service.get<any>('https://jsonplaceholder.typicode.com/rl-comments', {}, o);
    r2$.subscribe();
    httpMock.expectNone('https://jsonplaceholder.typicode.com/rl-comments');
    tick(1000);
    flushMicrotasks();
    const req2 = httpMock.expectOne('https://jsonplaceholder.typicode.com/rl-comments');
    req2.flush([{ id: 2 }]);
  }));

  it('queue sequential should run one at a time', fakeAsync(() => {
    const o = { queue: { enabled: true, mode: 'sequential', priority: 'normal' } } as const;
    const log: string[] = [];
    service.get<any>('https://jsonplaceholder.typicode.com/todos/1', {}, o).subscribe(() => log.push('1'));
    service.get<any>('https://jsonplaceholder.typicode.com/todos/2', {}, o).subscribe(() => log.push('2'));
    service.get<any>('https://jsonplaceholder.typicode.com/todos/3', {}, o).subscribe(() => log.push('3'));
    flushMicrotasks();
    // Only the first request should start
    const req1 = httpMock.expectOne('https://jsonplaceholder.typicode.com/todos/1');
    httpMock.expectNone('https://jsonplaceholder.typicode.com/todos/2');
    httpMock.expectNone('https://jsonplaceholder.typicode.com/todos/3');
    req1.flush({ id: 1 });
    flushMicrotasks();
    const req2 = httpMock.expectOne('https://jsonplaceholder.typicode.com/todos/2');
    req2.flush({ id: 2 });
    flushMicrotasks();
    const req3 = httpMock.expectOne('https://jsonplaceholder.typicode.com/todos/3');
    req3.flush({ id: 3 });
    expect(log).toEqual(['1', '2', '3']);
  }));

  it('queue parallel with concurrency=2 should limit simultaneous requests', fakeAsync(() => {
    const o = { raw: true, queue: { enabled: true, mode: 'parallel', concurrency: 2, priority: 'high' } } as const;
    service.get<any>('https://jsonplaceholder.typicode.com/comments', {}, o).subscribe();
    service.get<any>('https://jsonplaceholder.typicode.com/comments', {}, o).subscribe();
    service.get<any>('https://jsonplaceholder.typicode.com/comments', {}, o).subscribe();
    flushMicrotasks();
    const initial = httpMock.match(r => r.method === 'GET' && r.url === 'https://jsonplaceholder.typicode.com/comments');
    expect(initial.length).toBe(2);
    initial[0].flush([{ id: 1 }]);
    initial[1].flush([{ id: 2 }]);
    flushMicrotasks();
    const next = httpMock.expectOne('https://jsonplaceholder.typicode.com/comments');
    next.flush([{ id: 3 }]);
  }));

  it('batching should combine payloads into single request and distribute responses', fakeAsync(() => {
    const o = {
      method: 'GET',
      batch: {
        enabled: true,
        key: 'users-batch',
        size: 10,
        intervalMs: 0,
        combine: (arr: any[]) => arr.map(p => p.id),
        selector: (resp: any[], payload: any) => resp.find(u => u.id === payload.id)
      }
    } as const;
    const r1$ = service.send<any>('https://jsonplaceholder.typicode.com/users', { id: 1 }, o as any);
    const r2$ = service.send<any>('https://jsonplaceholder.typicode.com/users', { id: 2 }, o as any);
    const r3$ = service.send<any>('https://jsonplaceholder.typicode.com/users', { id: 3 }, o as any);
    let vals: any[] = [];
    r1$.subscribe(v => vals.push(v));
    r2$.subscribe(v => vals.push(v));
    r3$.subscribe(v => vals.push(v));
    tick(0);
    const req = httpMock.expectOne(r => r.method === 'GET' && r.url.startsWith('https://jsonplaceholder.typicode.com/users'));
    expect(req.request.urlWithParams).toContain('id=1');
    expect(req.request.urlWithParams).toContain('id=2');
    expect(req.request.urlWithParams).toContain('id=3');
    req.flush([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(vals).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
  }));

  it('retry with fallback emits fallback after exhausted attempts', fakeAsync(() => {
    const o = { retry: { attempts: 2, backoff: 'exponential', baseDelayMs: 50, fallbackValue: { ok: true } } } as const;
    let val: any;
    service.get<any>('https://jsonplaceholder.typicode.com/posts', {}, o).subscribe(v => val = v);
    const req1 = httpMock.expectOne('https://jsonplaceholder.typicode.com/posts');
    req1.flush(null, { status: 500, statusText: 'Server Error' });
    tick(50); // retry #1 delay
    const req2 = httpMock.expectOne('https://jsonplaceholder.typicode.com/posts');
    req2.flush(null, { status: 500, statusText: 'Server Error' });
    tick(100); // retry #2 delay (exponential)
    // After second retry fails, a final third request is issued (attempts=2 => two retries after initial)
    const req3 = httpMock.expectOne('https://jsonplaceholder.typicode.com/posts');
    req3.flush(null, { status: 500, statusText: 'Server Error' });
    // Fallback should emit on error via catchError
    flushMicrotasks();
    expect(val).toEqual({ ok: true });
  }));

  it('timeout emits error when exceeded', fakeAsync(() => {
    let err: any;
    service.get<any>('https://jsonplaceholder.typicode.com/posts', {}, { timeoutMs: 10 }).subscribe({ error: e => err = e });
    httpMock.expectOne('https://jsonplaceholder.typicode.com/posts');
    tick(11);
    expect(err).toBeTruthy();
  }));

  it('HEAD request uses HEAD method', () => {
    service.head<any>('https://jsonplaceholder.typicode.com/posts').subscribe();
    const req = httpMock.expectOne('https://jsonplaceholder.typicode.com/posts');
    expect(req.request.method).toBe('HEAD');
    req.flush(null);
  });

  it('headers and params applied to request', () => {
    const params = new HttpParams().set('_limit', '5').set('_page', '2');
    const headers = new HttpHeaders({ 'X-Mode': 'demo' });
    service.send<any>('https://jsonplaceholder.typicode.com/posts', undefined, { method: 'GET', params, headers }).subscribe();
    const req = httpMock.expectOne('https://jsonplaceholder.typicode.com/posts?_limit=5&_page=2');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('_limit')).toBe('5');
    expect(req.request.params.get('_page')).toBe('2');
    expect(req.request.headers.get('X-Mode')).toBe('demo');
    req.flush([{ id: 1 }]);
  });

  it('log.sendToServer called on success when enabled', () => {
    const sendSpy = jasmine.createSpy('sendLog');
    service.get<any>('https://jsonplaceholder.typicode.com/posts', {}, { log: { enabled: true, level: 'basic', sendToServer: sendSpy } }).subscribe();
    const req = httpMock.expectOne('https://jsonplaceholder.typicode.com/posts');
    req.flush([{ id: 1 }]);
    expect(sendSpy).toHaveBeenCalled();
  });
});

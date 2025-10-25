# AdvancedHttpClient

کتابخانه AdvancedHttpClient یک سرویس HTTP پیشرفته برای Angular است که علاوه بر قابلیت‌های استاندارد، مجموعه‌ای از ویژگی‌های عملیاتی سطح‌بالا را به‌صورت شفاف ارائه می‌کند:

- کش حافظه‌ای با انقضا
- اشتراک نتیجه و جلوگیری از ارسال‌های هم‌زمان تکراری (inflight dedup)
- محدودسازی نرخ (Rate Limit) و دیبانس (Debounce)
- صف‌بندی درخواست‌ها (Sequential/Parallel) با کنترل هم‌زمانی و اولویت
- بچینگ درخواست‌ها با ترکیب payload و توزیع پاسخ‌ها
- Retry با backoff و fallback سفارشی
- Timeout و لاگینگ با قابلیت ارسال لاگ به سرور

این سرویس برای سناریوهای کلاینتی با تعداد زیاد درخواست، بهینه‌سازی شبکه و مدیریت بار را تسهیل می‌کند.

## نصب و استفاده

سرویس به‌صورت `providedIn: 'root'` ثبت شده و تنها کافیست آن را تزریق کنید:

```ts
import { Component } from '@angular/core';
import { AdvancedHttpClientService } from 'advanced-http-client';

@Component({
  selector: 'app-demo',
  template: '...'
})
export class DemoComponent {
  constructor(private http: AdvancedHttpClientService) {}

  ngOnInit() {
    this.http.get<any>('https://jsonplaceholder.typicode.com/posts', { _limit: 5 })
      .subscribe(console.log);
  }
}
```

## شروع سریع

- پارامترها و هِدرها:
```ts
import { HttpHeaders, HttpParams } from '@angular/common/http';

const params = new HttpParams().set('_limit', '5').set('_page', '2');
const headers = new HttpHeaders({ 'X-Mode': 'demo' });

http.send<any>('https://jsonplaceholder.typicode.com/posts', undefined, {
  method: 'GET', params, headers
}).subscribe();
```

- جلوگیری از تکرار هم‌زمان (inflight dedup) و اشتراک نتیجه:
```ts
// دو مشترک، یک درخواست؛ نتیجه shareReplay می‌شود
http.get<any>('https://jsonplaceholder.typicode.com/posts/1').subscribe();
http.get<any>('https://jsonplaceholder.typicode.com/posts/1').subscribe();
```

- حالت خام برای عبور از dedup/shareReplay:
```ts
http.get<any>('https://jsonplaceholder.typicode.com/posts/1', {}, { raw: true }).subscribe();
http.get<any>('https://jsonplaceholder.typicode.com/posts/1', {}, { raw: true }).subscribe();
// در این حالت ۲ درخواست مستقل ارسال می‌شود
```

## ویژگی‌ها و مثال‌ها

### کش حافظه‌ای
- ذخیره پاسخ و سرویس‌دهی از کش تا پایان مدت انقضا:
```ts
http.get('https://jsonplaceholder.typicode.com/posts/2', {}, { cacheDurationMs: 30000 }).subscribe();
```

### Debounce و Rate Limit
- Debounce برای ادغام فراخوانی‌های سریع؛ Rate Limit برای فاصله‌گذاری بین ارسال‌ها:
```ts
// تنها یک درخواست پس از 300ms
http.get('https://api.example.com/search', { q: 'ng' }, { debounceMs: 300 }).subscribe();

// درخواست دوم با فاصله حداقل 1000ms نسبت به تکمیل قبلی برنامه‌ریزی می‌شود
http.get('https://api.example.com/items', {}, { rateLimitMs: 1000 }).subscribe();
```
نکته فنی: معیار Rate Limit بر اساس «زمان آخرین تکمیل» محاسبه می‌شود؛ بدین معنی که فراخوانی‌های بعدی پس از finalize درخواست قبلی زمان‌بندی می‌گردند.

### صف‌بندی (Queue)
- Sequential: اجرای تک‌به‌تک
```ts
http.get('https://api.example.com/todos/1', {}, { queue: { enabled: true, mode: 'sequential', priority: 'normal' } }).subscribe();
http.get('https://api.example.com/todos/2', {}, { queue: { enabled: true, mode: 'sequential', priority: 'normal' } }).subscribe();
```

- Parallel با `concurrency`
```ts
http.get('https://api.example.com/comments', {}, { raw: true, queue: { enabled: true, mode: 'parallel', concurrency: 2, priority: 'high' } }).subscribe();
http.get('https://api.example.com/comments', {}, { raw: true, queue: { enabled: true, mode: 'parallel', concurrency: 2, priority: 'high' } }).subscribe();
http.get('https://api.example.com/comments', {}, { raw: true, queue: { enabled: true, mode: 'parallel', concurrency: 2, priority: 'high' } }).subscribe();
```
نکته: برای مشاهده دقیق کنترل هم‌زمانی، در تست/مثال از `raw:true` استفاده کنید تا dedup مانع ارسال‌های همسان نشود.

### بچینگ (Batch)
- ترکیب payloadها و توزیع پاسخ‌ها با `combine` و `selector`:
```ts
const batchOpts = {
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

const r1$ = http.send<any>('https://jsonplaceholder.typicode.com/users', { id: 1 }, batchOpts as any);
const r2$ = http.send<any>('https://jsonplaceholder.typicode.com/users', { id: 2 }, batchOpts as any);
const r3$ = http.send<any>('https://jsonplaceholder.typicode.com/users', { id: 3 }, batchOpts as any);

// سرویس برای روش‌های GET/HEAD/OPTIONS شناسه‌ها را به‌صورت query با کلید "id" ترکیب می‌کند
// مثال: .../users?id=1&id=2&id=3
r1$.subscribe(console.log);
r2$.subscribe(console.log);
r3$.subscribe(console.log);
```

### Retry و Fallback
- تلاش مجدد با backoff و fallback مقدار یا فانکشن:
```ts
http.get('https://jsonplaceholder.typicode.com/posts', {}, {
  retry: {
    attempts: 2,               // دو retry پس از درخواست اولیه
    backoff: 'exponential',    // یا 'linear'
    baseDelayMs: 50,
    maxDelayMs: 2000,
    shouldRetry: (err) => err.status >= 500,
    fallbackValue: { ok: true }
  }
}).subscribe(v => console.log('Result:', v));
```
نکته: با `attempts=2`، چرخه شامل درخواست اولیه + ۲ تلاش مجدد است؛ در صورت تداوم خطا، مقدار `fallbackValue` از مسیر `catchError` منتشر می‌شود.

### Timeout
```ts
http.get('https://jsonplaceholder.typicode.com/posts', {}, { timeoutMs: 10 })
  .subscribe({ error: e => console.error('Timeout:', e) });
```

### لاگینگ
- ارسال لاگ‌های موفق/ناموفق و سطح‌بندی:
```ts
http.get('https://jsonplaceholder.typicode.com/posts', {}, {
  log: {
    enabled: true,
    level: 'basic', // 'none' | 'basic' | 'verbose'
    sendToServer: (entry) => fetch('/log', { method: 'POST', body: JSON.stringify(entry) })
  },
  debug: true // چاپ در کنسول
}).subscribe();
```

## API Reference (خلاصه گزینه‌ها)

- `method`: یکی از `GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS`
- `params`: شیء ساده برای پارامترها (به `HttpParams` تبدیل می‌شود)
- `headers`: شیء ساده برای هدرها (به `HttpHeaders` تبدیل می‌شود)
- `body`: بدنه برای روش‌های غیر GET/HEAD/OPTIONS
- `raw`: عبور از dedup و shareReplay؛ هر فراخوانی یک درخواست مستقل
- `cacheDurationMs`: مدت اعتبار کش؛ پاسخ موفق در حافظه ذخیره می‌شود
- `debounceMs`: تأخیر برای ادغام فراخوانی‌های سریع
- `rateLimitMs`: حداقل فاصله بین تکمیل درخواست‌ها روی همان کلید
- `queue`: `{ enabled, mode: 'sequential'|'parallel', concurrency?, priority: 'low'|'normal'|'high' }`
- `batch`: `{ enabled, key, size, intervalMs, combine(arr), selector(resp, payload) }`
- `retry`: `{ attempts, backoff: 'exponential'|'linear', baseDelayMs, maxDelayMs?, shouldRetry?, fallbackValue }`
- `timeoutMs`: زمان‌سنج بر حسب میلی‌ثانیه
- `log`: `{ enabled, level, sendToServer? }`
- `debug`: فعال‌سازی لاگ کنسول در کنار `log`

## نکات فنی و بهترین‌عمل‌ها

- Dedup بر اساس کلید ترکیبی `method + endpoint + params/body` انجام می‌شود و با `shareReplay` نتیجه را با مشترکین به اشتراک می‌گذارد.
- `raw:true` تمام بهینه‌سازی‌های اشتراک/هم‌زمانی را دور می‌زند؛ برای سناریوهای خاص و تست‌ها استفاده کنید.
- در حالت GET/HEAD/OPTIONS با بچینگ، کلید `id` برای ترکیب query استفاده می‌شود؛ اگر نیاز به کلید دیگری دارید، `combine` و مسیر ساخت endpoint را سفارشی کنید.
- هنگامی‌که هر دو `debounceMs` و `rateLimitMs` تنظیم شده‌اند، تأخیر واقعی برابر با بزرگ‌ترین مقدار لازم است.
- کش حافظه‌ای درون‌فرآیند است و پایداری بلندمدت ندارد؛ برای پایداری خارج از حافظه، لایه‌ی ذخیره‌سازی جداگانه در نظر بگیرید.

## تست، بیلد و انتشار

- اجرای تست‌ها: `npx ng test advanced-http-client --watch=false --browsers=ChromeHeadless`
- بیلد: `npx ng build advanced-http-client`
- انتشار: پس از بیلد به مسیر `dist/advanced-http-client` بروید و `npm publish` اجرا کنید.

## لایسنس

این پروژه صرفاً نمونه‌ای برای نمایش الگوی کلاینت HTTP پیشرفته در Angular است. برای استفاده در محیط تولید، مطابق نیاز خود آن را سفارشی و ارزیابی کنید.

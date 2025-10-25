import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdvancedHttpClientComponent } from './advanced-http-client.component';

describe('AdvancedHttpClientComponent', () => {
  let component: AdvancedHttpClientComponent;
  let fixture: ComponentFixture<AdvancedHttpClientComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdvancedHttpClientComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(AdvancedHttpClientComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { AppComponent } from './app.component';
import { SessionStore } from './core/session.store';

describe('AppComponent', () => {
  it('uses runtime branding and omits users from the top navigation', async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    }).compileComponents();
    TestBed.inject(SessionStore).set({
      id: 1, householdId: 1, role: 'admin', username: 'Emiliano'
    }, 'csrf-token');
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne('api/v1/app-config').flush({
      siteName: 'Hub Corso Umberto'
    });
    fixture.detectChanges();

    const brand = fixture.nativeElement.querySelector('.brand') as HTMLAnchorElement;
    const navigation = fixture.nativeElement.querySelector('nav') as HTMLElement;
    expect(brand.textContent).toContain('Hub Corso Umberto');
    expect(brand.getAttribute('aria-label')).toBe('Hub Corso Umberto, home');
    expect(navigation.textContent).not.toContain('Utenti');
  });
});

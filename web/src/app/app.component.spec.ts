import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { AppComponent } from './app.component';
import { SessionStore } from './core/session.store';
import { AppUpdateService } from './core/app-update.service';

describe('AppComponent', () => {
  it('shows a dedicated update overlay and keeps its action safe during requests or offline use', async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    }).compileComponents();
    const fixture = TestBed.createComponent(AppComponent);
    const updates = TestBed.inject(AppUpdateService);
    const apply = vi.spyOn(updates, 'apply').mockImplementation(() => undefined);
    TestBed.inject(HttpTestingController).expectOne('api/v1/app-config').flush({ siteName: 'Life Hub' });
    updates.ready.set(true);
    fixture.componentInstance.online.set(true);
    fixture.detectChanges();

    const notice = fixture.nativeElement.querySelector('.app-update-notice') as HTMLElement;
    const button = notice.querySelector('button') as HTMLButtonElement;
    expect(notice.parentElement).toBe(fixture.nativeElement);
    expect(notice.closest('main')).toBeNull();
    expect(notice.classList.contains('offline')).toBe(false);
    expect(notice.textContent).toContain('salva eventuali modifiche');
    button.click();
    expect(apply).toHaveBeenCalledOnce();

    updates.beginRequest();
    fixture.detectChanges();
    expect(button.disabled).toBe(true);
    button.click();
    expect(apply).toHaveBeenCalledOnce();
    updates.endRequest();
    fixture.componentInstance.online.set(false);
    fixture.detectChanges();
    expect(button.disabled).toBe(true);
    fixture.destroy();
  });

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

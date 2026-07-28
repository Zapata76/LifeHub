import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { SessionStore } from '../core/session.store';
import { HomeComponent } from './home.component';

describe('HomeComponent', () => {
  it('renders household labels and exposes the canonical Admin card only to administrators', async () => {
    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [provideRouter([]), { provide: HttpClient, useValue: { get: () => of({
        homeEyebrow: 'Avviso famiglia', homeTitle: 'Casa Maugeri', version: 3,
        openTasks: 1, uncheckedShoppingItems: 2, upcomingMeals: 0, activeGoals: 1
      }) } }]
    }).compileComponents();
    TestBed.inject(SessionStore).set({ id: 1, householdId: 1, role: 'admin', username: 'Emiliano' }, 'csrf');
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.hero .eyebrow').textContent).toContain('Avviso famiglia');
    expect(fixture.nativeElement.querySelector('.hero h1').textContent).toContain('Casa Maugeri');
    const adminCard = Array.from(fixture.nativeElement.querySelectorAll('.module-card'))
      .find((card) => (card as HTMLElement).textContent?.includes('Admin')) as HTMLAnchorElement;
    expect(adminCard.getAttribute('href')).toBe('/admin');
    expect(fixture.nativeElement.textContent).not.toContain('Account e ruoli familiari');
  });
});

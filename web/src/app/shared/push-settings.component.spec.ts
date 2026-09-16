import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { PushNotificationsService } from '../core/push-notifications.service';
import { PushSettingsComponent } from './push-settings.component';

describe('PushSettingsComponent', () => {
  it('explains unsupported devices, focuses the dialog and supports keyboard dismissal', async () => {
    await TestBed.configureTestingModule({
      imports: [PushSettingsComponent], providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
    const fixture = TestBed.createComponent(PushSettingsComponent);
    fixture.detectChanges();
    const push = TestBed.inject(PushNotificationsService);
    push.settingsOpen.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    const panel = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    const button = panel.querySelector('button') as HTMLButtonElement;
    expect(panel.textContent).toContain('iOS 16.4');
    expect(panel.textContent).toContain('schermata Home');
    expect(document.activeElement).toBe(button);
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(button);
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(push.settingsOpen()).toBe(false);
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
    fixture.destroy();
  });
});

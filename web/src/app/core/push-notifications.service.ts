import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom, timeout } from 'rxjs';
import { SessionStore } from './session.store';
import { apiErrorMessage } from '../shared/api-error';

interface PushConfiguration { enabled: boolean; publicKey: string | null; }

@Injectable({ providedIn: 'root' })
export class PushNotificationsService {
  private readonly sw = inject(SwPush, { optional: true });
  private readonly http = inject(HttpClient);
  private readonly store = inject(SessionStore);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly window = this.document.defaultView;
  private readonly ownerKey = `lifehub.push.owner:${new URL(this.document.baseURI).pathname}`;
  private publicKey: string | null = null;
  private refreshAgain = false;
  private readonly identity = computed(() => {
    const user = this.store.user();
    return user ? `${user.householdId}:${user.id}` : '';
  });
  readonly supported = !!this.sw?.isEnabled && !!this.window && 'Notification' in this.window;
  readonly settingsOpen = signal(false);
  readonly configured = signal(false);
  readonly active = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly permission = signal<NotificationPermission>(this.readPermission());
  readonly endpoint = signal<string | null>(null);

  constructor() {
    effect(() => {
      const owner = this.owner();
      // Session expiry does not revoke the user's device opt-in.
      untracked(() => {
        if (!owner) {
          this.settingsOpen.set(false);
          this.active.set(false);
        } else {
          void this.refresh();
        }
      });
    });
    this.sw?.pushSubscriptionChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => void this.refresh());
  }

  openSettings(): void {
    this.settingsOpen.set(true);
    void this.refresh();
  }

  async refresh(): Promise<void> {
    if (!this.supported || !this.owner()) return;
    if (this.busy()) { this.refreshAgain = true; return; }
    this.busy.set(true);
    this.error.set('');
    const owner = this.owner();
    try {
      this.permission.set(this.readPermission());
      const config = await firstValueFrom(this.http.get<PushConfiguration>('api/v1/push/config').pipe(timeout(8000)));
      let subscription = await this.currentSubscription();
      if (owner !== this.owner()) return;
      this.configured.set(config.enabled);
      this.publicKey = config.publicKey;
      this.endpoint.set(subscription?.endpoint ?? null);
      // Browser permissions are shared: never silently opt a different account in.
      if (subscription && (this.savedOwner() !== owner || (config.publicKey && !this.matchesKey(subscription, config.publicKey)))) {
        await this.unsubscribeBrowser();
        subscription = null;
      }
      this.active.set(false);
      if (subscription && config.enabled && this.permission() === 'granted') {
        await this.save(subscription);
        if (owner === this.owner()) this.active.set(true);
      }
    } catch (error: unknown) {
      this.error.set(apiErrorMessage(error, 'Impossibile verificare le notifiche. Riprova.'));
    } finally {
      this.finish();
    }
  }

  async enable(): Promise<void> {
    if (!this.sw || !this.supported || !this.configured() || !this.publicKey || this.busy() || !this.owner()) return;
    this.busy.set(true);
    this.error.set('');
    const owner = this.owner();
    let subscription: PushSubscription | null = null;
    try {
      // Keep this call in the button's user gesture: required especially by iOS.
      subscription = await this.sw.requestSubscription({ serverPublicKey: this.publicKey });
      if (owner !== this.owner()) { await this.unsubscribeBrowser(); return; }
      this.endpoint.set(subscription.endpoint);
      await this.save(subscription);
      if (owner !== this.owner()) { await this.unsubscribeBrowser(); return; }
      this.rememberOwner(owner);
      this.active.set(true);
    } catch (error: unknown) {
      if (subscription) {
        try { await this.unsubscribeBrowser(); } catch { /* Keep endpoint for logout/retry. */ }
      }
      this.error.set(this.readPermission() === 'denied'
        ? 'Notifiche bloccate. Consenti le notifiche nelle impostazioni del browser o del dispositivo.'
        : apiErrorMessage(error, 'Notifiche non attivate. Controlla i permessi e riprova.'));
    } finally {
      this.permission.set(this.readPermission());
      this.finish();
    }
  }

  async disable(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const subscription = await this.currentSubscription();
      const endpoint = subscription?.endpoint ?? this.endpoint();
      if (endpoint) {
        await firstValueFrom(this.http.post('api/v1/push/unsubscribe', { endpoint }).pipe(timeout(8000)));
      }
      if (subscription) await this.unsubscribeBrowser();
      this.clearDeviceState();
    } catch (error: unknown) {
      this.error.set(apiErrorMessage(error, 'Impossibile disattivare le notifiche. Riprova.'));
    } finally {
      this.finish();
    }
  }

  async afterLogout(): Promise<void> {
    this.settingsOpen.set(false);
    // The logout endpoint already removes this device server-side, even if native unsubscribe fails.
    try {
      const subscription = await this.currentSubscription();
      if (subscription) await this.unsubscribeBrowser();
    } catch { /* Next account's refresh retries cleanup and never opts it in automatically. */ }
    this.clearDeviceState();
  }

  private async save(subscription: PushSubscription): Promise<void> {
    const keys = subscription.toJSON().keys;
    await firstValueFrom(this.http.post('api/v1/push/subscriptions', {
      endpoint: subscription.endpoint, publicKey: keys?.['p256dh'], authToken: keys?.['auth']
    }).pipe(timeout(8000)));
  }

  private currentSubscription(): Promise<PushSubscription | null> {
    return this.sw?.isEnabled
      ? firstValueFrom(this.sw.subscription.pipe(timeout(8000))) : Promise.resolve(null);
  }

  private async unsubscribeBrowser(): Promise<void> {
    await this.sw?.unsubscribe();
    this.clearDeviceState();
  }

  private clearDeviceState(): void {
    this.active.set(false);
    this.endpoint.set(null);
    this.rememberOwner('');
  }

  private finish(): void {
    this.busy.set(false);
    if (this.refreshAgain) {
      this.refreshAgain = false;
      void this.refresh();
    }
  }

  private owner(): string {
    return this.identity();
  }

  private readPermission(): NotificationPermission {
    return this.window && 'Notification' in this.window ? this.window.Notification.permission : 'default';
  }

  private savedOwner(): string {
    try { return this.window?.localStorage.getItem(this.ownerKey) ?? ''; } catch { return ''; }
  }

  private rememberOwner(owner: string): void {
    try {
      if (owner) this.window?.localStorage.setItem(this.ownerKey, owner);
      else this.window?.localStorage.removeItem(this.ownerKey);
    } catch { /* Without persistent storage a new visit requires an explicit opt-in. */ }
  }

  private matchesKey(subscription: PushSubscription, expected: string): boolean {
    const key = subscription.options.applicationServerKey;
    if (!key) return false;
    return btoa(String.fromCharCode(...new Uint8Array(key)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') === expected;
  }
}

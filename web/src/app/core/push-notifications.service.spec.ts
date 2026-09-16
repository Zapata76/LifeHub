import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SwPush } from '@angular/service-worker';
import { BehaviorSubject, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PushNotificationsService } from './push-notifications.service';
import { SessionStore } from './session.store';

describe('PushNotificationsService', () => {
  let http: HttpTestingController;
  let service: PushNotificationsService;
  let store: SessionStore;
  let subscriptions: BehaviorSubject<PushSubscription | null>;
  let changes: Subject<unknown>;
  let sw: { isEnabled: boolean; subscription: unknown; pushSubscriptionChanges: unknown;
    requestSubscription: ReturnType<typeof vi.fn>; unsubscribe: ReturnType<typeof vi.fn> };
  const user = { id: 1, householdId: 1, username: 'Emiliano', role: 'admin' as const };
  const ownerKey = `lifehub.push.owner:${new URL(document.baseURI).pathname}`;
  const device = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/device',
    options: { applicationServerKey: new Uint8Array([1]).buffer },
    toJSON: () => ({ keys: { p256dh: 'public-key', auth: 'auth-token' } })
  } as unknown as PushSubscription;
  const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('Notification', { permission: 'granted' });
    subscriptions = new BehaviorSubject<PushSubscription | null>(null);
    changes = new Subject();
    sw = {
      isEnabled: true, subscription: subscriptions, pushSubscriptionChanges: changes,
      requestSubscription: vi.fn(async () => { subscriptions.next(device); return device; }),
      unsubscribe: vi.fn(async () => { subscriptions.next(null); })
    };
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: SwPush, useValue: sw }]
    });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(SessionStore);
    service = TestBed.inject(PushNotificationsService);
  });

  afterEach(() => { http.verify(); TestBed.resetTestingModule(); vi.unstubAllGlobals(); localStorage.clear(); });

  async function start(existing = false): Promise<void> {
    if (existing) { localStorage.setItem(ownerKey, '1:1'); subscriptions.next(device); }
    store.set(user, 'csrf');
    TestBed.tick();
    http.expectOne('api/v1/push/config').flush({ enabled: true, publicKey: 'AQ' });
    await settle();
    if (existing) { http.expectOne('api/v1/push/subscriptions').flush({ subscribed: true }); await settle(); }
  }

  it('never requests permission automatically and only saves subscriptions after a user action', async () => {
    await start();
    expect(sw.requestSubscription).not.toHaveBeenCalled();
    expect(service.active()).toBe(false);
    const enabling = service.enable();
    expect(sw.requestSubscription).toHaveBeenCalledWith({ serverPublicKey: 'AQ' });
    await settle();
    const request = http.expectOne('api/v1/push/subscriptions');
    expect(request.request.body).toEqual({ endpoint: device.endpoint, publicKey: 'public-key', authToken: 'auth-token' });
    request.flush({ subscribed: true });
    await enabling;
    expect(service.active()).toBe(true);
    expect(localStorage.getItem(ownerKey)).toBe('1:1');
  });

  it('cleans up a newly created browser subscription when server registration fails', async () => {
    await start();
    const enabling = service.enable();
    await settle();
    http.expectOne('api/v1/push/subscriptions').flush({}, { status: 503, statusText: 'Unavailable' });
    await enabling;
    expect(sw.unsubscribe).toHaveBeenCalledOnce();
    expect(service.active()).toBe(false);
    expect(service.error()).not.toBe('');
  });

  it('refreshes existing opt-in without prompting and ignores unchanged session identity', async () => {
    await start(true);
    expect(service.active()).toBe(true);
    expect(sw.requestSubscription).not.toHaveBeenCalled();
    store.set({ ...user }, 'new-csrf');
    TestBed.tick();
    await settle();
    http.expectNone('api/v1/push/config');
  });

  it('requires a new opt-in after changing account on a shared browser', async () => {
    await start(true);
    store.set({ ...user, id: 2 }, 'csrf-2');
    TestBed.tick();
    http.expectOne('api/v1/push/config').flush({ enabled: true, publicKey: 'AQ' });
    await settle();
    expect(sw.unsubscribe).toHaveBeenCalledOnce();
    expect(sw.requestSubscription).not.toHaveBeenCalled();
    expect(service.active()).toBe(false);
    expect(localStorage.getItem(ownerKey)).toBeNull();
  });

  it('keeps the device subscribed on session expiry, but clears it on explicit logout', async () => {
    await start(true);
    store.clear();
    TestBed.tick();
    expect(sw.unsubscribe).not.toHaveBeenCalled();
    await service.afterLogout();
    expect(sw.unsubscribe).toHaveBeenCalledOnce();
    expect(service.endpoint()).toBeNull();
  });

  it('removes the device from the server and browser when disabled', async () => {
    await start(true);
    const disabling = service.disable();
    await settle();
    http.expectOne('api/v1/push/unsubscribe').flush({ subscribed: false });
    await disabling;
    expect(service.active()).toBe(false);
    expect(sw.unsubscribe).toHaveBeenCalledOnce();
  });

  it('reports permission denial without registering any device', async () => {
    await start();
    sw.requestSubscription.mockImplementation(async () => {
      vi.stubGlobal('Notification', { permission: 'denied' });
      throw new Error('Denied');
    });
    await service.enable();
    expect(service.permission()).toBe('denied');
    expect(service.error()).toContain('bloccate');
    http.expectNone('api/v1/push/subscriptions');
  });

  it('replaces subscriptions tied to an old server key without an automatic permission prompt', async () => {
    await start(true);
    const refreshing = service.refresh();
    http.expectOne('api/v1/push/config').flush({ enabled: true, publicKey: 'Ag' });
    await refreshing;
    expect(sw.unsubscribe).toHaveBeenCalledOnce();
    expect(service.active()).toBe(false);
    expect(sw.requestSubscription).not.toHaveBeenCalled();
  });
});

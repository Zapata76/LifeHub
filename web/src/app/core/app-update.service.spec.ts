import { TestBed } from '@angular/core/testing';
import { SwUpdate, VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppUpdateService, RELOAD_APPLICATION } from './app-update.service';

describe('AppUpdateService', () => {
  let service: AppUpdateService;
  let versions: Subject<VersionEvent>;
  let failures: Subject<{ reason: string }>;
  let reload: ReturnType<typeof vi.fn>;
  let check: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    versions = new Subject();
    failures = new Subject();
    reload = vi.fn();
    check = vi.fn().mockResolvedValue(false);
    TestBed.configureTestingModule({ providers: [
      { provide: SwUpdate, useValue: {
        isEnabled: true, versionUpdates: versions, unrecoverable: failures, checkForUpdate: check
      } },
      { provide: RELOAD_APPLICATION, useValue: reload }
    ] });
    service = TestBed.inject(AppUpdateService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    document.querySelectorAll('[data-update-test]').forEach((element) => element.remove());
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function ready(): void {
    versions.next({ type: 'VERSION_READY', currentVersion: { hash: 'old' }, latestVersion: { hash: 'new' } });
  }

  function form(className = 'ng-dirty'): HTMLFormElement {
    const element = document.createElement('form');
    element.className = className;
    element.setAttribute('data-update-test', '');
    document.body.appendChild(element);
    return element;
  }

  it('checks on startup, resume and periodically, without concurrent checks', async () => {
    service.start();
    service.start();
    window.dispatchEvent(new Event('focus'));
    expect(check).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(0);
    window.dispatchEvent(new Event('focus'));
    expect(check).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(check).toHaveBeenCalledTimes(3);
  });

  it('reloads once when the new version is ready and the page is idle', async () => {
    service.start();
    ready();
    expect(service.ready()).toBe(true);
    expect(reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(reload).toHaveBeenCalledOnce();
    ready();
    await vi.advanceTimersByTimeAsync(1000);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('waits for active requests to finish before reloading', async () => {
    service.start();
    service.beginRequest();
    ready();
    service.apply();
    await vi.advanceTimersByTimeAsync(1000);
    expect(reload).not.toHaveBeenCalled();
    service.endRequest();
    await vi.advanceTimersByTimeAsync(1000);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('does not interrupt editing, even when typing starts after the update is ready', async () => {
    service.start();
    ready();
    form();
    await vi.advanceTimersByTimeAsync(1000);
    expect(reload).not.toHaveBeenCalled();
    service.apply();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('does not interrupt an open modal', async () => {
    const modal = document.createElement('div');
    modal.setAttribute('role', 'dialog');
    document.body.appendChild(modal);
    try {
      service.start();
      ready();
      await vi.advanceTimersByTimeAsync(1000);
      expect(reload).not.toHaveBeenCalled();
    } finally {
      modal.remove();
    }
    await vi.advanceTimersByTimeAsync(1100);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('does not mistake search filters for unsaved data', async () => {
    const search = form();
    search.setAttribute('role', 'search');
    const input = document.createElement('input');
    input.type = 'search';
    search.appendChild(input);
    service.start();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    ready();
    await vi.advanceTimersByTimeAsync(1100);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('reloads after a form is saved or reset on the same page', async () => {
    const editor = form();
    service.start();
    ready();
    service.beginRequest();
    service.endRequest();
    await vi.advanceTimersByTimeAsync(1100);
    // Completing a request (including a failed save) must not clear unsaved data.
    expect(reload).not.toHaveBeenCalled();
    editor.className = 'ng-pristine';
    await vi.advanceTimersByTimeAsync(1100);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('protects inline drafts until all unsaved changes have been cleared', async () => {
    const first = form('ng-pristine');
    const second = form('ng-pristine');
    first.setAttribute('data-unsaved-changes', 'true');
    second.setAttribute('data-unsaved-changes', 'true');
    service.start();
    ready();
    first.removeAttribute('data-unsaved-changes');
    await vi.advanceTimersByTimeAsync(1100);
    expect(reload).not.toHaveBeenCalled();
    second.removeAttribute('data-unsaved-changes');
    await vi.advanceTimersByTimeAsync(1100);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('does not carry dirty state into another page after a form is removed', async () => {
    const editor = form();
    service.start();
    ready();
    await vi.advanceTimersByTimeAsync(1100);
    expect(reload).not.toHaveBeenCalled();
    editor.remove();
    await vi.advanceTimersByTimeAsync(1100);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('disconnects page observation and pending reloads on destruction', async () => {
    const editor = form();
    service.start();
    ready();
    TestBed.resetTestingModule();
    editor.remove();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(reload).not.toHaveBeenCalled();
    expect(check).toHaveBeenCalledOnce();
  });

  it('keeps the cached version offline and retries on reconnect', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    service.start();
    ready();
    service.apply();
    await vi.advanceTimersByTimeAsync(1000);
    expect(check).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(check).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('recovers from an unavailable update check and an unrecoverable worker', async () => {
    check.mockRejectedValueOnce(new Error('Offline'));
    service.start();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(check).toHaveBeenCalledTimes(2);
    failures.next({ reason: 'Missing cached chunk' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('prevents automatic reload loops but allows an explicit update', async () => {
    sessionStorage.setItem('lifehub-update-reload:' + document.baseURI, String(Date.now()));
    service.start();
    ready();
    await vi.advanceTimersByTimeAsync(1000);
    expect(reload).not.toHaveBeenCalled();
    service.apply();
    expect(reload).toHaveBeenCalledOnce();
  });
});

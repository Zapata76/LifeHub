import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, InjectionToken, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate } from '@angular/service-worker';
import { fromEvent, merge } from 'rxjs';

export const RELOAD_APPLICATION = new InjectionToken<() => void>('Reload application', {
  providedIn: 'root', factory: () => () => window.location.reload()
});

@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private readonly updates = inject(SwUpdate, { optional: true });
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly reload = inject(RELOAD_APPLICATION);
  readonly ready = signal(false);
  readonly requests = signal(0);
  private started = false;
  private checking = false;
  private pageObserver?: MutationObserver;
  private reloading = false;
  private reloadTimer?: ReturnType<typeof setTimeout>;

  start(): void {
    const window = this.document.defaultView;
    if (this.started || !window || !this.updates?.isEnabled) return;
    this.started = true;
    this.updates.versionUpdates.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      if (event.type === 'VERSION_READY') {
        this.versionReady();
      }
    });
    this.updates.unrecoverable.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.versionReady();
    });
    merge(fromEvent(window, 'focus'), fromEvent(window, 'online'), fromEvent(this.document, 'visibilitychange'))
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => { void this.check(); this.maybeReload(); });
    const interval = setInterval(() => void this.check(), 120_000);
    this.destroyRef.onDestroy(() => {
      clearInterval(interval);
      clearTimeout(this.reloadTimer);
      this.pageObserver?.disconnect();
    });
    void this.check();
  }

  async check(): Promise<void> {
    if (!this.updates?.isEnabled || this.checking || !this.canUseNetwork()) return;
    this.checking = true;
    try {
      await this.updates.checkForUpdate();
    } catch {
      // Offline, timeout or partial deployment: keep this working version and retry later.
    } finally {
      this.checking = false;
    }
  }

  beginRequest(): void { this.requests.update((count) => count + 1); }
  endRequest(): void {
    this.requests.update((count) => Math.max(0, count - 1));
    this.maybeReload();
  }

  apply(): void {
    if (this.ready() && this.requests() === 0 && this.canUseNetwork()) this.reloadNow(true);
  }

  private maybeReload(): void {
    if (!this.ready() || this.reloading || this.reloadTimer || !this.safeToReload()) return;
    this.reloadTimer = setTimeout(() => {
      this.reloadTimer = undefined;
      if (this.safeToReload()) this.reloadNow(false);
    }, 1000);
  }

  private safeToReload(): boolean {
    return this.canUseNetwork() && this.requests() === 0 && !this.document.querySelector(
      'form.ng-dirty:not([role="search"]), [data-unsaved-changes="true"], [role="dialog"], [aria-modal="true"]'
    );
  }

  private versionReady(): void {
    this.ready.set(true);
    // Observe only while an update is pending. Saving/resetting a form or closing
    // a dialog must unlock the update even if the user stays on the same route.
    if (!this.pageObserver) {
      this.pageObserver = new MutationObserver(() => this.maybeReload());
      this.pageObserver.observe(this.document.body, {
        subtree: true, childList: true, attributes: true,
        attributeFilter: ['class', 'role', 'aria-modal', 'data-unsaved-changes']
      });
    }
    this.maybeReload();
  }

  private canUseNetwork(): boolean {
    return this.document.visibilityState !== 'hidden' && this.document.defaultView?.navigator.onLine === true;
  }

  private reloadNow(manual: boolean): void {
    if (this.reloading) return;
    const storage = this.document.defaultView;
    const key = 'lifehub-update-reload:' + this.document.baseURI;
    try {
      const lastReload = Number(storage?.sessionStorage.getItem(key) ?? '0');
      if (!manual && Date.now() - lastReload < 30_000) return;
      storage?.sessionStorage.setItem(key, String(Date.now()));
    } catch { /* Storage may be unavailable in private browsing. */ }
    this.reloading = true;
    // Reload as a whole: activating a new worker in-place could mix incompatible lazy chunks.
    this.reload();
  }
}

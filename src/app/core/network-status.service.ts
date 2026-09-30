import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class NetworkStatusService {
  readonly offline = signal(false);
  readonly checking = signal(false);
  readonly restored = signal(false);

  private retryTimer: ReturnType<typeof setInterval> | null = null;
  private reloadTimer: ReturnType<typeof setTimeout> | null = null;
  private boundOffline = () => this.markOffline();
  private boundOnline = () => void this.verifyAndRestore();

  constructor() {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return;

    window.addEventListener('offline', this.boundOffline, { passive: true });
    window.addEventListener('online', this.boundOnline, { passive: true });

    if (!navigator.onLine) {
      this.markOffline();
    }
  }

  async retry(): Promise<void> {
    if (typeof navigator === 'undefined') return;
    this.checking.set(true);
    try {
      if (!navigator.onLine) {
        this.markOffline();
        return;
      }
      const reachable = await this.canReachInternet();
      if (reachable) this.markRestored();
      else this.markOffline();
    } finally {
      this.checking.set(false);
    }
  }

  private markOffline(): void {
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = null;
    }
    this.restored.set(false);
    this.offline.set(true);
    this.startRecoveryCheck();
  }

  private async verifyAndRestore(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.onLine) {
      this.markOffline();
      return;
    }
    const reachable = await this.canReachInternet();
    if (reachable) this.markRestored();
    else this.markOffline();
  }

  private markRestored(): void {
    if (!this.offline() && !this.restored()) return;
    this.stopRecoveryCheck();
    this.offline.set(false);
    this.checking.set(false);
    this.restored.set(true);

    if (typeof window !== 'undefined') {
      if (this.reloadTimer) clearTimeout(this.reloadTimer);
      this.reloadTimer = setTimeout(() => window.location.reload(), 1400);
    }
  }

  private startRecoveryCheck(): void {
    if (this.retryTimer || typeof window === 'undefined') return;
    this.retryTimer = setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        void this.verifyAndRestore();
      }
    }, 5000);
  }

  private stopRecoveryCheck(): void {
    if (!this.retryTimer) return;
    clearInterval(this.retryTimer);
    this.retryTimer = null;
  }

  private async canReachInternet(): Promise<boolean> {
    if (typeof fetch === 'undefined') return typeof navigator !== 'undefined' && navigator.onLine;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    try {
      await fetch(`https://www.gstatic.com/generate_204?pg=${Date.now()}`, {
        method: 'GET',
        mode: 'no-cors',
        cache: 'no-store',
        signal: controller.signal,
      });
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }
}

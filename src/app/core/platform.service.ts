import { Injectable, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';

export type DesktopPlatform = 'mac' | 'windows' | 'linux' | 'mobile' | 'other';

@Injectable({ providedIn: 'root' })
export class PlatformService {
  private readonly platformId = inject(PLATFORM_ID);
  readonly platform = signal<DesktopPlatform>('other');
  readonly shortcutLabel = signal('Ctrl+Shift+L');
  readonly mobile = signal(false);
  private detected = false;

  detectOnce(): void {
    if (this.detected || !isPlatformBrowser(this.platformId)) return;
    this.detected = true;

    const nav = navigator as Navigator & { userAgentData?: { platform?: string; mobile?: boolean } };
    const raw = String(nav.userAgentData?.platform || nav.platform || nav.userAgent || '').toLowerCase();
    const ua = String(nav.userAgent || '').toLowerCase();
    const isMobile = !!nav.userAgentData?.mobile || /android|iphone|ipad|ipod|mobile/.test(ua);
    const isMac = /mac/.test(raw) || /macintosh|mac os x/.test(ua);
    const isWindows = /win/.test(raw) || /windows/.test(ua);
    const isLinux = /linux/.test(raw) || /linux/.test(ua);

    if (isMobile) {
      this.platform.set('mobile');
      this.mobile.set(true);
      this.shortcutLabel.set('');
      return;
    }
    if (isMac) {
      this.platform.set('mac');
      this.shortcutLabel.set('⌘+Shift+L');
      return;
    }
    if (isWindows) {
      this.platform.set('windows');
      this.shortcutLabel.set('Ctrl+Shift+L');
      return;
    }
    if (isLinux) {
      this.platform.set('linux');
      this.shortcutLabel.set('Ctrl+Shift+L');
      return;
    }
    this.platform.set('other');
    this.shortcutLabel.set('Ctrl+Shift+L');
  }

  isLockShortcut(event: KeyboardEvent): boolean {
    const key = event.key.toLowerCase();
    if (key !== 'l' || !event.shiftKey) return false;
    return this.platform() === 'mac' ? event.metaKey : event.ctrlKey;
  }
}

import { Injectable, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { StoreService } from './store.service';
import { APP_CONFIG } from '../config/app-config';
import { RentReminder, Resident } from './models';

type MailState = { state: 'busy' | 'sent' | 'error'; message: string };

/** Rent follow-up actions: prefilled WhatsApp reminders (all staff) and on-demand reminder emails (Owner only). */
@Injectable({ providedIn: 'root' })
export class RentReminderService {
  readonly mail = signal<Record<string, MailState>>({});
  constructor(private auth: AuthService, private store: StoreService) {}

  /** Rent is actually due: not paid by the due date, due today, or partially paid. Upcoming/Paid are excluded. */
  isDue(status: string) { return status === 'Overdue' || status === 'Due Today' || status === 'Partial'; }
  canEmail() { return this.store.role() === 'owner'; }
  resident(id: string): Resident | undefined { return this.store.residents().find(r => r.id === id); }
  hasEmail(id: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(this.resident(id)?.email || '').trim()); }
  mailState(id: string): MailState | undefined { return this.mail()[id]; }

  private pgName() { return this.auth.tenant()?.name || APP_CONFIG.property.name; }
  private sender() { return (this.auth.user()?.name || '').trim() || this.pgName(); }
  private money(v: number) { return '₹' + Math.round(Number(v) || 0).toLocaleString('en-IN'); }
  private date(v: string) { const d = new Date(`${v}T12:00:00`); return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
  private month(v: string) { const d = new Date(`${v}T12:00:00`); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }); }
  private waNumber(mobile: string) { const d = String(mobile || '').replace(/\D/g, ''); if (d.length === 10) return '91' + d; if (d.length === 12 && d.startsWith('91')) return d; return d.length >= 10 ? '91' + d.slice(-10) : ''; }
  private link(mobile: string, text: string) { const n = this.waNumber(mobile); return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : ''; }

  /** Prefilled WhatsApp rent reminder for a monthly resident. Empty string when there is no usable mobile number. */
  whatsappLink(r: RentReminder) {
    const res = this.resident(r.residentId); if (!res?.mobile) return '';
    const state = r.status === 'Partial' ? 'partially paid' : r.status === 'Due Today' ? 'due today' : 'not paid yet';
    const text = [
      `Hi ${res.name},`, '',
      `This is a reminder from ${this.pgName()}. Your rent for ${this.month(r.dueDate)} is ${state}.`, '',
      `Pending amount: ${this.money(r.balance)}`,
      `Due date: ${this.date(r.dueDate)}`,
      `Room: ${r.roomId}`, '',
      'Please pay the rent at the earliest. If you have already paid, kindly ignore this message.', '',
      'Thank you,', this.sender(), this.pgName()
    ].join('\n');
    return this.link(res.mobile, text);
  }

  /** Prefilled WhatsApp reminder for a daily-stay guest with an unpaid running bill. */
  dailyWhatsappLink(res: Resident, balance: number, days: number) {
    if (!res?.mobile) return '';
    const text = [
      `Hi ${res.name},`, '',
      `This is a reminder from ${this.pgName()}. Your stay bill for ${days} day${days === 1 ? '' : 's'} is pending.`, '',
      `Pending amount: ${this.money(balance)}`, '',
      'Please pay at the earliest. If you have already paid, kindly ignore this message.', '',
      'Thank you,', this.sender(), this.pgName()
    ].join('\n');
    return this.link(res.mobile, text);
  }

  async sendEmail(residentId: string) {
    if (!this.canEmail() || this.mailState(residentId)?.state === 'busy') return;
    this.set(residentId, { state: 'busy', message: 'Sending reminder email…' });
    try { const out = await this.store.sendRentReminderEmail(residentId); this.set(residentId, { state: 'sent', message: `Reminder email sent to ${out.to}` }); }
    catch (e: any) { this.set(residentId, { state: 'error', message: e?.message || 'Unable to send the reminder email.' }); }
  }
  private set(id: string, v: MailState) { this.mail.update(m => ({ ...m, [id]: v })); }
}

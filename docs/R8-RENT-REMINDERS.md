# R8 Rent Reminder Cycle

- Every resident has a compulsory `rentDueDay` (1–31).
- The app calculates the valid date each month; e.g. 31 becomes the last day in shorter months.
- Current-month rent payments are totaled using `billingMonth`.
- Reminder states: Upcoming, Due Today, Overdue, Partial, Paid.
- Paid stops the reminder for the current month only. The next month starts a fresh cycle automatically.
- Partial keeps the remaining balance visible and the reminder active.
- Dashboard, Payments, and Notifications consume the same centralized reminder computation.
- This logic is provider-neutral and will work unchanged when switching from demo data to Firebase.

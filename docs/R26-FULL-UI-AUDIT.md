# R26 Full UI Audit

- All six routed modal-producing pages audited: Amenities, Residents, Payments, Operations, Profile & Access, Super Owner.
- Removed transformed routed-host animation that caused fixed overlays to be constrained below the top bar and above the footer.
- Modal backdrop is now a viewport-level 100dvh overlay with a high stacking layer; modal header/footer remain fixed within the shell and only the body scrolls.
- Native selects receive reliable pointer/focus styling and remain native for accessibility.
- Profile menu now exposes account, PG, role, user access, branding/settings, optional Super Owner Control, workspace lock and sign out.
- Sidebar labels were rewritten to describe the destination clearly.
- Resident photo, ID proof, payment receipt and PG logo use a consistent premium encrypted-upload surface.
- Binary files continue to use encrypted R2 only; Firebase Storage remains unused.

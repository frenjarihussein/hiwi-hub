<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Read nested AGENTS.md before edits; local rules supplement these.
- Cashier types use profiles.account_kind and AppShell CASHIER_TABS — exclude cashiers from the full menu.
- Appearance uses user_prefs.extra.appearance, root data-appearance and ModernNavigation's filtered AppShell menu — presentation never grants permissions.
- Store per-user UI choices in public.user_prefs jsonb — one row per user, no schema per option.
- Entity groups/leaves use is_group/parent_id; category URLs redirect to card directories — preserve hierarchies without separate forms.
- Use idempotent forward-fix Drizzle migrations; never reapply supabase/migrations/20261004082146 or 20261004082227 (DROP SCHEMA public) — restored live schema predates the journal.
- Owner salaries/expenses use owner_finance_entries, outside tenant books — keep software-company finances separate.
- Record notes use public.record_comments keyed by entity_type/entity_id — one source across entities.
- Target notifications.user_id only via security-definer notify_user/notify_tenant_admins/notify_super_admins triggers — forbid client notification writes.
- /share/$token server functions verify tokens before admin reads — partners have no accounts.
- AI /api/chat uses the user's bearer and RLS; writes only ai_drafts approved on /ai-drafts — never changes books directly.
- POS shifts use pos_shifts and open_pos_shift/close_pos_shift RPCs only — consistent times and cash handover.
- POS drawers use ensure_pos_drawer per user; never show main cash balance — isolate seller cash.
- Chat uses realtime chat_messages; NULL recipient_id means company room — shared private/group storage.
- Closing reports use closing_account_id and configured closing_account_links before legacy types; untyped closing accounts remain visible.
- Client permissions mirror has_perm for tenant admins but respect disabled features — missing permission rows cannot hide authorized menus.
- Operational branch_id uses RESTRICTIVE branch_scope/can_see_branch RLS; profiles.branch_id or active_branch_id selects scope, branch_default fills inserts — filter all screens/reports.
- tenant_members tracks file membership; switch_tenant changes profiles.tenant_id; clone_tenant remaps chosen data IDs — one profile per user.
- Invoice charges use documents.charges (kind/account_id/pct/amount/note) and line_discount/line_addition; post_doc_charges chooses row/default accounts — preserve legacy discount_amount/freight_amount totals.
- Named prices use tenant_settings.price_names, products.prices level→price and partners.price_level; CrudPage supports col.key jsonb — stable price levels.
- Leaf code lengths use tenant_settings *_code_len via useCodingConfig — never hardcode 12.
- Entity ledger accounts, including classifications, are created atomically by DB triggers, never clients — avoid orphan accounts across editors.
- CrudPage uses reference-label.ts and account-scope.ts ledger-ID traversal; explicit parent wins over entity-parent account — numbering stays independent.
- Install error-actions.ts toast fix links once in __root — consistent recovery navigation.
- login_events writes only via logLoginEvent; IP/user-agent come from server headers — trusted session history.
- tenant_settings.doc_type_accounts overrides general post_document links; pattern rules live in src/lib/AGENTS.md.
- Lock tenant_settings inventory method after onboarding; enforce posting server-side — no UI-only accounting rules.
- entity_account_roots configures each directory; triggers require existing roots and never fabricate closing accounts — preserve blank companies.
- Documents separate partner_account_id/cash_account_id and carry both to settlement vouchers — independent ledger and drawer.
- DB triggers enforce subtree recoding and linked-partner currency restrictions — atomic rules across editors.
- Dialog keeps focus scope in Content, disables trapping minimized/compact, preserves fields, and bounds dragging with pointer capture. EntityTree reveals search ancestors.
- Company seeding uses chartFor/settingsMapFor; closing setup links only explicitly selected existing leaves through tenant_settings.closing_account_links — keeps inventory charts consistent without inventing closing accounts.
- Default logo/palette apply only without tenant logo_url/primary_color — tenant branding wins.
- navMode (user_prefs.extra) is desktop-only; openWindow navigates in place on phones.
- Legacy product initial_quantity remains readable by opening invoices but has no directory editor; only posting changes stock. Ending inventory never adds physical stock.
- ledger-display.ts centralizes currency amounts, debit/credit labels, and nature-side signs for statements and cash journals — avoids divergent reporting calculations.
- JournalNavigation reads scoped journal IDs for detail-page navigation; ledger descriptions link to those details — preserves filters and avoids discarding edits silently.
- Reconnect restoration requires the full original schema dump, then incrementals; never invent schema from app code. Current checkout lacks the base dump. app-database adapters preserve original schema types, not data, while retaining managed clients/auth/RLS. Restore records/users only from user backups; keep drizzle/schema.ts a stub.
- accounts.balance_side (debit/credit/both, inherited from ancestors via effectiveSide) decides balance-sheet side before nature — generic natures misplaced capital.
- FX revaluation mode lives in tenant_settings.fx_reval_mode/fx_reval_last; fx-reval.ts runs it client-side through revalue_fx_balances — one posting path.
- Project leads are projects with status='lead' (lead_* columns); projects_only account_kind shows only project tabs — no separate leads table.
- Uploads go through media-compress.ts before storage — keeps attachment storage small.
- Project-only users use PROJECT_PRESETS (project-presets.ts) as starting permission rows and land on /project-board; AppShell kindAllows/CASHIER_EXTRA permit /projects/<id> only — the /projects card directory stays accounting.
- createUserAccount forces projects_only kind and keepProjectPerms for projects-only companies (projectsOnlyFeatures) and project-manager callers — UI hiding alone cannot leak accounting permissions.
- Projects-only users get /api/chat with project prompt + assistant-project-tools.ts only (no accounting tools) — server-side isolation, not prompt-only.
- project_snags holds field snag items; photos are attachments tagged snag:<id>; handover certificates are printed HTML, not stored.
- Stock items and services share public.products split by item_type; ItemsDirectory renders /products (stock) and /services (service) with separate trees; partners.deal_type filters invoice item lists — one posting path for both kinds.
- Sign-in branding reads a device-local cache written by useRememberBrand after a signed-in session loads tenant branding — the login page has no tenant before sign-in.
- i18n.tsx merges the legacy English catalog, base labels and i18n-navigation overrides into one dictionary for React t() and DOM translation; menu labels use t() — keeps dynamic menus consistent when switching languages.
- Consult src/lib/AGENTS.md for Telegram, solar project/offer and pattern rules.
- InvoiceBalanceInfo reads scoped ledger/stock moves via invoice-info and ledger-display — display never changes books.
- GlobalWorkProgress observes application requests and query activity; explicit work-progress tasks own batch counts and always finish in finally — concurrent work cannot hide other operations, and unknown durations never fabricate percentages.
- Brand palettes are derived from the persisted tenant logo via brand-palette.ts and applied as semantic CSS tokens by useApplyBrandColor — every existing branding editor shares a multi-colour theme without new storage or permission paths.

- Company bots are scoped per request via withTenantBot (integrations.server.ts); company webhooks use ?t=<tenant> — one shared handler serves every company's bot.

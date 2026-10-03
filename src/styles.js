export const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Public+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap');

:root {
  --paper: #FAFAF7;
  --paper-raised: #F8F7F2;
  --ink: #12140F;
  --ink-soft: #5B6960;
  --teal: #0E6B5C;
  --teal-soft: #DCEAE4;
  --amber: #C97D25;
  --amber-soft: #F3E3CC;
  --rose: #AE3B47;
  --rose-soft: #F1DCDC;
  --info: #3D6E8C;
  --info-soft: #DCE6EA;
  --line: #D9D4C4;
  --sidebar: #1B3A5C;
  --sidebar-text: #D9E6F2;

  /* Semantic aliases — additive only, nothing above changes meaning.
     New code should prefer these names over --teal/--amber/--rose
     directly, so the underlying hue can evolve without a find-replace
     across the whole app. */
  --color-primary: var(--teal);
  --color-success: var(--teal);
  --color-success-soft: var(--teal-soft);
  --color-warning: var(--amber);
  --color-warning-soft: var(--amber-soft);
  --color-error: var(--rose);
  --color-error-soft: var(--rose-soft);
  --color-info: var(--info);
  --color-info-soft: var(--info-soft);
}

* { box-sizing: border-box; }
body { margin: 0; }
.app-root { font-family: 'Public Sans', -apple-system, sans-serif; color: var(--ink); background: var(--paper); min-height: 100vh; width: 100%; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.boot, .center-spin { display: flex; align-items: center; justify-content: center; min-height: 300px; color: var(--teal); }

.auth-split { display: flex; height: 100vh; overflow: hidden; }

.auth-brand-panel { flex: 1.1; background: var(--sidebar); color: var(--sidebar-text); display: flex; align-items: center; padding: 60px; position: relative; overflow: hidden; }
.auth-brand-pattern { position: absolute; inset: 0; width: 100%; height: 100%; color: var(--sidebar-text); opacity: 0.12; pointer-events: none; }
.auth-brand-content { position: relative; z-index: 1; max-width: 440px; }
.auth-brand-panel .auth-eyebrow { color: var(--sidebar-text); opacity: 0.8; }
.auth-brand-panel .auth-title { color: #fff; font-size: 42px; }
.auth-brand-panel .auth-sub { color: var(--sidebar-text); opacity: 0.85; font-size: 15.5px; }

.auth-form-panel { flex: 1; display: flex; align-items: center; justify-content: center; padding: 40px; overflow-y: auto; }
.auth-eyebrow-compact { display: none; }
.auth-form-title { font-family: 'Fraunces', serif; font-size: 23px; font-weight: 600; margin: 0 0 20px; }

.auth-card { max-width: 420px; width: 100%; background: var(--paper-raised); border: 1px solid var(--line); border-radius: 14px; padding: 36px 32px; }
.auth-eyebrow { font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 0.08em; color: var(--teal); margin-bottom: 10px; }
.auth-title { font-family: 'Fraunces', serif; font-size: 32px; font-weight: 600; margin: 0 0 8px; }
.auth-sub { color: var(--ink-soft); font-size: 14.5px; line-height: 1.5; margin: 0 0 22px; }
.auth-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); margin-bottom: 20px; }
.auth-tab { background: none; border: none; padding: 8px 4px; margin-right: 20px; font-family: inherit; font-size: 13px; font-weight: 600; color: var(--ink-soft); cursor: pointer; border-bottom: 2px solid transparent; }
.auth-tab.active { color: var(--ink); border-bottom-color: var(--teal); }
.auth-submit { width: 100%; justify-content: center; margin-top: 18px; }
.auth-note { font-size: 12px; color: var(--ink-soft); margin-top: 14px; line-height: 1.5; }

@media (max-width: 900px) {
  .auth-brand-panel { display: none; }
  .auth-eyebrow-compact { display: block; }
  .auth-form-panel { padding: 24px; }
}

.field-label { display: block; font-size: 12px; font-weight: 600; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px; }
.field-input { width: 100%; padding: 11px 13px; border: 1px solid var(--line); border-radius: 8px; background: #fff; font-family: inherit; font-size: 14.5px; color: var(--ink); outline: none; transition: border-color .15s; }
.field-input:focus { border-color: var(--teal); }
.field-input.textarea { min-height: 90px; resize: vertical; line-height: 1.5; }
.field-input.textarea.big { min-height: 160px; }
.field-error { color: var(--rose); font-size: 13px; margin-top: 8px; }
.code-input { font-family: 'IBM Plex Mono', monospace; letter-spacing: 0.15em; text-transform: uppercase; font-size: 18px; text-align: center; }

.role-row { display: flex; gap: 10px; }
.role-btn { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 16px 10px; border: 1.5px solid var(--line); border-radius: 10px; background: #fff; cursor: pointer; color: var(--ink-soft); font-size: 13px; font-weight: 600; transition: all .15s; }
.role-btn.active { border-color: var(--teal); color: var(--teal); background: var(--teal-soft); }

.btn-primary { display: inline-flex; align-items: center; gap: 7px; background: var(--ink); color: #fff; border: none; padding: 11px 18px; border-radius: 8px; font-family: inherit; font-size: 14px; font-weight: 600; cursor: pointer; transition: opacity .15s; }
.btn-primary:hover:not(:disabled) { opacity: 0.85; }
.btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-ghost { display: inline-flex; align-items: center; gap: 7px; background: #fff; border: 1px solid var(--line); padding: 9px 14px; border-radius: 8px; font-family: inherit; font-size: 13.5px; font-weight: 600; color: var(--ink); cursor: pointer; }
.btn-ghost:hover:not(:disabled) { background: var(--paper-raised); }

.shell { display: flex; height: 100vh; overflow: hidden; }
.sidebar { width: 240px; background: var(--sidebar); color: var(--sidebar-text); padding: 22px 16px; display: flex; flex-direction: column; flex-shrink: 0; }
.brand { display: flex; align-items: center; gap: 10px; margin-bottom: 26px; padding: 0 4px; }
.brand-mark { width: 32px; height: 32px; border-radius: 7px; background: var(--teal); color: #fff; display: flex; align-items: center; justify-content: center; font-family: 'IBM Plex Mono', monospace; font-size: 11px; font-weight: 700; }
.brand-text { font-family: 'Fraunces', serif; font-size: 16px; font-weight: 600; color: #fff; }

.profile-card { display: flex; align-items: center; gap: 10px; padding: 10px; background: rgba(255,255,255,0.06); border-radius: 10px; margin-bottom: 20px; }
.avatar { width: 34px; height: 34px; border-radius: 50%; background: var(--amber); color: #1B2820; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; flex-shrink: 0; }
.avatar.small { width: 28px; height: 28px; font-size: 12px; }
.profile-name { font-size: 13.5px; font-weight: 600; color: #fff; }
.profile-role { font-size: 11.5px; color: #9FB2A8; }

.nav { display: flex; flex-direction: column; gap: 3px; flex: 1; }
.nav-item { display: flex; align-items: center; gap: 9px; padding: 10px 11px; border-radius: 8px; background: none; border: none; color: #B9C7BE; font-family: inherit; font-size: 13.5px; font-weight: 500; cursor: pointer; text-align: left; transition: background .12s; }
.nav-item:hover { background: rgba(255,255,255,0.06); }
.nav-item.active { background: var(--teal); color: #fff; }
.nav-item.logout { color: #8AA097; margin-top: auto; }

.main { flex: 1; min-width: 0; overflow-y: auto; height: 100%; display: flex; flex-direction: column; }
.main > .app-topbar { position: sticky; top: 0; z-index: 5; }
.main > *:not(.app-topbar):not(.wf-overlay) { padding: 40px 44px; }
/* Livraison 69: a page may never be wider than the screen (on a phone the
   class page was 25px too wide and its right edge was cut off). */
.main > * { min-width: 0; }
.main > .page { width: 100%; }
.page { max-width: 880px; }
.page.narrow { max-width: 560px; }
/* Wider, centered variant used only by the Reading/Listening builder
   screens — .page itself stays untouched since 8+ other screens
   (dashboards, class lists...) share that base class. */
.page.page-wide { max-width: 900px; margin: 0 auto; }

.page-header { display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 26px; gap: 16px; flex-wrap: wrap; }
.eyebrow { font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 0.08em; color: var(--teal); margin-bottom: 4px; text-transform: uppercase; }
.page-title { font-family: 'Fraunces', serif; font-size: 28px; font-weight: 600; margin: 0; }
.muted-p { color: var(--ink-soft); font-size: 14px; margin: -10px 0 20px; }
.section-title { font-family: 'Fraunces', serif; font-size: 17px; font-weight: 600; margin: 26px 0 12px; }
.back-link { display: inline-flex; align-items: center; gap: 6px; background: none; border: none; color: var(--ink-soft); font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; margin-bottom: 18px; padding: 0; }
.back-link:hover { color: var(--ink); }
.row-right { display: flex; justify-content: flex-end; margin-bottom: 16px; }

.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
.class-card { text-align: left; background: var(--paper-raised); border: 1px solid var(--line); border-radius: 12px; padding: 18px; cursor: pointer; font-family: inherit; transition: border-color .15s; }
.class-card:hover { border-color: var(--teal); }
.class-card-top { display: flex; align-items: center; justify-content: space-between; }
.class-card-name { font-weight: 600; font-size: 15px; }
.chev { color: var(--ink-soft); flex-shrink: 0; }
.class-card-code { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--ink-soft); margin-top: 10px; letter-spacing: 0.04em; }
.class-card-code span { color: var(--teal); font-weight: 600; }
.class-card-teacher { display: flex; align-items: center; gap: 5px; font-size: 12.5px; color: var(--ink-soft); margin-top: 8px; }

.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); margin-bottom: 20px; }
.tab { background: none; border: none; padding: 10px 4px; margin-right: 22px; font-family: inherit; font-size: 13.5px; font-weight: 600; color: var(--ink-soft); cursor: pointer; border-bottom: 2px solid transparent; }
.tab.active { color: var(--ink); border-bottom-color: var(--teal); }

.ticket-list { display: flex; flex-direction: column; gap: 10px; }
.ticket { display: flex; align-items: center; justify-content: space-between; background: var(--paper-raised); border: 1px solid var(--line); border-radius: 10px; padding: 14px 0; cursor: pointer; font-family: inherit; text-align: left; position: relative; transition: border-color .15s; width: 100%; }
.ticket:hover { border-color: var(--teal); }
.ticket-main { display: flex; align-items: center; gap: 13px; padding: 0 18px; flex: 1; min-width: 0; }
.ticket-icon { flex-shrink: 0; }
.ticket-title { font-weight: 600; font-size: 14.5px; }
.ticket-type { font-size: 12px; color: var(--ink-soft); margin-top: 2px; }
.ticket-stub { flex-shrink: 0; padding: 0 18px; margin-left: 8px; border-left: 1px dashed var(--line); display: flex; align-items: center; height: 100%; }
.due-badge { display: inline-flex; align-items: center; gap: 5px; font-family: 'IBM Plex Mono', monospace; font-size: 11px; font-weight: 500; padding: 5px 9px; border-radius: 20px; background: var(--paper); color: var(--ink-soft); white-space: nowrap; }
.due-badge.warn { background: var(--amber-soft); color: var(--amber); }
.due-badge.danger { background: var(--rose-soft); color: var(--rose); }
.due-badge.timed { background: var(--sidebar); color: #fff; }

.field-hint { font-size: 12px; color: var(--ink-soft); margin: 6px 0 0; line-height: 1.5; }

.word-count { display: inline-flex; align-items: center; font-family: 'IBM Plex Mono', monospace; font-size: 12px; font-weight: 500; color: var(--ink-soft); background: var(--paper-raised); border: 1px solid var(--line); padding: 5px 10px; border-radius: 20px; margin-top: 8px; }
.word-count.met { color: var(--teal); background: var(--teal-soft); border-color: var(--teal); }

.timer-panel { display: flex; align-items: center; gap: 12px; background: var(--sidebar); color: #fff; border-radius: 10px; padding: 14px 18px; margin: 16px 0; }
.timer-panel.urgent { background: var(--rose); animation: pulse 1s infinite; }
.timer-panel.done { background: var(--paper-raised); color: var(--ink-soft); border: 1px solid var(--line); }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.75; } }
.timer-label { font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.85; }
.timer-clock { font-family: 'IBM Plex Mono', monospace; font-size: 22px; font-weight: 600; }

.status-badge { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 600; padding: 5px 10px; border-radius: 20px; white-space: nowrap; }
.status-badge.pending { background: var(--line); color: var(--ink-soft); }
.status-badge.submitted { background: var(--amber-soft); color: var(--amber); }
.status-badge.graded { background: var(--teal-soft); color: var(--teal); }
.status-badge.inprogress { background: #E4E1D3; color: var(--ink-soft); }

.asg-header { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 6px; }
.asg-icon { margin-top: 3px; flex-shrink: 0; }
.asg-type { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 3px; }
.asg-title { font-family: 'Fraunces', serif; font-size: 24px; font-weight: 600; margin: 0 0 6px; }
.asg-due { display: flex; align-items: center; gap: 5px; font-size: 12.5px; color: var(--ink-soft); }
.asg-desc { color: var(--ink-soft); font-size: 14px; line-height: 1.6; margin: 14px 0 0; padding: 14px 16px; background: var(--paper-raised); border-radius: 8px; border: 1px solid var(--line); white-space: pre-wrap; }
.asg-image { max-width: 100%; border-radius: 10px; border: 1px solid var(--line); margin: 14px 0 0; display: block; }
.pdf-embed-wrap { margin: 14px 0 0; }
.pdf-embed { width: 100%; height: 78vh; min-height: 520px; border: 1px solid var(--line); border-radius: 10px; background: #fff; display: block; }
.pdf-embed-fallback { display: inline-flex; align-items: center; gap: 5px; margin-top: 8px; font-size: 11.5px; color: var(--ink-soft); text-decoration: none; }
.pdf-embed-fallback:hover { color: var(--teal); }
.audio-embed-wrap { margin: 14px 0 0; padding: 16px; background: var(--paper-raised); border: 1px solid var(--line); border-radius: 10px; }
.audio-embed { width: 100%; display: block; }
.file-chip { display: inline-flex; align-items: center; gap: 6px; margin-top: 10px; padding: 7px 12px; background: var(--paper-raised); border: 1px solid var(--line); border-radius: 20px; font-size: 12.5px; color: var(--ink-soft); }
.file-preview-row { display: flex; align-items: center; gap: 12px; margin-top: 10px; flex-wrap: wrap; }
.remove-file { padding: 6px 10px; font-size: 11.5px; color: var(--rose); }
.image-preview { max-width: 100%; max-height: 160px; border-radius: 8px; border: 1px solid var(--line); margin-top: 10px; }

.reading-passage { margin-top: 14px; }
.reading-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
.reading-hint { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--teal); font-weight: 600; }
.color-picker { display: flex; align-items: center; gap: 6px; }
.color-swatch { width: 22px; height: 22px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; padding: 0; }
.color-swatch.active { border-color: var(--ink); box-shadow: 0 0 0 2px #fff, 0 0 0 3px var(--ink); }
.swatch-yellow { background: #F2D24B; }
.swatch-green { background: #6FBF73; }
.swatch-red { background: #E06B6B; }
.hl-word { cursor: pointer; border-radius: 3px; padding: 0 1px; transition: background .1s; }
.hl-word:hover { background: rgba(14,107,92,0.12); }
.hl-word.hl-yellow { background: #F2D24B; color: var(--ink); }
.hl-word.hl-green { background: #A9DDAB; color: var(--ink); }
.hl-word.hl-red { background: #F0B4B4; color: var(--ink); }
.reading-text { cursor: default; color: var(--ink); }
.hl-word { cursor: pointer; border-radius: 3px; padding: 0 1px; transition: background .1s; }
.hl-word:hover { background: rgba(14,107,92,0.12); }

.sub-list { display: flex; flex-direction: column; gap: 8px; }
.sub-row { display: flex; align-items: center; gap: 11px; background: var(--paper-raised); border: 1px solid var(--line); border-radius: 9px; padding: 11px 14px; cursor: pointer; transition: border-color .15s; }
.sub-row:hover { border-color: var(--teal); }
.sub-row-disabled { cursor: default; opacity: 0.7; }
.sub-row-disabled:hover { border-color: var(--line); }
.sub-name { flex: 1; font-weight: 500; font-size: 14px; }
.sub-meta { font-size: 12px; color: var(--ink-soft); }

.roster-list { display: flex; flex-direction: column; gap: 8px; }
.roster-row { display: flex; align-items: center; gap: 11px; background: var(--paper-raised); border: 1px solid var(--line); border-radius: 9px; padding: 11px 14px; }
.roster-name { flex: 1; font-weight: 500; font-size: 14px; }
.roster-date { font-size: 12px; color: var(--ink-soft); }

.submission-box { background: var(--paper); border: 1px solid var(--line); border-radius: 8px; padding: 13px 15px; font-size: 13.5px; line-height: 1.55; white-space: pre-wrap; width: 100%; min-height: 130px; font-family: inherit; color: var(--ink); resize: vertical; }
.spellcheck-hint { display: flex; align-items: center; gap: 5px; font-size: 11.5px; color: var(--ink-soft); margin-bottom: 6px; }
.empty-inline { color: var(--ink-soft); font-size: 13.5px; font-style: italic; }

.feedback-panel { background: var(--teal-soft); border: 1px solid var(--teal); border-radius: 10px; padding: 16px 18px; margin: 18px 0; }
.feedback-band { font-family: 'Fraunces', serif; font-size: 20px; font-weight: 600; color: var(--teal); }
.feedback-text { font-size: 13.5px; color: var(--ink); margin: 8px 0 0; line-height: 1.55; }

.type-row { display: flex; gap: 6px; flex-wrap: wrap; }
.type-chip { padding: 7px 12px; border-radius: 20px; border: 1px solid var(--line); background: #fff; font-family: inherit; font-size: 12.5px; font-weight: 600; color: var(--ink-soft); cursor: pointer; }
.type-chip.active { background: var(--ink); color: #fff; border-color: var(--ink); }

.empty-state { text-align: center; padding: 60px 20px; color: var(--ink-soft); }
.empty-icon { display: inline-flex; align-items: center; justify-content: center; width: 52px; height: 52px; border-radius: 50%; background: var(--paper-raised); border: 1px solid var(--line); margin-bottom: 14px; color: var(--teal); }
.empty-title { font-weight: 600; font-size: 15px; color: var(--ink); margin-bottom: 4px; }
.empty-body { font-size: 13px; max-width: 320px; margin: 0 auto; line-height: 1.5; }

.modal-overlay { position: fixed; inset: 0; background: rgba(23,37,31,0.45); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 20px; }
.modal { background: #fff; border-radius: 14px; width: 100%; max-width: 420px; max-height: 88vh; overflow-y: auto; }
.modal.wide { max-width: 520px; }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px; border-bottom: 1px solid var(--line); }
.modal-title { font-family: 'Fraunces', serif; font-size: 17px; font-weight: 600; }
.modal-close { background: none; border: none; cursor: pointer; color: var(--ink-soft); padding: 4px; }
.modal-body { padding: 20px; }

.toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: var(--ink); color: #fff; padding: 11px 20px; border-radius: 30px; font-size: 13.5px; font-weight: 500; z-index: 60; box-shadow: 0 8px 24px rgba(0,0,0,0.2); }

/* The blue menu as a phone drawer — the button lives in the green bar. */
.app-menu-btn { position: absolute; left: 8px; top: 50%; transform: translateY(-50%); width: 36px; height: 36px; border-radius: 8px; border: none; background: rgba(255,255,255,0.18); color: #fff; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; }
.app-menu-btn:hover { background: rgba(255,255,255,0.3); }
.app-menu-close { margin-left: auto; width: 32px; height: 32px; border-radius: 8px; border: none; background: rgba(255,255,255,0.1); color: var(--sidebar-text); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; }
.app-menu-close:hover { background: rgba(255,255,255,0.2); color: #fff; }
.app-menu-backdrop { position: absolute; inset: 0; z-index: 110; background: rgba(18, 20, 15, 0.45); }

@media (max-width: 760px) {
  /* Laid out across the top, the seven menu entries needed 558px on a
     390px phone: "Join a class", "Full screen" and "Sign out" fell off
     the right edge and the page does not scroll sideways, so they were
     simply unreachable. The menu now slides over the page instead,
     keeping its full-size vertical entries. */
  .shell { position: relative; }
  .sidebar {
    position: absolute; top: 0; left: 0; bottom: 0; z-index: 120;
    width: 272px; max-width: 86vw; padding: 18px 16px;
    transform: translateX(-100%); transition: transform .18s ease;
    overflow-y: auto; -webkit-overflow-scrolling: touch;
  }
  /* The shadow belongs to the open drawer only: left on permanently it
     showed as a grey band down the left edge of the closed page. */
  .shell.menu-open .sidebar { transform: translateX(0); box-shadow: 0 0 30px rgba(0, 0, 0, 0.35); }
  /* The brand row holds the close button on a phone. */
  .brand { margin-bottom: 20px; }
  /* Comfortable tap targets, and the whole width for the content: the
     old layout added the sidebar's padding on top of the page's own. */
  .nav-item { padding: 12px 11px; font-size: 14.5px; }
  .main { padding: 0; }
  .main > *:not(.app-topbar):not(.wf-overlay) { padding: 22px 16px; }
  .app-topbar { position: relative; min-height: 44px; display: flex; align-items: center; justify-content: center; box-sizing: border-box; }
}

/* A phone in landscape is short: the menu keeps its own scrollbar so
   "Sign out" at the bottom stays reachable. */
@media (max-width: 760px) and (max-height: 480px) {
  .nav-item { padding: 9px 11px; }
}

.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 30px; }
.stat-card { display: flex; align-items: center; gap: 12px; background: var(--paper-raised); border: 1px solid var(--line); border-radius: 12px; padding: 16px 18px; }
.stat-icon { width: 36px; height: 36px; border-radius: 9px; background: var(--teal-soft); color: var(--teal); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.stat-value { font-family: 'Fraunces', serif; font-size: 24px; font-weight: 600; line-height: 1; }
.stat-label { font-size: 11.5px; color: var(--ink-soft); margin-top: 4px; }

.dash-columns { display: grid; grid-template-columns: 1.4fr 1fr; gap: 32px; }
.dash-col { min-width: 0; }
.dash-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }
.dash-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; background: var(--paper-raised); border: 1px solid var(--line); border-radius: 9px; padding: 11px 14px; cursor: pointer; transition: border-color .15s; }
.dash-row:hover { border-color: var(--teal); }
.dash-row.attention { justify-content: flex-start; cursor: default; }
.dash-row.attention:hover { border-color: var(--line); }
.dash-row-title { font-weight: 600; font-size: 13.5px; }
.dash-row-sub { font-size: 12px; color: var(--ink-soft); margin-top: 2px; }
.dash-row-meta { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--ink-soft); white-space: nowrap; }
.attn-missing { color: var(--rose); flex-shrink: 0; }
.attn-feedback { color: var(--amber); flex-shrink: 0; }

@media (max-width: 900px) {
  .dash-columns { grid-template-columns: 1fr; }
}

/* Writing Focus Mode — full-screen overlay, Task 1/2 only.
   Self-contained: does not alter any other layout rule above. */
.wf-overlay {
  position: fixed; inset: 0; z-index: 200;
  background: var(--paper);
  display: flex; flex-direction: column;
  overflow-y: auto;
}
.wf-topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 28px; border-bottom: 1px solid var(--line);
  background: var(--paper-raised); flex-shrink: 0;
}
.wf-title-group { text-align: center; flex: 1; min-width: 0; }
.wf-title { font-family: 'Fraunces', serif; font-size: 17px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wf-timer { display: flex; align-items: center; gap: 6px; font-family: 'IBM Plex Mono', monospace; font-size: 14px; font-weight: 600; color: var(--teal); background: var(--teal-soft); padding: 6px 12px; border-radius: 20px; white-space: nowrap; }
.wf-timer.urgent { color: #fff; background: var(--rose); animation: pulse 1s infinite; }

.wf-body { flex: 1; display: flex; gap: 28px; padding: 28px; max-width: 1200px; margin: 0 auto; width: 100%; align-items: flex-start; }
.wf-body.with-image { align-items: stretch; }
.wf-image-panel { flex: 0 0 44%; max-width: 540px; display: flex; flex-direction: column; gap: 8px; position: sticky; top: 28px; }
.wf-zoom-controls { display: flex; align-items: center; gap: 6px; align-self: flex-start; background: var(--paper-raised); border: 1px solid var(--line); border-radius: 8px; padding: 5px 8px; }
.wf-zoom-btn { width: 26px; height: 26px; border-radius: 6px; border: 1px solid var(--line); background: #fff; cursor: pointer; font-weight: 700; font-size: 15px; display: flex; align-items: center; justify-content: center; color: var(--ink); line-height: 1; }
.wf-zoom-btn:hover { border-color: var(--teal); color: var(--teal); }
.wf-zoom-level { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--ink-soft); min-width: 38px; text-align: center; }
.wf-zoom-reset { font-size: 11px; color: var(--teal); background: none; border: none; cursor: pointer; text-decoration: underline; padding: 0 2px; }
.wf-image-scroll { overflow: auto; border: 1px solid var(--line); border-radius: 10px; background: #fff; max-height: 72vh; padding: 8px; display: flex; align-items: flex-start; justify-content: center; }
.wf-zoomable-image { display: block; width: 100%; height: auto; transform-origin: 0 0; transition: transform .12s ease; }
.wf-editor-panel { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.wf-instructions { color: var(--ink-soft); font-size: 15px; line-height: 1.6; margin-bottom: 16px; padding: 14px 16px; background: var(--paper-raised); border-radius: 8px; border: 1px solid var(--line); white-space: pre-wrap; }
.wf-textarea { flex: 1; min-height: 46vh; width: 100%; padding: 20px 22px; border: 1px solid var(--line); border-radius: 10px; background: #fff; font-family: inherit; font-size: 16px; line-height: 1.7; color: var(--ink); outline: none; resize: vertical; }
.wf-textarea:focus { border-color: var(--teal); }
.wf-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; gap: 12px; flex-wrap: wrap; }
.wf-save-indicator { font-size: 11.5px; color: var(--ink-soft); font-style: italic; }

@media (max-width: 800px) {
  .wf-body { flex-direction: column; padding: 18px; }
  .wf-image-panel { flex: none; max-width: 100%; position: static; }
}

/* Reading Focus Mode — split passage + numbered answers, reuses .wf-overlay/.wf-topbar */
.rf-body { flex: 1; display: flex; gap: 24px; padding: 28px; max-width: 1300px; margin: 0 auto; width: 100%; align-items: flex-start; }
.rf-passage-panel { flex: 1.3; min-width: 0; background: #fff; border: 1px solid var(--line); border-radius: 10px; padding: 20px 22px; max-height: 78vh; overflow-y: auto; }
.rf-answers-panel { flex: 1; min-width: 280px; max-width: 420px; position: sticky; top: 28px; background: var(--paper-raised); border: 1px solid var(--line); border-radius: 10px; padding: 18px 20px; max-height: 78vh; overflow-y: auto; }
.rf-answers-title { font-family: 'Fraunces', serif; font-size: 16px; font-weight: 600; margin-bottom: 14px; }
.rf-answer-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px dashed var(--line); font-size: 14px; }
.rf-answer-num { font-family: 'IBM Plex Mono', monospace; font-size: 12px; font-weight: 700; color: var(--teal); width: 22px; flex-shrink: 0; }
.rf-answer-input { flex: 1; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; font-size: 14px; outline: none; }
.rf-answer-input:focus { border-color: var(--teal); }

@media (max-width: 900px) {
  .rf-body { flex-direction: column; }
  .rf-answers-panel { position: static; max-width: 100%; }
}

/* Fullscreen toggle button, shared by Writing/Reading topbars */
.wf-topbar-right { display: flex; align-items: center; gap: 10px; }
.fullscreen-btn { padding: 7px 9px; }

/* Full-screen grading view (teacher) — reuses the same overlay pattern as wf-overlay */
.grade-overlay { position: fixed; inset: 0; z-index: 200; background: var(--paper); display: flex; flex-direction: column; overflow-y: auto; }
.grade-topbar { display: flex; align-items: center; justify-content: space-between; padding: 16px 28px; border-bottom: 1px solid var(--line); background: var(--paper-raised); flex-shrink: 0; }
.grade-title { font-family: 'Fraunces', serif; font-size: 16px; font-weight: 600; }

.qe-bank-overlay { position: fixed; inset: 0; z-index: 200; background: var(--paper); display: flex; flex-direction: column; overflow-y: auto; }
.qe-bank-topbar { display: flex; align-items: center; justify-content: space-between; padding: 16px 28px; border-bottom: 1px solid var(--line); background: var(--paper-raised); flex-shrink: 0; }
.qe-bank-title { font-family: 'Fraunces', serif; font-size: 16px; font-weight: 600; }
.qe-bank-body { max-width: 760px; margin: 0 auto; padding: 24px 24px 60px; width: 100%; box-sizing: border-box; }
.qe-bank-group { background: var(--paper-raised); border: 1px solid var(--line); border-radius: 14px; padding: 20px 24px; margin-bottom: 18px; }
.qe-bank-question { padding: 12px 0; border-top: 1px solid var(--line); }
.qe-bank-question:first-of-type { border-top: none; padding-top: 4px; }
.qe-bank-gapfill-note { font-size: 12.5px; color: var(--ink-soft); font-style: italic; margin: 0; }
.grade-body { flex: 1; display: flex; gap: 28px; padding: 28px; max-width: 1400px; margin: 0 auto; width: 100%; align-items: flex-start; }
.grade-panel { min-width: 0; }
.grade-panel-submission { flex: 2.2; }
.grade-panel-submission .submission-box { min-height: 68vh; font-size: 15px; line-height: 1.65; }
.grade-panel-form { flex: 1; min-width: 300px; max-width: 400px; }
@media (max-width: 900px) {
  .grade-body { flex-direction: column; }
}

/* IELTS 4-criteria writing scores */
.criteria-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
.criteria-label { font-size: 13.5px; color: var(--ink); }
.criteria-input { width: 80px; text-align: center; }
.criteria-avg { margin-top: 10px; padding: 10px 14px; background: var(--teal-soft); color: var(--teal); border-radius: 8px; font-size: 13.5px; font-weight: 600; }

/* Reading Focus Mode — optional 3rd column for separately-entered questions */
.rf-body.three-col .rf-passage-panel { flex: 1.1; }
.rf-questions-panel { flex: 0.9; min-width: 220px; background: #fff; border: 1px solid var(--line); border-radius: 10px; padding: 18px 20px; max-height: 78vh; overflow-y: auto; }
.rf-questions-title { font-family: 'Fraunces', serif; font-size: 15px; font-weight: 600; margin-bottom: 10px; }
.rf-questions-text { font-size: 14px; line-height: 1.6; color: var(--ink); white-space: pre-wrap; }
.rf-body.three-col .rf-answers-panel { flex: 0.7; min-width: 220px; max-width: 320px; }
.rf-answers-title-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.rf-answers-title-row .rf-answers-title { margin-bottom: 0; }

@media (max-width: 1100px) {
  .rf-body.three-col { flex-direction: column; }
  .rf-questions-panel, .rf-body.three-col .rf-answers-panel { max-width: 100%; }
}

/* Resizable column divider — drag to resize, session-only (not saved) */
.rf-divider { flex: 0 0 6px; align-self: stretch; cursor: col-resize; position: relative; }
.rf-divider::after { content: ""; position: absolute; top: 0; bottom: 0; left: 2px; width: 2px; border-radius: 2px; background: var(--line); transition: background .15s; }
.rf-divider:hover::after, .rf-divider:active::after { background: var(--teal); }
@media (max-width: 1100px) {
  .rf-divider { display: none; }
}

/* Submission confirmation dialog — sits above every overlay */
.confirm-overlay { position: fixed; inset: 0; z-index: 300; background: rgba(23,37,31,0.55); display: flex; align-items: center; justify-content: center; padding: 20px; }
.confirm-box { background: #fff; border-radius: 14px; max-width: 380px; width: 100%; padding: 24px; text-align: center; }
.confirm-title { font-family: 'Fraunces', serif; font-size: 18px; font-weight: 600; margin-bottom: 8px; }
.confirm-text { font-size: 13.5px; color: var(--ink-soft); line-height: 1.5; margin-bottom: 20px; }
.confirm-actions { display: flex; gap: 10px; justify-content: center; }
.delete-assignment-btn { color: var(--rose); }
.delete-assignment-btn:hover { background: var(--rose-soft); }

/* Two-step class deletion — the dialog spells out what disappears. */
.cd-del-list { margin: 14px 0; padding-left: 20px; font-size: 14px; line-height: 1.9; color: var(--ink); }
.cd-del-warning { display: flex; align-items: flex-start; gap: 9px; margin: 14px 0 16px; padding: 11px 13px; border-radius: 9px; background: var(--rose-soft); border: 1px solid var(--rose); color: var(--ink); font-size: 13px; line-height: 1.55; }
.cd-del-warning svg { flex-shrink: 0; margin-top: 1px; color: var(--rose); }
.cd-del-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
.cd-del-confirm { background: var(--rose); }
.cd-del-confirm:disabled { background: var(--rose); opacity: 0.35; }

/* Listening Focus Mode — narrow audio panel */
.rf-audio-panel { min-width: 200px; background: #fff; border: 1px solid var(--line); border-radius: 10px; padding: 20px 16px; display: flex; flex-direction: column; align-items: center; text-align: center; }
.rf-audio-icon { color: var(--teal); margin-bottom: 10px; }
.test-beep-btn { font-size: 11.5px; padding: 6px 10px; }
.locked-audio { width: 100%; }
.locked-audio-playing { display: flex; align-items: center; justify-content: center; gap: 7px; font-size: 12.5px; color: var(--teal); background: var(--teal-soft); border-radius: 8px; padding: 10px 12px; }

/* Checkbox row, used for "allow audio pause" and future toggle options */
.checkbox-row { display: flex; align-items: center; gap: 8px; font-size: 13.5px; color: var(--ink); cursor: pointer; }
.checkbox-row input[type="checkbox"] { width: 15px; height: 15px; accent-color: var(--teal); cursor: pointer; }

/* ---------- Livraison 69: page headers, breadcrumbs, menus ---------- */
.crumbs { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; font-size: 13px; color: var(--ink-soft); margin-bottom: 14px; }
.crumb-link { background: none; border: none; padding: 2px 0; font: inherit; color: var(--ink-soft); cursor: pointer; }
.crumb-link:hover { color: var(--ink); text-decoration: underline; text-underline-offset: 3px; }
.crumb-here { color: var(--ink); font-weight: 600; }
.crumb-sep { color: #B7B2A3; }
.ph { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; flex-wrap: wrap; margin-bottom: 22px; }
.ph-main { display: flex; gap: 14px; align-items: flex-start; min-width: 0; }
.ph-icon { width: 42px; height: 42px; border-radius: 11px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px; }
.ph-title { font-family: 'Fraunces', serif; font-size: 28px; font-weight: 600; margin: 0; line-height: 1.15; overflow-wrap: anywhere; }
.ph-meta { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
.ph-actions { display: flex; gap: 8px; align-items: center; flex-shrink: 0; }
.pill { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; padding: 5px 11px; border-radius: 999px; background: #F1EFE7; color: var(--ink-soft); font-weight: 600; border: none; font-family: inherit; }
.pill-teal { background: var(--teal-soft); color: var(--teal); }
button.pill { cursor: pointer; }
button.pill:hover { filter: brightness(0.97); }
.btn-teal { display: inline-flex; align-items: center; gap: 7px; background: var(--teal); color: #fff; border: 1px solid var(--teal); padding: 10px 16px; border-radius: 9px; font-family: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-teal:hover:not(:disabled) { opacity: 0.92; }
.btn-dots { padding: 9px 12px; font-weight: 800; letter-spacing: 1px; }
.dm { position: relative; display: inline-block; }
.dm-list { position: absolute; right: 0; top: calc(100% + 8px); z-index: 30; min-width: 240px; background: #fff; border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 20px 50px rgba(18,20,15,0.16); padding: 6px; }
.dm-list.dm-left { right: auto; left: 0; }
.dm-list.dm-wide { width: 390px; max-width: calc(100vw - 32px); }
.dm-item { display: flex; width: 100%; gap: 12px; align-items: center; padding: 10px 12px; border-radius: 9px; background: none; border: none; font-family: inherit; font-size: 14px; color: var(--ink); cursor: pointer; text-align: left; }
.dm-item.dm-rich { align-items: flex-start; padding: 11px 12px; }
.dm-item:hover:not(:disabled), .dm-item:focus-visible { background: #F3F6F4; outline: none; }
.dm-item:disabled { opacity: 0.45; cursor: not-allowed; }
.dm-danger { color: var(--rose); }
.dm-danger:hover:not(:disabled) { background: var(--rose-soft); }
.dm-icon { display: inline-flex; flex-shrink: 0; }
.dm-text { display: flex; flex-direction: column; min-width: 0; }
.dm-title { font-weight: 600; }
.dm-hint { font-size: 12.5px; color: var(--ink-soft); margin-top: 2px; line-height: 1.4; }
.dm-sep { height: 1px; background: var(--line); margin: 6px 8px; }
.dm-label { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-soft); padding: 8px 12px 4px; }
.type-ic { width: 34px; height: 34px; border-radius: 9px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.type-ic.ic-dark { background: var(--ink); color: #fff; }
.type-ic.ic-reading { background: var(--info-soft); color: var(--info); }
.type-ic.ic-listening { background: var(--teal-soft); color: var(--teal); }
.type-ic.ic-writing { background: var(--amber-soft); color: var(--amber); }
.type-ic.ic-speaking { background: var(--rose-soft); color: var(--rose); }
.copy-done { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; background: var(--teal-soft); border: 1px solid var(--teal); color: var(--ink); border-radius: 10px; padding: 11px 14px; margin-bottom: 18px; font-size: 14px; }
.copy-done .btn-link { background: none; border: none; padding: 0; font: inherit; font-weight: 700; color: var(--teal); cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
.copy-done .copy-x { margin-left: auto; background: none; border: none; color: var(--ink-soft); cursor: pointer; font-size: 18px; line-height: 1; }
@media (max-width: 760px) {
  .ph-title { font-size: 23px; }
  /* On a phone the menus open under the whole row of buttons, from edge
     to edge, so they never run off the screen. */
  .ph-actions { width: 100%; position: relative; }
  .ph-actions .dm { position: static; }
  .ph-actions .dm-list, .ph-actions .dm-list.dm-wide { left: 0; right: 0; width: auto; max-width: none; min-width: 0; }
}

/* ---------- Livraison 70: figures and tables ---------- */
.stat-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 22px; }
.stat { background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 13px 15px; min-width: 0; }
.stat-l { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; color: var(--ink-soft); text-transform: uppercase; }
.stat-v { font-family: 'Fraunces', serif; font-size: 26px; font-weight: 600; margin-top: 3px; line-height: 1.2; }
.stat-d { font-size: 12px; color: var(--ink-soft); }
.pill-rose { background: var(--rose-soft); color: var(--rose); }
.pill-amber { background: var(--amber-soft); color: #8A5414; }
.pill-plain { background: transparent; color: var(--ink-soft); padding-left: 0; padding-right: 0; font-weight: 500; }
.dt-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.dt-search { display: flex; align-items: center; gap: 8px; border: 1px solid var(--line); background: #fff; border-radius: 9px; padding: 0 12px; color: var(--ink-soft); min-width: 0; flex: 1 1 220px; max-width: 320px; }
.dt-search input { border: none; outline: none; background: transparent; padding: 9px 0; font: inherit; font-size: 13.5px; color: var(--ink); width: 100%; min-width: 0; }
.dt-search:focus-within { border-color: var(--teal); }
.dt-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.dt-chip { font-family: inherit; font-size: 12.5px; padding: 6px 11px; border-radius: 999px; border: 1px solid var(--line); background: #fff; color: var(--ink-soft); font-weight: 600; cursor: pointer; }
.dt-chip.on { background: var(--ink); color: #fff; border-color: var(--ink); }
.dt-reset { background: none; border: none; padding: 0; font: inherit; font-weight: 700; color: var(--teal); cursor: pointer; text-decoration: underline; }
.dt-wrap { background: #fff; border: 1px solid var(--line); border-radius: 12px; overflow: visible; }
.dt { width: 100%; border-collapse: separate; border-spacing: 0; table-layout: auto; }
.dt th { font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-soft); text-align: left; padding: 10px 14px; background: #F6F4EE; border-bottom: 1px solid var(--line); font-weight: 700; white-space: nowrap; }
.dt th:first-child { border-top-left-radius: 12px; } .dt th:last-child { border-top-right-radius: 12px; }
.dt td { padding: 11px 14px; font-size: 14px; border-bottom: 1px solid #EFECE3; vertical-align: middle; }
.dt tbody tr:last-child td { border-bottom: none; }
.dt-row { cursor: pointer; }
.dt-row:hover td { background: #FBFAF6; }
.dt-title { display: flex; align-items: center; gap: 12px; min-width: 0; }
.dt-title-text { display: flex; flex-direction: column; min-width: 0; }
.dt-open { background: none; border: none; padding: 0; font: inherit; font-weight: 600; color: var(--ink); text-align: left; cursor: pointer; overflow-wrap: anywhere; }
.dt-open:hover { text-decoration: underline; text-underline-offset: 3px; }
.dt-sub { font-size: 12px; color: var(--ink-soft); }
.dt-muted { color: #9AA39D; }
.dt .pill, .dt-nowrap { white-space: nowrap; }
.dt-progress { display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; }
.dt-bar { width: 80px; height: 6px; background: #EFECE3; border-radius: 9px; overflow: hidden; display: inline-block; }
.dt-bar i { display: block; height: 100%; background: var(--teal); border-radius: 9px; }
.dt-actions { width: 44px; text-align: right; }
.btn-row { padding: 5px 10px; font-weight: 800; }
.show-sm { display: none; }
@media (max-width: 760px) {
  .stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .hide-sm { display: none; }
  .show-sm { display: inline; }
  .dt td, .dt th { padding: 10px 10px; }
  .dt-search { max-width: none; }
  .dt .dm-list { left: auto; right: 0; min-width: 220px; }
}

/* ---------- Livraison 71: student pages, dashboard blocks ---------- */
.page.page-dash { max-width: 1120px; margin: 0 auto; }
.ph-sub { font-size: 14px; color: var(--ink-soft); margin-top: 6px; }
.sec-label { font-size: 11.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--teal); margin: 18px 0 10px; }
.btn-go { padding: 6px 12px; white-space: nowrap; }
.card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 14px; }
.c-card { display: flex; flex-direction: column; gap: 6px; text-align: left; background: #fff; border: 1px solid var(--line); border-radius: 14px; padding: 16px 18px; font-family: inherit; color: var(--ink); cursor: pointer; min-width: 0; }
.c-card:hover { border-color: var(--teal); }
.c-card-name { font-size: 17px; font-weight: 700; overflow-wrap: anywhere; }
.c-card-line { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--ink-soft); }
.c-card-foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 8px; padding-top: 10px; border-top: 1px solid #EFECE3; }
.c-card-open { font-size: 13px; font-weight: 700; color: var(--teal); }
.c-card-new { border-style: dashed; align-items: center; justify-content: center; flex-direction: row; gap: 8px; color: var(--ink-soft); font-weight: 600; min-height: 140px; }
.next-up { display: flex; align-items: center; gap: 16px; background: linear-gradient(135deg, var(--sidebar), #24507A); color: #fff; border-radius: 16px; padding: 20px 22px; margin-bottom: 18px; }
.next-up .type-ic { width: 42px; height: 42px; }
.next-up-main { flex: 1; min-width: 0; }
.next-up-k { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: #7FD1BE; font-weight: 700; }
.next-up-title { display: block; background: none; border: none; padding: 0; margin: 4px 0; font-family: 'Fraunces', serif; font-size: 23px; font-weight: 600; color: #fff; text-align: left; cursor: pointer; overflow-wrap: anywhere; }
.next-up-title:hover { text-decoration: underline; text-underline-offset: 4px; }
.next-up-title-static { font-family: 'Fraunces', serif; font-size: 21px; margin-top: 4px; }
.next-up-meta { font-size: 13.5px; color: #C9D8E6; }
.next-up-due { font-weight: 700; } .next-up-due.danger { color: #F6B3BB; } .next-up-due.warn { color: #F3C98A; }
.next-up-go { background: var(--amber); color: #fff; border: none; border-radius: 10px; padding: 12px 20px; font-family: inherit; font-weight: 700; font-size: 15px; cursor: pointer; white-space: nowrap; }
.next-up-go:hover { opacity: 0.92; }
.dash-grid { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr); gap: 18px; align-items: start; }
.panel { background: #fff; border: 1px solid var(--line); border-radius: 14px; padding: 16px 18px; margin-bottom: 18px; min-width: 0; }
.panel-h { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 8px; }
.panel-h h2 { font-size: 16px; margin: 0; }
.panel-link { background: none; border: none; padding: 0; font-family: inherit; font-size: 13px; font-weight: 700; color: var(--teal); cursor: pointer; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
.panel-link:hover { text-decoration: underline; text-underline-offset: 3px; }
.panel-note { font-size: 12px; color: var(--ink-soft); }
.panel-text { font-size: 13.5px; color: var(--ink-soft); margin: 0 0 12px; }
.plist { display: flex; flex-direction: column; }
.prow { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid #EFECE3; }
.prow .dt-muted { font-size: 12.5px; white-space: nowrap; }
.due-danger { color: #B4233C; font-weight: 600; }
.due-warn { color: #B45309; font-weight: 600; }
.prow:last-child { border-bottom: none; }
.prow-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.skill-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.skill-tile { border: 1px solid var(--line); border-radius: 10px; padding: 10px 6px; text-align: center; background: #fff; font-family: inherit; cursor: pointer; color: var(--ink); min-width: 0; }
.skill-tile:disabled { cursor: default; opacity: 0.8; }
.skill-tile:hover:not(:disabled) { border-color: var(--teal); }
.skill-tile b { display: block; font-family: 'Fraunces', serif; font-size: 18px; overflow-wrap: anywhere; }
.skill-tile span { font-size: 11.5px; color: var(--ink-soft); }
.mini-bars { display: flex; align-items: flex-end; gap: 6px; height: 56px; margin-top: 8px; }
.mini-bar { flex: 1; background: var(--teal-soft); border: none; border-radius: 4px 4px 0 0; cursor: pointer; padding: 0; }
.mini-bar.last { background: var(--teal); }
.mini-card { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; margin-bottom: 8px; background: #fff; font-family: inherit; color: var(--ink); text-align: left; cursor: pointer; }
.mini-card:hover { border-color: var(--teal); }
.mini-card b { font-size: 14px; }
/* Livraison 72 — teacher cards and dashboard */
div.c-card:focus-visible, .act-row:focus-visible { outline: 2px solid var(--teal); outline-offset: 2px; }
.code-pill { cursor: pointer; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0.04em; }
.code-pill:hover { filter: brightness(0.96); }
.c-card-num { color: var(--ink); }
.c-card-dot { margin: 0 2px; }
.c-card-quiet { font-size: 12.5px; color: var(--ink-soft); white-space: nowrap; }
.act-row { display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 0; border: none; border-bottom: 1px solid #EFECE3; background: none; font-family: inherit; color: var(--ink); text-align: left; cursor: pointer; }
.act-row:last-child { border-bottom: none; }
.act-row:hover .act-text b { text-decoration: underline; text-underline-offset: 3px; }
.act-av { flex: none; width: 30px; height: 30px; border-radius: 50%; background: var(--amber); color: #fff; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; }
.act-text { font-size: 13.5px; overflow-wrap: anywhere; }
.mini-card .ex-badge { flex: none; }
/* Livraison 73 — one assignment, teacher side */
.stat-grid.stat-grid-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.pill-blue { background: #E3ECF5; color: #2B5A85; }
.dt-row.dt-row-static { cursor: default; }
.dt-row.dt-row-static:hover td { background: transparent; }
.dt-name { font-weight: 600; }
.dt-result { font-weight: 700; }
.dt-q { display: block; font-size: 13.5px; color: var(--ink); overflow-wrap: anywhere; }
.dt-row-hard td { background: #FDF6EC; }
/* Livraison 74 — results (student) and correction (teacher) */
.rs-page { max-width: 1180px; }
.rs-hero { display: flex; align-items: center; gap: 24px; background: #fff; border: 1px solid var(--line); border-radius: 16px; padding: 20px 24px; margin: 6px 0 16px; }
.rs-hero-main { flex: 1; min-width: 0; }
.rs-hero-band { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-top: 2px; }
.rs-big { font-family: Georgia, serif; font-size: 40px; font-weight: 700; line-height: 1.05; }
.rs-hero-meta { font-size: 13.5px; color: var(--ink-soft); margin-top: 6px; }
.rs-title { font-family: Georgia, serif; font-size: 24px; margin: 2px 0 10px; overflow-wrap: anywhere; }
.rs-band-box { text-align: center; min-width: 130px; padding-right: 22px; border-right: 1px solid #EFECE3; }
.rs-task-bands { display: flex; gap: 10px; flex-wrap: wrap; }
.rs-task-band { border: 1px solid var(--line); border-radius: 10px; padding: 8px 14px; display: flex; flex-direction: column; min-width: 120px; }
.rs-task-band span { font-size: 11.5px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-soft); }
.rs-task-band b { font-family: Georgia, serif; font-size: 22px; }
.rs-dots { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.rs-dot { width: 30px; height: 30px; border-radius: 7px; border: none; font-family: inherit; font-weight: 700; font-size: 12.5px; cursor: pointer; }
.rs-dot.ok { background: var(--teal-soft); color: var(--teal); }
.rs-dot.ko { background: var(--rose-soft); color: var(--rose); }
.rs-teacher-note { background: #F4F8F6; border: 1px solid var(--teal-soft); border-radius: 12px; padding: 13px 16px; margin-bottom: 16px; }
.rs-teacher-note-h { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; color: var(--teal); }
.rs-teacher-note p { margin: 6px 0 0; white-space: pre-wrap; font-size: 14px; line-height: 1.55; }
.rs-viewbar { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
.rs-seg { display: inline-flex; border: 1px solid var(--line); border-radius: 9px; overflow: hidden; background: #fff; }
.rs-seg button { border: none; background: none; padding: 8px 14px; font-family: inherit; font-weight: 600; font-size: 13px; color: var(--ink-soft); cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.rs-seg button.on { background: var(--teal-soft); color: var(--teal); }
.rs-hint { font-size: 12.5px; color: var(--ink-soft); margin: 6px 0 0; }
.rs-center { text-align: center; }
.rs-sheet-chips { margin-bottom: 10px; }
.rs-res-h { text-align: right; }
.rs-res { text-align: right; white-space: nowrap; }
.rs-ok, .rs-ko, .rs-part { display: inline-flex; align-items: center; gap: 4px; font-weight: 700; font-size: 13px; }
.rs-ok { color: var(--teal); } .rs-ko { color: var(--rose); } .rs-part { color: #8A5414; }
.rs-row.rs-wrong td:first-child { box-shadow: inset 3px 0 0 var(--rose); }
.rs-row.rs-partial td:first-child { box-shadow: inset 3px 0 0 var(--amber); }
.rs-flash td, .rs-flash { background: #FFF6D9 !important; transition: background 0.3s; }
.rs-two { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 22px; align-items: start; }
.rs-main { min-width: 0; }
.rs-side { position: sticky; top: 16px; display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.rs-side .panel { margin-bottom: 0; }
.rs-ring { display: flex; justify-content: center; }
.rs-counts { display: flex; justify-content: center; gap: 14px; margin-top: 8px; }
.rs-actions { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
.rs-actions .btn-primary { flex: 1; }
.rs-next { margin-top: 10px; display: inline-flex; align-items: center; gap: 4px; }
.rs-nav { align-items: center; flex-wrap: wrap; }
.rs-nav-label { font-size: 13px; color: var(--ink-soft); white-space: nowrap; }
.rs-foot { margin-top: 22px; }
.rs-crit { margin-bottom: 10px; }
.rs-crit-h { display: flex; justify-content: space-between; gap: 10px; font-size: 13.5px; margin-bottom: 4px; }
.rs-crit-bar { height: 8px; background: #EFECE3; border-radius: 9px; overflow: hidden; }
.rs-crit-bar i { display: block; height: 100%; background: var(--teal); border-radius: 9px; }
.rs-notes { display: flex; flex-direction: column; gap: 8px; }
.rs-note { text-align: left; border: none; border-left: 3px solid var(--rose); background: #FFF7F7; border-radius: 0 8px 8px 0; padding: 9px 12px; font: inherit; font-size: 13px; color: var(--ink); cursor: pointer; display: flex; flex-direction: column; gap: 2px; }
.rs-note b { font-weight: 700; overflow-wrap: anywhere; }
.rs-note span { color: var(--ink-soft); overflow-wrap: anywhere; }
.rs-note.on { background: #FDECEC; }
mark.rs-mark-on { outline: 2px solid var(--rose); outline-offset: 1px; }
.rs-wait { display: flex; align-items: center; gap: 14px; background: #fff; border: 1px solid var(--line); border-radius: 14px; padding: 16px 18px; margin-bottom: 16px; }
.rs-wait-ic { width: 42px; height: 42px; border-radius: 50%; background: var(--amber-soft); color: #8A5414; display: flex; align-items: center; justify-content: center; flex: none; }
.rs-wait-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.rs-wait-main span { font-size: 13.5px; color: var(--ink-soft); }
.rs-wrv-top { padding: 22px 28px 0; max-width: 1400px; margin: 0 auto; width: 100%; }
.rs-wrv .qe-wrv-tabs { padding-left: 28px; }
.rs-wrv-form { display: flex; flex-direction: column; gap: 14px; }
.rs-wrv-form .panel { margin-bottom: 0; }
.rs-crit-row { margin-bottom: 12px; }
.rs-pick { display: flex; flex-wrap: wrap; gap: 3px; }
.rs-chip { min-width: 31px; height: 28px; padding: 0 5px; border: 1px solid var(--line); border-radius: 7px; background: #fff; font-family: inherit; font-weight: 600; font-size: 12px; color: var(--ink-soft); cursor: pointer; }
.rs-chip.on { background: var(--teal); border-color: var(--teal); color: #fff; }
.rs-lower { padding: 0 2px; }
/* Livraison 75 — paper builders: parts / content / settings */
.page.bl-page { max-width: 1440px; }
.bl-grid { display: grid; grid-template-columns: 200px minmax(0, 1fr) 320px; grid-template-areas: "left center right"; gap: 20px; align-items: start; }
.bl-left { grid-area: left; position: sticky; top: 16px; min-width: 0; }
.bl-center { grid-area: center; min-width: 0; }
.bl-center > .qe-part-block:first-of-type > div:first-child { margin-top: 0 !important; }
.bl-right { grid-area: right; position: sticky; top: 16px; max-height: calc(100vh - 32px); overflow-y: auto; display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.bl-right .panel { margin-bottom: 0; }
.bl-label { font-size: 11.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-soft); margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
.bl-count { font-weight: 700; color: var(--teal); letter-spacing: 0; }
.bl-settings .field-label { margin-top: 10px; }
.bl-settings > .bl-label + .field-label { margin-top: 0; }
.bl-row2 { display: grid; grid-template-columns: 1fr; gap: 0; }
.bl-parts { display: flex; flex-direction: column; gap: 4px; }
.bl-part { display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; padding: 9px 11px; border-radius: 9px; border: 1px solid transparent; background: none; font-family: inherit; color: var(--ink-soft); cursor: pointer; }
.bl-part:hover { background: #F4F2EC; }
.bl-part.on { background: #fff; border-color: var(--line); color: var(--ink); }
.bl-part-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.bl-part-main b { font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bl-part-main small { font-size: 11.5px; color: var(--ink-soft); }
.bl-ok { color: var(--teal); flex: none; }
.bl-todo { color: #C9C4B4; flex: none; }
.bl-add { display: inline-flex; align-items: center; gap: 6px; margin-top: 6px; padding: 8px 11px; border: 1px dashed var(--line); border-radius: 9px; background: none; font-family: inherit; font-weight: 600; font-size: 13px; color: var(--teal); cursor: pointer; }
.bl-check { margin-bottom: 4px; }
.bl-ck { display: flex; gap: 8px; align-items: center; font-size: 13px; padding: 4px 0; color: var(--ink-soft); }
.bl-ck.ok { color: var(--ink); }
.bl-ck-ic { width: 17px; height: 17px; border-radius: 50%; flex: none; display: inline-flex; align-items: center; justify-content: center; background: #E4E0D3; color: #fff; }
.bl-ck.ok .bl-ck-ic { background: var(--teal); }
.bl-right .qe-builder-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
.bl-right .qe-builder-actions button { width: 100%; }
.bl-audio { margin-bottom: 18px; }
.bl-steps { list-style: none; display: flex; align-items: center; gap: 10px; margin: 0 0 18px; padding: 0; flex-wrap: wrap; }
.bl-step { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: var(--ink-soft); }
.bl-step:not(:last-child)::after { content: ""; width: 40px; height: 2px; background: var(--line); margin-left: 4px; }
.bl-step.done:not(:last-child)::after { background: var(--teal); }
.bl-step-n { width: 24px; height: 24px; border-radius: 50%; border: 2px solid var(--line); background: #fff; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; }
.bl-step.done .bl-step-n { background: var(--teal); border-color: var(--teal); color: #fff; }
.bl-step.now { color: var(--ink); }
.bl-step.now .bl-step-n { border-color: var(--teal); color: var(--teal); }
.bl-import-panel { max-width: 900px; }
.bl-import-panel > .field-label:first-child { margin-top: 0 !important; }
.bl-ck-ic.bl-ck-bad { background: var(--rose); font-size: 11px; font-weight: 700; }
.bl-right .qe-pe-actions .field-hint { text-align: center; }
@media (max-width: 1250px) {
  .bl-grid { grid-template-columns: minmax(0, 1fr) 300px; grid-template-areas: "left left" "center right"; }
  .bl-left { position: static; }
  .bl-parts { flex-direction: row; flex-wrap: wrap; align-items: stretch; }
  .bl-parts .bl-label { width: 100%; }
  .bl-part { width: auto; min-width: 160px; border-color: var(--line); background: #fff; }
}
@media (max-width: 900px) {
  .bl-grid { grid-template-columns: minmax(0, 1fr); grid-template-areas: "left" "right" "center"; }
  .bl-right { position: static; max-height: none; overflow: visible; }
  .bl-part { flex: 1 1 140px; }
}
@media (max-width: 900px) {
  .rs-two { grid-template-columns: minmax(0, 1fr); }
  .rs-side { position: static; }
  .rs-hero { flex-direction: column; align-items: flex-start; gap: 14px; padding: 16px; }
  .rs-band-box { border-right: none; padding-right: 0; text-align: left; }
  .rs-big { font-size: 32px; }
  .rs-wrv-top { padding: 16px 16px 0; }
  .rs-wrv .qe-wrv-tabs { padding-left: 16px; }
}
@media (max-width: 900px) { .dash-grid { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 760px) {
  .next-up { flex-wrap: wrap; padding: 16px; }
  .next-up-go { width: 100%; }
  .next-up-title { font-size: 20px; }
  .skill-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
/* Livraison 77 — Profile, Join a class, teacher preview. */
.pf-grid { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 18px; align-items: start; }
.pf-who { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; }
.pf-avatar { width: 56px; height: 56px; font-size: 22px; }
.pf-who-main { display: flex; flex-direction: column; min-width: 0; }
.pf-who-main b { font-size: 17px; overflow-wrap: anywhere; }
.pf-inline { display: flex; gap: 8px; align-items: stretch; }
.pf-inline .field-input { flex: 1; min-width: 0; }
.pf-inline .btn-ghost { white-space: nowrap; }
.pf-readonly { padding: 11px 13px; border: 1px dashed var(--line); border-radius: 8px; background: #FAF9F5; font-size: 14.5px; color: var(--ink-soft); overflow-wrap: anywhere; }
.pf-acts { display: flex; flex-direction: column; }
.pf-act { display: flex; align-items: center; gap: 10px; width: 100%; padding: 11px 2px; background: none; border: none; border-bottom: 1px solid #EFECE3; font-family: inherit; font-size: 14px; color: var(--ink); text-align: left; cursor: pointer; }
.pf-act:last-child { border-bottom: none; }
.pf-act span { flex: 1; }
.pf-act b { font-family: 'Fraunces', serif; font-size: 18px; }
.pf-act .pf-act-go { color: var(--ink-soft); }
.pf-act:hover span, .pf-act:hover .pf-act-go { color: var(--teal); }
.pf-admin { border-style: dashed; border-color: #1B3A5C; }
.pf-admin .panel-h h2 { display: inline-flex; align-items: center; gap: 7px; color: #1B3A5C; }
.jc-page { max-width: 640px; margin: 0 auto; }
.jc-card { text-align: center; padding: 48px 8px 24px; }
.jc-boxes { display: flex; justify-content: center; gap: 10px; margin: 26px 0 8px; }
.jc-box { width: 58px; height: 66px; border: 2px solid var(--line); border-radius: 12px; background: #fff; text-align: center; font-family: 'IBM Plex Mono', monospace; font-size: 28px; font-weight: 700; color: var(--ink); text-transform: uppercase; outline: none; padding: 0; transition: border-color .15s, box-shadow .15s; }
.jc-box.on { border-color: var(--teal); }
.jc-box:focus { border-color: var(--teal); box-shadow: 0 0 0 3px var(--teal-soft); }
.jc-boxes.bad .jc-box { border-color: var(--rose); }
.jc-err { margin: 6px auto 0; max-width: 420px; }
.jc-go { margin-top: 18px; min-width: 200px; justify-content: center; }
.jc-mine { margin-top: 20px; font-size: 13.5px; color: var(--ink-soft); }
.pv-views { margin-bottom: 14px; }
.pv-key .pv-part-row td { background: #F6F4EE; font-size: 11.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-soft); padding-top: 8px; padding-bottom: 8px; }
.pv-part .qe-sp-questions, .pv-part .qe-sp-cuecard { margin-top: 4px; }
@media (max-width: 900px) { .pf-grid { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 760px) {
  .jc-card { padding-top: 24px; }
  .jc-boxes { gap: 7px; }
  .jc-box { width: 48px; height: 58px; font-size: 24px; }
  .pf-inline { flex-wrap: wrap; }
}
`;

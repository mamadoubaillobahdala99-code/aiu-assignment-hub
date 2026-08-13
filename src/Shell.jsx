export const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Public+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap');

:root {
  --paper: #EFEDE5;
  --paper-raised: #F8F7F2;
  --ink: #1B2820;
  --ink-soft: #5B6960;
  --teal: #0E6B5C;
  --teal-soft: #DCEAE4;
  --amber: #C97D25;
  --amber-soft: #F3E3CC;
  --rose: #AE3B47;
  --rose-soft: #F1DCDC;
  --line: #D9D4C4;
  --sidebar: #17251F;
  --sidebar-text: #D9E5DE;
}

* { box-sizing: border-box; }
body { margin: 0; }
.app-root { font-family: 'Public Sans', -apple-system, sans-serif; color: var(--ink); background: var(--paper); min-height: 100vh; width: 100%; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.boot, .center-spin { display: flex; align-items: center; justify-content: center; min-height: 300px; color: var(--teal); }

.auth { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
.auth-card { max-width: 420px; width: 100%; background: var(--paper-raised); border: 1px solid var(--line); border-radius: 14px; padding: 36px 32px; }
.auth-eyebrow { font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 0.08em; color: var(--teal); margin-bottom: 10px; }
.auth-title { font-family: 'Fraunces', serif; font-size: 32px; font-weight: 600; margin: 0 0 8px; }
.auth-sub { color: var(--ink-soft); font-size: 14.5px; line-height: 1.5; margin: 0 0 22px; }
.auth-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); margin-bottom: 20px; }
.auth-tab { background: none; border: none; padding: 8px 4px; margin-right: 20px; font-family: inherit; font-size: 13px; font-weight: 600; color: var(--ink-soft); cursor: pointer; border-bottom: 2px solid transparent; }
.auth-tab.active { color: var(--ink); border-bottom-color: var(--teal); }
.auth-submit { width: 100%; justify-content: center; margin-top: 18px; }
.auth-note { font-size: 12px; color: var(--ink-soft); margin-top: 14px; line-height: 1.5; }

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
.btn-ghost { display: inline-flex; align-items: center; gap: 7px; background: var(--paper-raised); border: 1px solid var(--line); padding: 9px 14px; border-radius: 8px; font-family: 'IBM Plex Mono', monospace; font-size: 12.5px; font-weight: 500; color: var(--ink); cursor: pointer; letter-spacing: 0.03em; }

.shell { display: flex; min-height: 100vh; }
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

.main { flex: 1; padding: 40px 44px; min-width: 0; }
.page { max-width: 880px; }
.page.narrow { max-width: 560px; }

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
.status-badge.pending { background: var(--rose-soft); color: var(--rose); }
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
.reading-text { cursor: default; }
.hl-word { cursor: pointer; border-radius: 3px; padding: 0 1px; transition: background .1s; }
.hl-word:hover { background: rgba(14,107,92,0.12); }

.sub-list { display: flex; flex-direction: column; gap: 8px; }
.sub-row { display: flex; align-items: center; gap: 11px; background: var(--paper-raised); border: 1px solid var(--line); border-radius: 9px; padding: 11px 14px; cursor: pointer; transition: border-color .15s; }
.sub-row:hover { border-color: var(--teal); }
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

@media (max-width: 760px) {
  .shell { flex-direction: column; }
  .sidebar { width: 100%; flex-direction: row; align-items: center; padding: 12px 16px; gap: 14px; }
  .brand { margin-bottom: 0; }
  .profile-card { display: none; }
  .nav { flex-direction: row; }
  .nav-item.logout { margin-top: 0; margin-left: auto; }
  .main { padding: 24px 18px; }
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
.wf-image-scroll { overflow: auto; border: 1px solid var(--line); border-radius: 10px; background: #fff; max-height: 72vh; padding: 8px; }
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
`;

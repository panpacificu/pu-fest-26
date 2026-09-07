:root{
  --navy:#0b1f3f;
  --blue:#215fa6;
  --blue-soft:#eef4fb;
  --gold:#f0c857;
  --ink:#182235;
  --muted:#6f7b8d;
  --line:#e5e9ef;
  --bg:#f6f8fb;
  --white:#ffffff;
  --green:#16845b;
  --red:#c84452;
  --orange:#a45e10;
  --radius:14px;
  --shadow:0 6px 24px rgba(18,37,63,.06);
}

*{box-sizing:border-box}
html{font-size:15px}
body{
  margin:0;
  font-family:"Inter",ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  background:var(--bg);
  color:var(--ink);
  -webkit-font-smoothing:antialiased;
  text-rendering:optimizeLegibility;
}
button,input,select,textarea{font:inherit}
button{touch-action:manipulation}
a{text-decoration:none;color:inherit}
small{font-size:.78rem}

.topbar{
  min-height:60px;
  background:#fff;
  border-bottom:1px solid var(--line);
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:18px;
  padding:0 clamp(14px,3vw,34px);
  position:sticky;
  top:0;
  z-index:40;
}
.brand{display:flex;align-items:center;gap:10px;min-width:0}
.brand-mark{
  width:34px;height:34px;border-radius:10px;
  background:var(--navy);color:#fff;display:grid;place-items:center;
  font-weight:800;font-size:.78rem;flex:0 0 auto
}
.brand span:last-child{display:flex;flex-direction:column;min-width:0}
.brand strong{font-size:.9rem;white-space:nowrap}
.brand small{color:var(--muted);margin-top:1px}
.topbar nav{display:flex;align-items:center;gap:14px;font-size:.82rem}
.topbar nav a{color:var(--muted);padding:8px 2px}
.topbar nav a.active{color:var(--navy);font-weight:700}
.link-btn{border:0;background:none;color:var(--muted);cursor:pointer;padding:8px 2px}

.page{
  width:min(1380px,calc(100% - 28px));
  margin:24px auto 54px;
}
.page-heading{
  display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin-bottom:18px;
}
.compact-heading h1{font-size:clamp(1.65rem,3vw,2.25rem)}
.page-heading h1{margin:4px 0 5px;letter-spacing:-.035em}
.page-heading p{margin:0;color:var(--muted);font-size:.9rem;line-height:1.5}
.kicker,.eyebrow{
  font-size:.68rem;font-weight:800;letter-spacing:.15em;color:var(--blue)
}
.event-chip{
  background:var(--navy);color:#fff;border-radius:12px;
  padding:11px 15px;display:flex;align-items:baseline;gap:6px;flex:0 0 auto
}
.event-chip strong{font-size:1.25rem}.event-chip span{font-size:.72rem;opacity:.72}

.panel{
  background:#fff;border:1px solid var(--line);border-radius:var(--radius);
  box-shadow:var(--shadow);padding:17px
}
.panel-head{
  display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:14px
}
.panel-head h2{font-size:1rem;margin:0 0 2px}
.panel-head p{font-size:.74rem;color:var(--muted);margin:0}
.panel-step{
  width:26px;height:26px;border-radius:50%;background:var(--blue-soft);color:var(--blue);
  display:grid;place-items:center;font-size:.72rem;font-weight:800
}

.grid-two{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(340px,.9fr);gap:16px}
.top-gap{margin-top:16px}
.sticky-panel{align-self:start;position:sticky;top:76px}

.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.span-2{grid-column:1/-1}
label{
  display:flex;flex-direction:column;gap:6px;font-size:.74rem;font-weight:700;color:#3b4758
}
input,select,textarea{
  width:100%;border:1px solid #dce2e9;background:#fff;border-radius:10px;
  padding:10px 11px;color:var(--ink);outline:none;transition:.15s;min-height:40px
}
textarea{resize:vertical}
input:focus,select:focus,textarea:focus{
  border-color:#7da9db;box-shadow:0 0 0 3px rgba(33,95,166,.09)
}
input[readonly]{background:#f7f9fb;color:#536074}
.form-divider{border-bottom:1px solid var(--line);margin:2px 0;height:18px;position:relative}
.form-divider span{
  position:absolute;background:#fff;padding-right:8px;color:var(--muted);
  font-size:.62rem;letter-spacing:.12em;font-weight:800
}
.form-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:3px}

.btn{
  border:0;border-radius:10px;padding:10px 14px;min-height:40px;
  font-weight:800;font-size:.76rem;cursor:pointer;display:inline-flex;
  align-items:center;justify-content:center;gap:6px
}
.btn:disabled{opacity:.5;cursor:not-allowed}
.btn-primary{background:var(--navy);color:#fff}
.btn-primary:hover{background:#12325f}
.btn-ghost{background:#f1f4f8;color:#2e3d52}
.btn-small{padding:7px 10px;min-height:32px;font-size:.7rem}

.table-wrap{
  overflow:auto;
  border-radius:10px;
  -webkit-overflow-scrolling:touch
}
table{width:100%;border-collapse:collapse;font-size:.75rem}
th{
  text-align:left;color:#8590a0;font-size:.62rem;letter-spacing:.07em;text-transform:uppercase;
  padding:9px 8px;border-bottom:1px solid var(--line);white-space:nowrap
}
td{padding:10px 8px;border-bottom:1px solid #eef1f5;vertical-align:top}
td strong{display:block}
td small{display:block;color:var(--muted);margin-top:2px;line-height:1.35}
.empty{text-align:center;color:var(--muted);padding:22px}

.status{
  display:inline-flex;border-radius:999px;padding:4px 7px;font-size:.58rem;
  font-weight:900;letter-spacing:.05em;background:#edf1f5;color:#536175
}
.status-sent,.status-success{background:#e7f6ef;color:#0b7450}
.status-unused,.status-pending{background:#eaf2ff;color:#245f9d}
.status-failed,.status-invalid,.status-void{background:#fdecee;color:#a62f3b}
.status-used{background:#fff0df;color:#99570d}

.stats{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:14px}
.stat{
  background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px;
  box-shadow:0 2px 10px rgba(18,37,63,.025)
}
.stat span{display:block;font-size:.68rem;color:var(--muted);margin-bottom:5px}
.stat strong{font-size:1.4rem;letter-spacing:-.03em}
.search{max-width:310px}

.staff-list{display:grid;gap:5px}
.staff-row{
  display:flex;justify-content:space-between;align-items:center;gap:12px;
  padding:9px 0;border-bottom:1px solid var(--line)
}
.staff-row strong,.staff-row small{display:block}
.staff-row small{color:var(--muted);font-size:.68rem;margin-top:2px}
.staff-row>div:last-child{display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
.role{
  font-size:.58rem;font-weight:800;letter-spacing:.06em;color:var(--blue);
  background:#edf4ff;padding:4px 7px;border-radius:999px
}

dialog{border:0;background:transparent;padding:0;max-width:min(500px,calc(100vw - 24px));width:100%}
dialog::backdrop{background:rgba(5,17,38,.58);backdrop-filter:blur(2px)}
.dialog-card{
  background:#fff;border-radius:18px;padding:22px;box-shadow:0 24px 70px rgba(0,0,0,.24);
  display:grid;gap:11px;position:relative
}
.dialog-card h2{margin:0;font-size:1.25rem}
.dialog-card>p{color:var(--muted);margin:0;font-size:.85rem}
.dialog-x{position:absolute;right:12px;top:9px;border:0;background:none;font-size:1.4rem;color:var(--muted);cursor:pointer}
.success-icon{
  width:48px;height:48px;border-radius:50%;background:#e3f7ee;color:var(--green);
  display:grid;place-items:center;font-size:1.35rem;font-weight:900
}
.ticket-list{display:grid;gap:6px}
.ticket-list>div{
  border:1px solid var(--line);border-radius:9px;padding:8px 10px;
  display:flex;justify-content:space-between;gap:10px
}
.ticket-list span{color:var(--muted);font-size:.68rem}

.toast{
  position:fixed;right:16px;bottom:16px;background:var(--navy);color:#fff;
  padding:11px 13px;border-radius:10px;box-shadow:var(--shadow);z-index:100;
  transform:translateY(12px);opacity:0;transition:.2s;font-size:.75rem;max-width:330px
}
.toast.show{transform:none;opacity:1}
.toast-error{background:#8f2934}.toast-success{background:#087450}

.login-page{
  min-height:100vh;
  background:linear-gradient(135deg,#0b1f3f 0%,#102e5f 100%);
  color:white;display:grid;place-items:center;padding:22px
}
.login-shell{
  width:min(920px,100%);display:grid;grid-template-columns:1fr 380px;gap:42px;align-items:center
}
.login-brand h1{
  font-size:clamp(3.5rem,8vw,5.8rem);margin:4px 0;letter-spacing:-.065em;line-height:.92
}
.login-brand h1 span{color:var(--gold)}
.login-brand>p{color:#c7d2e2;max-width:460px;font-size:1rem;line-height:1.6}
.event-meta{display:flex;gap:24px;margin-top:30px}
.event-meta div{display:flex;flex-direction:column;gap:3px}
.event-meta small{font-size:.58rem;letter-spacing:.13em;color:#8f9db2}
.event-meta strong{font-size:.74rem}
.login-card{
  background:#fff;color:var(--ink);border-radius:20px;padding:26px;box-shadow:0 24px 70px rgba(0,0,0,.22)
}
.login-card h2{font-size:1.7rem;margin:4px 0}
.login-card>div>p{color:var(--muted);margin:0;font-size:.82rem;line-height:1.5}
.stack{display:grid;gap:12px;margin-top:20px}
.form-error{color:#a92e3a;background:#fdecee;padding:9px;border-radius:8px;font-size:.7rem}
.fineprint{margin-top:16px;color:#94a0b0;font-size:.62rem}

.scanner-page{background:#081832;color:#fff;min-height:100vh}
.scanner-topbar{background:#0a1e3e;border-color:#17335f;color:#fff}
.scanner-topbar .link-btn{color:#b6c2d4}
.scanner-shell{
  width:min(1080px,calc(100% - 20px));margin:18px auto 30px;
  display:grid;grid-template-columns:1fr .78fr;gap:14px
}
.scanner-card{background:#fff;color:var(--ink);border-radius:16px;padding:16px}
.scanner-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.scanner-heading h1{font-size:1.5rem;margin:3px 0}
.scanner-heading p{margin:0;color:var(--muted);font-size:.8rem}
.gate-label{max-width:180px}
#reader{
  margin-top:14px;border-radius:12px;overflow:hidden;background:#07111f;min-height:320px
}
#reader video{object-fit:cover}
.scanner-help{text-align:center;color:var(--muted);font-size:.68rem;margin:9px 0}
.manual-box{margin-top:10px;border-top:1px solid var(--line);padding-top:12px}
.manual-box>span{font-size:.68rem;color:var(--muted)}
.manual-box>div{display:flex;gap:7px;margin-top:6px}
.scan-result{
  border-radius:16px;padding:28px;min-height:460px;display:flex;flex-direction:column;
  justify-content:center;align-items:center;text-align:center;background:#0d2a58;transition:.2s
}
.scan-result.success{background:#08724f}
.scan-result.used{background:#8a4e09}
.scan-result.invalid,.scan-result.void{background:#8d2834}
.result-symbol{
  width:76px;height:76px;border:2px solid rgba(255,255,255,.45);border-radius:50%;
  display:grid;place-items:center;font-size:2rem;font-weight:900;margin-bottom:18px
}
.result-label{font-size:.65rem;letter-spacing:.16em;font-weight:900;opacity:.8}
.scan-result h2{font-size:2rem;letter-spacing:-.04em;margin:8px 0 4px}
.scan-result p{color:rgba(255,255,255,.78);margin:0;font-size:.84rem;line-height:1.5}
.result-ticket{margin:15px 0;font-weight:800;letter-spacing:.11em;font-size:.82rem}
.lookup-person{padding:8px 0}.lookup-person strong,.lookup-person span{display:block}
.lookup-person span{color:var(--muted);font-size:.75rem;margin-top:3px}

.ticket-page{
  min-height:100vh;background:#0b1f3f;padding:20px;display:grid;place-items:center
}
.public-ticket-shell{width:min(480px,100%)}
.public-ticket{
  background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,.28)
}
.ticket-hero{
  background:linear-gradient(135deg,#0b1f3f,#215fa6);color:#fff;padding:25px;text-align:center
}
.ticket-hero .eyebrow{color:#d6e4ff}
.ticket-hero h1{font-size:2.8rem;margin:4px 0;letter-spacing:-.06em}
.ticket-hero h1 span{color:var(--gold)}
.ticket-hero p{margin:0;color:#d8e4f6;font-size:.82rem}
.ticket-body{padding:24px;text-align:center}
.public-status{margin-bottom:14px}
.ticket-qr{display:grid;place-items:center;margin:7px auto 15px;min-height:210px}
.ticket-body h2{font-size:1.55rem;margin:8px 0 3px}
.ticket-body>p{color:var(--muted);margin:0;font-size:.8rem}
.ticket-number{margin:18px 0;background:#f5f7fa;border-radius:11px;padding:12px}
.ticket-number small{display:block;color:var(--muted);font-size:.58rem;letter-spacing:.13em}
.ticket-number strong{display:block;margin-top:3px;letter-spacing:.08em}
.ticket-note{font-size:.7rem;color:var(--muted);line-height:1.55}
.public-ticket footer{
  border-top:1px dashed #d7dde5;padding:14px 20px;text-align:center;
  font-size:.62rem;color:var(--muted);line-height:1.5
}
.ticket-error{display:grid;gap:7px;padding:24px 0}
.ticket-error strong{font-size:1.25rem}.ticket-error span{color:var(--muted);font-size:.8rem}

@media(max-width:980px){
  .grid-two,.scanner-shell{grid-template-columns:1fr}
  .sticky-panel{position:static}
  .stats{grid-template-columns:repeat(2,1fr)}
  .login-shell{grid-template-columns:1fr;gap:28px;max-width:620px}
  .login-brand{text-align:center}
  .login-brand>p{margin-inline:auto}
  .event-meta{justify-content:center}
  .scan-result{min-height:320px}
}

@media(max-width:680px){
  html{font-size:14px}
  .topbar{min-height:56px;padding:0 12px}
  .brand strong{font-size:.82rem}
  .brand small{font-size:.66rem}
  .topbar nav{gap:10px}
  .topbar nav a{display:none}
  .link-btn{font-size:.72rem}

  .page{width:min(100% - 16px,1380px);margin-top:14px}
  .page-heading{align-items:flex-start;flex-direction:column;margin-bottom:12px}
  .page-heading h1{font-size:1.6rem}
  .event-chip{padding:9px 12px}

  .panel{padding:13px;border-radius:12px}
  .panel-head{margin-bottom:11px}
  .form-grid{grid-template-columns:1fr;gap:10px}
  .span-2{grid-column:auto}
  .form-actions{position:sticky;bottom:0;background:linear-gradient(to top,#fff 80%,rgba(255,255,255,0));padding-top:8px}
  .form-actions .btn-primary{width:100%;min-height:46px}
  input,select,textarea{min-height:44px;font-size:16px}
  textarea{font-size:15px}
  .btn{min-height:42px}

  .table-wrap{margin-inline:-3px}
  table{min-width:640px}
  th{padding:8px 7px}
  td{padding:9px 7px}

  .stats{grid-template-columns:1fr 1fr;gap:8px}
  .stat{padding:12px}
  .stat strong{font-size:1.2rem}
  .stat:last-child{grid-column:1/-1}
  .search{max-width:none}

  .scanner-shell{width:min(100% - 10px,1080px);margin:6px auto 16px;gap:8px}
  .scanner-card{padding:11px;border-radius:12px}
  .scanner-heading{flex-direction:column}
  .scanner-heading h1{font-size:1.25rem}
  .gate-label{max-width:none;width:100%}
  #reader{min-height:285px;margin-top:10px;border-radius:10px}
  .manual-box>div{display:grid;grid-template-columns:1fr auto}
  .scan-result{min-height:270px;padding:20px;border-radius:12px}
  .result-symbol{width:62px;height:62px;font-size:1.6rem;margin-bottom:13px}
  .scan-result h2{font-size:1.55rem}
  .scan-result .btn{width:100%;max-width:240px}

  .login-page{padding:14px}
  .login-card{padding:22px;border-radius:16px}
  .login-brand h1{font-size:3.6rem}
  .login-brand>p{font-size:.9rem}
  .event-meta{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:20px}
  .event-meta div:last-child{grid-column:1/-1}
  .login-card .btn-primary{min-height:46px}

  .ticket-page{padding:10px}
  .public-ticket-shell{width:100%}
  .public-ticket{border-radius:16px}
  .ticket-hero{padding:20px}
  .ticket-hero h1{font-size:2.45rem}
  .ticket-body{padding:18px}
}

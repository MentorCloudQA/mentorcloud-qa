import type {
  Reporter,
  FullConfig,
  Suite,
  TestCase,
  FullResult,
} from '@playwright/test/reporter';
import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Custom reporter — renders a branded TEST-RUN-REPORT.pdf after EVERY
 * `npx playwright test` invocation, so the report always reflects the most
 * recent run. Wired into playwright.config.ts. Focuses on the functional
 * `staging` project; the auth `setup` project is summarised separately.
 *
 * outcome() classifies each test as expected (passed) / unexpected (failed) /
 * flaky (failed then passed on retry) / skipped.
 */
const OUT_PDF = 'TEST-RUN-REPORT.pdf';
const OUT_HTML = 'TEST-RUN-REPORT.html'; // intermediate; handy for quick viewing
const LOGO_PATH = 'C:/projects/mentorcloud/Assets/Square_Image_Logo.png';
const REPORTER_NAME = 'Venu';

type Outcome = 'expected' | 'unexpected' | 'flaky' | 'skipped';
type Row = {
  id: string;
  title: string;
  module: string;
  outcome: Outcome;
  location: string;
  error: string;
  skipReason: string;
};

const esc = (s: string) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function moduleOf(test: TestCase): string {
  const file = test.location.file.replace(/\\/g, '/');
  const m = file.match(/\/tests\/([^/]+)\//);
  return m ? m[1] : '(other)';
}
function idOf(test: TestCase): string {
  const m = test.title.match(/^(TC-[A-Z0-9]+-\d+)/);
  return m ? m[1] : test.title.split(' ')[0];
}

export default class RunReportReporter implements Reporter {
  private rootSuite!: Suite;
  private startedAt = 0;

  onBegin(_config: FullConfig, suite: Suite): void {
    this.rootSuite = suite;
    this.startedAt = Date.now();
  }

  async onEnd(result: FullResult): Promise<void> {
    const durationMs = Date.now() - this.startedAt;
    const now = new Date();

    let setupPassed = 0;
    let setupFailed = 0;
    const rows: Row[] = [];

    for (const projectSuite of this.rootSuite.suites) {
      const project = projectSuite.title;
      for (const test of projectSuite.allTests()) {
        const outcome = test.outcome() as Outcome;
        if (project === 'setup') {
          if (outcome === 'unexpected') setupFailed++;
          else setupPassed++;
          continue;
        }
        const rawErr =
          test.results
            .map((res) => res.error?.message || res.error?.value || res.error?.stack || '')
            .find((s) => s.trim()) || '';
        const errMsg =
          rawErr
            .replace(/\x1b\[[0-9;]*m/g, '')
            .split('\n')
            .map((l) => l.trim())
            .find((l) => l)
            ?.slice(0, 200) || '';
        const skipReason =
          outcome === 'skipped'
            ? (test.annotations.find((a) => a.type === 'skip')?.description || '').slice(0, 200)
            : '';
        rows.push({
          id: idOf(test),
          title: test.title.replace(/^TC-[A-Z0-9]+-\d+\s*/, ''),
          module: moduleOf(test),
          outcome,
          location: `${path.basename(test.location.file)}:${test.location.line}`,
          error: errMsg,
          skipReason,
        });
      }
    }

    const count = (o: Outcome) => rows.filter((r) => r.outcome === o).length;
    const passed = count('expected');
    const failed = count('unexpected');
    const flaky = count('flaky');
    const skipped = count('skipped');
    const totalFn = rows.length;

    const fmtDur = (ms: number) => {
      const s = Math.round(ms / 1000);
      return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
    };
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(
      now.getHours()
    )}:${pad(now.getMinutes())}`;

    const state = failed > 0 ? 'fail' : flaky > 0 ? 'warn' : 'pass';
    const statusText =
      failed > 0
        ? `${failed} Failed`
        : flaky > 0
        ? `Passed · ${flaky} Flaky`
        : 'All Passed';
    const statusColor =
      state === 'fail' ? 'var(--mandy)' : state === 'warn' ? 'var(--fuel-yellow)' : 'var(--shamrock)';

    let logoSrc = '';
    try {
      logoSrc = 'data:image/png;base64,' + fs.readFileSync(LOGO_PATH).toString('base64');
    } catch {
      /* render without the logo */
    }

    const modules = [...new Set(rows.map((r) => r.module))].sort();
    const modRows = modules
      .map((mod) => {
        const r = rows.filter((x) => x.module === mod);
        const f = r.filter((x) => x.outcome === 'unexpected').length;
        const fl = r.filter((x) => x.outcome === 'flaky').length;
        const sk = r.filter((x) => x.outcome === 'skipped').length;
        const p = r.filter((x) => x.outcome === 'expected').length;
        return `<tr><td class="mod">${esc(mod)}</td><td class="num ok">${p}</td><td class="num ${
          f ? 'bad' : 'z'
        }">${f}</td><td class="num ${fl ? 'wn' : 'z'}">${fl}</td><td class="num ${
          sk ? 'sk' : 'z'
        }">${sk}</td><td class="num tot">${r.length}</td></tr>`;
      })
      .join('');

    const listSection = (
      title: string,
      cls: string,
      items: Row[],
      withErr: boolean
    ): string =>
      items.length
        ? `<div class="seclabel"><h2>${title}</h2><span class="rule"></span></div>
           <div class="list ${cls}">${items
             .map(
               (r) =>
                 `<div class="item"><div class="item-h"><span class="iid">${esc(r.id)}</span><span class="ititle">${esc(
                   r.title
                 )}</span><span class="iloc">${esc(r.location)}</span></div>${
                   withErr && r.error ? `<div class="ierr">${esc(r.error)}</div>` : ''
                 }${r.skipReason ? `<div class="ireason">${esc(r.skipReason)}</div>` : ''}</div>`
             )
             .join('')}</div>`
        : '';

    const failures = rows.filter((r) => r.outcome === 'unexpected');
    const flakies = rows.filter((r) => r.outcome === 'flaky');
    const skips = rows.filter((r) => r.outcome === 'skipped');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  :root{--black-pearl:#06222E;--pearl-2:#0c3344;--shamrock:#35E19D;--royal-blue:#485DD8;--electric-violet:#9727E7;--mandy:#E24B4C;--fuel-yellow:#EBB12D;--ink:#233640;--muted:#6c7e87;--line:#e4ecf0;}
  *{box-sizing:border-box;}
  body{font-family:-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--ink);font-size:11px;line-height:1.45;margin:0;background:radial-gradient(60% 30% at 90% 0%,rgba(53,225,157,.06),transparent 70%),radial-gradient(50% 26% at 4% 3%,rgba(151,39,231,.05),transparent 70%),#fff;}
  .hero{position:relative;overflow:hidden;border-radius:22px;padding:24px 26px;color:#eaf6f1;background:radial-gradient(120% 140% at 100% 0%,rgba(72,93,216,.55),transparent 55%),radial-gradient(130% 150% at 0% 100%,rgba(53,225,157,.40),transparent 55%),radial-gradient(90% 120% at 80% 110%,rgba(151,39,231,.38),transparent 60%),linear-gradient(135deg,var(--black-pearl),var(--pearl-2));box-shadow:0 18px 40px -18px rgba(6,34,46,.55);}
  .hero::after{content:"";position:absolute;inset:0;border-radius:22px;border:1px solid rgba(255,255,255,.10);pointer-events:none;}
  .hero-top{display:flex;align-items:center;justify-content:space-between;gap:16px;}
  .logo-wrap{background:#fff;border-radius:14px;padding:8px 14px;display:inline-flex;box-shadow:0 8px 20px -10px rgba(0,0,0,.4);}
  .logo{height:28px;width:auto;display:block;}
  .status-chip{display:inline-flex;align-items:center;gap:8px;background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.22);color:#fff;font-weight:700;font-size:11px;letter-spacing:.04em;padding:8px 16px;border-radius:999px;}
  .status-chip .dot{width:9px;height:9px;border-radius:50%;background:${statusColor};box-shadow:0 0 10px ${statusColor};}
  h1{font-size:25px;margin:16px 0 4px;color:#fff;letter-spacing:-.4px;font-weight:800;}
  h1 .grad{background:linear-gradient(90deg,var(--shamrock),#8ad9ff 50%,var(--fuel-yellow));-webkit-background-clip:text;background-clip:text;color:transparent;}
  .runmeta{color:#b9cfd6;margin:0 0 16px;font-size:10px;}
  .runmeta code{background:rgba(255,255,255,.10);color:#d7fff0;border-radius:6px;padding:2px 6px;}
  .stats{display:flex;gap:10px;flex-wrap:wrap;}
  .stat{flex:1;min-width:92px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:11px 13px;}
  .stat .v{font-size:22px;font-weight:800;color:#fff;line-height:1;}
  .stat .l{font-size:8px;letter-spacing:.07em;text-transform:uppercase;color:#9fb6bd;margin-top:6px;}
  .stat.pass .v{color:var(--shamrock);} .stat.fail .v{color:#ff8d8d;} .stat.warn .v{color:var(--fuel-yellow);} .stat.skip .v{color:#9fb6bd;}
  .seclabel{display:flex;align-items:center;gap:10px;margin:20px 0 10px;}
  .seclabel h2{font-size:12px;color:var(--black-pearl);margin:0;letter-spacing:.03em;text-transform:uppercase;}
  .seclabel .rule{flex:1;height:2px;border-radius:2px;background:linear-gradient(90deg,var(--shamrock),transparent);}
  .list{display:flex;flex-direction:column;gap:8px;}
  .item{border:1px solid var(--line);border-radius:12px;padding:9px 12px;background:#fff;box-shadow:0 8px 20px -18px rgba(6,34,46,.4);}
  .list.fail .item{border-left:5px solid var(--mandy);}
  .list.warn .item{border-left:5px solid var(--fuel-yellow);}
  .list.skip .item{border-left:5px solid #aebcc3;}
  .item-h{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;}
  .iid{font-weight:800;color:var(--royal-blue);white-space:nowrap;}
  .ititle{flex:1;color:var(--black-pearl);font-weight:600;}
  .iloc{font-family:"SF Mono",Consolas,monospace;font-size:9px;color:var(--muted);background:#eef4f7;border-radius:5px;padding:1px 6px;}
  .ierr{margin-top:5px;font-family:"SF Mono",Consolas,monospace;font-size:9px;color:#a8323a;background:#fdf0f0;border-radius:6px;padding:5px 8px;}
  .ireason{margin-top:5px;font-size:9.5px;color:var(--muted);}
  table{width:100%;border-collapse:separate;border-spacing:0;border-radius:14px;overflow:hidden;box-shadow:0 10px 26px -18px rgba(6,34,46,.4);}
  th{background:var(--black-pearl);color:#bfeede;text-align:left;font-size:8.5px;text-transform:uppercase;letter-spacing:.05em;padding:9px 12px;}
  td{padding:8px 12px;border-bottom:1px solid var(--line);}
  tbody tr:nth-child(even) td{background:#f5f9fb;}
  td.mod{font-weight:600;color:var(--black-pearl);}
  td.num,th.num{text-align:center;}
  td.num.ok{color:#1b8f5e;font-weight:700;} td.num.bad{color:var(--mandy);font-weight:800;}
  td.num.wn{color:#b9851a;font-weight:700;} td.num.sk{color:var(--muted);} td.num.z{color:#c4cfd5;} td.num.tot{font-weight:700;color:var(--black-pearl);}
  .footer{margin-top:18px;padding:12px 14px;border-radius:14px;background:#f4f8fa;border:1px solid var(--line);color:#5d6e76;font-size:9px;}
</style></head><body>
  <div class="hero">
    <div class="hero-top">
      <span class="logo-wrap"><img class="logo" src="${logoSrc}" alt="MentorCloud"></span>
      <span class="status-chip"><span class="dot"></span>${esc(statusText)}</span>
    </div>
    <h1>Test Run <span class="grad">Report</span></h1>
    <p class="runmeta">Last run <code>${stamp}</code> &nbsp;·&nbsp; Duration <code>${fmtDur(
      durationMs
    )}</code> &nbsp;·&nbsp; Project <code>staging</code> &nbsp;·&nbsp; Reporter <code>${esc(
      REPORTER_NAME
    )}</code> &nbsp;·&nbsp; Auth setup ${setupPassed} ok${setupFailed ? `, ${setupFailed} failed` : ''}</p>
    <div class="stats">
      <div class="stat pass"><div class="v">${passed}</div><div class="l">Passed</div></div>
      <div class="stat warn"><div class="v">${flaky}</div><div class="l">Flaky</div></div>
      <div class="stat fail"><div class="v">${failed}</div><div class="l">Failed</div></div>
      <div class="stat skip"><div class="v">${skipped}</div><div class="l">Skipped</div></div>
      <div class="stat"><div class="v">${totalFn}</div><div class="l">Executed</div></div>
    </div>
  </div>

  ${listSection('❌ Failures', 'fail', failures, true)}
  ${listSection('⚠️ Flaky — passed on retry', 'warn', flakies, false)}
  ${listSection('⏭️ Skipped — by design', 'skip', skips, false)}

  <div class="seclabel"><h2>Results by module</h2><span class="rule"></span></div>
  <table><thead><tr><th>Module</th><th class="num">Passed</th><th class="num">Failed</th><th class="num">Flaky</th><th class="num">Skipped</th><th class="num">Total</th></tr></thead><tbody>${modRows}</tbody></table>

  <p class="footer">MentorCloud QA · Auto-generated by <b>reporters/run-report.ts</b> after every <code>npx playwright test</code> run. Failures during staging-load windows typically recover on an isolated re-run; tests skip only on a genuine technical blocker or QA directive.</p>
</body></html>`;

    fs.writeFileSync(OUT_HTML, html);
    try {
      const browser = await chromium.launch();
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle' });
      await page.pdf({
        path: OUT_PDF,
        format: 'A4',
        printBackground: true,
        margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
      });
      await browser.close();
      // eslint-disable-next-line no-console
      console.log(
        `\n📄 ${OUT_PDF} updated — ${statusText} (${passed}/${totalFn} passed, status ${result.status}).`
      );
      // Publish to the shared synced folder (Google Drive / OneDrive) so a single
      // shared link always shows the latest report. Set PDF_PUBLISH_DIR in .env.
      const pubDir = process.env.PDF_PUBLISH_DIR;
      if (pubDir) {
        try {
          fs.mkdirSync(pubDir, { recursive: true });
          fs.copyFileSync(OUT_PDF, path.join(pubDir, OUT_PDF));
          // eslint-disable-next-line no-console
          console.log(`📤 Published ${OUT_PDF} -> ${pubDir}`);
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn(`⚠️ Could not publish ${OUT_PDF}: ${(e as Error).message}`);
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`\n⚠️ Could not render ${OUT_PDF}:`, (e as Error).message, `— HTML written to ${OUT_HTML}.`);
    }
  }
}

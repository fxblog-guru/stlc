/**
 * tooling.mjs — which tools this machine needs before the enabled test types can run, and how to
 * install each one (the `preparing-test-tooling` skill, `/qa-setup`, `npm run qa:setup`).
 *
 * The plan is a pure function of the profile (enabled §Test types, §Platforms runners, §Unit testing
 * frameworks) so a test can pin it; setup-check.mjs probes the machine against it. Nothing here
 * installs anything.
 */

/**
 * One tool. `probe` is a read-only command (argv) whose exit 0 means present; `path` (relative to the
 * QA root) or `dir` (absolute) is checked instead when a file decides it. `install` per OS:
 * win · mac · linux; `any` when the command is the same everywhere.
 */
const T = {
  node: { label: 'Node.js ≥ 20', probe: ['node', '--version'], minMajor: 20, install: { win: 'winget install OpenJS.NodeJS.LTS', mac: 'brew install node@22', linux: 'https://nodejs.org/en/download (or nvm install 22)' } },
  deps: { label: 'QA workspace dependencies', path: 'node_modules/@playwright/test/package.json', install: { any: 'npm install   # in the QA root' } },
  browsers: { label: 'Playwright browsers', install: { any: 'npx playwright install chromium   # or set PW_CHANNEL=msedge|chrome in .env.<env> to use an installed browser' } },
  envFile: { label: '.env.<env>', install: { any: 'copy .env.example to .env.<env> in the QA root, then fill it (/qa-env checks the values)' } },
  k6: { label: 'k6', probe: ['k6', 'version'], install: { win: 'winget install k6 --source winget', mac: 'brew install k6', linux: 'https://grafana.com/docs/k6/latest/set-up/install-k6/' } },
  docker: { label: 'Docker (ZAP baseline)', probe: ['docker', 'version', '--format', '{{.Client.Version}}'], install: { win: 'winget install Docker.DockerDesktop', mac: 'brew install --cask docker', linux: 'https://docs.docker.com/engine/install/' } },
  java: { label: 'Java 17+ (Maestro needs it)', probe: ['java', '-version'], install: { win: 'winget install Microsoft.OpenJDK.17', mac: 'brew install openjdk@17', linux: 'sudo apt-get install -y openjdk-17-jre' } },
  maestro: { label: 'Maestro CLI', probe: ['maestro', '--version'], install: { win: 'https://docs.maestro.dev/getting-started/installing-maestro/windows (WSL or the zip release on PATH)', mac: 'curl -fsSL "https://get.maestro.mobile.dev" | bash', linux: 'curl -fsSL "https://get.maestro.mobile.dev" | bash' } },
  adb: { label: 'Android platform-tools (adb)', probe: ['adb', 'version'], install: { win: 'winget install Google.PlatformTools', mac: 'brew install --cask android-platform-tools', linux: 'sudo apt-get install -y android-tools-adb' } },
  xcrun: { label: 'Xcode command-line tools (simctl)', probe: ['xcrun', 'simctl', 'help'], install: { win: 'iOS needs macOS — run iOS on a Mac or a device farm', mac: 'xcode-select --install', linux: 'iOS needs macOS — run iOS on a Mac or a device farm' } },
  appium: { label: 'Appium 2', probe: ['appium', '--version'], install: { any: 'npm install -g appium && appium driver install uiautomator2   # (xcuitest on macOS) — in the mobile framework repo’s own setup' } },
  dotnet: { label: '.NET SDK', probe: ['dotnet', '--version'], install: { win: 'winget install Microsoft.DotNet.SDK.8', mac: 'brew install --cask dotnet-sdk', linux: 'https://learn.microsoft.com/dotnet/core/install/linux' } },
  python: { label: 'Python 3 + pytest', probe: ['python', '-m', 'pytest', '--version'], install: { any: 'python -m pip install pytest   # in the app repo’s own environment' } },
  maven: { label: 'Maven or Gradle', probe: ['mvn', '-v'], alt: ['gradle', '--version'], install: { win: 'winget install Apache.Maven', mac: 'brew install maven', linux: 'sudo apt-get install -y maven' } },
  allure: { label: 'Allure CLI (reports)', probe: ['allure', '--version'], install: { any: 'npm install -g allure-commandline' } },
  playwrightCli: { label: 'playwright-cli (live locator checks, agent exploration)', probe: ['playwright-cli', '--version'], install: { any: 'npm install -g @playwright/cli && playwright-cli install --skills' } },
  mobileMcp: { label: 'mobile-mcp server (agent exploration on a device)', mcp: 'mobile-mcp', install: { any: 'claude mcp add mobile-mcp -- npx -y @mobilenext/mobile-mcp@latest' } },
  python3Wiki: { label: 'Python 3 (domain wiki converter)', probe: ['python', '--version'], install: { win: 'winget install Python.Python.3.12', mac: 'brew install python', linux: 'sudo apt-get install -y python3' } },
};

const PLAYWRIGHT_TYPES = ['api', 'integration', 'e2e', 'security', 'accessibility', 'ui'];
const BROWSER_TYPES = ['e2e', 'accessibility', 'ui'];

/** Unit toolchain from a §Unit testing `Language / framework` cell (`csharp / xunit`, `python / pytest`…). */
export function unitTool(framework) {
  const f = String(framework).toLowerCase();
  if (/csharp|xunit|nunit|mstest|dotnet/.test(f)) return 'dotnet';
  if (/python|pytest/.test(f)) return 'python';
  if (/java|kotlin|junit/.test(f)) return 'maven';
  if (/typescript|javascript|vitest|jest/.test(f)) return 'node';
  return null;
}

/**
 * The tool plan for a profile: [{ id, label, need: 'required'|'optional', for: [...why], probe, path,
 * mcp, install }]. `profile` = { types: string[], platforms: Map(id → { runner, enabled }),
 * unitFrameworks: string[] }; `os` ∈ win | mac | linux; `hasWikiInbox` adds the converter.
 */
export function toolingPlan(profile, { os = 'linux', hasWikiInbox = false } = {}) {
  const types = new Set(profile.types ?? []);
  const plats = [...(profile.platforms ?? new Map()).values()].filter((p) => p.enabled);
  const items = new Map();
  const add = (id, need, why) => {
    const cur = items.get(id);
    if (cur) { if (need === 'required') cur.need = 'required'; if (!cur.for.includes(why)) cur.for.push(why); return; }
    const t = T[id];
    items.set(id, { id, label: t.label, need, for: [why], probe: t.probe ?? null, alt: t.alt ?? null, minMajor: t.minMajor ?? null, path: t.path ?? null, mcp: t.mcp ?? null, install: t.install[os] ?? t.install.any });
  };

  add('node', 'required', 'every QA script');
  add('deps', 'required', 'lint, runners, run plans');
  add('envFile', 'required', 'every run');
  for (const t of PLAYWRIGHT_TYPES) if (types.has(t)) add('deps', 'required', t);
  for (const t of BROWSER_TYPES) if (types.has(t)) { add('browsers', 'required', t); add('playwrightCli', 'optional', t); }
  if (plats.some((p) => p.runner === 'playwright-electron')) add('deps', 'required', 'desktop-electron');
  if (types.has('performance')) add('k6', 'required', 'performance');
  if (types.has('security')) add('docker', 'required', 'security');
  if (types.has('mobile')) {
    for (const p of plats.filter((x) => x.kind === 'mobile' || ['android', 'ios'].includes(x.id))) {
      const why = `mobile ${p.id} (${p.runner})`;
      if (p.runner === 'maestro') { add('maestro', 'required', why); add('java', 'required', why); add('mobileMcp', 'optional', `${why} — /qa-explore --agent`); }
      if (p.runner === 'appium-wdio') add('appium', 'required', why);
      if (p.id === 'android') add('adb', 'required', why);
      if (p.id === 'ios') add('xcrun', 'required', why);
    }
  }
  if (types.has('unit')) for (const f of profile.unitFrameworks ?? []) { const id = unitTool(f); if (id && id !== 'node') add(id, 'required', `unit (${f})`); }
  add('allure', 'optional', 'npm run report:allure');
  if (hasWikiInbox) add('python3Wiki', 'optional', '/qa-knowledge converter');
  return [...items.values()];
}

/** §Unit testing `Language / framework` cells of a profile text. */
export function unitFrameworks(profileText) {
  const sec = profileText.replace(/\r\n?/g, '\n').split(/^## /m).find((s) => s.startsWith('Unit testing')) ?? '';
  const out = [];
  for (const l of sec.split('\n')) {
    const c = l.trim().startsWith('|') ? l.trim().split('|').slice(1, -1).map((x) => x.trim()) : [];
    if (c.length >= 3 && /^`[a-z0-9-]+`$/.test(c[0])) out.push(c[2].replace(/`/g, ''));
  }
  return out;
}

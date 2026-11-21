/* Theme: Auto | Light | AMOLED (true black). Classic script, loaded in <head> so the page never flashes the wrong theme.
   Auto follows the device's dark-mode setting and, where the browser exposes an ambient light sensor, the room's light:
   dim room -> true-black AMOLED with softer (less glaring) text; bright room -> light theme.
   Where there is no sensor, dark mode text is dimmed a little at night (22:00-06:00). The choice is remembered per browser. */
(function () {
  var KEY = 'bpm_prefs', root = document.documentElement, mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  var DEF = { theme: 'auto', size: 'm', density: 'comfortable', bright: 'auto', motion: 'full', idle: 15 };
  var prefs = Object.assign({}, DEF), lux = null;
  try { var raw = JSON.parse(localStorage.getItem(KEY) || 'null'); if (raw) Object.assign(prefs, raw); else { var old = localStorage.getItem('bpm_theme'); if (old) prefs.theme = old; } } catch (e) { }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) { } }
  var mode = prefs.theme;
  function textL() {                                   // text lightness (%) in AMOLED mode: dimmer in the dark, crisper in daylight (or fixed by the Settings page)
    if (prefs.bright === 'dim') return 72; if (prefs.bright === 'normal') return 88; if (prefs.bright === 'bright') return 96;
    if (lux != null) return lux < 3 ? 70 : lux < 20 ? 78 : lux < 100 ? 86 : 93;
    var hr = new Date().getHours(); return (hr >= 22 || hr < 6) ? 76 : 88;
  }
  function dark() {
    if (mode === 'light') return false; if (mode === 'amoled') return true;
    if (lux != null) return root.dataset.lux === 'dim' ? true : root.dataset.lux === 'bright' ? false : !!(mq && mq.matches);
    return !!(mq && mq.matches);
  }
  function apply() {
    mode = prefs.theme; var d = dark(); root.dataset.theme = d ? 'amoled' : 'light';
    var Z = { s: 0.92, m: 1, l: 1.12, xl: 1.25 }; root.style.setProperty('--z', Z[prefs.size] || 1); root.dataset.density = prefs.density; root.dataset.motion = prefs.motion; root.style.setProperty('--txt-l', textL() + '%');
    var m = document.querySelector('meta[name=theme-color]'); if (m) m.content = d ? '#000000' : '#0A5F22';
    var b = document.getElementById('theme'); if (b) { var n = { auto: 'Auto', light: 'Normal', amoled: 'AMOLED' }[mode]; b.title = 'Theme: ' + n + ' (click to change)'; b.setAttribute('aria-label', 'Theme: ' + n); b.dataset.mode = mode; b.querySelector('span').textContent = n; }
    document.dispatchEvent(new CustomEvent('bpm-theme', { detail: { dark: d } }));
  }
  window.bpmPrefs = { get: function () { return Object.assign({}, prefs); }, defaults: DEF,
    set: function (k, v) { prefs[k] = v; save(); apply(); }, reset: function () { prefs = Object.assign({}, DEF); save(); apply(); } };
  window.bpmTheme = { cycle: function () { prefs.theme = prefs.theme === 'auto' ? 'light' : prefs.theme === 'light' ? 'amoled' : 'auto'; save(); apply(); } };
  if (mq && mq.addEventListener) mq.addEventListener('change', apply);
  try {                                                // ambient light (Chromium on Android/ChromeOS where enabled); silently skipped elsewhere
    if ('AmbientLightSensor' in window) {
      var s = new AmbientLightSensor({ frequency: 1 });
      s.addEventListener('reading', function () {
        var prev = root.dataset.lux; lux = s.illuminance;
        root.dataset.lux = lux < 12 ? 'dim' : lux > 60 ? 'bright' : (prev || 'mid');   // hysteresis between 12 and 60 lux
        apply();
      });
      s.start();
    }
  } catch (e) { }
  apply();
  document.addEventListener('DOMContentLoaded', function () {
    var b = document.createElement('button'); b.id = 'theme'; b.type = 'button'; b.className = 'theme-fab';
    b.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg><span></span>';
    b.onclick = window.bpmTheme.cycle; document.body.appendChild(b); apply();
  });
})();

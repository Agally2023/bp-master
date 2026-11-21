/* Theme: Auto | Light | AMOLED (true black). Classic script, loaded in <head> so the page never flashes the wrong theme.
   Auto follows the device's dark-mode setting and, where the browser exposes an ambient light sensor, the room's light:
   dim room -> true-black AMOLED with softer (less glaring) text; bright room -> light theme.
   Where there is no sensor, dark mode text is dimmed a little at night (22:00-06:00). The choice is remembered per browser. */
(function () {
  var KEY = 'bpm_theme', root = document.documentElement, mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  var mode = 'auto', lux = null;
  try { mode = localStorage.getItem(KEY) || 'auto'; } catch (e) { }
  function textL() {                                   // text lightness (%) in AMOLED mode: dimmer in the dark, crisper in daylight
    if (lux != null) return lux < 3 ? 70 : lux < 20 ? 78 : lux < 100 ? 86 : 93;
    var hr = new Date().getHours(); return (hr >= 22 || hr < 6) ? 76 : 88;
  }
  function dark() {
    if (mode === 'light') return false; if (mode === 'amoled') return true;
    if (lux != null) return root.dataset.lux === 'dim' ? true : root.dataset.lux === 'bright' ? false : !!(mq && mq.matches);
    return !!(mq && mq.matches);
  }
  function apply() {
    var d = dark(); root.dataset.theme = d ? 'amoled' : 'light'; root.style.setProperty('--txt-l', textL() + '%');
    var m = document.querySelector('meta[name=theme-color]'); if (m) m.content = d ? '#000000' : '#0A5F22';
    var b = document.getElementById('theme'); if (b) { var n = { auto: 'Auto', light: 'Light', amoled: 'AMOLED' }[mode]; b.title = 'Theme: ' + n + ' (click to change)'; b.setAttribute('aria-label', 'Theme: ' + n); b.dataset.mode = mode; b.querySelector('span').textContent = n; }
  }
  window.bpmTheme = { cycle: function () { mode = mode === 'auto' ? 'light' : mode === 'light' ? 'amoled' : 'auto'; try { localStorage.setItem(KEY, mode); } catch (e) { } apply(); } };
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

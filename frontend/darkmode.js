(function() {
  function init(retry = 0) {
    const toggle = document.getElementById('toggleDarkMode');
    if (!toggle) {
      if (retry < 10) setTimeout(() => init(retry + 1), 50);
      return;
    }
    function apply(dark) {
      document.body.classList.toggle('dark', dark);
      toggle.checked = dark;
      localStorage.setItem('darkMode', dark ? '1' : '0');
    }
    const stored = localStorage.getItem('darkMode');
    const pref = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const startDark = stored === '1' || (stored === null && pref);
    apply(startDark);
    toggle.addEventListener('change', () => apply(toggle.checked));
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init());
  } else {
    init();
  }
})();

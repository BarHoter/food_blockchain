(function() {
  const btn = document.getElementById('toggleDarkMode');
  if (!btn) return;
  function apply(dark) {
    document.body.classList.toggle('dark', dark);
    btn.textContent = dark ? 'Light Mode' : 'Dark Mode';
    localStorage.setItem('darkMode', dark ? '1' : '0');
  }
  const stored = localStorage.getItem('darkMode');
  const pref = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const startDark = stored === '1' || (stored === null && pref);
  apply(startDark);
  btn.addEventListener('click', () => apply(!document.body.classList.contains('dark')));
})();

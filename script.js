// Local time (Bologna-style footer touch, using Brazil time)
function updateLocalTime() {
  const el = document.getElementById('local-time');
  if (!el) return;
  const now = new Date();
  const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  el.textContent = `Local time ${time}`;
}
updateLocalTime();
setInterval(updateLocalTime, 30000);

// Dynamic theming — accent color switcher
(function () {
  const root = document.documentElement;
  const switcher = document.getElementById('theme-switcher');
  if (!switcher) return;
  const dots = switcher.querySelectorAll('.theme-dot');
  const STORAGE_KEY = 'portfolio-theme';
  const saved = localStorage.getItem(STORAGE_KEY) || 'green';

  function applyTheme(theme) {
    if (theme === 'green') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', theme);
    }
    dots.forEach(d => d.classList.toggle('active', d.dataset.theme === theme));
  }

  applyTheme(saved);

  dots.forEach(dot => {
    dot.addEventListener('click', () => {
      const theme = dot.dataset.theme;
      applyTheme(theme);
      localStorage.setItem(STORAGE_KEY, theme);
    });
  });
})();

// Draggable panels (Sobre section)
(function () {
  const canvas = document.getElementById('desktop-canvas');
  if (!canvas) return;
  const panels = canvas.querySelectorAll('.panel');
  let topZ = 10;

  panels.forEach(panel => {
    const bar = panel.querySelector('.panel-bar');
    let offsetX = 0, offsetY = 0, dragging = 
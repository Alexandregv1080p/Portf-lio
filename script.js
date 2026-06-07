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

// Side rail active state on scroll
const railDots = document.querySelectorAll('.rail-dot');
const sections = document.querySelectorAll('section[id]');

window.addEventListener('scroll', () => {
  const scrollY = window.scrollY + window.innerHeight / 3;
  sections.forEach(section => {
    if (scrollY >= section.offsetTop && scrollY < section.offsetTop + section.offsetHeight) {
      railDots.forEach(d => d.classList.remove('active'));
      const match = document.querySelector(`.rail-dot[data-target="${section.id}"]`);
      if (match) match.classList.add('active');
    }
  });
});

// Scroll reveal animations
const animElements = document.querySelectorAll('[data-anime]');
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry, i) => {
    if (entry.isIntersecting) {
      setTimeout(() => {
        entry.target.classList.add('animated');
        entry.target.querySelectorAll('.fill').forEach(bar => {
          bar.style.width = bar.dataset.w + '%';
        });
      }, i * 70);
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });

animElements.forEach(el => observer.observe(el));

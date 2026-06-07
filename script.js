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

// Draggable panels (Sobre section)
(function () {
  const canvas = document.getElementById('desktop-canvas');
  if (!canvas) return;
  const panels = canvas.querySelectorAll('.panel');
  let topZ = 10;

  panels.forEach(panel => {
    const bar = panel.querySelector('.panel-bar');
    let offsetX = 0, offsetY = 0, dragging = false;

    function bringToFront() {
      topZ += 1;
      panel.style.zIndex = topZ;
    }

    function startDrag(clientX, clientY) {
      dragging = true;
      panel.classList.add('dragging');
      bringToFront();
      const rect = panel.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      offsetX = clientX - rect.left;
      offsetY = clientY - rect.top;
      panel.dataset.canvasLeft = canvasRect.left;
      panel.dataset.canvasTop = canvasRect.top;
    }

    function moveDrag(clientX, clientY) {
      if (!dragging) return;
      const canvasRect = canvas.getBoundingClientRect();
      let newLeft = clientX - canvasRect.left - offsetX;
      let newTop = clientY - canvasRect.top - offsetY;
      newLeft = Math.max(0, Math.min(newLeft, canvas.clientWidth - panel.o
document.addEventListener('DOMContentLoaded', () => {
  const eye = document.querySelector('.logo-eye');
  const pupil = eye?.querySelector('.pupil');
  if (!eye || !pupil) return;

  document.addEventListener('mousemove', (e) => {
    const rect = eye.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const x = e.clientX - centerX;
    const y = e.clientY - centerY;
    const angle = Math.atan2(y, x);
    const max = rect.width / 4;
    const pupilX = Math.cos(angle) * max;
    const pupilY = Math.sin(angle) * max;
    pupil.style.transform = `translate(${pupilX}px, ${pupilY}px)`;
  });
});

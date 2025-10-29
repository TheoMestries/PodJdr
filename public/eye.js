document.addEventListener('DOMContentLoaded', () => {
  const eye = document.querySelector('.logo-eye');
  const pupil = eye?.querySelector('.pupil');
  if (!eye || !pupil) return;

  if (document.body.classList.contains('shadow-safe')) {
    eye.classList.add('eye-disabled');
    pupil.style.transform = 'translate(-50%, -50%)';
    return;
  }

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

const secretSequence = [
  'arrowup',
  'arrowup',
  'arrowdown',
  'arrowdown',
  'arrowleft',
  'arrowright',
  'arrowleft',
  'arrowright',
  'b',
  'a',
];
let secretIndex = 0;
let shadowRequestInFlight = false;
const TOUCH_THRESHOLD = 30;
let touchStartPoint = null;

function normalizeKey(key) {
  if (!key) {
    return '';
  }
  return key.toLowerCase();
}

async function triggerShadowAccess() {
  if (shadowRequestInFlight) {
    return;
  }
  shadowRequestInFlight = true;
  try {
    const res = await fetch('/shadow/access');
    if (res.ok) {
      window.location.href = 'hack-msg.html';
      return;
    }
    if (res.status === 401) {
      window.alert('Authentification requise pour ce protocole.');
    } else if (res.status === 403) {
      window.alert('Signal brouillé : accès refusé.');
    }
  } catch (err) {
    console.error('Échec de l’ouverture du canal fantôme', err);
  } finally {
    shadowRequestInFlight = false;
  }
}

function processSecretInput(key) {
  if (!key) {
    return;
  }

  if (key === secretSequence[secretIndex]) {
    secretIndex += 1;
    if (secretIndex === secretSequence.length) {
      secretIndex = 0;
      triggerShadowAccess();
    }
  } else {
    secretIndex = key === secretSequence[0] ? 1 : 0;
  }
}

document.addEventListener('keydown', (event) => {
  processSecretInput(normalizeKey(event.key));
});

document.addEventListener(
  'touchstart',
  (event) => {
    if (event.touches.length !== 1) {
      touchStartPoint = null;
      return;
    }
    const touch = event.touches[0];
    touchStartPoint = {
      x: touch.clientX,
      y: touch.clientY,
    };
  },
  { passive: true }
);

document.addEventListener('touchend', (event) => {
  if (!touchStartPoint) {
    return;
  }

  const touch = event.changedTouches[0];
  if (!touch) {
    touchStartPoint = null;
    return;
  }

  const dx = touch.clientX - touchStartPoint.x;
  const dy = touch.clientY - touchStartPoint.y;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  let key = '';

  if (absX > TOUCH_THRESHOLD || absY > TOUCH_THRESHOLD) {
    if (absX > absY) {
      key = dx > 0 ? 'arrowright' : 'arrowleft';
    } else {
      key = dy > 0 ? 'arrowdown' : 'arrowup';
    }
    processSecretInput(key);
  } else {
    const expected = secretSequence[secretIndex];
    if (expected === 'b' || expected === 'a') {
      processSecretInput(expected);
    }
  }

  touchStartPoint = null;
});

document.addEventListener('touchcancel', () => {
  touchStartPoint = null;
});

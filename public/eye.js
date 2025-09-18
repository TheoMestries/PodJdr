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

document.addEventListener('keydown', (event) => {
  const key = normalizeKey(event.key);
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
});

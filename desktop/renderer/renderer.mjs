const image = document.getElementById('clip-image');
const video = document.getElementById('clip-video');
const pet = document.getElementById('pet');
const placeholder = document.getElementById('placeholder');
const bubble = document.getElementById('bubble');
const statusDot = document.getElementById('status');
let interactive = false;
let currentClip = null;
let bubbleTimer = null;

function clipUrl(file) {
  return `alba-clip://local/${file.split(/[\\/]/).map(encodeURIComponent).join('/')}`;
}

function hideAll() {
  image.classList.remove('visible');
  video.classList.remove('visible');
  placeholder.classList.remove('visible');
  video.pause();
  video.removeAttribute('src');
  video.load();
  image.removeAttribute('src');
}

function renderClip(clip) {
  if (!clip) {
    if (currentClip === null) return;
    currentClip = null;
    hideAll();
    placeholder.classList.add('visible');
    return;
  }
  const key = `${clip.kind}:${clip.file}`;
  if (currentClip === key) return;
  currentClip = key;
  hideAll();
  const url = clipUrl(clip.file);
  if (clip.kind === 'video') {
    video.loop = clip.loop !== false;
    video.style.objectFit = clip.fit || 'contain';
    video.src = url;
    video.classList.add('visible');
    video.play().catch(() => {});
  } else {
    image.style.objectFit = clip.fit || 'contain';
    image.src = url;
    image.classList.add('visible');
  }
}

function showBubble(text) {
  if (!text) return;
  bubble.textContent = text;
  bubble.classList.add('visible');
  if (bubbleTimer) clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => bubble.classList.remove('visible'), Math.min(12000, Math.max(2200, text.length * 90)));
}

window.alba.onState((message) => {
  if (message.type === 'hello') return;
  if (message.type === 'state') {
    pet.classList.toggle('asleep', Boolean(message.asleep));
    renderClip(message.clip);
  }
  if (message.type === 'say') showBubble(message.text);
});
window.alba.onConnection(({ connected }) => statusDot.classList.toggle('connected', Boolean(connected)));
window.alba.onInteractive((value) => {
  interactive = Boolean(value);
  document.body.classList.toggle('interactive', interactive);
  if (!interactive) window.alba.setIgnoreMouseEvents(true);
});
window.alba.getConfig().then(({ interactive: value }) => {
  interactive = Boolean(value);
  document.body.classList.toggle('interactive', interactive);
});

document.addEventListener('mousemove', (event) => {
  if (interactive) return;
  const over = Boolean(event.target?.closest?.('.hit'));
  window.alba.setIgnoreMouseEvents(!over);
});
document.addEventListener('mouseleave', () => {
  if (!interactive) window.alba.setIgnoreMouseEvents(true);
});
pet.addEventListener('mousedown', (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  window.alba.dragStart();
});
window.addEventListener('mouseup', () => window.alba.dragEnd());
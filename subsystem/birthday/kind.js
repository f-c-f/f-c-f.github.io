(() => {
  'use strict';
  const select = document.getElementById('birthday-kind');
  function update() {
    const countdown = select.value === 'countdown';
    document.getElementById('birthday-kind-birthday').hidden = countdown;
    document.getElementById('birthday-kind-countdown').hidden = !countdown;
  }
  if (new URLSearchParams(window.location.search).get('kind') === 'countdown') select.value = 'countdown';
  select.addEventListener('change', update);
  update();
})();

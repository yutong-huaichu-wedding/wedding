(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const layer = document.createElement('div');
  layer.className = 'falling-cats';
  layer.setAttribute('aria-hidden', 'true');
  document.body.prepend(layer);
  function pauseWhenHidden(){for(const cat of layer.querySelectorAll('img'))cat.style.animationPlayState=document.hidden?'paused':''}
  document.addEventListener('visibilitychange',pauseWhenHidden);
  const leftOrRight = () => Math.random() < .5 ? Math.random() * 15 : 85 + Math.random() * 13;
  const count = innerWidth < 600 ? 2 : 4;
  for (let i = 0; i < count; i++) {
    const cat = document.createElement('img');
    cat.src = '/cat-fall-' + (i % 2 + 1) + '.png';
    cat.alt = '';
    cat.draggable = false;
    cat.style.left = leftOrRight() + '%';
    cat.style.width = (innerWidth < 600 ? 34 + Math.random() * 24 : 46 + Math.random() * 35) + 'px';
    cat.style.animationDuration = (10 + Math.random() * 10) + 's';
    cat.style.animationDelay = (-Math.random() * 18) + 's';
    cat.addEventListener('click', () => {
      if (cat.classList.contains('popped')) return;
      const rect = cat.getBoundingClientRect();
      const spark = document.createElement('span');
      spark.className = 'cat-spark';
      spark.textContent = ['😻', '💕', '⭐', '🐾'][Math.floor(Math.random() * 4)];
      spark.style.left = rect.left + rect.width / 2 + 'px';
      spark.style.top = rect.top + rect.height / 2 + 'px';
      document.body.append(spark);
      setTimeout(() => spark.remove(), 700);
      cat.classList.add('popped');
      setTimeout(() => {
        cat.classList.remove('popped');
        cat.style.animation = 'none';
        void cat.offsetWidth;
        cat.style.left = leftOrRight() + '%';
        cat.style.animation = 'cat-fall ' + (10 + Math.random() * 10) + 's linear infinite';
      }, 600);
    });
    layer.append(cat);
  }
  pauseWhenHidden();
})();

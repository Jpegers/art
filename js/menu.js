// Simple navigation toggler for burger menu
// When the burger is clicked the mobile menu overlay will
// toggle. Body scrolling is prevented while the menu is open.

document.addEventListener('DOMContentLoaded', () => {
  const burger = document.querySelector('.burger');
  const menu = document.querySelector('.mobile-menu');
  const body = document.body;
  if (!burger || !menu) return;

  burger.addEventListener('click', () => {
    // toggle menu open state
    const isOpen = menu.classList.toggle('open');
    // also toggle modifier on burger itself to animate into a cross
    burger.classList.toggle('open', isOpen);
    // lock body scroll when menu is open
    if (isOpen) {
      body.style.overflow = 'hidden';
    } else {
      body.style.overflow = '';
    }
  });

  // Also close menu when any link inside mobile-nav is clicked
  menu.addEventListener('click', (e) => {
    const target = e.target;
    if (target.tagName && target.tagName.toLowerCase() === 'a') {
      menu.classList.remove('open');
      burger.classList.remove('open');
      body.style.overflow = '';
    }
  });
});
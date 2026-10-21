// One quiet reveal on scroll, and nothing else.
//
// No parallax, no counting numbers, no carousel. Every page here is short
// enough that anything more would be decoration competing with the few things
// it has to say — and a marketing site that fights its own copy for attention
// is worse than a plain one.
//
// Elements are only hidden once this script has run: it adds reveal-on to
// <html>, and the CSS hides nothing without it. So a reader who prefers
// reduced motion, or whose JavaScript never runs, gets the whole page rather
// than an empty one. Anything already on screen, or scrolled past, is shown
// at once, so nothing above the fold fades in late.
(function () {
  if (!window.matchMedia('(prefers-reduced-motion: no-preference)').matches) return;
  if (typeof IntersectionObserver !== 'function') return;

  var all = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
  var later = [];
  var vh = window.innerHeight;
  all.forEach(function (el) {
    var box = el.getBoundingClientRect();
    // A hidden section (Tonight, before it arrives) has no box yet; it
    // waits like anything below the fold.
    if (box.height > 0 && box.top < vh) el.classList.add('in');
    else later.push(el);
  });
  document.documentElement.classList.add('reveal-on');

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      }
    });
  }, { rootMargin: '-8% 0px' });

  later.forEach(function (el) { io.observe(el); });
})();

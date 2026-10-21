// The motion on the front page and the Teams page. Every picture is drawn
// finished without it; any failure takes html.motion off again. ES5.
(function () {
  'use strict';

  var root = document.documentElement;
  if (!window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (typeof window.IntersectionObserver !== 'function') return;

  var dead = false, observers = [];
  function each(list, fn) { for (var k = 0; k < list.length; k++) fn(list[k], k); }
  function all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function toggle(el, name, on) { if (on) el.classList.add(name); else el.classList.remove(name); }
  function find(list, el) {
    for (var k = 0; k < list.length; k++) if (list[k].el === el) return list[k];
    return null;
  }
  function stop() {
    dead = true;
    each(observers, function (io) { io.disconnect(); });
    root.classList.remove('motion');
    root.classList.remove('drive-js');
    if (road) road.removeAttribute('data-at');
    if (stops) each(stops, function (li) { li.classList.remove('past'); li.firstElementChild.removeAttribute('aria-current'); });
  }

  try {
    // ?drive=js forces the fallback driver. Never stored.
    var forced = ('&' + location.search.replace(/^\?/, '') + '&').indexOf('&drive=js&') !== -1;
    var useView = !forced && !!(window.CSS && CSS.supports && CSS.supports('animation-timeline', 'view()'));
    var pinQuery = window.matchMedia('(min-height: 36.0625rem)');
    if (!useView) root.classList.add('drive-js');
    root.classList.add('motion');

    var road = document.querySelector('.road');
    var stops = all('.road li'), labels = all('.road-now span');
    // 26svh a step, a 16svh tail, as in story.css.
    var scenes = all('#life .scene').map(function (el, i) {
      var steps = parseInt(el.getAttribute('data-steps'), 10) || 3, span = (steps - 1) * 26 + 16;
      return { el: el, i: i, steps: steps, inner: el.querySelector('.frame-in'),
        t2: 26 / span, t3: 52 / span, near: true, flow: false, done: false, step: 0, view: '' };
    });
    var scrubs = all('[data-scrub]').map(function (el) { return { el: el, near: true, view: '' }; });
    var roadH = 0, current = -1, fillWas = '', ticking = false, first = true, timer = 0;
    var lastWidth = window.innerWidth, lastHeight = window.innerHeight, lastPin = pinQuery.matches;

    // A scene pins when it fits the pinned frame itself (svh, not innerHeight).
    var fit = function () {
      var pin = pinQuery.matches;
      each(scenes, function (s) { s.el.removeAttribute('data-flow'); });
      roadH = pin && road ? road.getBoundingClientRect().height : 0;
      var frame = scenes.length && scenes[0].el.querySelector('.frame');
      var room = (pin && frame ? frame.getBoundingClientRect().height : window.innerHeight - roadH) - 8;
      var tall = scenes.map(function (s) { return s.inner ? s.inner.getBoundingClientRect().height : 0; });
      each(scenes, function (s, k) {
        s.flow = !pin || tall[k] > room;
        if (!s.flow) { s.done = false; return; }
        s.el.setAttribute('data-flow', '');
        if (s.view) { s.el.style.removeProperty('--view'); s.view = ''; }
      });
      lastWidth = window.innerWidth;
      lastHeight = window.innerHeight;
      lastPin = pin;
    };

    var setSteps = function (s, n) {
      if (n === s.step) return;
      for (var k = 1; k <= 3; k++) toggle(s.el, 's' + k, k <= n);
      s.step = n;
    };
    var writeView = function (s, p) {
      var v = p.toFixed(4);
      if (v !== s.view) { s.el.style.setProperty('--view', v); s.view = v; }
    };
    var setCurrent = function (i) {
      if (!road || i === current) return;
      current = i;
      if (i >= 0) road.setAttribute('data-at', String(i)); else road.removeAttribute('data-at');
      each(stops, function (li, k) {
        toggle(li, 'past', k <= i);
        if (k === i) li.firstElementChild.setAttribute('aria-current', 'step');
        else li.firstElementChild.removeAttribute('aria-current');
      });
      each(labels, function (span, k) { toggle(span, 'on', k === i); });
    };

    var draw = function () {
      // A tab that loaded hidden, or at another size, fits again on its first real frame.
      if (window.innerWidth !== lastWidth || Math.abs(window.innerHeight - lastHeight) >= 150) { fit(); first = true; }
      var vh = window.innerHeight, readAll = first, rects = [], boxes = [];
      first = false;
      // Read, then write.
      each(scenes, function (s, k) {
        if (readAll || s.near || k === current) rects[k] = s.el.getBoundingClientRect();
      });
      each(scrubs, function (s, k) {
        if (!useView && (readAll || s.near)) boxes[k] = s.el.getBoundingClientRect();
      });
      if (readAll && road) {
        var at = -1;
        each(scenes, function (s, k) { if (rects[k].top <= vh / 2) at = k; });
        setCurrent(at);
      }
      each(scenes, function (s, k) {
        var r = rects[k];
        if (!r) return;
        if (s.flow) {
          if (!s.done && r.top < vh * 0.75) { setSteps(s, s.steps); s.done = true; }
          return;
        }
        // view()'s contain progress, less the road.
        var run = r.height - (vh - roadH);
        var p = run > 0 ? clamp((roadH - r.top) / run) : (r.top <= roadH ? 1 : 0);
        var n = r.top <= vh * 0.4 ? 1 : 0;
        if (n && p >= s.t2) n = 2;
        if (n === 2 && s.steps > 2 && p >= s.t3) n = 3;
        setSteps(s, n);
        if (!useView) writeView(s, p);
      });
      each(scrubs, function (s, k) {
        if (boxes[k]) writeView(s, clamp((vh - boxes[k].top) / (vh + boxes[k].height)));
      });
      if (road) {
        var c = rects[current], fill = current < 0 ? 0 :
          (current + (c ? clamp((vh / 2 - c.top) / c.height) : 0)) / scenes.length;
        fill = fill.toFixed(4);
        if (fill !== fillWas) { road.style.setProperty('--road', fill); fillWas = fill; }
      }
    };

    var frame = function () {
      ticking = false;
      if (!dead) try { draw(); } catch (e) { stop(); }
    };
    var request = function () {
      if (dead || ticking) return;
      ticking = true;
      window.requestAnimationFrame(frame);
    };
    var refit = function () {
      if (!dead) try { fit(); first = true; draw(); } catch (e) { stop(); }
    };
    var watch = function (options, fn, targets) {
      var io = new IntersectionObserver(function (entries) {
        if (!dead) try { each(entries, fn); request(); } catch (e) { stop(); }
      }, options);
      each(targets, function (el) { io.observe(el); });
      observers.push(io);
      return io;
    };

    fit();
    draw();

    // Arriving at #beta: the scenes above just grew.
    var target = location.hash.length > 1 && document.getElementById(location.hash.slice(1));
    if (target) {
      root.style.scrollBehavior = 'auto';
      target.scrollIntoView();
      root.style.scrollBehavior = '';
      first = true;
      draw();
    }

    var sceneEls = scenes.map(function (s) { return s.el; });
    watch({ rootMargin: '50% 0px' }, function (e) {
      var s = find(scenes, e.target) || find(scrubs, e.target);
      s.near = e.isIntersecting;
      toggle(s.el, 'near', s.near);
    }, sceneEls.concat(scrubs.map(function (s) { return s.el; })));
    if (road) watch({ rootMargin: '-50% 0px -50% 0px' }, function (e) {
      var s = find(scenes, e.target);
      if (e.isIntersecting) setCurrent(s.i);
      else if (s.i === current && e.boundingClientRect.top > window.innerHeight / 2) setCurrent(s.i - 1);
    }, sceneEls);
    var seen = watch({ threshold: [0.1, 0.2, 0.35] }, function (e) {
      if (e.intersectionRatio < 0.35 && e.intersectionRect.height < window.innerHeight * 0.35) return;
      e.target.classList.add('seen');
      seen.unobserve(e.target);
    }, all('[data-seen]'));

    window.addEventListener('scroll', request, { passive: true });
    // iOS bars move the height by about 110px: only a frame. More, or a new width, refits.
    window.addEventListener('resize', function () {
      if (window.innerWidth === lastWidth && pinQuery.matches === lastPin && Math.abs(window.innerHeight - lastHeight) < 150) return request();
      clearTimeout(timer);
      timer = setTimeout(refit, 250);
    }, { passive: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(refit);
    window.addEventListener('load', refit);
  } catch (e) {
    stop();
  }
})();

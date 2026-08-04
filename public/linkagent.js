/*! Linkagent v1 | MIT | injects approved internal links by wrapping existing text, never rewriting content */
(function () {
  "use strict";
  var doc = document;
  var sc = doc.currentScript;
  if (!sc || window.__linkagent) return;
  window.__linkagent = 1;

  var key = sc.getAttribute("data-key");
  if (!key) return;
  var api = sc.getAttribute("data-api") || "";
  if (!api) {
    try { api = new URL(sc.src).origin; } catch (e) { return; }
  }
  var MAX = parseInt(sc.getAttribute("data-max") || "10", 10) || 10;
  var SPA = sc.getAttribute("data-spa") === "true";

  var SKIP = {
    A: 1, BUTTON: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1,
    NAV: 1, HEADER: 1, FOOTER: 1, ASIDE: 1, SCRIPT: 1, STYLE: 1,
    NOSCRIPT: 1, CODE: 1, PRE: 1, TEXTAREA: 1, INPUT: 1, SELECT: 1,
    OPTION: 1, LABEL: 1, IFRAME: 1, SVG: 1, FORM: 1, FIGCAPTION: 1
  };

  function blocked(el) {
    for (var n = el; n && n !== doc.documentElement; n = n.parentNode) {
      if (n.nodeType !== 1) continue;
      if (SKIP[n.nodeName.toUpperCase()]) return true;
      if (n.isContentEditable) return true;
      if (n.getAttribute && (n.hasAttribute("data-la-skip") || n.getAttribute("aria-hidden") === "true")) return true;
    }
    return false;
  }

  function pathOf(href) {
    try { return new URL(href, location.href).pathname.replace(/\/+$/, "") || "/"; } catch (e) { return null; }
  }

  // Only in-content links count: a target sitting in the nav or footer is
  // still worth an in-text link, so those are ignored here.
  function alreadyLinked(root, targetPath) {
    var anchors = root.getElementsByTagName("a");
    for (var i = 0; i < anchors.length; i++) {
      var href = anchors[i].getAttribute("href");
      if (href && pathOf(href) === targetPath && !blocked(anchors[i].parentNode)) return true;
    }
    return false;
  }

  function isWordChar(ch) {
    return ch && /[A-Za-z0-9]/.test(ch);
  }

  function place(root, rule) {
    var needle = rule.t.toLowerCase();
    var walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var node;
    while ((node = walker.nextNode())) {
      var text = node.nodeValue;
      if (!text || text.length < needle.length) continue;
      var at = text.toLowerCase().indexOf(needle);
      if (at < 0) continue;
      if (isWordChar(text.charAt(at - 1)) || isWordChar(text.charAt(at + needle.length))) continue;
      if (blocked(node.parentNode)) continue;
      var mid = node.splitText(at);
      mid.splitText(needle.length);
      var a = doc.createElement("a");
      a.href = rule.h;
      if (rule.ti) a.title = rule.ti;
      a.setAttribute("data-la", "");
      a.appendChild(doc.createTextNode(mid.nodeValue));
      mid.parentNode.replaceChild(a, mid);
      return true;
    }
    return false;
  }

  function inject(rules) {
    if (!rules || !rules.length) return;
    var here = pathOf(location.pathname);
    var root = doc.querySelector("main,article,[role=main]") || doc.body;
    var done = 0;
    for (var i = 0; i < rules.length && done < MAX; i++) {
      var r = rules[i];
      if (!r || !r.t || !r.h) continue;
      var target = pathOf(r.h);
      if (!target || target === here) continue;
      if (alreadyLinked(root, target)) continue;
      if (place(root, r)) done++;
    }
  }

  function whenIdle(fn) {
    if ("requestIdleCallback" in window) requestIdleCallback(fn, { timeout: 2000 });
    else setTimeout(fn, 32);
  }

  // Opened from the dashboard's "View live" button (#la=<anchor>): scroll to
  // the injected link and flash it so it is easy to spot.
  function highlightFromHash() {
    var h = location.hash || "";
    if (h.indexOf("#la=") !== 0) return;
    var wanted;
    try { wanted = decodeURIComponent(h.slice(4).split(":~:")[0]).toLowerCase(); } catch (e) { return; }
    var links = doc.querySelectorAll("a[data-la]");
    for (var i = 0; i < links.length; i++) {
      var el = links[i];
      if ((el.textContent || "").trim().toLowerCase() !== wanted) continue;
      try { el.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) { el.scrollIntoView(); }
      var prev = el.style.cssText;
      el.style.cssText = prev + ";background:rgba(132,204,22,.32);outline:2px solid #84cc16;outline-offset:2px;border-radius:3px;transition:background .7s ease,outline-color .7s ease";
      setTimeout(function () {
        el.style.background = "transparent";
        el.style.outlineColor = "transparent";
        setTimeout(function () { el.style.cssText = prev; }, 800);
      }, 2400);
      return;
    }
  }

  var lastPath = null;
  function run() {
    var p = location.pathname.replace(/\/+$/, "") || "/";
    if (p === lastPath) return;
    lastPath = p;
    fetch(api + "/api/map/" + encodeURIComponent(key) + "?p=" + encodeURIComponent(p))
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        whenIdle(function () {
          if (data && data.rules && data.rules.length) inject(data.rules);
          highlightFromHash();
        });
      })
      .catch(function () {});
  }

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", run);
  else run();

  if (SPA && window.history && history.pushState) {
    var wrap = function (fnName) {
      var orig = history[fnName];
      history[fnName] = function () {
        var out = orig.apply(this, arguments);
        setTimeout(run, 300);
        return out;
      };
    };
    wrap("pushState");
    wrap("replaceState");
    window.addEventListener("popstate", function () { setTimeout(run, 300); });
  }
})();

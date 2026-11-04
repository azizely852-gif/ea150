/* Electro Aziz — translation engine */
(function () {
  "use strict";

  var SUPPORTED = ["fr", "en", "ar"];
  var DEFAULT_LANG = "fr";
  var STORAGE_KEY = "ea_lang";
  var state = { lang: DEFAULT_LANG };
  var missing = {};

  function normalize(lang) {
    if (!lang) return "";
    var code = String(lang).toLowerCase().split("-")[0];
    return SUPPORTED.indexOf(code) > -1 ? code : "";
  }

  function detectLanguage() {
    try {
      var params = new URLSearchParams(window.location.search);
      var fromUrl = normalize(params.get("lang"));
      if (fromUrl) return fromUrl;
    } catch (e) { /* ignore */ }

    try {
      var stored = normalize(localStorage.getItem(STORAGE_KEY));
      if (stored) return stored;
    } catch (e) { /* ignore */ }

    var browser = normalize(navigator.language || (navigator.languages && navigator.languages[0]));
    if (browser) return browser;
    return DEFAULT_LANG;
  }

  function dictionary(lang) {
    return (window.EA_LANG && window.EA_LANG[lang]) || {};
  }

  function t(key, vars, lang) {
    var target = lang || state.lang;
    var value = dictionary(target)[key];
    if (value === undefined) value = dictionary(DEFAULT_LANG)[key];
    if (value === undefined) {
      missing[target + ":" + key] = true;
      return "";
    }
    if (vars) {
      Object.keys(vars).forEach(function (name) {
        value = value.split("{" + name + "}").join(String(vars[name]));
      });
    }
    return value;
  }

  function setText(el, value) {
    if (value === "" || value === undefined) return;
    el.textContent = value;
  }

  function apply(lang) {
    var next = normalize(lang) || DEFAULT_LANG;
    state.lang = next;

    try { localStorage.setItem(STORAGE_KEY, next); } catch (e) { /* ignore */ }

    var html = document.documentElement;
    html.setAttribute("lang", next);
    html.setAttribute("dir", next === "ar" ? "rtl" : "ltr");

    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      setText(el, t(el.getAttribute("data-i18n")));
    });

    document.querySelectorAll("[data-i18n-html]").forEach(function (el) {
      var value = t(el.getAttribute("data-i18n-html"));
      if (value) el.innerHTML = value;
    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      var value = t(el.getAttribute("data-i18n-placeholder"));
      if (value) el.setAttribute("placeholder", value);
    });

    document.querySelectorAll("[data-i18n-aria]").forEach(function (el) {
      var value = t(el.getAttribute("data-i18n-aria"));
      if (value) el.setAttribute("aria-label", value);
    });

    document.querySelectorAll("[data-i18n-title]").forEach(function (el) {
      var value = t(el.getAttribute("data-i18n-title"));
      if (value) el.setAttribute("title", value);
    });

    document.querySelectorAll("button[data-lang]").forEach(function (btn) {
      var active = btn.getAttribute("data-lang") === next;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });

    var title = t("meta.title");
    if (title) document.title = title;
    var description = t("meta.description");
    if (description) {
      var metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) metaDesc.setAttribute("content", description);
      var ogDesc = document.querySelector('meta[property="og:description"]');
      if (ogDesc) ogDesc.setAttribute("content", description);
      var twDesc = document.querySelector('meta[name="twitter:description"]');
      if (twDesc) twDesc.setAttribute("content", description);
    }
    document.querySelectorAll('meta[property="og:title"], meta[name="twitter:title"]').forEach(function (meta) {
      if (title) meta.setAttribute("content", title);
    });

    try {
      var url = new URL(window.location.href);
      url.searchParams.set("lang", next);
      window.history.replaceState(null, "", url.toString());
    } catch (e) { /* ignore */ }

    window.__MISSING_I18N = Object.keys(missing);
    document.dispatchEvent(new CustomEvent("ea:languagechange", { detail: { lang: next, dir: next === "ar" ? "rtl" : "ltr" } }));
    return next;
  }

  function setLanguage(lang) {
    return apply(lang);
  }

  function checkDictionaries() {
    var all = Object.keys(dictionary(DEFAULT_LANG));
    var report = {};
    SUPPORTED.forEach(function (lang) {
      report[lang] = all.filter(function (key) { return dictionary(lang)[key] === undefined; });
    });
    return report;
  }

  var api = {
    supported: SUPPORTED.slice(),
    init: function () { return apply(detectLanguage()); },
    setLanguage: setLanguage,
    getLang: function () { return state.lang; },
    isRTL: function () { return state.lang === "ar"; },
    t: t,
    checkDictionaries: checkDictionaries,
    getMissing: function () { return Object.keys(missing); }
  };

  window.EA_I18N = api;

  function boot() {
    apply(detectLanguage());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

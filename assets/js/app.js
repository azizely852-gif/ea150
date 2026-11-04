/* Electro Aziz — interactions, WhatsApp assistant & UI */
(function () {
  "use strict";

  var WA_NUMBER = "212666451752";
  var WA_BASE = "https://wa.me/" + WA_NUMBER;
  var CURRENCY_KEY = "ea_currency";
  var BOT_SEEN_KEY = "ea_bot_seen";
  var CURRENCIES = ["mad", "eur", "usd"];

  var PLANS = {
    essential: { name: "pricing.essentialName", period: "pricing.perMonth", devices: "pricing.devices1" },
    premium: { name: "pricing.premiumName", period: "pricing.per3", devices: "pricing.devices2" },
    ultimate: { name: "pricing.ultimateName", period: "pricing.per6", devices: "pricing.devices3" },
    family: { name: "pricing.familyName", period: "pricing.per12", devices: "pricing.devices5" }
  };

  var WA_STATIC = {
    nav: "wa.nav",
    hero: "wa.hero",
    cta: "wa.cta",
    contact: "wa.contact",
    trial: "bot.trialWa",
    agent: "bot.agentWa"
  };

  var state = {
    currency: "mad",
    botOpen: false,
    botToken: 0,
    botTimer: null,
    lastFocus: null,
    menuOpen: false,
    counterDone: false
  };

  var botTimers = [];

  /* ------------------------------------------------------------------ */
  /* Helpers                                                             */
  /* ------------------------------------------------------------------ */

  function t(key, vars) {
    if (window.EA_I18N && typeof window.EA_I18N.t === "function") {
      return window.EA_I18N.t(key, vars);
    }
    return "";
  }

  function lang() {
    return window.EA_I18N ? window.EA_I18N.getLang() : "fr";
  }

  function currentCurrency() {
    return state.currency;
  }

  function currencyCode() {
    return currentCurrency().toUpperCase();
  }

  function waHref(message) {
    return WA_BASE + "?text=" + encodeURIComponent(message || "");
  }

  function safeStorage(key, fallback) {
    try {
      var value = localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch (e) {
      return fallback;
    }
  }

  function setStorage(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* ignore */ }
  }

  function formatPrice(value) {
    var number = Number(value);
    if (!isFinite(number)) return String(value);
    var decimals = Math.floor(number) === number ? 0 : 2;
    try {
      return new Intl.NumberFormat(numberLocale(), {
        minimumFractionDigits: decimals,
        maximumFractionDigits: 2
      }).format(number);
    } catch (e) {
      return String(number);
    }
  }

  function priceFrom(el) {
    if (!el) return "";
    var value = el.getAttribute("data-" + currentCurrency());
    if (value === null) value = el.getAttribute("data-mad");
    return value === null ? "" : value;
  }

  function planLabel(planId) {
    return PLANS[planId] ? t(PLANS[planId].name) : planId;
  }

  function planPrice(planId) {
    var link = document.querySelector('[data-plan="' + planId + '"]');
    var card = link ? link.closest(".plan-card") : null;
    var value = card ? card.querySelector(".price-value") : null;
    return priceFrom(value);
  }

  function planPeriod(planId) {
    return PLANS[planId] ? t(PLANS[planId].period) : "";
  }

  function planDevices(planId) {
    return PLANS[planId] ? t(PLANS[planId].devices) : "";
  }

  function orderMessage(name, price, period) {
    return t("bot.orderMsg", {
      name: name,
      price: formatPrice(price),
      cur: currencyCode(),
      period: period
    });
  }

  function orderUrl(name, price, period) {
    return waHref(orderMessage(name, price, period));
  }

  function detectPlan(text) {
    if (/essentiel|essential|اساسي|أساسي/.test(text)) return "essential";
    if (/premium|بريميوم|المميز/.test(text)) return "premium";
    if (/ultimate|التيميت|ألتيميت|النهائي/.test(text)) return "ultimate";
    if (/famille|family|عائلة|عائلي|الأسرة/.test(text)) return "family";
    return "";
  }

  /* ------------------------------------------------------------------ */
  /* Currency                                                            */
  /* ------------------------------------------------------------------ */

  function applyCurrency(currency, persist) {
    if (CURRENCIES.indexOf(currency) === -1) currency = "mad";
    state.currency = currency;

    document.querySelectorAll(".price-main").forEach(function (main) {
      var value = main.querySelector(".price-value");
      var code = main.querySelector(".price-cur");
      if (value) {
        var amount = priceFrom(value);
        if (amount !== "") value.textContent = formatPrice(amount);
      }
      if (code) code.textContent = currencyCode();
    });

    document.querySelectorAll("button[data-currency]").forEach(function (btn) {
      var active = btn.getAttribute("data-currency") === currency;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });

    if (persist !== false) setStorage(CURRENCY_KEY, currency);
    updateStaticLinks();
  }

  /* ------------------------------------------------------------------ */
  /* Static links                                                        */
  /* ------------------------------------------------------------------ */

  function updateStaticLinks() {
    document.querySelectorAll("[data-wa]").forEach(function (link) {
      var key = WA_STATIC[link.getAttribute("data-wa")] || "wa.contact";
      link.href = waHref(t(key));
    });

    document.querySelectorAll("[data-plan]").forEach(function (link) {
      var planId = link.getAttribute("data-plan");
      if (!PLANS[planId]) return;
      link.href = orderUrl(planLabel(planId), planPrice(planId), planPeriod(planId));
    });

    document.querySelectorAll("[data-ibo]").forEach(function (link) {
      var kind = link.getAttribute("data-ibo");
      var offer = link.closest(".ibo-offer");
      var value = offer ? offer.querySelector(".price-value") : null;
      var name = t(kind === "bundle" ? "ibo.pack2Name" : "ibo.pack1Name");
      var period = t(kind === "bundle" ? "ibo.pack2Period" : "ibo.pack1Period");
      link.href = orderUrl(name, priceFrom(value), period);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Header, mobile menu & scrollspy                                     */
  /* ------------------------------------------------------------------ */

  function initHeader() {
    var header = document.getElementById("siteHeader");
    var toggle = document.getElementById("menuToggle");
    var menu = document.getElementById("mobileMenu");
    var backdrop = document.getElementById("menuBackdrop");
    if (!toggle || !menu) return;

    function setMenu(open) {
      state.menuOpen = open;
      document.body.classList.toggle("menu-open", open);
      menu.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      if (backdrop) backdrop.hidden = !open;
    }

    toggle.addEventListener("click", function () {
      setMenu(!state.menuOpen);
    });

    if (backdrop) {
      backdrop.addEventListener("click", function () { setMenu(false); });
    }

    document.querySelectorAll("[data-close-menu]").forEach(function (el) {
      el.addEventListener("click", function () { setMenu(false); });
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth > 1024 && state.menuOpen) setMenu(false);
    });

    function onScroll() {
      if (header) header.classList.toggle("is-scrolled", window.scrollY > 14);
      updateScrollspy();
    }

    var ticking = false;
    window.addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        onScroll();
        ticking = false;
      });
    }, { passive: true });

    onScroll();
  }

  function updateScrollspy() {
    var links = document.querySelectorAll(".main-nav .nav-link");
    if (!links.length) return;
    var offset = (document.getElementById("siteHeader") ? document.getElementById("siteHeader").offsetHeight : 74) + 70;
    var current = "";
    var sections = [];

    links.forEach(function (link) {
      var id = link.getAttribute("href");
      if (!id || id.charAt(0) !== "#") return;
      var section = document.querySelector(id);
      if (section && sections.indexOf(section) === -1) sections.push(section);
    });

    sections.forEach(function (section) {
      if (section.offsetTop <= window.scrollY + offset) current = "#" + section.id;
    });

    if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 4) {
      var last = sections[sections.length - 1];
      if (last) current = "#" + last.id;
    }

    links.forEach(function (link) {
      link.classList.toggle("is-active", link.getAttribute("href") === current);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Reveal & counters                                                   */
  /* ------------------------------------------------------------------ */

  function initReveal() {
    var items = document.querySelectorAll(".reveal");
    if (!items.length) return;

    if (!("IntersectionObserver" in window)) {
      items.forEach(function (el) { el.classList.add("is-visible"); });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -36px 0px" });

    items.forEach(function (el) {
      if (el.getBoundingClientRect().top < window.innerHeight) {
        el.classList.add("is-visible");
      } else {
        observer.observe(el);
      }
    });
  }

  function numberLocale() {
    var code = lang();
    return code === "ar" ? "ar-MA" : code === "en" ? "en-US" : "fr-FR";
  }

  function formatCounter(value, decimals) {
    try {
      return new Intl.NumberFormat(numberLocale(), {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      }).format(value);
    } catch (e) {
      return String(value);
    }
  }

  function renderCounters(final) {
    document.querySelectorAll("[data-count]").forEach(function (el) {
      var target = parseFloat(el.getAttribute("data-count"));
      var decimals = parseInt(el.getAttribute("data-decimals") || "0", 10);
      var suffix = el.getAttribute("data-suffix") || "";
      if (!isFinite(target)) return;
      var value = final ? target : parseFloat(el.getAttribute("data-current") || "0");
      el.textContent = formatCounter(value, decimals) + suffix;
    });
  }

  function initCounters() {
    var counters = document.querySelectorAll("[data-count]");
    if (!counters.length) return;
    renderCounters(false);

    function run() {
      if (state.counterDone) return;
      state.counterDone = true;
      counters.forEach(function (el) {
        var target = parseFloat(el.getAttribute("data-count"));
        var decimals = parseInt(el.getAttribute("data-decimals") || "0", 10);
        var suffix = el.getAttribute("data-suffix") || "";
        var start = null;
        var duration = 1500;

        if (!isFinite(target)) return;

        function step(timestamp) {
          if (start === null) start = timestamp;
          var progress = Math.min((timestamp - start) / duration, 1);
          var eased = 1 - Math.pow(1 - progress, 3);
          var value = target * eased;
          el.setAttribute("data-current", String(value));
          el.textContent = formatCounter(value, decimals) + suffix;
          if (progress < 1) {
            window.requestAnimationFrame(step);
          } else {
            el.textContent = formatCounter(target, decimals) + suffix;
          }
        }
        window.requestAnimationFrame(step);
      });
    }

    if (!("IntersectionObserver" in window)) {
      run();
      return;
    }

    var wrap = document.querySelector(".hero-stats");
    if (!wrap) { run(); return; }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          run();
          observer.disconnect();
        }
      });
    }, { threshold: 0.3 });
    observer.observe(wrap);
  }

  /* ------------------------------------------------------------------ */
  /* Bot: markup helpers                                                 */
  /* ------------------------------------------------------------------ */

  function botEls() {
    return {
      widget: document.getElementById("botWidget"),
      panel: document.getElementById("botPanel"),
      close: document.getElementById("botClose"),
      reset: document.getElementById("botReset"),
      messages: document.getElementById("botMessages"),
      quick: document.getElementById("botQuick"),
      form: document.getElementById("botForm"),
      input: document.getElementById("botInput"),
      toggle: document.getElementById("botToggle"),
      badge: document.getElementById("botBadge")
    };
  }

  function scrollBot() {
    var messages = document.getElementById("botMessages");
    if (messages) messages.scrollTop = messages.scrollHeight;
  }

  function addMessage(text, kind) {
    var messages = document.getElementById("botMessages");
    if (!messages) return null;
    var el = document.createElement("div");
    el.className = "msg msg--" + (kind || "bot");
    el.textContent = text;
    messages.appendChild(el);
    scrollBot();
    return el;
  }

  function addActions(actions) {
    var messages = document.getElementById("botMessages");
    if (!messages || !actions || !actions.length) return;
    var wrap = document.createElement("div");
    wrap.className = "msg-actions";
    actions.forEach(function (action) {
      var link = document.createElement("a");
      link.className = "msg-btn" + (action.primary ? " msg-btn--primary" : "");
      link.href = action.href;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = action.label;
      wrap.appendChild(link);
    });
    messages.appendChild(wrap);
    scrollBot();
  }

  function setQuick(items) {
    var quick = document.getElementById("botQuick");
    if (!quick) return;
    quick.innerHTML = "";
    (items || []).forEach(function (item) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "quick-chip";
      chip.textContent = item.label;
      chip.addEventListener("click", function () {
        addMessage(item.label, "user");
        handleBotAction(item.action, item.label);
      });
      quick.appendChild(chip);
    });
  }

  function mainQuick() {
    return [
      { action: "offers", label: t("bot.qOffers") },
      { action: "ibo", label: t("bot.qIbo") },
      { action: "trial", label: t("bot.qTrial") },
      { action: "support", label: t("bot.qSupport") },
      { action: "devices", label: t("bot.qDevices") },
      { action: "agent", label: t("bot.qAgent") }
    ];
  }

  function plansQuick() {
    var items = Object.keys(PLANS).map(function (id) {
      return { action: "plan:" + id, label: planLabel(id) };
    });
    items.push({ action: "ibo", label: t("bot.qIbo") });
    items.push({ action: "main", label: t("bot.mainMenu") });
    return items;
  }

  function backQuick(extra) {
    var items = extra ? extra.slice() : [];
    items.push({ action: "offers", label: t("bot.qOffers") });
    items.push({ action: "agent", label: t("bot.qAgent") });
    items.push({ action: "main", label: t("bot.mainMenu") });
    return items;
  }

  function scheduleBot(fn, delay, token) {
    var id = window.setTimeout(function () {
      if (token === state.botToken) fn();
    }, delay);
    botTimers.push(id);
  }

  function clearBotTimers() {
    botTimers.forEach(function (id) { window.clearTimeout(id); });
    botTimers = [];
  }

  /* ------------------------------------------------------------------ */
  /* Bot: conversation                                                   */
  /* ------------------------------------------------------------------ */

  function showGreeting() {
    addMessage(t("bot.greeting"));
    setQuick(mainQuick());
  }

  function showTyping() {
    var messages = document.getElementById("botMessages");
    if (!messages) return null;
    var el = document.createElement("div");
    el.className = "msg msg--bot msg--typing";
    el.setAttribute("aria-label", t("bot.thinking"));
    el.innerHTML = "<i></i><i></i><i></i>";
    messages.appendChild(el);
    scrollBot();
    return el;
  }

  function replyWith(fn) {
    var token = state.botToken;
    var typing = showTyping();
    scheduleBot(function () {
      if (typing && typing.parentNode) typing.parentNode.removeChild(typing);
      fn();
      scrollBot();
    }, 620, token);
  }

  function botOpen(open) {
    var els = botEls();
    if (!els.panel || !els.toggle) return;
    state.botOpen = open;
    els.panel.hidden = !open;
    els.toggle.classList.toggle("is-open", open);
    els.toggle.setAttribute("aria-expanded", open ? "true" : "false");
    els.toggle.setAttribute("aria-label", t(open ? "bot.close" : "bot.open"));

    if (open) {
      if (els.badge) els.badge.classList.add("is-hidden");
      setStorage(BOT_SEEN_KEY, "1");
      if (window.innerWidth < 1025) {
        document.body.classList.remove("menu-open");
        var menu = document.getElementById("mobileMenu");
        if (menu) menu.classList.remove("is-open");
        var backdrop = document.getElementById("menuBackdrop");
        if (backdrop) backdrop.hidden = true;
        var toggle = document.getElementById("menuToggle");
        if (toggle) toggle.setAttribute("aria-expanded", "false");
        state.menuOpen = false;
      }
      if (els.messages && !els.messages.children.length) showGreeting();
      window.setTimeout(function () {
        if (els.input) els.input.focus();
        scrollBot();
      }, 130);
    } else if (els.toggle) {
      els.toggle.focus();
    }
  }

  function resetBot() {
    state.botToken += 1;
    clearBotTimers();
    var els = botEls();
    if (!els.messages) return;
    els.messages.innerHTML = "";
    showGreeting();
  }

  function respondPlan(planId) {
    var name = planLabel(planId);
    var price = planPrice(planId);
    var period = planPeriod(planId);
    var devices = planDevices(planId);
    var text = t("bot.planDetails", {
      name: name,
      price: formatPrice(price),
      cur: currencyCode(),
      period: period,
      devices: devices
    });
    addMessage(text);
    addActions([{
      label: t("bot.orderBtn", { name: name }),
      href: orderUrl(name, price, period),
      primary: true
    }]);
    setQuick(backQuick([
      { action: "trial", label: t("bot.qTrial") },
      { action: "devices", label: t("bot.qDevices") }
    ]));
  }

  function respondIbo() {
    var activation = document.querySelector('[data-ibo="activation"]');
    var bundle = document.querySelector('[data-ibo="bundle"]');
    var activationCard = activation ? activation.closest(".ibo-offer") : null;
    var bundleCard = bundle ? bundle.closest(".ibo-offer") : null;
    var activationPrice = activationCard ? priceFrom(activationCard.querySelector(".price-value")) : "";
    var bundlePrice = bundleCard ? priceFrom(bundleCard.querySelector(".price-value")) : "";
    var activationPeriod = t("ibo.pack1Period");
    var bundlePeriod = t("ibo.pack2Period");
    var actions = [];

    addMessage(t("bot.iboMsgTpl", {
      aPrice: formatPrice(activationPrice),
      bPrice: formatPrice(bundlePrice),
      cur: currencyCode(),
      aPeriod: activationPeriod,
      bPeriod: bundlePeriod
    }));

    if (activationCard) {
      actions.push({
        label: t("ibo.pack1Name"),
        href: orderUrl(
          t("ibo.pack1Name"),
          activationPrice,
          activationPeriod
        )
      });
    }
    if (bundleCard) {
      actions.push({
        label: t("ibo.pack2Name"),
        href: orderUrl(
          t("ibo.pack2Name"),
          bundlePrice,
          bundlePeriod
        ),
        primary: true
      });
    }
    addActions(actions);
    setQuick(backQuick([{ action: "trial", label: t("bot.qTrial") }]));
  }

  function respondTrial() {
    addMessage(t("bot.trialMsg"));
    addActions([{
      label: t("bot.trialBtn"),
      href: waHref(t("bot.trialWa")),
      primary: true
    }]);
    setQuick(backQuick([{ action: "devices", label: t("bot.qDevices") }]));
  }

  function respondSupport() {
    addMessage(t("bot.supportMsg"));
    addActions([{
      label: t("bot.supportBtn"),
      href: waHref(t("bot.supportWa")),
      primary: true
    }]);
    setQuick(backQuick([{ action: "devices", label: t("bot.qDevices") }]));
  }

  function respondDevices() {
    addMessage(t("bot.devicesMsg"));
    addActions([{
      label: t("bot.devicesBtn"),
      href: waHref(t("bot.deviceWa")),
      primary: true
    }]);
    setQuick(backQuick([{ action: "trial", label: t("bot.qTrial") }]));
  }

  function respondAgent() {
    addMessage(t("bot.agentMsg"));
    addActions([{
      label: t("bot.agentBtn"),
      href: waHref(t("bot.agentWa")),
      primary: true
    }]);
    setQuick(backQuick());
  }

  function respondOffers() {
    addMessage(t("bot.offersMsg"));
    addMessage(t("bot.planAsk"));
    setQuick(plansQuick());
  }

  function respondMain() {
    addMessage(t("bot.menuMsg"));
    setQuick(mainQuick());
  }

  function respondFallback() {
    addMessage(t("bot.fallbackMsg"));
    addActions([{
      label: t("bot.fallbackBtn"),
      href: waHref(t("bot.agentWa")),
      primary: true
    }]);
    setQuick(mainQuick());
  }

  function handleBotAction(action, label) {
    if (!action) return;

    if (action.indexOf("plan:") === 0) {
      replyWith(function () { respondPlan(action.slice(5)); });
      return;
    }

    switch (action) {
      case "offers":
        replyWith(respondOffers);
        break;
      case "ibo":
        replyWith(respondIbo);
        break;
      case "trial":
        replyWith(respondTrial);
        break;
      case "support":
        replyWith(respondSupport);
        break;
      case "devices":
        replyWith(respondDevices);
        break;
      case "agent":
        replyWith(respondAgent);
        break;
      case "main":
        replyWith(respondMain);
        break;
      case "thanks":
        replyWith(function () { addMessage(t("bot.thanksReply")); setQuick(mainQuick()); });
        break;
      case "greeting":
        replyWith(function () { addMessage(t("bot.greetReply")); setQuick(mainQuick()); });
        break;
      default:
        replyWith(respondFallback);
    }
  }

  function normaliseText(value) {
    var text = String(value || "").toLowerCase().trim();
    text = text.replace(/[\u0300-\u036f]/g, "");
    text = text.replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");
    return text;
  }

  function detectIntent(value) {
    var text = normaliseText(value);
    if (!text) return "fallback";

    if (detectPlan(text)) return "plan:" + detectPlan(text);

    if (/ibo|player|ايبو|أيبو/.test(text)) return "ibo";
    if (/essai|trial|demo|test gratuit|تجرب|تجربة|مجاني/.test(text)) return "trial";
    if (/support|probleme|panne|coupure|technique|depannage|help|issue|assistance|دعم|مشكل|عطل|مساعدة|مساعده/.test(text)) return "support";
    if (/appareil|device|smart ?tv|android|fire ?(tv|stick)|mag|formuler|iphone|ipad|جهاز|أجهزة|تلفاز/.test(text)) return "devices";
    if (/agent|conseiller|humain|advisor|human|parler|واتساب|مستشار|موظف/.test(text)) return "agent";
    if (/offre|tarif|prix|abonnement|plan|price|offer|subscription|cost|عرض|عروض|سعر|أسعار|اشتراك/.test(text)) return "offers";
    if (/(^|\s)(merci|thanks|thank you|choukran|shukran)(\s|$)|شكرا|شكرًا/.test(text)) return "thanks";
    if (/(^|\s)(bonjour|salut|bonsoir|hello|hi|hey|salam|salamo)(\s|$)|سلام|مرحبا|اهلا|أهلا/.test(text)) return "greeting";
    return "fallback";
  }

  function handleFreeText(value) {
    var text = String(value || "").trim();
    if (!text) return;
    addMessage(text, "user");
    var intent = detectIntent(text);
    if (intent.indexOf("plan:") === 0) {
      replyWith(function () { respondPlan(intent.slice(5)); });
      return;
    }
    handleBotAction(intent, text);
  }

  function initBot() {
    var els = botEls();
    if (!els.panel || !els.toggle) return;

    if (safeStorage(BOT_SEEN_KEY, "") === "1" && els.badge) {
      els.badge.classList.add("is-hidden");
    }

    els.toggle.addEventListener("click", function () {
      botOpen(!state.botOpen);
    });

    if (els.close) {
      els.close.addEventListener("click", function () { botOpen(false); });
    }

    if (els.reset) {
      els.reset.addEventListener("click", function () {
        resetBot();
        if (els.input) els.input.focus();
      });
    }

    document.querySelectorAll("[data-open-bot]").forEach(function (btn) {
      btn.addEventListener("click", function () { botOpen(true); });
    });

    if (els.form && els.input) {
      els.form.addEventListener("submit", function (e) {
        e.preventDefault();
        var value = els.input.value;
        els.input.value = "";
        handleFreeText(value);
      });
    }

    if (els.panel) {
      els.panel.addEventListener("click", function (e) {
        var link = e.target.closest ? e.target.closest("a[href]") : null;
        if (!link) return;
        window.setTimeout(function () {
          if (state.botOpen) addMessage(t("bot.opening"));
        }, 260);
      });
    }

    showGreeting();
  }

  /* ------------------------------------------------------------------ */
  /* Contact form                                                        */
  /* ------------------------------------------------------------------ */

  function initContactForm() {
    var form = document.getElementById("contactForm");
    if (!form) return;
    var nameInput = document.getElementById("cfName");
    var planSelect = document.getElementById("cfPlan");
    var messageInput = document.getElementById("cfMessage");
    var success = document.getElementById("formSuccess");
    var fallback = document.getElementById("formFallback");
    var nameField = nameInput ? nameInput.closest(".field") : null;
    var error = document.getElementById("cfNameError");

    if (!nameInput) return;

    function clearError() {
      if (nameField) nameField.classList.remove("is-invalid");
      nameInput.removeAttribute("aria-invalid");
      if (error) error.hidden = true;
    }

    nameInput.addEventListener("input", function () {
      if (nameInput.value.trim().length >= 2) clearError();
    });

    function buildMessage() {
      var name = nameInput.value.trim();
      var plan = planSelect && planSelect.value
        ? planSelect.options[planSelect.selectedIndex].textContent
        : t("contact.planPh");
      var message = messageInput ? messageInput.value.trim() : "";
      var lines = [
        t("wa.formIntro", { name: name }),
        t("wa.formPlan", { plan: plan })
      ];
      if (message) lines.push(t("wa.formMessage", { message: message }));
      return lines.join("\n");
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (nameInput.value.trim().length < 2) {
        if (nameField) nameField.classList.add("is-invalid");
        nameInput.setAttribute("aria-invalid", "true");
        if (error) error.hidden = false;
        nameInput.focus();
        return;
      }
      clearError();

      var href = waHref(buildMessage());
      if (fallback) fallback.href = href;
      if (success) success.hidden = false;

      var opened = window.open(href, "_blank", "noopener");
      if (opened) opened.opener = null;
    });

    if (success) {
      success.setAttribute("role", "status");
      success.setAttribute("aria-live", "polite");
    }
  }

  /* ------------------------------------------------------------------ */
  /* Legal dialog                                                        */
  /* ------------------------------------------------------------------ */

  function initLegal() {
    var modal = document.getElementById("legalModal");
    if (!modal) return;
    var closeBtn = document.getElementById("legalClose");
    var lastFocus = null;

    function selectTab(name) {
      document.querySelectorAll("[data-legal-tab]").forEach(function (tab) {
        var active = tab.getAttribute("data-legal-tab") === name;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-selected", active ? "true" : "false");
        tab.setAttribute("tabindex", active ? "0" : "-1");
      });
      document.querySelectorAll("[data-legal-panel]").forEach(function (panel) {
        panel.classList.toggle("is-active", panel.getAttribute("data-legal-panel") === name);
      });
      var body = modal.querySelector(".legal-body");
      if (body) body.scrollTop = 0;
    }

    function openModal(name) {
      lastFocus = document.activeElement;
      selectTab(name || "terms");
      if (typeof modal.showModal === "function") {
        if (!modal.open) modal.showModal();
      } else {
        modal.setAttribute("open", "");
      }
      if (closeBtn) closeBtn.focus();
    }

    function closeModal() {
      if (typeof modal.close === "function") {
        if (modal.open) modal.close();
      } else {
        modal.removeAttribute("open");
      }
      if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
    }

    document.querySelectorAll("[data-legal]").forEach(function (trigger) {
      trigger.addEventListener("click", function () {
        openModal(trigger.getAttribute("data-legal"));
      });
    });

    document.querySelectorAll("[data-legal-tab]").forEach(function (tab) {
      tab.addEventListener("click", function () {
        selectTab(tab.getAttribute("data-legal-tab"));
      });
    });

    document.querySelectorAll("[data-legal-close]").forEach(function (btn) {
      btn.addEventListener("click", closeModal);
    });

    if (closeBtn) closeBtn.addEventListener("click", closeModal);

    modal.addEventListener("click", function (e) {
      if (e.target === modal) closeModal();
    });

    modal.addEventListener("cancel", function (e) {
      e.preventDefault();
      closeModal();
    });
  }

  /* ------------------------------------------------------------------ */
  /* Language & misc                                                     */
  /* ------------------------------------------------------------------ */

  function onLanguageChange() {
    applyCurrency(state.currency, false);
    renderCounters(true);

    var form = document.getElementById("contactForm");
    var success = document.getElementById("formSuccess");
    var fallback = document.getElementById("formFallback");
    if (form && success && !success.hidden && fallback) {
      var name = document.getElementById("cfName");
      if (name && name.value.trim().length >= 2) {
        var planSelect = document.getElementById("cfPlan");
        var messageInput = document.getElementById("cfMessage");
        var plan = planSelect && planSelect.value
          ? planSelect.options[planSelect.selectedIndex].textContent
          : t("contact.planPh");
        var lines = [
          t("wa.formIntro", { name: name.value.trim() }),
          t("wa.formPlan", { plan: plan })
        ];
        if (messageInput && messageInput.value.trim()) {
          lines.push(t("wa.formMessage", { message: messageInput.value.trim() }));
        }
        fallback.href = waHref(lines.join("\n"));
      }
    }

    var els = botEls();
    if (els.messages && els.messages.children.length) {
      resetBot();
    } else if (els.messages) {
      showGreeting();
    }
  }

  function initLanguage() {
    document.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("button[data-lang]") : null;
      if (!btn || !window.EA_I18N) return;
      window.EA_I18N.setLanguage(btn.getAttribute("data-lang"));
    });

    document.addEventListener("ea:languagechange", onLanguageChange);

    document.querySelectorAll("button[data-currency]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        applyCurrency(btn.getAttribute("data-currency"));
        renderCounters(true);
      });
    });
  }

  function initKeyboard() {
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (state.botOpen) {
        botOpen(false);
        return;
      }
      if (state.menuOpen) {
        var toggle = document.getElementById("menuToggle");
        var menu = document.getElementById("mobileMenu");
        var backdrop = document.getElementById("menuBackdrop");
        state.menuOpen = false;
        document.body.classList.remove("menu-open");
        if (menu) menu.classList.remove("is-open");
        if (toggle) toggle.setAttribute("aria-expanded", "false");
        if (backdrop) backdrop.hidden = true;
        if (toggle) toggle.focus();
      }
    });
  }

  function initYear() {
    var year = document.getElementById("year");
    if (year) year.textContent = String(new Date().getFullYear());
  }

  /* ------------------------------------------------------------------ */
  /* Boot                                                                */
  /* ------------------------------------------------------------------ */

  function init() {
    state.currency = CURRENCIES.indexOf(safeStorage(CURRENCY_KEY, "mad")) > -1
      ? safeStorage(CURRENCY_KEY, "mad")
      : "mad";

    initHeader();
    initLanguage();
    applyCurrency(state.currency, false);
    initReveal();
    initCounters();
    initBot();
    initContactForm();
    initLegal();
    initKeyboard();
    initYear();
    updateStaticLinks();
    renderCounters(true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

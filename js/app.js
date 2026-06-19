/* Stubb: local-first product logic for the static app.
   Real production deployments should replace localStorage with a server DB,
   Wholegrain auth, Stripe Checkout, signed webhooks, and transactional email. */
(function () {
  const VERSION = "0.2.0";
  const STATE_KEY = "stubb-state-v2";
  const THEME_KEY = "stubb-theme";
  const CLIENT_ID_KEY = "stubb-client-id";
  const WHOLEGRAIN_ACCOUNTS_URL = window.STUBB_CONFIG?.wholegrainAccountsUrl || "https://wholegrainstudios.co.uk/accounts/link";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const page = document.body.dataset.page || "home";
  const params = new URLSearchParams(location.search);

  const icons = {
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="3.2"/><path d="M5 20c1.2-3.6 4-5.5 7-5.5s5.8 1.9 7 5.5"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 5l7 7-7 7"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
    scan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2M7 12h10"/></svg>'
  };

  function id(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function slugify(value) {
    return String(value || "event")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "event";
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char]));
  }

  function money(value) {
    const amount = Number(value || 0);
    return amount === 0 ? "Free" : new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP"
    }).format(amount);
  }

  function dateTime(event) {
    const start = new Date(`${event.date}T${event.startTime || "00:00"}`);
    return {
      date: start.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }),
      fullDate: start.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
      time: start.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" })
    };
  }

  function isPast(event) {
    const end = new Date(`${event.date}T${event.endTime || event.startTime || "23:59"}`);
    return end.getTime() < Date.now();
  }

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STATE_KEY));
      if (parsed && parsed.version === 2) return parsed;
    } catch (_) {}
    return { version: 2, users: [], currentUserId: null, events: [], tickets: [], checkout: null, editorDraft: null };
  }

  let state = loadState();
  function save() {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  }

  function currentUser() {
    return state.users.find(user => user.id === state.currentUserId) || null;
  }

  function getLocalClientId() {
    let clientId = localStorage.getItem(CLIENT_ID_KEY);
    if (!clientId) {
      clientId = id("stubb");
      localStorage.setItem(CLIENT_ID_KEY, clientId);
    }
    return clientId;
  }

  function buildWholegrainLinkUrl() {
    const url = new URL(WHOLEGRAIN_ACCOUNTS_URL);
    url.searchParams.set("game", "stubb");
    url.searchParams.set("gameName", "Stubb");
    url.searchParams.set("gameAccountId", getLocalClientId());
    url.searchParams.set("returnTo", new URL("account.html?configure=1", window.location.href).href);
    return url.toString();
  }

  async function restoreLinkedAccountFromUrl() {
    const url = new URL(window.location.href);
    const restoreToken = url.searchParams.get("stubbRestoreToken");
    if (!restoreToken) return;
    url.searchParams.delete("stubbRestoreToken");
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);

    let linkedProfile = null;
    if (location.protocol !== "file:") {
      try {
        const response = await fetch("/.netlify/functions/stubb-profile?action=restore-wholegrain-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ restoreToken }),
          cache: "no-store"
        });
        if (response.ok) linkedProfile = (await response.json()).profile;
      } catch (_) {}
    }

    const linkedId = linkedProfile?.identityId || `wg_${restoreToken.slice(0, 24).replace(/[^a-z0-9_-]/gi, "") || getLocalClientId()}`;
    let user = state.users.find(item => item.identityId === linkedId || item.id === getLocalClientId());
    if (!user) {
      user = {
        id: linkedProfile?.id || getLocalClientId(),
        identityId: linkedId,
        linkedAccount: true,
        name: linkedProfile?.name || "",
        email: linkedProfile?.identityEmail || linkedProfile?.email || "",
        type: "",
        organisationName: "",
        description: "",
        bannerImage: "",
        stripeDetails: ""
      };
      state.users.push(user);
    }
    user.identityId = linkedId;
    user.linkedAccount = true;
    user.email = linkedProfile?.identityEmail || linkedProfile?.email || user.email || "";
    if (linkedProfile?.name && !user.name) user.name = linkedProfile.name;
    state.currentUserId = user.id;
    save();
  }

  function organisationSlug(user = currentUser()) {
    if (!user) return "";
    return slugify(user.organisationName || user.name || user.email.split("@")[0]);
  }

  function eventById() {
    const eventId = params.get("event") || params.get("id");
    return state.events.find(event => event.id === eventId) || state.events[0] || null;
  }

  function ticketById() {
    const ticketId = params.get("ticket") || params.get("ticket_id");
    return state.tickets.find(ticket => ticket.id === ticketId) || state.tickets[0] || null;
  }

  function applyTheme() {
    const theme = localStorage.getItem(THEME_KEY) || "dark";
    document.documentElement.classList.toggle("theme-light", theme === "light");
    $$("[data-theme-toggle]").forEach(toggle => toggle.classList.toggle("is-on", theme === "light"));
  }

  function setTheme(next) {
    localStorage.setItem(THEME_KEY, next);
    applyTheme();
  }

  function toast(message, tone = "success") {
    $(".toast")?.remove();
    const el = document.createElement("div");
    el.className = `toast toast--${tone}`;
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3600);
  }

  function nav(active = "discover") {
    const user = currentUser();
    const eventsHref = user?.type === "organisation" ? "events-organisation.html" : "events-user.html";
    return `
      <header class="nav">
        <div class="nav__inner">
          <a href="index.html" class="brand"><span class="brand__mark"></span>Stubb</a>
          <nav class="nav__links nav__links--page">
            <a href="index.html" class="nav__link ${active === "discover" ? "is-active" : ""}">Discover</a>
            ${user ? `<a href="${eventsHref}" class="nav__link ${active === "events" ? "is-active" : ""}">Events</a>` : ""}
            ${user?.type === "organisation" ? `<a href="events-organisation-public.html?org=${organisationSlug(user)}" class="nav__link">Public page</a>` : ""}
          </nav>
          <div class="nav__right">
            <button class="btn btn--ghost btn--icon" data-theme-toggle title="Toggle theme" aria-label="Toggle theme">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z"/></svg>
            </button>
            <div data-menu-root style="position:relative;">
              <button class="avatar-btn" data-menu-trigger aria-label="Account menu">${icons.user}</button>
              <div class="menu">
                ${user ? `
                  <a href="account.html" class="menu__item">Account</a>
                  <a href="${eventsHref}" class="menu__item">Events</a>
                  <a href="settings.html" class="menu__item">Settings</a>
                  <button class="menu__item menu__item--danger" data-action="logout" type="button">Log out</button>
                ` : `<a href="login.html" class="menu__item">Log in / Sign up</a>`}
              </div>
            </div>
          </div>
        </div>
      </header>`;
  }

  function shell(active, content) {
    document.body.innerHTML = `${nav(active)}<main id="app">${content}</main><footer class="footer"><div class="container footer__inner"><span class="brand brand--sm"><span class="brand__mark"></span>Stubb</span><p>A Wholegrain Studios product.</p></div></footer>`;
    applyTheme();
  }

  function card(event, options = {}) {
    const dt = dateTime(event);
    const sold = state.tickets.filter(ticket => ticket.eventId === event.id && ticket.status === "paid").length;
    return `
      <a href="event-page.html?event=${encodeURIComponent(event.id)}" class="event-card">
        <div class="event-card__media">
          ${event.coverImage ? `<img src="${escapeHtml(event.coverImage)}" alt="">` : `<div class="image-placeholder">No cover image</div>`}
          ${isPast(event) ? `<span class="event-card__past-tag">Past event</span>` : `<span class="event-card__price-tag">${money(event.price)}</span>`}
        </div>
        <div class="event-card__perf"><span class="notch notch--l"></span><span class="notch notch--r"></span></div>
        <div class="event-card__body">
          <h3 class="event-card__title">${escapeHtml(event.title)}</h3>
          <p class="event-card__desc">${escapeHtml(event.description)}</p>
          <div class="event-card__meta">
            <span>${icons.calendar}${dt.date}</span>
            <span>${icons.clock}${dt.time}</span>
          </div>
          ${options.showSales ? `<p class="muted">${sold}/${event.maxTickets} sold</p>` : ""}
        </div>
      </a>`;
  }

  function empty(title, text, action = "") {
    return `<section class="empty"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p>${action ? `<div class="mt-6">${action}</div>` : ""}</section>`;
  }

  function renderHome() {
    const events = [...state.events].sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`));
    shell("discover", `
      <section class="hero">
        <div class="container hero__inner">
          <span class="eyebrow">Tear here to begin</span>
          <h1 class="hero__title">Every great night starts with a stub.</h1>
          <p class="hero__sub">Browse live events from local organisers, buy tickets, and keep scannable entry stubs in one place.</p>
          <div class="hero__search">${icons.scan}<input type="search" class="hero__search-input" id="event-search" placeholder="Search events, organisers, venues"></div>
        </div>
      </section>
      <section class="container section">
        <div class="section-head">
          <div><span class="eyebrow">Public events</span><h1>Discover</h1></div>
          ${currentUser()?.type === "organisation" ? `<a class="btn btn--primary" href="event-editor.html">${icons.plus}New event</a>` : ""}
        </div>
        <div id="event-grid" class="event-grid">${events.map(event => card(event)).join("")}</div>
        ${events.length ? "" : empty("No public events yet", "Sign up as an organisation and create the first event. Stubb starts empty: no sample data, no pretend listings.", `<a href="login.html" class="btn btn--primary">Create an account</a>`)}
      </section>`);

    $("#event-search")?.addEventListener("input", event => {
      const term = event.target.value.toLowerCase();
      const matches = events.filter(item => [item.title, item.description, item.organisationName].join(" ").toLowerCase().includes(term));
      $("#event-grid").innerHTML = matches.map(item => card(item)).join("") || empty("No matching events", "Try a different search term.");
    });
  }

  function renderLogin() {
    document.body.innerHTML = `${nav()}<main class="auth-shell"><section class="auth-card">
      <span class="eyebrow">Wholegrain linked account</span>
      <h1 class="auth-title">Log in or sign up</h1>
      <p class="auth-sub">Stubb uses Wholegrain Studios for account login. After linking, you will return here to configure whether this account is for buying tickets or hosting events.</p>
      <a class="btn btn--primary btn--block btn--lg mt-6" href="${escapeHtml(buildWholegrainLinkUrl())}">Continue with Wholegrain Studios ${icons.arrow}</a>
      <p class="auth-fineprint">This sends your local Stubb profile ID to Wholegrain so it can link the signed-in account and return you safely to account setup.</p>
    </section></main>`;
    applyTheme();
  }

  function requireUser() {
    if (!currentUser()) {
      location.href = "login.html";
      return false;
    }
    return true;
  }

  function renderAccount() {
    if (!requireUser()) return;
    const user = currentUser();
    const isOrg = user.type === "organisation";
    shell("account", `<section class="container page narrow">
      <div class="section-head"><div><span class="eyebrow">Account</span><h1>${isOrg ? "Organisation profile" : "Account setup"}</h1></div></div>
      <form class="panel form-stack" id="account-form">
        <div class="linked-callout"><strong>Wholegrain account linked</strong><span>${escapeHtml(user.email || "Configure your Stubb profile to continue.")}</span></div>
        <div class="account-type-grid">
          <label class="account-type-card ${user.type === "user" || !user.type ? "is-selected" : ""}"><input type="radio" name="type" value="user" ${user.type === "user" || !user.type ? "checked" : ""}><h3>User</h3><p>Buy tickets and keep your stubs in one place.</p></label>
          <label class="account-type-card ${isOrg ? "is-selected" : ""}"><input type="radio" name="type" value="organisation" ${isOrg ? "checked" : ""}><h3>Organisation</h3><p>Create events, sell tickets, and check attendees in.</p></label>
        </div>
        <label class="field"><span class="field__label">Banner image URL</span><input class="input" name="bannerImage" value="${escapeHtml(user.bannerImage)}" placeholder="https://..."></label>
        <label class="field" data-user-field><span class="field__label">Display name</span><input class="input" name="name" value="${escapeHtml(user.name)}"></label>
        <div data-org-fields ${isOrg ? "" : "hidden"}>
          <label class="field"><span class="field__label">Name of organisation</span><input class="input" name="organisationName" value="${escapeHtml(user.organisationName)}"></label>
          <label class="field"><span class="field__label">Description of organisation</span><textarea class="textarea" name="description">${escapeHtml(user.description)}</textarea></label>
          <label class="field"><span class="field__label">Stripe details</span><textarea class="textarea" name="stripeDetails" placeholder="Stripe account ID, onboarding status, payout notes">${escapeHtml(user.stripeDetails)}</textarea><span class="field__hint">Never store secret keys in a browser. Use Netlify environment variables for production secrets.</span></label>
        </div>
        <button class="btn btn--primary">Save account</button>
      </form>
    </section>`);
    $$("input[name=type]").forEach(input => input.addEventListener("change", () => {
      $$(".account-type-card").forEach(cardEl => cardEl.classList.toggle("is-selected", cardEl.querySelector("input").checked));
      $("[data-org-fields]").hidden = $("input[name=type]:checked").value !== "organisation";
    }));
    $("#account-form").addEventListener("submit", event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget));
      user.bannerImage = data.bannerImage.trim();
      user.type = data.type;
      user.name = data.name.trim();
      if (data.type === "organisation") {
        user.organisationName = data.organisationName.trim();
        user.description = data.description.trim();
        user.stripeDetails = data.stripeDetails.trim();
      } else {
        user.organisationName = "";
        user.description = "";
        user.stripeDetails = "";
      }
      save();
      toast("Account saved");
    });
  }

  function renderSettings() {
    shell("settings", `<section class="container page narrow">
      <div class="section-head"><div><span class="eyebrow">Settings</span><h1>Preferences</h1></div></div>
      <div class="panel settings-list">
        <div class="settings-row"><div><strong>Dark mode</strong><p>Enabled by default across Stubb.</p></div><button class="toggle" data-theme-toggle type="button" aria-label="Toggle dark mode"></button></div>
        <div class="settings-row"><div><strong>Version</strong><p>Stubb ${VERSION}</p></div></div>
        <div class="settings-row"><div><strong>Buy me a coffee</strong><p>Support the project.</p></div><a class="btn btn--secondary" href="https://www.buymeacoffee.com/" target="_blank" rel="noopener">Open</a></div>
      </div>
    </section>`);
    applyTheme();
  }

  function renderUserEvents() {
    if (!requireUser()) return;
    const mine = state.tickets.filter(ticket => ticket.buyerEmail === currentUser().email && ticket.status === "paid");
    const events = mine.map(ticket => state.events.find(event => event.id === ticket.eventId)).filter(Boolean);
    shell("events", `<section class="container page">
      <div class="section-head"><div><span class="eyebrow">Your tickets</span><h1>Events</h1></div></div>
      <div class="event-grid">${events.map(event => card(event)).join("")}</div>
      ${events.length ? "" : empty("No tickets yet", "Tickets you buy will appear here with an open-in-app ticket link.", `<a href="index.html" class="btn btn--primary">Discover events</a>`)}
    </section>`);
  }

  function renderOrganisationEvents(publicOnly = false) {
    const user = currentUser();
    const org = params.get("org") || organisationSlug(user);
    const owned = state.events.filter(event => event.organisationSlug === org || (user && event.ownerId === user.id));
    const canCreate = user?.type === "organisation" && (!org || org === organisationSlug(user));
    shell("events", `<section class="container page">
      <div class="section-head">
        <div><span class="eyebrow">${publicOnly ? "Public organiser page" : "Hosted events"}</span><h1>${escapeHtml(user?.organisationName || org || "Organisation events")}</h1></div>
        ${canCreate ? `<a href="event-editor.html" class="btn btn--primary">${icons.plus}New event</a>` : ""}
      </div>
      ${user?.bannerImage ? `<img class="banner" src="${escapeHtml(user.bannerImage)}" alt="">` : ""}
      ${user?.description ? `<p class="lead">${escapeHtml(user.description)}</p>` : ""}
      <div class="event-grid">${owned.map(event => card(event, { showSales: !publicOnly })).join("")}</div>
      ${owned.length ? "" : empty("No events published", canCreate ? "Create your first event to make this public page shareable." : "This organiser has not published anything yet.", canCreate ? `<a href="event-editor.html" class="btn btn--primary">Create event</a>` : "")}
    </section>`);
  }

  function editorForm(event = null) {
    const today = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    return `
      <form class="editor-grid" id="editor-form">
        <div class="editor-main">
          <section class="panel">
            <h2 class="panel-title">Cover image</h2>
            <label class="field"><span class="field__label">Cover image URL</span><input class="input" name="coverImage" value="${escapeHtml(event?.coverImage || "")}" placeholder="https://..."></label>
          </section>
          <section class="panel mt-6">
            <h2 class="panel-title">Event details</h2>
            <label class="field"><span class="field__label">Title</span><input class="input" name="title" value="${escapeHtml(event?.title || "")}" required></label>
            <label class="field"><span class="field__label">Description</span><textarea class="textarea" name="description" required>${escapeHtml(event?.description || "")}</textarea></label>
          </section>
          <section class="panel mt-6">
            <h2 class="panel-title">Date and time</h2>
            <div class="input-row">
              <label class="field"><span class="field__label">Date</span><input class="input" type="date" name="date" value="${escapeHtml(event?.date || today)}" required></label>
              <label class="field"><span class="field__label">Start time</span><input class="input" type="time" name="startTime" value="${escapeHtml(event?.startTime || "19:30")}" required></label>
            </div>
            <label class="field"><span class="field__label">End time</span><input class="input" type="time" name="endTime" value="${escapeHtml(event?.endTime || "22:30")}" required></label>
          </section>
          <section class="panel mt-6">
            <h2 class="panel-title">Tickets</h2>
            <div class="input-row">
              <label class="field"><span class="field__label">Max tickets</span><input class="input" type="number" name="maxTickets" min="1" value="${escapeHtml(event?.maxTickets || 60)}" required></label>
              <label class="field"><span class="field__label">Ticket price (GBP)</span><input class="input" type="number" name="price" min="0" step="0.01" value="${escapeHtml(event?.price ?? "0.00")}" required></label>
            </div>
          </section>
          <section class="panel mt-6">
            <h2 class="panel-title">Other images</h2>
            <label class="field"><span class="field__label">Gallery image URLs</span><textarea class="textarea" name="images" placeholder="One URL per line">${escapeHtml((event?.images || []).join("\n"))}</textarea></label>
          </section>
        </div>
        <aside class="editor-side"><div class="panel editor-side__panel">
          <button class="btn btn--primary btn--block" name="intent" value="preview">Preview</button>
          <a class="btn btn--ghost btn--block mt-3" href="events-organisation.html">Cancel</a>
        </div></aside>
      </form>`;
  }

  function renderEditor() {
    if (!requireUser()) return;
    const user = currentUser();
    if (user.type !== "organisation") return shell("events", empty("Organisation account required", "Only organisations can create events."));
    const existing = state.events.find(event => event.id === params.get("event"));
    if (existing && existing.ownerId !== user.id) return shell("events", empty("You cannot edit this event", "This event belongs to another organisation."));
    shell("events", `<section class="container page editor-shell"><div class="section-head"><div><span class="eyebrow">events / ${escapeHtml(organisationSlug(user))}</span><h1>${existing ? "Edit event" : "Create event"}</h1></div></div>${editorForm(existing)}</section>`);
    $("#editor-form").addEventListener("submit", event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget));
      state.editorDraft = {
        id: existing?.id || id("evt"),
        ownerId: user.id,
        organisationName: user.organisationName,
        organisationSlug: organisationSlug(user),
        slug: slugify(data.title),
        title: data.title.trim(),
        description: data.description.trim(),
        coverImage: data.coverImage.trim(),
        date: data.date,
        startTime: data.startTime,
        endTime: data.endTime,
        maxTickets: Number(data.maxTickets),
        price: Number(data.price),
        images: data.images.split(/\n+/).map(item => item.trim()).filter(Boolean),
        createdAt: existing?.createdAt || new Date().toISOString()
      };
      save();
      location.href = `event-preview.html${existing ? `?event=${existing.id}` : ""}`;
    });
  }

  function renderPreview() {
    if (!requireUser()) return;
    const draft = state.editorDraft;
    if (!draft) return shell("events", empty("No draft to preview", "Create or edit an event first.", `<a class="btn btn--primary" href="event-editor.html">Open editor</a>`));
    shell("events", `<section class="container page">
      <div class="section-head"><div><span class="eyebrow">Preview</span><h1>${escapeHtml(draft.title)}</h1></div><div class="actions"><button class="btn btn--primary" data-action="publish-event">Create Event</button><a class="btn btn--secondary" href="event-editor.html?event=${encodeURIComponent(draft.id)}">Continue Editing</a><button class="btn btn--danger" data-action="discard-draft">Discard event</button></div></div>
      ${eventDetailMarkup(draft, true)}
    </section>`);
  }

  function eventDetailMarkup(event, preview = false) {
    const dt = dateTime(event);
    const sold = state.tickets.filter(ticket => ticket.eventId === event.id && ticket.status === "paid").length;
    const remaining = Math.max(0, event.maxTickets - sold);
    const closed = preview ? false : isPast(event) || remaining <= 0;
    const user = currentUser();
    const owner = user && event.ownerId === user.id;
    const myTicket = user && state.tickets.find(ticket => ticket.eventId === event.id && ticket.buyerEmail === user.email && ticket.status === "paid");
    return `<div class="event-layout">
      <article class="event-main">
        <div class="event-hero-media">${event.coverImage ? `<img src="${escapeHtml(event.coverImage)}" alt="">` : `<div class="image-placeholder large">No cover image</div>`}</div>
        <span class="eyebrow">${escapeHtml(event.organisationName)}</span>
        <h1>${escapeHtml(event.title)}</h1>
        <p class="lead">${escapeHtml(event.description)}</p>
        <div class="meta-grid"><span>${icons.calendar}${dt.fullDate}</span><span>${icons.clock}${dt.time}</span><span>${money(event.price)}</span><span>${remaining} tickets left</span></div>
        ${(event.images || []).length ? `<div class="gallery">${event.images.map(src => `<img src="${escapeHtml(src)}" alt="">`).join("")}</div>` : ""}
      </article>
      <aside class="checkout-panel panel">
        <h2 class="panel-title">${closed ? "Sales closed" : "Tickets"}</h2>
        ${owner ? `<div class="stack"><a class="btn btn--secondary btn--block" href="event-editor.html?event=${event.id}">Edit Event</a><a class="btn btn--primary btn--block" href="manage-event.html?event=${event.id}">Manage</a><button class="btn btn--danger btn--block" data-action="delete-event" data-event="${event.id}">Delete Event</button></div>` : myTicket ? `<a class="btn btn--primary btn--block" href="ticket-page.html?ticket=${myTicket.id}">View my ticket</a>` : closed ? `<p class="muted">${isPast(event) ? "This event has already happened." : "This event is sold out."}</p>` : `<form id="quantity-form"><label class="field"><span class="field__label">Number of tickets</span><input class="input" type="number" name="quantity" min="1" max="${remaining}" value="1"></label><button class="btn btn--primary btn--block mt-5">Checkout</button></form>`}
      </aside>
    </div>`;
  }

  function renderEvent() {
    const event = eventById();
    if (!event) return shell("discover", empty("Event not found", "There are no events yet, or this link points to an event that was removed.", `<a href="index.html" class="btn btn--primary">Back to Discover</a>`));
    shell("discover", `<section class="container page">${eventDetailMarkup(event)}</section>`);
    $("#quantity-form")?.addEventListener("submit", submit => {
      submit.preventDefault();
      const quantity = Number(new FormData(submit.currentTarget).get("quantity"));
      state.checkout = { eventId: event.id, quantity };
      save();
      location.href = "checkout.html";
    });
  }

  function renderCheckout() {
    const checkout = state.checkout;
    const event = state.events.find(item => item.id === checkout?.eventId);
    if (!event) return shell("discover", empty("No checkout in progress", "Choose tickets from an event page first.", `<a href="index.html" class="btn btn--primary">Find events</a>`));
    const total = Number(event.price) * Number(checkout.quantity);
    document.body.innerHTML = `${nav()}<main class="auth-shell"><div class="checkout-grid">
      <form class="auth-card checkout-form" id="checkout-form">
        <span class="eyebrow">Secure checkout</span><h1 class="auth-title">Your details</h1>
        <label class="field"><span class="field__label">Full name</span><input class="input" name="name" value="${escapeHtml(currentUser()?.name || "")}" required></label>
        <label class="field"><span class="field__label">Email address</span><input class="input" type="email" name="email" value="${escapeHtml(currentUser()?.email || "")}" required></label>
        <button class="btn btn--primary btn--block btn--lg mt-6">Continue to payment</button>
        <p class="auth-fineprint">This static prototype confirms payment locally. Production should call the Netlify Checkout function, redirect to Stripe, then issue tickets only after a verified webhook.</p>
      </form>
      <aside class="order-summary"><h2 class="panel-title">Order summary</h2><strong>${escapeHtml(event.title)}</strong><div class="perf my-5"></div><div class="order-summary__line"><span>${checkout.quantity} x General admission</span><span class="mono">${money(total)}</span></div></aside>
    </div></main>`;
    applyTheme();
    $("#checkout-form").addEventListener("submit", submit => {
      submit.preventDefault();
      const data = Object.fromEntries(new FormData(submit.currentTarget));
      const remaining = event.maxTickets - state.tickets.filter(ticket => ticket.eventId === event.id && ticket.status === "paid").length;
      if (remaining < checkout.quantity || isPast(event)) return toast("Tickets are no longer available", "warning");
      let firstTicket = null;
      for (let i = 0; i < checkout.quantity; i++) {
        const ticket = {
          id: id("tkt"),
          code: `${slugify(event.title).slice(0, 6).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
          eventId: event.id,
          buyerName: data.name.trim(),
          buyerEmail: data.email.trim(),
          status: "paid",
          checkedIn: false,
          createdAt: new Date().toISOString()
        };
        state.tickets.push(ticket);
        firstTicket ||= ticket;
      }
      state.checkout = null;
      save();
      location.href = `ticket-page.html?ticket=${firstTicket.id}`;
    });
  }

  function renderTicket() {
    const ticket = ticketById();
    const event = state.events.find(item => item.id === ticket?.eventId);
    if (!ticket || !event) return shell("events", empty("Ticket not found", "The ticket link is invalid or the ticket was removed."));
    shell("events", `<section class="container page narrow">
      <div class="ticket-full panel">
        <span class="eyebrow">Admit one</span><h1>${escapeHtml(event.title)}</h1>
        <p>${escapeHtml(ticket.buyerName)} · ${escapeHtml(ticket.buyerEmail)}</p>
        <canvas class="qr-canvas" width="260" height="260" data-ticket-payload="${escapeHtml(ticketPayload(ticket, event))}"></canvas>
        <p class="ticket-code mono">${escapeHtml(ticket.code)}</p>
        <p class="muted">Open in app: ${location.origin}${location.pathname.replace(/[^/]+$/, "")}ticket-page.html?ticket=${ticket.id}</p>
      </div>
    </section>`);
    drawQrLike($(".qr-canvas"), ticketPayload(ticket, event));
  }

  function ticketPayload(ticket, event) {
    return JSON.stringify({ type: "stubb-ticket", ticketId: ticket.id, code: ticket.code, eventId: event.id });
  }

  function drawQrLike(canvas, text) {
    const ctx = canvas.getContext("2d");
    const cells = 29;
    const size = canvas.width / cells;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#111";
    function square(x, y, w) { ctx.fillRect(x * size, y * size, w * size, w * size); }
    [[1, 1], [21, 1], [1, 21]].forEach(([x, y]) => { square(x, y, 7); ctx.fillStyle = "#fff"; square(x + 1, y + 1, 5); ctx.fillStyle = "#111"; square(x + 2, y + 2, 3); });
    let hash = 2166136261;
    for (const ch of text) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
    for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) {
      const inFinder = (x < 9 && y < 9) || (x > 19 && y < 9) || (x < 9 && y > 19);
      if (!inFinder) {
        hash = Math.imul(hash ^ (x * 31 + y * 17), 16777619);
        if ((hash >>> 0) % 3 === 0) square(x, y, 1);
      }
    }
  }

  function renderManage() {
    if (!requireUser()) return;
    const event = eventById();
    if (!event || event.ownerId !== currentUser().id) return shell("events", empty("Manage access denied", "Only the owning organisation can manage this event."));
    const attendees = state.tickets.filter(ticket => ticket.eventId === event.id && ticket.status !== "cancelled");
    shell("events", `<section class="container page">
      <div class="section-head"><div><span class="eyebrow">Manage event</span><h1>${escapeHtml(event.title)}</h1></div><button class="btn btn--primary" data-action="open-scanner">${icons.scan}Scan QR code</button></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Checked in</th><th>Ticket code</th></tr></thead><tbody>
        ${attendees.map(ticket => `<tr><td>${escapeHtml(ticket.buyerName)}</td><td>${escapeHtml(ticket.buyerEmail)}</td><td><span class="badge badge--${ticket.status === "paid" ? "success" : "warning"}">${ticket.status}</span></td><td><button class="checkbox ${ticket.checkedIn ? "is-checked" : ""}" data-action="toggle-checkin" data-ticket="${ticket.id}" aria-label="Toggle check in">${ticket.checkedIn ? "✓" : ""}</button></td><td class="mono">${escapeHtml(ticket.code)}</td></tr>`).join("")}
      </tbody></table></div>
      ${attendees.length ? "" : empty("No attendees yet", "Paid attendees will appear here after checkout.")}
      <div class="modal-overlay" id="scanner-modal"><div class="modal"><h3>Scan ticket</h3><p>Camera scanning uses the browser BarcodeDetector API where available. You can always enter the ticket code manually.</p><video id="scan-video" autoplay playsinline muted></video><form id="manual-scan" class="mt-5"><label class="field"><span class="field__label">Ticket code or payload</span><input class="input" name="code" required></label><button class="btn btn--primary btn--block mt-4">Check in</button></form><div class="modal__actions"><button class="btn btn--secondary" data-modal-close>Close</button></div></div></div>
    </section>`);
  }

  function checkIn(raw) {
    let code = raw.trim();
    try { code = JSON.parse(code).code || code; } catch (_) {}
    const ticket = state.tickets.find(item => item.eventId === eventById()?.id && (item.code === code || item.id === code));
    if (!ticket) return toast("Ticket not found for this event", "warning");
    if (ticket.checkedIn) return toast(`You've already checked in ${ticket.buyerName}`, "warning");
    ticket.checkedIn = true;
    ticket.checkedInAt = new Date().toISOString();
    save();
    toast(`${ticket.buyerName} checked in`);
    renderManage();
  }

  document.addEventListener("click", event => {
    const trigger = event.target.closest("[data-menu-trigger]");
    if (trigger) trigger.closest("[data-menu-root]").querySelector(".menu").classList.toggle("is-visible");
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "logout") { state.currentUserId = null; save(); location.href = "index.html"; }
    if (action === "publish-event") {
      const draft = state.editorDraft;
      const index = state.events.findIndex(item => item.id === draft.id);
      if (index >= 0) state.events[index] = draft; else state.events.push(draft);
      state.editorDraft = null;
      save();
      location.href = `event-page.html?event=${draft.id}`;
    }
    if (action === "discard-draft" && confirm("Discard this event draft?")) { state.editorDraft = null; save(); location.href = "events-organisation.html"; }
    if (action === "delete-event" && confirm("Delete this event and its tickets from this browser?")) {
      const eventId = event.target.closest("[data-event]").dataset.event;
      state.events = state.events.filter(item => item.id !== eventId);
      state.tickets = state.tickets.filter(item => item.eventId !== eventId);
      save();
      location.href = "events-organisation.html";
    }
    if (action === "toggle-checkin") {
      const ticket = state.tickets.find(item => item.id === event.target.closest("[data-ticket]").dataset.ticket);
      ticket.checkedIn = !ticket.checkedIn;
      save();
      renderManage();
    }
    if (action === "open-scanner") $("#scanner-modal")?.classList.add("is-visible");
    if (event.target.closest("[data-modal-close]")) event.target.closest(".modal-overlay")?.classList.remove("is-visible");
    if (event.target.closest("[data-theme-toggle]")) setTheme(document.documentElement.classList.contains("theme-light") ? "dark" : "light");
  });

  document.addEventListener("submit", event => {
    if (event.target.id === "manual-scan") {
      event.preventDefault();
      checkIn(new FormData(event.target).get("code"));
    }
  });

  const routes = {
    home: renderHome,
    login: renderLogin,
    account: renderAccount,
    settings: renderSettings,
    "events-user": renderUserEvents,
    "events-organisation": () => renderOrganisationEvents(false),
    "events-organisation-public": () => renderOrganisationEvents(true),
    "event-editor": renderEditor,
    "event-preview": renderPreview,
    "event-page": renderEvent,
    "event-page-closed": renderEvent,
    checkout: renderCheckout,
    "ticket-page": renderTicket,
    "email-ticket": renderTicket,
    "manage-event": renderManage
  };

  document.addEventListener("DOMContentLoaded", async () => {
    await restoreLinkedAccountFromUrl();
    applyTheme();
    (routes[page] || renderHome)();
  });
})();

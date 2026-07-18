/* ═══════════════════════════════════════════════════════════
   ADMIN CONTENT API
═══════════════════════════════════════════════════════════ */
const CONTENT_API_URL = '/api/content';
let _contentCache = null;

async function fetchContent() {
  if (_contentCache) return _contentCache;
  const response = await fetch(CONTENT_API_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error('HTTP ' + response.status + ': Failed to load admin content');
  const content = await response.json();
  _contentCache = {
    tournaments: Array.isArray(content.tournaments) ? content.tournaments : [],
    images: Array.isArray(content.images) ? content.images : [],
    socials: Array.isArray(content.socials) ? content.socials : [],
    testimonials: Array.isArray(content.testimonials) ? content.testimonials : []
  };
  return _contentCache;
}

/* ═══════════════════════════════════════════════════════════
   CMS DATA SERVICE — Tournaments
═══════════════════════════════════════════════════════════ */
let _tournamentsCache = null;
let _fetchPromise     = null;

async function fetchTournaments() {
  if (_tournamentsCache !== null) return _tournamentsCache;
  if (_fetchPromise) return _fetchPromise;
  _fetchPromise = (async () => {
    const content = await fetchContent();
    const rows = content.tournaments;
    _tournamentsCache = rows
      .filter(row => row && row.published !== false && row.name && String(row.name).trim())
      .map((row, i) => normalizeTournament(row, i))
      .sort((a, b) => (Number(a.order) || 9999) - (Number(b.order) || 9999));
    return _tournamentsCache;
  })();
  return _fetchPromise;
}

function normalizeTournament(row, index) {
  const get = (key) => row[key] == null ? '' : String(row[key]).trim();
  const regRaw = get('registration');
  const isRegOpen = ['true','yes','1','open'].includes(regRaw.toLowerCase());
  let status = get('status').toLowerCase();
  if (!['upcoming','ongoing','past'].includes(status)) {
    status = autoDetectStatus(get('date'), get('endDate') || get('date'));
  }
  const name = get('name');
  const rules = Array.isArray(row.rules) ? row.rules.join('\n') : get('rules');
  return {
    id:               get('id') || 't_' + index + '_' + name.replace(/\s+/g,'_').toLowerCase(),
    name,
    date:             get('date'),
    endDate:          get('endDate') || get('date'),
    prize:            get('prize'),
    status,
    image:            get('poster') || get('image'),
    description:      get('description'),
    registrationOpen: isRegOpen,
    order:            Number(row.order) || index + 1,
    featured:         row.featured === true,
    rules,
    format:           get('format'),
    overs:            get('overs'),
    entryFee:         get('entryFee'),
    venue:            get('venue'),
    contact:          get('contact'),
    cricHeroes:       get('cricLink'),
    tournamentLink:   get('tournamentLink') || get('cricLink') || get('registerLink')
  };
}

function autoDetectStatus(startStr, endStr) {
  if (!startStr) return 'upcoming';
  const now   = new Date();
  const start = new Date(startStr);
  const end   = endStr ? new Date(endStr) : start;
  if (isNaN(start.getTime())) return 'upcoming';
  if (now < start) return 'upcoming';
  if (now >= start && now <= end) return 'ongoing';
  return 'past';
}

function refreshTournaments() {
  _contentCache = null;
  _tournamentsCache = null;
  _fetchPromise     = null;
  loadAndRenderTournaments();
}

/* ═══════════════════════════════════════════════════════════
   COUNTDOWN TIMER LOGIC
═══════════════════════════════════════════════════════════ */
function getCountdownText(dateStr) {
  if (!dateStr) return null;
  const now   = new Date();
  const start = new Date(dateStr);
  if (isNaN(start.getTime())) return null;
  const diff  = start - now;
  if (diff <= 0) return null; // already started

  const totalSecs = Math.floor(diff / 1000);
  const days      = Math.floor(totalSecs / 86400);
  const hours     = Math.floor((totalSecs % 86400) / 3600);
  const mins      = Math.floor((totalSecs % 3600) / 60);

  if (days === 0 && hours === 0 && mins < 60) return 'Starts Today!';
  if (days === 0 && hours < 24) return 'Starts in ' + hours + 'h ' + mins + 'm';
  if (days === 1) return 'Starts Tomorrow';
  if (days < 7) return 'Starts in ' + days + ' Days ' + hours + 'h';
  return 'Starts in ' + days + ' Days';
}

// Track active countdown intervals
const _countdownIntervals = [];

function startCountdownFor(elementId, dateStr) {
  const el = document.getElementById(elementId);
  if (!el || !dateStr) return;
  const update = () => {
    const text = getCountdownText(dateStr);
    if (!text) { el.style.display = 'none'; return; }
    const icon = el.querySelector('.cd-icon');
    if (icon) icon.nextSibling && (icon.nextSibling.textContent = text);
    else el.innerHTML = '<span class="cd-icon">⏱️</span> ' + text;
  };
  update();
  const iv = setInterval(update, 60000);
  _countdownIntervals.push(iv);
}

/* ═══════════════════════════════════════════════════════════
   DATE FORMATTERS
═══════════════════════════════════════════════════════════ */
function formatDateDisplay(str) {
  if (!str) return '';
  const d = new Date(str);
  if (isNaN(d.getTime())) return str;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}
function formatDateShort(str) {
  if (!str) return '';
  const d = new Date(str);
  if (isNaN(d.getTime())) return str;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ═══════════════════════════════════════════════════════════
   UTILITY
═══════════════════════════════════════════════════════════ */
function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}
function escAttr(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/'/g,'&#39;')
    .replace(/"/g,'&quot;');
}
function safeHttpsUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim(), window.location.origin);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.href : '';
  } catch {
    return '';
  }
}
function safeImageUrl(value) {
  const clean = String(value || '').trim();
  if (/^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(clean)) return clean;
  if (/^\/(?!\/)/.test(clean)) return new URL(clean, window.location.origin).href;
  const safe = safeHttpsUrl(clean);
  if (!safe) return '';
  const parsed = new URL(safe);
  if (parsed.hostname === 'res.cloudinary.com' && /\/image\/upload\/v\d+\//.test(parsed.pathname)) {
    parsed.pathname = parsed.pathname.replace('/image/upload/', '/image/upload/f_auto,q_auto:good,w_1600,c_limit/');
    return parsed.href;
  }
  return safe;
}
function setContainerHtml(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

/* ═══════════════════════════════════════════════════════════
   RENDER: STATES
═══════════════════════════════════════════════════════════ */
function renderLoadingState() {
  return '<div class="loading-state"><div class="loading-spinner"></div><p>Loading tournaments...</p></div>';
}
function renderErrorState(message) {
  return '<div class="error-state"><span class="error-icon">⚠️</span><h3>Couldn\'t load tournaments</h3><p>' + escHtml(message || 'Failed to connect to the CMS.') + '</p><button class="error-retry-btn" data-content-action="refresh-tournaments">Try Again</button></div>';
}
function renderEmptyState(icon, title, message) {
  return '<div class="empty-state"><span class="empty-icon">' + icon + '</span><h3>' + escHtml(title) + '</h3><p>' + escHtml(message) + '</p></div>';
}
function renderCardsGrid(cardsHtml) {
  return '<div class="tournament-cards-grid">' + cardsHtml + '</div>';
}

/* ═══════════════════════════════════════════════════════════
   RENDER: TOURNAMENT CARDS
═══════════════════════════════════════════════════════════ */
function buildCardPoster(t, fallbackEmoji) {
  const safeImage = safeImageUrl(t.image);
  if (safeImage) {
    const ph = '<div class="t-card-poster-placeholder">' + fallbackEmoji + '<span>' + escHtml(t.name) + '</span></div>';
    return ph + '<img src="' + escAttr(safeImage) + '" alt="' + escAttr(t.name) + '" data-image-fallback="hide">';
  }
  return '<div class="t-card-poster-placeholder">' + fallbackEmoji + '<span>' + escHtml(t.name) + '</span></div>';
}
function buildDateRange(t) {
  if (t.date && t.endDate && t.date !== t.endDate) {
    return formatDateShort(t.date) + ' — ' + formatDateShort(t.endDate);
  }
  return formatDateDisplay(t.date);
}

function buildCountdownCardHtml(t) {
  if (t.status !== 'upcoming') return '';
  const text = getCountdownText(t.date);
  if (!text) return '';
  const cdId = 'cd-card-' + escAttr(t.id);
  // Will be initialised after render via startCountdownFor
  return '<div class="t-card-countdown" id="' + cdId + '"><span class="cd-icon">⏱️</span> ' + escHtml(text) + '</div>';
}

function buildCricHeroesBtn(t, size) {
  const safeUrl = safeHttpsUrl(t.cricHeroes);
  if (!safeUrl || (t.status !== 'ongoing' && t.status !== 'past')) return '';
  const pad = size === 'modal' ? 'padding:14px 24px;font-size:0.82rem;' : '';
  return '<a href="' + escAttr(safeUrl) + '" target="_blank" rel="noopener noreferrer" class="t-btn-cricheroes" style="' + pad + '">'
    + '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>'
    + ' View on CricHeroes</a>';
}

function buildGoToTournamentBtn(t, size) {
  const safeUrl = safeHttpsUrl(t.tournamentLink);
  if (!safeUrl || (t.status !== 'ongoing' && t.status !== 'past')) return '';
  const pad = size === 'modal' ? 'padding:14px 24px;font-size:0.82rem;' : '';
  return '<a href="' + escAttr(safeUrl) + '" target="_blank" rel="noopener noreferrer" class="t-btn-goto" style="' + pad + '">'
    + '<svg viewBox="0 0 24 24"><path d="M19 19H5V5h7V3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>'
    + ' Go to Tournament</a>';
}

function renderUpcomingCard(t) {
  const cdId  = 'cd-card-' + t.id;
  const cdHtml = buildCountdownCardHtml(t);
  const regBtn = t.registrationOpen
    ? '<button class="t-btn-register" data-tournament-action="register" data-tournament-id="' + escAttr(t.id) + '" data-tournament-name="' + escAttr(t.name) + '">Register Team</button>'
    : '<button class="t-btn-register" disabled>Registration Closed</button>';
  const detailsBtn = '<button class="t-btn-details" data-tournament-action="details" data-tournament-id="' + escAttr(t.id) + '">View Details</button>';
  return '<div class="tournament-card">'
    + '<div class="t-card-poster"><span class="t-card-status-pill upcoming-pill">📅 Upcoming</span>' + buildCardPoster(t,'🏏') + '</div>'
    + '<div class="t-card-body">'
    + '<div class="t-card-name">' + escHtml(t.name) + '</div>'
    + (t.date ? '<div class="t-card-date">' + escHtml(buildDateRange(t)) + '</div>' : '')
    + (t.prize ? '<div class="t-card-prize">' + escHtml(t.prize) + '</div>' : '')
    + cdHtml
    + (t.description ? '<div class="t-card-desc">' + escHtml(t.description) + '</div>' : '')
    + '<div class="t-card-actions">' + regBtn + detailsBtn + '</div>'
    + '</div></div>';
}

function renderOngoingCard(t) {
  const detailsBtn = '<button class="t-btn-details" data-tournament-action="details" data-tournament-id="' + escAttr(t.id) + '">View Details</button>';
  const chBtn      = buildCricHeroesBtn(t, 'card');
  const gotoBtn    = buildGoToTournamentBtn(t, 'card');

  return '<div class="tournament-card">'
    + '<div class="t-card-poster"><span class="t-card-status-pill ongoing-pill">🔴 Live</span>' + buildCardPoster(t,'🏏') + '</div>'
    + '<div class="t-card-body">'
    + '<div class="t-card-name">' + escHtml(t.name) + '</div>'
    + (t.date ? '<div class="t-card-date">' + escHtml(buildDateRange(t)) + '</div>' : '')
    + (t.prize ? '<div class="t-card-prize">' + escHtml(t.prize) + '</div>' : '')
    + (t.description ? '<div class="t-card-desc">' + escHtml(t.description) + '</div>' : '')
    + '<div class="t-card-actions">' + detailsBtn + chBtn + gotoBtn + '</div>'
    + '</div></div>';
}

function renderPastCard(t) {
  const detailsBtn = '<button class="t-btn-details" data-tournament-action="details" data-tournament-id="' + escAttr(t.id) + '">View Details</button>';
  const chBtn      = buildCricHeroesBtn(t, 'card');
  const gotoBtn    = buildGoToTournamentBtn(t, 'card');

  return '<div class="tournament-card">'
    + '<div class="t-card-poster"><span class="t-card-status-pill past-pill">✓ Completed</span>' + buildCardPoster(t,'🏆') + '</div>'
    + '<div class="t-card-body">'
    + '<div class="t-card-name">' + escHtml(t.name) + '</div>'
    + (t.date ? '<div class="t-card-date">' + escHtml(buildDateRange(t)) + '</div>' : '')
    + (t.prize ? '<div class="t-card-prize">' + escHtml(t.prize) + '</div>' : '')
    + (t.description ? '<div class="t-card-desc">' + escHtml(t.description) + '</div>' : '')
    + '<div class="t-card-actions">' + detailsBtn + chBtn + gotoBtn + '</div>'
    + '</div></div>';
}

/* ═══════════════════════════════════════════════════════════
   TOURNAMENT DETAILS MODAL
═══════════════════════════════════════════════════════════ */
function openTournamentModal(id) {
  const t = (_tournamentsCache || []).find(x => x.id === id);
  if (!t) return;

  // Poster
  const posterEl = document.getElementById('t-modal-poster');
  const closeBtn = document.getElementById('t-modal-close');
  // Remove old poster content except close button and status pill
  const pillEl = document.getElementById('t-modal-status-pill');

  const safePosterUrl = safeImageUrl(t.image);
  if (safePosterUrl) {
    // Create img element safely
    let imgEl = posterEl.querySelector('img');
    if (!imgEl) { imgEl = document.createElement('img'); posterEl.appendChild(imgEl); }
    imgEl.src = safePosterUrl;
    imgEl.alt = t.name;
    imgEl.style.width = '100%';
    imgEl.style.height = '100%';
    imgEl.style.objectFit = 'cover';
    imgEl.style.position = 'absolute';
    imgEl.style.inset = '0';
    imgEl.style.display = 'block';
    imgEl.dataset.imageFallback = 'modal-poster';
    // remove placeholder if any
    const ph = posterEl.querySelector('.t-modal-poster-placeholder');
    if (ph) ph.remove();
  } else {
    const imgEl = posterEl.querySelector('img');
    if (imgEl) imgEl.remove();
    let ph = posterEl.querySelector('.t-modal-poster-placeholder');
    if (!ph) {
      ph = document.createElement('div');
      ph.className = 't-modal-poster-placeholder';
      posterEl.appendChild(ph);
    }
    ph.innerHTML = '🏏<span>' + escHtml(t.name) + '</span>';
  }

  // Status pill
  const pillMap = {
    upcoming: ['upcoming-pill','📅 Upcoming'],
    ongoing:  ['ongoing-pill','🔴 Live Now'],
    past:     ['past-pill','✓ Completed'],
  };
  const [pillClass, pillText] = pillMap[t.status] || ['past-pill','—'];
  pillEl.className = 't-card-status-pill ' + pillClass;
  pillEl.textContent = pillText;

  // Title
  document.getElementById('t-modal-title').textContent = t.name;

  // Countdown
  const cdEl = document.getElementById('t-modal-countdown');
  if (t.status === 'upcoming') {
    const cdText = getCountdownText(t.date);
    if (cdText) {
      cdEl.innerHTML = '<span class="cd-icon">⏱️</span><span id="t-modal-cd-text">' + escHtml(cdText) + '</span>';
      cdEl.style.display = 'flex';
      // Live update
      clearInterval(window._modalCdInterval);
      window._modalCdInterval = setInterval(() => {
        const el = document.getElementById('t-modal-cd-text');
        if (!el) return;
        const txt = getCountdownText(t.date);
        if (!txt) { cdEl.style.display = 'none'; clearInterval(window._modalCdInterval); }
        else el.textContent = txt;
      }, 30000);
    } else {
      cdEl.style.display = 'none';
    }
  } else {
    cdEl.style.display = 'none';
    clearInterval(window._modalCdInterval);
  }

  // Registration status
  const regEl = document.getElementById('t-modal-reg-status');
  if (t.status === 'upcoming' || t.status === 'ongoing') {
    if (t.registrationOpen) {
      regEl.className = 't-modal-reg-status reg-open';
      regEl.innerHTML = '✅ Registration Open';
    } else {
      regEl.className = 't-modal-reg-status reg-closed';
      regEl.innerHTML = '🔒 Registration Closed';
    }
    regEl.style.display = 'inline-flex';
  } else {
    regEl.style.display = 'none';
  }

  // Meta grid
  const metaItems = [];
  if (t.date)     metaItems.push(['📅 Date',       buildDateRange(t)]);
  if (t.prize)    metaItems.push(['🏆 Prize',      t.prize]);
  if (t.format)   metaItems.push(['🏏 Format',     t.format]);
  if (t.overs)    metaItems.push(['⚡ Overs',       t.overs]);
  if (t.entryFee) metaItems.push(['💰 Entry Fee',  t.entryFee]);
  if (t.venue)    metaItems.push(['📍 Venue',       t.venue]);
  if (t.contact)  metaItems.push(['📞 Contact',     t.contact]);

  const metaGrid = document.getElementById('t-modal-meta-grid');
  metaGrid.innerHTML = metaItems.map(([label, val]) =>
    '<div class="t-modal-meta-item"><div class="m-label">' + escHtml(label) + '</div><div class="m-val">' + escHtml(val) + '</div></div>'
  ).join('');

  // Description
  const descSec = document.getElementById('t-modal-desc-section');
  const descEl  = document.getElementById('t-modal-desc');
  if (t.description) {
    descEl.textContent = t.description;
    descSec.style.display = 'block';
  } else {
    descSec.style.display = 'none';
  }

  // Rules
  const rulesSec = document.getElementById('t-modal-rules-section');
  const rulesEl  = document.getElementById('t-modal-rules');
  if (t.rules) {
    const ruleLines = t.rules.split(/[;\n]+/).map(r => r.trim()).filter(Boolean);
    rulesEl.innerHTML = ruleLines.map(r => '<li>' + escHtml(r) + '</li>').join('');
    rulesSec.style.display = 'block';
  } else {
    rulesSec.style.display = 'none';
  }

  // Actions
  const actionsEl = document.getElementById('t-modal-actions');
  let actionsHtml = '';
  if ((t.status === 'upcoming' || t.status === 'ongoing') && t.registrationOpen) {
    actionsHtml += '<button class="t-btn-register" style="padding:14px 32px;font-size:0.82rem" data-tournament-action="register-modal" data-tournament-id="' + escAttr(t.id) + '" data-tournament-name="' + escAttr(t.name) + '">Register Team</button>';
  }
  actionsHtml += buildCricHeroesBtn(t, 'modal');
  actionsHtml += buildGoToTournamentBtn(t, 'modal');

  actionsEl.innerHTML = actionsHtml;

  // Open overlay
  document.getElementById('t-modal-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeTournamentModal() {
  document.getElementById('t-modal-overlay').classList.remove('open');
  document.body.style.overflow = '';
  clearInterval(window._modalCdInterval);
}

function handleModalOverlayClick(e) {
  if (e.target === document.getElementById('t-modal-overlay')) closeTournamentModal();
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    closeTournamentModal();
    closeLightbox();
  }
});

/* ═══════════════════════════════════════════════════════════
   MAIN TOURNAMENT RENDER ENGINE
═══════════════════════════════════════════════════════════ */
async function loadAndRenderTournaments() {
  setContainerHtml('upcoming-state-container', renderLoadingState());
  setContainerHtml('ongoing-state-container',  renderLoadingState());
  setContainerHtml('past-state-container',     renderLoadingState());

  let tournaments;
  try {
    tournaments = await fetchTournaments();
  } catch (err) {
    const errorHtml = renderErrorState(err.message);
    setContainerHtml('upcoming-state-container', errorHtml);
    setContainerHtml('ongoing-state-container',  errorHtml);
    setContainerHtml('past-state-container',     errorHtml);
    return;
  }

  const upcoming = tournaments.filter(t => t.status === 'upcoming');
  const ongoing  = tournaments.filter(t => t.status === 'ongoing');
  const past     = tournaments.filter(t => t.status === 'past');

  document.getElementById('tnav-count-upcoming').textContent = upcoming.length;
  document.getElementById('tnav-count-ongoing').textContent  = ongoing.length;
  document.getElementById('tnav-count-past').textContent     = past.length;

  setContainerHtml('upcoming-state-container',
    upcoming.length
      ? renderCardsGrid(upcoming.map(renderUpcomingCard).join(''))
      : renderEmptyState('📅','No Upcoming Tournaments','Check back soon — exciting tournaments are being planned!')
  );
  setContainerHtml('ongoing-state-container',
    ongoing.length
      ? renderCardsGrid(ongoing.map(renderOngoingCard).join(''))
      : renderEmptyState('🏏','No Ongoing Tournaments','No tournaments are currently in progress. Check back soon!')
  );
  setContainerHtml('past-state-container',
    past.length
      ? renderCardsGrid(past.map(renderPastCard).join(''))
      : renderEmptyState('🏆','No Past Tournaments Yet','Tournament history will appear here after events conclude.')
  );

  // Start card countdowns for upcoming
  upcoming.forEach(t => {
    const el = document.getElementById('cd-card-' + t.id);
    if (el) {
      const update = () => {
        const text = getCountdownText(t.date);
        if (!text) { el.style.display = 'none'; return; }
        el.innerHTML = '<span class="cd-icon">⏱️</span> ' + escHtml(text);
      };
      update();
      setInterval(update, 60000);
    }
  });

  populateTournamentSelect(tournaments);

  // Re-apply any active search after render
  if (_searchQuery) applyTournamentSearch();
}

/* ═══════════════════════════════════════════════════════════
   TOURNAMENT REGISTRATION SELECT
═══════════════════════════════════════════════════════════ */
function populateTournamentSelect(tournaments) {
  const sel = document.getElementById('tournament-select');
  if (!sel) return;
  const available = tournaments.filter(t =>
    (t.status === 'upcoming' && t.registrationOpen) || t.status === 'ongoing'
  );
  if (available.length === 0) {
    sel.innerHTML = '<option value="">— No tournaments open for registration —</option>';
  } else {
    sel.innerHTML = '<option value="">— Select a Tournament —</option>';
    available.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.dataset.name = t.name;
      opt.textContent = t.name + (t.date ? ' (' + formatDateShort(t.date) + ')' : '');
      sel.appendChild(opt);
    });
  }
  // Apply pending selection if any
  if (sel.dataset.pendingId) {
    sel.value = sel.dataset.pendingId;
    delete sel.dataset.pendingId;
    delete sel.dataset.pendingName;
  }
  updateTournamentBanner(sel);
}

function updateTournamentBanner(sel) {
  const banner     = document.getElementById('tournament-name-banner');
  const bannerName = document.getElementById('tournament-banner-name');
  const hidden     = document.getElementById('tournament-name-hidden');
  if (!banner || !bannerName || !hidden) return;
  const selected = sel.options[sel.selectedIndex];
  if (selected && selected.value && selected.dataset.name) {
    bannerName.textContent = selected.dataset.name;
    hidden.value = selected.dataset.name;
    banner.classList.add('visible');
  } else {
    bannerName.textContent = '—';
    hidden.value = '';
    banner.classList.remove('visible');
  }
}

/* ═══════════════════════════════════════════════════════════
   DYNAMIC GALLERY — Google Sheets
═══════════════════════════════════════════════════════════ */
const FALLBACK_GALLERY_IMAGES = [
  { title: 'Match Day', image: 'https://images.unsplash.com/photo-1719368472026-dc26f70a9b76?q=80&h=800&w=800&auto=format&fit=crop' },
  { title: 'Training Nets', image: 'https://images.unsplash.com/photo-1649265825072-f7dd6942baed?q=80&h=800&w=800&auto=format&fit=crop' },
  { title: 'Pitch Moments', image: 'https://images.unsplash.com/photo-1555212697-194d092e3b8f?q=80&h=800&w=800&auto=format&fit=crop' },
  { title: 'Evening Cricket', image: 'https://images.unsplash.com/photo-1729086046027-09979ade13fd?q=80&h=800&w=800&auto=format&fit=crop' },
  { title: 'Team Energy', image: 'https://images.unsplash.com/photo-1601568494843-772eb04aca5d?q=80&h=800&w=800&auto=format&fit=crop' },
  { title: 'Centre Life', image: 'https://images.unsplash.com/photo-1585687501004-615dfdfde7f1?q=80&h=800&w=800&auto=format&fit=crop' },
];

async function loadGallery() {
  const container = document.getElementById('gallery-scroll-container');
  if (!container) return;

  try {
    const content = await fetchContent();
    const rows = content.images;
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('No gallery data');

    const items = rows
      .filter(r => r && r.published !== false && r.src && r.placement !== 'sponsor')
      .sort((a, b) => (Number(a.order) || 9999) - (Number(b.order) || 9999))
      .map(r => ({ image: r.src, title: r.title || r.alt || '' }));

    if (items.length === 0) throw new Error('No valid gallery images');

    const trackHtml = items.map(item => buildGalleryItem(item)).join('');
    container.innerHTML = '<div class="gallery-track">' + trackHtml + '</div>';

  } catch (err) {
    const trackHtml = FALLBACK_GALLERY_IMAGES.map(item => buildGalleryItem(item)).join('');
    container.innerHTML = '<div class="gallery-track">' + trackHtml + '</div>';
  }
}

function buildGalleryItem(item) {
  const safeImage = safeImageUrl(item.image);
  if (!safeImage) return '';
  const titleAttr = escAttr(item.title || 'Photo');
  return '<button type="button" class="gallery-item" data-gallery-src="' + escAttr(safeImage) + '" data-gallery-title="' + titleAttr + '">'
    + '<div class="gallery-item-inner">'
    + '<img src="' + escAttr(safeImage) + '" alt="' + titleAttr + '" loading="lazy" data-image-fallback="gallery">'
    + '<div class="gallery-item-overlay"><div class="gallery-item-title">' + escHtml(item.title || '') + '</div></div>'
    + '</div></button>';
}

/* ═══════════════════════════════════════════════════════════
   LIGHTBOX
═══════════════════════════════════════════════════════════ */
function openLightbox(src, title) {
  const overlay = document.getElementById('lightbox-overlay');
  const img     = document.getElementById('lightbox-img');
  const titleEl = document.getElementById('lightbox-title');
  if (src) {
    img.src = src;
    img.style.display = 'block';
  } else {
    img.style.display = 'none';
  }
  titleEl.textContent = title || '';
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeLightbox() {
  document.getElementById('lightbox-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

/* ═══════════════════════════════════════════════════════════
   DYNAMIC TESTIMONIALS — Google Sheets
═══════════════════════════════════════════════════════════ */
let _testimonialsData = [];
let _testimonialIndex = 0;
const TESTIMONIALS_PER_VIEW = 3;
let _testimonialAutoplay = null;

async function loadTestimonials() {
  const container = document.getElementById('testimonials-container');
  if (!container) return;

  try {
    const content = await fetchContent();
    const rows = content.testimonials;
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('No testimonials');

    _testimonialsData = rows
    .filter(r => r && r.published !== false)
    .sort((a, b) => (Number(a.order) || 9999) - (Number(b.order) || 9999))
    .map(r => ({
      name:  r.name || '',
      text:  r.text || '',
      team:  r.role || '',
      image: r.avatar || '',
      stars: parseInt(r.rating || '5') || 5,
    })).filter(t => t.name && t.text);

    if (_testimonialsData.length === 0) throw new Error('No valid testimonials');
    renderTestimonialsCarousel(container);

  } catch (err) {
    container.innerHTML = '<div class="testimonials-empty">Testimonials coming soon.</div>';
  }
}

function renderTestimonialsCarousel(container) {
  const all = _testimonialsData.length ? _testimonialsData : [];
  const columns = [
    all,
    all.slice(1).concat(all.slice(0, 1)),
    all.slice(2).concat(all.slice(0, 2)),
  ].filter(col => col.length);

  const durations = [16, 21, 18];
  const columnsHtml = columns.map((items, i) => buildTestimonialColumn(items, durations[i] || 18)).join('');
  container.innerHTML = '<div class="testimonials-columns-wrap">' + columnsHtml + '</div>';
}

function buildTestimonialColumn(items, duration) {
  const cardsHtml = items.concat(items).map(t => buildTestimonialCard(t)).join('');
  return '<div class="testimonials-column" style="--testimonial-duration:' + duration + 's">'
    + '<div class="testimonials-column-track">' + cardsHtml + '</div>'
    + '</div>';
}

function buildTestimonialCard(t) {
  const stars = Math.min(5, Math.max(1, t.stars || 5));
  const starsHtml = Array(stars).fill('<span class="testimonial-star">★</span>').join('')
    + Array(5-stars).fill('<span class="testimonial-star" style="opacity:0.2">★</span>').join('');
  const initials = t.name.split(' ').map(w => w[0]).join('').substring(0,2).toUpperCase();

  let avatarHtml;
  const safeAvatar = safeImageUrl(t.image);
  if (safeAvatar) {
    avatarHtml = '<div class="testimonial-avatar">'
      + '<img src="' + escAttr(safeAvatar) + '" alt="' + escAttr(t.name) + '" data-image-fallback="avatar" data-fallback-text="' + escAttr(initials) + '">'
      + '</div>';
  } else {
    avatarHtml = '<div class="testimonial-avatar">' + escHtml(initials) + '</div>';
  }

  return '<div class="testimonial-card">'
    + '<div class="testimonial-stars">' + starsHtml + '</div>'
    + '<p class="testimonial-text">' + escHtml(t.text) + '</p>'
    + '<div class="testimonial-author">'
    + avatarHtml
    + '<div><div class="testimonial-name">' + escHtml(t.name) + '</div>'
    + (t.team ? '<div class="testimonial-team">' + escHtml(t.team) + '</div>' : '')
    + '</div></div></div>';
}

/* ═══════════════════════════════════════════════════════════
   DYNAMIC SOCIALS — Admin JSON
═══════════════════════════════════════════════════════════ */
async function loadSocials() {
  try {
    const content = await fetchContent();
    const socials = content.socials
      .map(s => ({ ...s, safeUrl: safeHttpsUrl(s && s.url) }))
      .filter(s => s && s.published !== false && s.visible && s.safeUrl)
      .sort((a, b) => (Number(a.order) || 9999) - (Number(b.order) || 9999));
    if (!socials.length) return;

    const row = document.querySelector('.social-row');
    if (row) {
      row.innerHTML = socials.map(s => {
        const platform = String(s.platform || '').toLowerCase();
        const className = platform.includes('whatsapp') ? 'social-btn-wa'
          : platform.includes('instagram') ? 'social-btn-ig'
          : platform.includes('facebook') ? 'social-btn-fb'
          : platform.includes('youtube') ? 'social-btn-yt'
          : '';
        return '<a class="social-btn ' + className + '" href="' + escAttr(s.safeUrl) + '" target="_blank" rel="noopener noreferrer" title="' + escAttr(s.platform || s.label) + '">'
          + '<span class="social-icon">' + escHtml(socialIcon(s.platform)) + '</span>' + escHtml(s.label || s.platform) + '</a>';
      }).join('');
    }

    const footer = document.querySelector('.footer-social');
    if (footer) {
      footer.innerHTML = socials.map(s =>
        '<a class="footer-social-btn" href="' + escAttr(s.safeUrl) + '" target="_blank" rel="noopener noreferrer" title="' + escAttr(s.platform || s.label) + '">'
        + escHtml(socialIcon(s.platform)) + '</a>'
      ).join('');
    }
  } catch {
    // Keep the original hard-coded social links if admin content is unavailable.
  }
}

function socialIcon(platform) {
  const p = String(platform || '').toLowerCase();
  if (p.includes('whatsapp')) return 'WA';
  if (p.includes('instagram')) return 'IG';
  if (p.includes('facebook')) return 'FB';
  if (p.includes('youtube')) return 'YT';
  if (p.includes('email')) return '@';
  return 'LINK';
}

function getVisibleCount() {
  return window.innerWidth < 600 ? 1 : (window.innerWidth < 900 ? 2 : 3);
}

function updateTestimonialView() {
  const track = document.getElementById('testimonials-track');
  if (!track) return;
  const visCount = getVisibleCount();
  const total    = _testimonialsData.length;
  const maxIndex = Math.max(0, total - visCount);
  if (_testimonialIndex > maxIndex) _testimonialIndex = maxIndex;
  const cardWidth   = 100 / visCount;
  const cards       = track.querySelectorAll('.testimonial-card');
  cards.forEach(c => { c.style.flex = '0 0 calc(' + cardWidth + '% - ' + (28*(visCount-1)/visCount) + 'px)'; });
  const offset = _testimonialIndex * (100 / visCount);
  track.style.transform = 'translateX(-' + offset + '%)';
  // Dots
  document.querySelectorAll('.testimonials-dot').forEach((d,i) => {
    d.classList.toggle('active', i === _testimonialIndex);
  });
}

function nextTestimonial() {
  const total    = _testimonialsData.length;
  const visCount = getVisibleCount();
  const maxIndex = Math.max(0, total - visCount);
  _testimonialIndex = _testimonialIndex >= maxIndex ? 0 : _testimonialIndex + 1;
  updateTestimonialView();
  resetTestimonialAutoplay();
}

function prevTestimonial() {
  const total    = _testimonialsData.length;
  const visCount = getVisibleCount();
  const maxIndex = Math.max(0, total - visCount);
  _testimonialIndex = _testimonialIndex <= 0 ? maxIndex : _testimonialIndex - 1;
  updateTestimonialView();
  resetTestimonialAutoplay();
}

function goToTestimonial(i) {
  _testimonialIndex = i;
  updateTestimonialView();
  resetTestimonialAutoplay();
}

function startTestimonialAutoplay() {
  clearInterval(_testimonialAutoplay);
  _testimonialAutoplay = setInterval(nextTestimonial, 5000);
}

function resetTestimonialAutoplay() {
  startTestimonialAutoplay();
}

window.addEventListener('resize', () => {
  updateTestimonialView();
});

/* ═══════════════════════════════════════════════════════════
   TOURNAMENT SEARCH
═══════════════════════════════════════════════════════════ */
let _searchQuery = '';

function handleTournamentSearch(query) {
  _searchQuery = query.trim().toLowerCase();
  const clearBtn = document.getElementById('tournament-search-clear');
  if (clearBtn) clearBtn.classList.toggle('visible', _searchQuery.length > 0);
  applyTournamentSearch();
}

function clearTournamentSearch() {
  _searchQuery = '';
  const input = document.getElementById('tournament-search-input');
  if (input) input.value = '';
  const clearBtn = document.getElementById('tournament-search-clear');
  if (clearBtn) clearBtn.classList.remove('visible');
  applyTournamentSearch();
}

function applyTournamentSearch() {
  const tabs = ['upcoming', 'ongoing', 'past'];
  tabs.forEach(tab => {
    const container = document.getElementById(tab + '-state-container');
    const infoEl    = document.getElementById('search-info-' + tab);
    if (!container) return;

    const cards = container.querySelectorAll('.tournament-card');
    if (!cards.length) {
      if (infoEl) infoEl.classList.remove('visible');
      return;
    }

    if (!_searchQuery) {
      cards.forEach(c => c.classList.remove('search-hidden'));
      if (infoEl) infoEl.classList.remove('visible');
      return;
    }

    let matched = 0;
    cards.forEach(card => {
      const text = card.textContent.toLowerCase();
      const isMatch = text.includes(_searchQuery);
      card.classList.toggle('search-hidden', !isMatch);
      if (isMatch) matched++;
    });

    if (infoEl) {
      if (matched === 0) {
        infoEl.innerHTML = 'No results for <span class="tsec-search-highlight">"' + escHtml(_searchQuery) + '"</span> in this tab.';
      } else {
        infoEl.innerHTML = '<strong>' + matched + '</strong> result' + (matched !== 1 ? 's' : '') + ' for <span class="tsec-search-highlight">"' + escHtml(_searchQuery) + '"</span>';
      }
      infoEl.classList.add('visible');
    }
  });
}

/* ═══════════════════════════════════════════════════════════
   UI CONTROLS
═══════════════════════════════════════════════════════════ */
function showMainSite() {
  document.getElementById('main-site').style.display = 'block';
  document.getElementById('tournament-page').classList.remove('active');
  document.body.style.overflow = '';
  closeTournamentMobileNav();
  clearTournamentSearch();
}

function showTournamentPage(e, tab) {
  if (e) e.preventDefault();
  document.getElementById('main-site').style.display = 'none';
  document.getElementById('tournament-page').classList.add('active');
  document.body.style.overflow = '';
  closeMobileNav();
  if (_tournamentsCache === null && _fetchPromise === null) loadAndRenderTournaments();
  const targetTab = tab || 'upcoming';
  const btn = document.getElementById('tnav-' + targetTab);
  if (btn) switchTournamentTab(targetTab, btn);
  window.scrollTo(0,0);
}

function switchTournamentTab(tab, btn) {
  document.querySelectorAll('.tnav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tournament-section').forEach(s => s.classList.remove('active'));
  btn.classList.add('active');
  const sec = document.getElementById('tsec-' + tab);
  if (sec) sec.classList.add('active');
  // Re-apply search filter for the newly visible tab
  if (_searchQuery) applyTournamentSearch();
}

function openTournamentRegistration(tournamentId, tournamentName) {
  showMainSite();
  setTimeout(() => {
    switchBookingTab('tournament', document.querySelectorAll('.booking-tab-btn')[1]);
    document.getElementById('booking').scrollIntoView({ behavior: 'smooth' });
    const sel = document.getElementById('tournament-select');
    if (sel) {
      sel.value = tournamentId;
      if (!sel.value) {
        sel.dataset.pendingId   = tournamentId;
        sel.dataset.pendingName = tournamentName;
      }
      updateTournamentBanner(sel);
    }
  }, 100);
}

function switchBookingTab(tab, btn) {
  document.querySelectorAll('.booking-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.booking-form-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  const panel = document.getElementById('booking-panel-' + tab);
  if (panel) panel.classList.add('active');
}

function toggleMobileNav() {
  const nav = document.getElementById('mobile-nav');
  const button = document.getElementById('hamburger');
  nav.classList.toggle('open');
  if (button) button.setAttribute('aria-expanded', nav.classList.contains('open') ? 'true' : 'false');
}
function closeMobileNav() {
  document.getElementById('mobile-nav').classList.remove('open');
  const button = document.getElementById('hamburger');
  if (button) button.setAttribute('aria-expanded', 'false');
}
function toggleTournamentMobileNav() {
  const nav = document.getElementById('tournament-mobile-nav');
  const button = document.getElementById('tournament-hamburger');
  nav.classList.toggle('open');
  if (button) button.setAttribute('aria-expanded', nav.classList.contains('open') ? 'true' : 'false');
}
function closeTournamentMobileNav() {
  document.getElementById('tournament-mobile-nav').classList.remove('open');
  const button = document.getElementById('tournament-hamburger');
  if (button) button.setAttribute('aria-expanded', 'false');
}

/* ═══════════════════════════════════════════════════════════
   FORM SUBMISSIONS
═══════════════════════════════════════════════════════════ */
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 4500);
}

function clearFormError(form) {
  const errorBox = form.querySelector('.form-inline-error');
  if (errorBox) {
    errorBox.textContent = '';
    errorBox.hidden = true;
  }
  form.querySelectorAll('.form-field-error').forEach(field => {
    field.classList.remove('form-field-error');
    field.removeAttribute('aria-invalid');
  });
  form.querySelectorAll('.form-field-inline-error').forEach(message => message.remove());
}

function showFormError(form, message, fieldName) {
  clearFormError(form);
  const errorBox = form.querySelector('.form-inline-error');
  if (errorBox) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }
  const field = fieldName ? form.elements.namedItem(fieldName) : null;
  if (field && typeof field.focus === 'function') {
    field.classList.add('form-field-error');
    field.setAttribute('aria-invalid', 'true');
    const fieldGroup = field.closest('.form-group');
    if (fieldGroup) {
      const inlineError = document.createElement('small');
      inlineError.className = 'form-field-inline-error';
      inlineError.setAttribute('role', 'alert');
      inlineError.textContent = message;
      fieldGroup.appendChild(inlineError);
    }
    field.focus();
  }
}

function updatePhoneInput(input) {
  const maxDigits = 15;
  let digitCount = 0;
  let limitedValue = '';
  for (const character of input.value) {
    if (/\d/.test(character)) {
      if (digitCount >= maxDigits) continue;
      digitCount += 1;
    }
    limitedValue += character;
  }
  if (limitedValue !== input.value) input.value = limitedValue;
  const counter = input.parentElement && input.parentElement.querySelector('.phone-digit-count');
  if (counter) {
    counter.textContent = digitCount + '/15 digits';
    counter.classList.toggle('at-limit', digitCount === maxDigits);
  }
}

function validateBookingForm(data) {
  const email = String(data.email || '').trim();
  const phone = String(data.phone || '').trim();
  const phoneDigits = phone.replace(/\D/g, '');
  if (data.form_type === 'Slot Booking' && String(data.fullname || '').trim().length < 2) {
    return { message: 'Please enter your full name.', field: 'fullname' };
  }
  if (data.form_type === 'Tournament Registration' && String(data.team_name || '').trim().length < 2) {
    return { message: 'Please enter your team name.', field: 'team_name' };
  }
  if (data.form_type === 'Tournament Registration' && String(data.captain_name || '').trim().length < 2) {
    return { message: 'Please enter the captain name.', field: 'captain_name' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { message: 'Please enter a valid email address.', field: 'email' };
  }
  if (!/^\+?[\d\s().-]+$/.test(phone)) {
    return { message: 'Use numbers only. You may also use +, spaces, brackets, dots or hyphens.', field: 'phone' };
  }
  if (phoneDigits.length < 7 || phoneDigits.length > 15) {
    return { message: 'Phone number must contain 7 to 15 digits.', field: 'phone' };
  }
  if (data.form_type === 'Slot Booking' && !/^\d{4}-\d{2}-\d{2}$/.test(String(data.booking_date || ''))) {
    return { message: 'Please select a booking date.', field: 'booking_date' };
  }
  return null;
}

async function handleFormSubmit(form, e) {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  const validationError = validateBookingForm(data);
  if (validationError) {
    showFormError(form, validationError.message, validationError.field);
    return;
  }
  clearFormError(form);
  const btn = form.querySelector('[type="submit"]');
  const originalText = btn.textContent;
  btn.textContent = 'Sending...';
  btn.disabled = true;
  try {
    const response = await fetch(form.action, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok) {
      const tournamentName = form.querySelector('#tournament-name-hidden');
      const isTournament = data.form_type === 'Tournament Registration';
      const confirmation = {
        reference: String(result.reference || ''),
        requestType: isTournament ? 'Tournament registration' : 'Ground booking',
        title: isTournament
          ? String((tournamentName && tournamentName.value) || data.tournament_selection || 'Tournament registration')
          : String(data.booking_type || 'Ground booking'),
        detail: isTournament
          ? 'HCC will contact you about registration and availability.'
          : [data.booking_date, data.time_slot].filter(Boolean).join(' · '),
        deliveryDelayed: result.deliveryStatus === 'failed'
      };
      const confirmationPath = '/booking-confirmation#' + encodeURIComponent(JSON.stringify(confirmation));
      try {
        sessionStorage.setItem('hcc-booking-confirmation', JSON.stringify(confirmation));
      } catch {}
      window.location.assign(confirmationPath);
      return;
    } else {
      showFormError(form, result.error || 'We could not save the request. Please check your details and try again.');
    }
  } catch {
    showFormError(form, 'Network error. Please check your connection and try again.');
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

/* ═══════════════════════════════════════════════════════════
   CURSOR
═══════════════════════════════════════════════════════════ */
const cursor = document.getElementById('cursor');
const ring   = document.getElementById('cursor-ring');
let mx = 0, my = 0, rx = 0, ry = 0;
const isFinePointer = window.matchMedia && window.matchMedia('(pointer: fine)').matches;

if (isFinePointer) {
  document.addEventListener('mousemove', e => {
    mx = e.clientX; my = e.clientY;
    cursor.style.left = mx + 'px';
    cursor.style.top  = my + 'px';
  });

  function animRing() {
    rx += (mx - rx) * 0.12;
    ry += (my - ry) * 0.12;
    ring.style.left = rx + 'px';
    ring.style.top  = ry + 'px';
    requestAnimationFrame(animRing);
  }
  animRing();

  document.querySelectorAll('a, button, input, select, textarea').forEach(el => {
    el.addEventListener('mouseenter', () => {
      cursor.style.width = '20px'; cursor.style.height = '20px';
      ring.style.width = '60px'; ring.style.height = '60px';
      ring.style.opacity = '0.3';
    });
    el.addEventListener('mouseleave', () => {
      cursor.style.width = '12px'; cursor.style.height = '12px';
      ring.style.width = '40px'; ring.style.height = '40px';
      ring.style.opacity = '0.6';
    });
  });
} else {
  cursor.style.display = 'none';
  ring.style.display = 'none';
}

/* ─── NAVBAR SCROLL ─── */
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 40);
});

/* ─── PARALLAX ─── */
const heroBg   = document.getElementById('hero-bg');
const heroLogo = document.getElementById('hero-logo');
const heroScrollStage = document.getElementById('hero-scroll-stage');
const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const shouldReduceMedia = prefersReducedMotion || window.innerWidth <= 700;

if (shouldReduceMedia) {
  document.querySelectorAll('.about-motion-media video').forEach(video => {
    video.pause();
    video.removeAttribute('src');
    video.load();
  });
}

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

function updateSmoothVideoHero() {
  if (!heroScrollStage) return;
  const heroEl = document.getElementById('hero');
  if (prefersReducedMotion) {
    heroScrollStage.style.setProperty('--hero-clip-start', '0%');
    heroScrollStage.style.setProperty('--hero-clip-end', '100%');
    heroScrollStage.style.setProperty('--hero-video-scale', '1.02');
    if (heroEl) heroEl.classList.remove('hero-fixed', 'hero-ended');
    return;
  }
  const rect = heroScrollStage.getBoundingClientRect();
  if (window.innerWidth <= 600) {
    heroScrollStage.style.setProperty('--hero-clip-start', '0%');
    heroScrollStage.style.setProperty('--hero-clip-end', '100%');
    heroScrollStage.style.setProperty('--hero-video-scale', '1');
    if (heroEl) {
      const isActive = rect.top <= 0 && rect.bottom > window.innerHeight;
      const isEnded = rect.bottom <= window.innerHeight;
      heroEl.classList.toggle('hero-fixed', isActive);
      heroEl.classList.toggle('hero-ended', isEnded);
    }
    return;
  }
  const scrollDistance = Math.max(1, heroScrollStage.offsetHeight - window.innerHeight);
  const progress = clamp01(-rect.top / scrollDistance);
  const eased = 1 - Math.pow(1 - progress, 3);
  const clipStart = 24 * (1 - eased);
  const clipEnd = 76 + (24 * eased);
  const scale = 1.32 - (0.30 * eased);

  heroScrollStage.style.setProperty('--hero-clip-start', clipStart.toFixed(2) + '%');
  heroScrollStage.style.setProperty('--hero-clip-end', clipEnd.toFixed(2) + '%');
  heroScrollStage.style.setProperty('--hero-video-scale', scale.toFixed(3));

  if (heroEl) {
    const isActive = rect.top <= 0 && rect.bottom > window.innerHeight;
    const isEnded = rect.bottom <= window.innerHeight;
    heroEl.classList.toggle('hero-fixed', isActive);
    heroEl.classList.toggle('hero-ended', isEnded);
  }
}

const aboutParallax = document.getElementById('about');

function updateAboutParallax() {
  if (!aboutParallax || !aboutParallax.classList.contains('about-parallax')) return;
  if (prefersReducedMotion) {
    aboutParallax.style.setProperty('--about-shift', '0px');
    aboutParallax.style.setProperty('--about-opacity', '1');
    aboutParallax.style.setProperty('--about-media-x', '0px');
    aboutParallax.style.setProperty('--about-media-scale', '1.04');
    aboutParallax.style.setProperty('--about-bg', '18');
    return;
  }

  const rect = aboutParallax.getBoundingClientRect();
  const revealStart = window.innerHeight * 0.92;
  const revealEnd = Math.min(96, window.innerHeight * 0.14);
  const revealDistance = Math.max(1, revealStart - revealEnd);
  const raw = (revealStart - rect.top) / revealDistance;
  const progress = clamp01(raw);
  const eased = progress * progress * (3 - (2 * progress));
  const reveal = clamp01((progress - 0.06) / 0.62);
  const shift = -360 + (360 * eased);
  const mediaX = 220 - (292 * eased);
  const mediaScale = 1.2 - (0.16 * eased);
  const opacity = 1 - Math.pow(1 - reveal, 2);

  aboutParallax.style.setProperty('--about-shift', shift.toFixed(1) + 'px');
  aboutParallax.style.setProperty('--about-opacity', opacity.toFixed(3));
  aboutParallax.style.setProperty('--about-media-x', mediaX.toFixed(1) + 'px');
  aboutParallax.style.setProperty('--about-media-scale', mediaScale.toFixed(3));
  aboutParallax.style.setProperty('--about-bg', (eased * 26).toFixed(2));
}

window.addEventListener('scroll', () => {
  const s = window.scrollY;
  if (heroBg)   heroBg.style.transform   = 'translate(-50%, calc(-50% + ' + (s * 0.3) + 'px))';
  updateSmoothVideoHero();
  updateAboutParallax();
});
window.addEventListener('resize', () => {
  updateSmoothVideoHero();
  updateAboutParallax();
});
window.addEventListener('load', () => {
  updateSmoothVideoHero();
  updateAboutParallax();
});
window.addEventListener('pageshow', () => {
  updateSmoothVideoHero();
  updateAboutParallax();
});
updateSmoothVideoHero();
updateAboutParallax();
setTimeout(updateSmoothVideoHero, 250);
setTimeout(updateAboutParallax, 250);

/* ─── SCROLL REVEAL ─── */
const revealObs = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('revealed'); });
}, { threshold: 0.12 });
document.querySelectorAll('.reveal, .reveal-left, .reveal-right').forEach(el => revealObs.observe(el));

const postHeroSlideObs = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) e.target.classList.add('slide-in');
  });
}, { threshold: 0.18, rootMargin: '0px 0px -8% 0px' });
document.querySelectorAll('.after-hero-slide').forEach(el => postHeroSlideObs.observe(el));

/* ─── COUNTERS ─── */
function animateCounter(el, target, suffix) {
  suffix = suffix || '';
  let start = 0;
  const dur = 1800;
  const step = ts => {
    if (!start) start = ts;
    const progress = Math.min((ts - start) / dur, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.floor(ease * target) + suffix;
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
let countersStarted = false;
const counterObs = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting && !countersStarted) {
      countersStarted = true;
      animateCounter(document.getElementById('c1'), 8);
      animateCounter(document.getElementById('c2'), 2);
      animateCounter(document.getElementById('c3'), 1000, '+');
      animateCounter(document.getElementById('c4'), 8);
    }
  });
}, { threshold: 0.4 });
const statsSection = document.querySelector('.about-stats');
if (statsSection) counterObs.observe(statsSection);

/* ─── FORM EVENT LISTENERS ─── */
['slot-booking-form', 'tournament-booking-form'].forEach(formId => {
  const form = document.getElementById(formId);
  form.addEventListener('submit', (event) => handleFormSubmit(form, event));
  form.addEventListener('input', (event) => {
    const field = event.target;
    if (field.matches && field.matches('[data-phone-input]')) updatePhoneInput(field);
    if (!field.classList || !field.classList.contains('form-field-error')) return;
    field.classList.remove('form-field-error');
    field.removeAttribute('aria-invalid');
    const errorBox = form.querySelector('.form-inline-error');
    if (errorBox) {
      errorBox.textContent = '';
      errorBox.hidden = true;
    }
    form.querySelectorAll('.form-field-inline-error').forEach(message => message.remove());
  });
});
/* ─── TOURNAMENT SELECT → BANNER SYNC ─── */
document.getElementById('tournament-select').addEventListener('change', function () {
  updateTournamentBanner(this);
});

/* ─── STATIC PAGE CONTROLS ─── */
document.getElementById('t-modal-overlay').addEventListener('click', handleModalOverlayClick);
document.getElementById('t-modal-close').addEventListener('click', closeTournamentModal);

const lightboxOverlay = document.getElementById('lightbox-overlay');
const lightboxContent = document.getElementById('lightbox-content');
lightboxOverlay.addEventListener('click', closeLightbox);
lightboxContent.addEventListener('click', event => event.stopPropagation());
document.getElementById('lightbox-close').addEventListener('click', closeLightbox);

document.getElementById('hamburger').addEventListener('click', toggleMobileNav);
document.getElementById('tournament-hamburger').addEventListener('click', toggleTournamentMobileNav);

document.querySelectorAll('[data-booking-tab]').forEach(button => {
  button.addEventListener('click', () => switchBookingTab(button.dataset.bookingTab, button));
});

document.querySelectorAll('[data-tournament-tab-button]').forEach(button => {
  button.addEventListener('click', () => switchTournamentTab(button.dataset.tournamentTabButton, button));
});

document.getElementById('tournament-search-input').addEventListener('input', event => {
  handleTournamentSearch(event.currentTarget.value);
});
document.getElementById('tournament-search-clear').addEventListener('click', clearTournamentSearch);

/* ─── SAFE DYNAMIC CONTENT EVENTS ─── */
document.addEventListener('click', event => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  const siteAction = target.closest('[data-site-action]');
  if (siteAction) {
    const action = siteAction.dataset.siteAction;
    const tab = siteAction.dataset.tournamentTab;
    if (action === 'show-main') showMainSite();
    if (action === 'show-tournaments') showTournamentPage(event, tab);
    if (action === 'mobile-show-main') {
      closeMobileNav();
      showMainSite();
    }
    if (action === 'mobile-show-tournaments') {
      closeMobileNav();
      showTournamentPage(event, tab);
    }
    if (action === 'tournament-mobile-show-main') {
      closeTournamentMobileNav();
      showMainSite();
    }
    if (action === 'tournament-mobile-show-tournaments') {
      closeTournamentMobileNav();
      showTournamentPage(event, tab);
    }
    return;
  }

  const contentAction = target.closest('[data-content-action]');
  if (contentAction && contentAction.dataset.contentAction === 'refresh-tournaments') {
    refreshTournaments();
    return;
  }

  const tournamentAction = target.closest('[data-tournament-action]');
  if (tournamentAction) {
    const action = tournamentAction.dataset.tournamentAction;
    const id = tournamentAction.dataset.tournamentId || '';
    const name = tournamentAction.dataset.tournamentName || '';
    if (action === 'details') openTournamentModal(id);
    if (action === 'register' || action === 'register-modal') {
      if (action === 'register-modal') closeTournamentModal();
      openTournamentRegistration(id, name);
    }
    return;
  }

  const galleryItem = target.closest('[data-gallery-src]');
  if (galleryItem) openLightbox(galleryItem.dataset.gallerySrc || '', galleryItem.dataset.galleryTitle || '');
});

document.addEventListener('error', event => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement)) return;
  const fallback = image.dataset.imageFallback;
  if (fallback === 'hide') {
    image.style.display = 'none';
    return;
  }
  if (fallback === 'brand') {
    delete image.dataset.imageFallback;
    image.src = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 200 200%22><circle cx=%22100%22 cy=%22100%22 r=%2290%22 fill=%22none%22 stroke=%22%23C8101E%22 stroke-width=%228%22/><text x=%22100%22 y=%22115%22 text-anchor=%22middle%22 font-size=%2280%22 font-weight=%22bold%22 fill=%22%23C8101E%22>H</text></svg>';
    return;
  }
  if (fallback === 'modal-poster' && image.parentElement) {
    image.style.display = 'none';
    image.parentElement.style.display = 'flex';
    return;
  }
  if (fallback === 'avatar' && image.parentElement) {
    image.parentElement.textContent = image.dataset.fallbackText || 'HCC';
    return;
  }
  if (fallback === 'gallery' && image.parentElement) {
    const placeholder = document.createElement('div');
    placeholder.className = 'gallery-placeholder-inner gp-1';
    const icon = document.createTextNode('🏏');
    const label = document.createElement('span');
    label.textContent = image.alt || 'Photo';
    placeholder.append(icon, label);
    image.parentElement.replaceChildren(placeholder);
  }
}, true);

/* ─── INIT ─── */
loadAndRenderTournaments();
loadGallery();
loadTestimonials();
loadSocials();

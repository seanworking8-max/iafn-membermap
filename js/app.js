/* js/app.js — Application orchestrator */
'use strict';

class App {
  constructor() {
    this._dm   = new DataManager();
    this._map  = null;
    this._tbl  = null;
    this._view = 'map'; // 'map' | 'table'
    this._sbOpen = true;
    this._theme  = localStorage.getItem('mm_theme') || 'light';
    this._requiredPassword = 'IAFN2026';
    this._isAuthenticated = sessionStorage.getItem('mm_auth_ok') === '1';
    this._started = false;
  }

  async bootstrap() {
    this._initTheme();
    this._initAuthGate();

    if (!this._isAuthenticated) {
      this._showAuthGate();
      return;
    }

    await this._startApp();
  }

  async _startApp() {
    if (this._started) return;
    this._started = true;

    /* Show loader */
    const loader = document.getElementById('loading-screen');
    loader?.classList.remove('hidden');

    /* Load data */
    await this._dm.load('data/members.csv');

    /* Build UI */
    this._buildKPIs();
    this._buildFilters();
    this._buildLegend();
    this._initViews();
    this._bindEvents();
    this._initUpload();
    this._refresh();
    this._updateDataBadge(new Set(this._dm.all().map(r => r.Organization)).size, 'members.csv');

    /* Restore sidebar state */
    const savedSB = localStorage.getItem('mm_sb') !== 'closed';
    if (!savedSB) this._closeSidebar();

    /* Restore last view */
    const savedView = localStorage.getItem('mm_view') || 'map';
    if (savedView !== this._view) this._switchView(savedView, false);

    /* Dismiss loader */
    if (loader) {
      loader.classList.add('hidden');
      setTimeout(() => loader.remove(), 600);
    }

    /* Entrance animation */
    gsap.from('.header', { y: -52, opacity: 0, duration: .5, ease: 'power2.out' });
    gsap.from('.sidebar', { x: -40, opacity: 0, duration: .5, delay: .1, ease: 'power2.out' });
    gsap.from('.kpis', { y: -20, opacity: 0, duration: .4, delay: .2, ease: 'power2.out' });

    /* Load world map */
    await this._map.loadWorld();
  }

  /* ─── Auth gate ─── */
  _initAuthGate() {
    const form = document.getElementById('auth-form');
    const input = document.getElementById('auth-password');

    if (!form || form.dataset.bound === 'true') return;

    form.dataset.bound = 'true';
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const password = input?.value || '';

      if (password !== this._requiredPassword) {
        this._setAuthStatus('Incorrect password. Try again.', 'error');
        input?.focus();
        input?.select();
        return;
      }

      this._isAuthenticated = true;
      sessionStorage.setItem('mm_auth_ok', '1');
      this._setAuthStatus('Access granted. Loading dashboard…', 'success');
      this._hideAuthGate();
      if (input) input.value = '';

      try {
        await this._startApp();
      } catch (err) {
        console.error('Failed to start app after login:', err);
        this._setAuthStatus('Access granted, but the dashboard failed to load.', 'error');
        const ls = document.getElementById('loading-screen');
        if (ls) {
          ls.classList.remove('hidden');
          ls.innerHTML = `<div style="text-align:center;color:#64748b;padding:40px">
            <p style="font-size:1.2rem;font-weight:700;margin-bottom:8px">Failed to load data</p>
            <p style="font-size:.85rem">${err.message}</p>
            <p style="font-size:.8rem;margin-top:12px;opacity:.6">Make sure the server is running: <code>python3 -m http.server 8080</code></p>
          </div>`;
        }
      }
    });
  }

  _showAuthGate() {
    /* Auth screen is already visible (open class set in HTML + inline script).
       Just ensure loading screen is hidden and focus the input. */
    document.getElementById('loading-screen')?.classList.add('hidden');
    requestAnimationFrame(() => document.getElementById('auth-password')?.focus());
  }

  _hideAuthGate() {
    document.body.classList.remove('app-locked');
    document.getElementById('auth-screen')?.classList.remove('open');
  }

  _setAuthStatus(message = '', type = '') {
    const status = document.getElementById('auth-status');
    if (!status) return;
    status.textContent = message;
    status.className = `auth-status${type ? ` ${type}` : ''}`;
  }

  /* ─── KPIs ─── */
  _buildKPIs() {
    const data    = this._dm.all();
    const orgs    = new Set(data.map(r => r.Organization)).size;
    const ctries  = new Set(data.filter(r => r.Presence_Type === 'HQ').map(r => r.ISO_Alpha3)).size;
    const engs    = data.reduce((s, r) => s + (parseFloat(r.Engagements) || 0), 0);
    const indirect = data.reduce((s, r) => s + (parseFloat(r.Indirect_Members_Count) || 0), 0);

    const strip = document.querySelector('.kpis');
    if (!strip) return;
    strip.innerHTML = `
      <div class="kpi">
        <div class="kpi-icon orgs">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">
            <circle cx="8" cy="5" r="3"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6"/>
          </svg>
        </div>
        <div class="kpi-text">
          <div class="kpi-val" id="kpi-orgs">0</div>
          <div class="kpi-lbl">Organizations</div>
        </div>
      </div>
      <div class="kpi-dot"></div>
      <div class="kpi">
        <div class="kpi-icon ctry">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">
            <circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c-2 2-3 4-3 6s1 4 3 6M8 2c2 2 3 4 3 6s-1 4-3 6"/>
          </svg>
        </div>
        <div class="kpi-text">
          <div class="kpi-val" id="kpi-ctry">0</div>
          <div class="kpi-lbl">Countries</div>
        </div>
      </div>
      <div class="kpi-dot"></div>
      <div class="kpi">
        <div class="kpi-icon eng">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">
            <path d="M2 12l3-3 3 3 6-8"/><circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none"/>
          </svg>
        </div>
        <div class="kpi-text">
          <div class="kpi-val" id="kpi-eng">0</div>
          <div class="kpi-lbl">Engagements</div>
        </div>
      </div>
      <div class="kpi-dot"></div>
      <div class="kpi">
        <div class="kpi-icon indirect">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">
            <path d="M2 8h4l2-5 2 10 2-5h2"/>
          </svg>
        </div>
        <div class="kpi-text">
          <div class="kpi-val" id="kpi-indirect">0</div>
          <div class="kpi-lbl">Indirect Members</div>
        </div>
      </div>`;

    Utils.animateCounter(document.getElementById('kpi-orgs'),     orgs,     900);
    Utils.animateCounter(document.getElementById('kpi-ctry'),     ctries,   900);
    Utils.animateCounter(document.getElementById('kpi-eng'),      Math.round(engs), 900);
    Utils.animateCounter(document.getElementById('kpi-indirect'), Math.round(indirect), 900);
  }

  /* ─── Filter sidebar ─── */
  _buildFilters() {
    const data    = this._dm.all();
    const regions = [...new Set(data.map(r => r.Region).filter(Boolean))].sort();
    const scopes  = [...new Set(data.map(r => r.Scope).filter(Boolean))].sort();
    const comms   = [...new Set(data.map(r => r.Commodity).filter(Boolean))].sort();
    const types   = [...new Set(data.map(r => r.Member_Type).filter(Boolean))].sort();
    const vcs     = [...new Set(data.map(r => r.Value_Chain).filter(Boolean))].sort();

    /* ── Value chain groupings ── */
    const tradeVCs    = vcs.filter(v => /^trade/i.test(v));
    const producerVCs = vcs.filter(v => /^producer|^farmer/i.test(v));
    const inputVCs    = vcs.filter(v => /^input|^processing/i.test(v));
    const coordVCs    = vcs.filter(v => /^standard|^value.chain|^professional/i.test(v));

    /* ── Commodity groupings ── */
    const grainComms    = comms.filter(c => /^grain|^canola|^sorghum|^soybean|^pulses/i.test(c));
    const livestockComms= comms.filter(c => /^animal|^cattle|^dairy/i.test(c));
    const foodComms     = comms.filter(c => /^food|^non-alc|^processed|^seafood/i.test(c));
    const inputComms    = comms.filter(c => /^crop|^fertil|^seeds/i.test(c));
    const multiComms    = comms.filter(c => /^multi/i.test(c));

    /* ── Member type groupings ── */
    const assocTypes    = types.filter(t => /^association|^national/i.test(t));
    const companyTypes  = types.filter(t => /^compan/i.test(t));
    const producerTypes = types.filter(t => /^farmer|^individual farm|^producer/i.test(t));
    const mixedTypes    = types.filter(t =>
      !assocTypes.includes(t) && !companyTypes.includes(t) && !producerTypes.includes(t));

    /* ── All 27 organizations ── */
    const orgs = [...new Set(data.filter(r => r.Presence_Type === 'HQ').map(r => r.Organization).filter(Boolean))].sort();

    const sb = document.querySelector('.sb-scroll');
    if (!sb) return;

    /* Section icons (inline SVG) */
    const icons = {
      geography: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c-2 2-3 4-3 6s1 4 3 6M8 2c2 2 3 4 3 6s-1 4-3 6"/></svg>',
      valueChain: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12l4-4 3 3 5-7"/></svg>',
      commodity: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 2L3 5v6l5 3 5-3V5z"/><path d="M3 5l5 3 5-3M8 8v6"/></svg>',
      organization: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8" cy="5" r="2.5"/><path d="M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5"/></svg>',
      members: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="5.5" cy="5" r="2"/><circle cx="10.5" cy="5" r="2"/><path d="M1 14c0-2.5 2-4.5 4.5-4.5S10 11.5 10 14M6 14c0-2.5 2-4.5 4.5-4.5S15 11.5 15 14"/></svg>',
    };

    const sections = [
      {
        id: 'geography', title: 'Geography', icon: icons.geography,
        subsections: [
          { id: 'region', title: 'Region', items: regions },
          { id: 'scope',  title: 'Scope',  items: scopes  },
        ]
      },
      {
        id: 'valueChain', title: 'Value Chain', icon: icons.valueChain,
        subsections: [
          { id: 'valueChain', title: 'Trade',               items: tradeVCs    },
          { id: 'valueChain', title: 'Producers & Farmers', items: producerVCs },
          { id: 'valueChain', title: 'Input & Processing',  items: inputVCs    },
          { id: 'valueChain', title: 'Coordination',        items: coordVCs    },
        ]
      },
      {
        id: 'commodity', title: 'Commodity', icon: icons.commodity,
        subsections: [
          { id: 'commodity', title: 'Grains & Oilseeds',   items: grainComms     },
          { id: 'commodity', title: 'Livestock & Dairy',   items: livestockComms },
          { id: 'commodity', title: 'Food & Beverages',    items: foodComms      },
          { id: 'commodity', title: 'Inputs & Technology', items: inputComms     },
          { id: 'commodity', title: 'Multi-Commodity',     items: multiComms     },
        ]
      },
      {
        id: 'organization', title: 'Member Type', icon: icons.organization,
        subsections: [
          { id: 'type', title: 'Associations',        items: assocTypes    },
          { id: 'type', title: 'Companies',           items: companyTypes  },
          { id: 'type', title: 'Producers & Farmers', items: producerTypes },
          { id: 'type', title: 'Mixed & Networks',    items: mixedTypes    },
        ]
      },
      {
        id: 'members', title: 'Organizations', icon: icons.members,
        subsections: [
          { id: 'organization', title: null, items: orgs },
        ]
      },
    ];

    sb.innerHTML = sections.map(s => this._sectionHTML(s, data)).join('');

    /* ── Build sidebar footer ── */
    this._buildSidebarFooter();

    /* ── Section expand button: toggle section body ── */
    sb.querySelectorAll('.sb-section-expand').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const hd   = btn.closest('.sb-section-hd');
        const body = hd.nextElementSibling;
        btn.classList.toggle('coll');
        if (body) body.classList.toggle('coll');
      });
    });

    /* ── Section "All" button: select / clear all chips in section ── */
    sb.querySelectorAll('.sb-section-sel').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        this._toggleAllChips(btn.closest('.sb-section').querySelectorAll('.sb-chip'));
      });
    });

    /* ── Subsection expand button: toggle only that subsection body ── */
    sb.querySelectorAll('.sb-sub-expand').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const body = btn.closest('.sb-subsection').querySelector('.sb-subsection-body');
        btn.classList.toggle('coll');
        if (body) body.classList.toggle('coll');
      });
    });

    /* ── Subsection title area: select / clear all chips in that subsection ── */
    sb.querySelectorAll('.sb-sub-select').forEach(area => {
      area.addEventListener('click', e => {
        e.stopPropagation();
        const sub  = area.closest('.sb-subsection');
        const body = sub.querySelector('.sb-subsection-body');
        const btn  = sub.querySelector('.sb-sub-expand');
        /* Auto-expand so user sees what was selected */
        if (btn && btn.classList.contains('coll')) {
          btn.classList.remove('coll');
          if (body) body.classList.remove('coll');
        }
        if (body) this._toggleAllChips(body.querySelectorAll('.sb-chip'));
      });
    });

    /* ── Individual chip toggle ── */
    sb.querySelectorAll('.sb-chip').forEach(chip => {
      chip.addEventListener('click', e => {
        e.stopPropagation();
        const { filterKey, value } = chip.dataset;
        if (this._dm.toggleFilter(filterKey, value)) {
          chip.classList.toggle('on');
          this._updateSectionStates();
          this._refresh();
        }
      });
    });
  }

  /* Toggle all chips on/off; if all already on → clear all, else select all */
  _toggleAllChips(chips) {
    const list  = [...chips];
    const allOn = list.every(c => c.classList.contains('on'));
    list.forEach(chip => {
      const { filterKey, value } = chip.dataset;
      const isOn = chip.classList.contains('on');
      if (allOn) {
        if (isOn)  { this._dm.toggleFilter(filterKey, value); chip.classList.remove('on'); }
      } else {
        if (!isOn) { this._dm.toggleFilter(filterKey, value); chip.classList.add('on'); }
      }
    });
    this._updateSectionStates();
    this._refresh();
  }

  /* Update section visual states (has-active class, sel button state) */
  _updateSectionStates() {
    document.querySelectorAll('.sb-section').forEach(section => {
      const chips = section.querySelectorAll('.sb-chip');
      const onChips = section.querySelectorAll('.sb-chip.on');
      const selBtn = section.querySelector('.sb-section-sel');
      const hasActive = onChips.length > 0;
      section.classList.toggle('has-active', hasActive);
      if (selBtn) {
        const allOn = chips.length > 0 && onChips.length === chips.length;
        selBtn.classList.toggle('active', allOn);
        selBtn.textContent = allOn ? 'Clear' : 'All';
      }
    });
    /* Sub-section has-active states */
    document.querySelectorAll('.sb-subsection').forEach(sub => {
      const body = sub.querySelector('.sb-subsection-body');
      if (!body) return;
      const onCnt = body.querySelectorAll('.sb-chip.on').length;
      sub.classList.toggle('has-active', onCnt > 0);
    });
    this._updateSidebarFooter();
  }

  /* Build the sidebar footer */
  _buildSidebarFooter() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar || sidebar.querySelector('.sb-footer')) return;
    const footer = document.createElement('div');
    footer.className = 'sb-footer hidden';
    footer.innerHTML = `<span class="sb-footer-info"></span><button class="sb-footer-clear">Clear All Filters</button>`;
    sidebar.appendChild(footer);

    footer.querySelector('.sb-footer-clear').addEventListener('click', () => {
      this._dm.clearFilters();
      this._syncChips();
      this._updateSectionStates();
      this._refresh();
    });
  }

  /* Update sidebar footer filter count */
  _updateSidebarFooter() {
    const footer = document.querySelector('.sb-footer');
    if (!footer) return;
    const active = this._dm.activeFilters();
    const count = active.filter(f => f.key !== 'search').length;
    if (count === 0) {
      footer.classList.add('hidden');
    } else {
      footer.classList.remove('hidden');
      footer.querySelector('.sb-footer-info').innerHTML =
        `<strong>${count}</strong> filter${count !== 1 ? 's' : ''} active`;
    }
  }

  _sectionHTML({ title, icon, subsections }, allData) {
    const CHEV = `<svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 6l4 4 4-4"/></svg>`;

    let totalChips = 0;
    const subsHtml = subsections.map(({ id: subId, title: subTitle, items }) => {
      if (!items || !items.length) return '';
      totalChips += items.length;
      const chips = items.map(item => {
        const count = allData.filter(r => r[this._fieldFor(subId)] === item).length;
        if (count === 0) return ''; /* skip items with no data */
        return `<div class="sb-chip" data-filter-key="${subId}" data-value="${Utils.escapeHtml(item)}">
          <span class="sb-box"><svg width="10" height="10" class="sb-chk" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.8"><polyline points="3 8 6.5 12 13 4"/></svg></span>
          <span class="sb-label">${Utils.escapeHtml(item)}</span>
          <span class="sb-cnt">${count}</span>
        </div>`;
      }).join('');
      if (!chips) return '';
      if (!subTitle) return `<div class="sb-subsection-body">${chips}</div>`;
      return `<div class="sb-subsection">
        <div class="sb-subsection-row">
          <button class="sb-sub-expand coll" aria-label="Expand ${subTitle}">${CHEV}</button>
          <div class="sb-sub-select">
            <span class="sb-subsection-title">${subTitle}</span>
            <span class="sb-sub-cnt">${items.length}</span>
          </div>
        </div>
        <div class="sb-subsection-body coll">${chips}</div>
      </div>`;
    }).join('');

    return `<div class="sb-section">
      <div class="sb-section-hd">
        <span class="sb-section-icon">${icon || ''}</span>
        <span class="sb-section-title">${title}<span class="sb-section-n">${totalChips}</span></span>
        <button class="sb-section-sel">All</button>
        <button class="sb-section-expand">${CHEV}</button>
      </div>
      <div class="sb-section-body">${subsHtml}</div>
    </div>`;
  }

  _fieldFor(id) {
    const map = { region:'Region', scope:'Scope', commodity:'Commodity', type:'Member_Type', valueChain:'Value_Chain', organization:'Organization' };
    return map[id] || id;
  }

  /* ─── Commodity legend ─── */
  _buildLegend() {
    const leg = document.querySelector('.map-legend');
    if (!leg) return;
    leg.innerHTML =
      `<div class="ml-title">Presence</div>
      <div class="ml-row"><span class="ml-dot" style="background:#E8701A"></span>HQ Country</div>
      <div class="ml-row" style="margin-bottom:10px"><span class="ml-dot" style="background:#38bdf8"></span>Activity Location</div>
      <div class="ml-title">Commodity</div>` +
      Utils.COMMODITY_CATEGORIES.map(c =>
        `<div class="ml-row">
          <span class="ml-dot" style="background:${c.color}"></span>
          ${Utils.escapeHtml(c.label)}
        </div>`
      ).join('');
  }

  /* ─── Init views ─── */
  _initViews() {
    const mapContainer = document.getElementById('map-container');
    const tblContainer = document.getElementById('table-container');

    this._map = new MapView(mapContainer, this._dm);
    this._map.init();
    this._map.onCountryClick(iso => this._openDetail(iso));

    this._tbl = new TableView(tblContainer, this._dm);
    this._tbl.onRowClick(iso => this._openDetail(iso));
  }

  /* ─── Refresh on filter change ─── */
  _refresh() {
    const filtered = this._dm.filtered();

    /* Update KPI counts */
    const orgs    = new Set(filtered.map(r => r.Organization)).size;
    const ctries  = new Set(filtered.filter(r => r.Presence_Type === 'HQ').map(r => r.ISO_Alpha3)).size;
    const engs    = filtered.reduce((s,r) => s + (parseFloat(r.Engagements)||0), 0);
    const indir   = filtered.reduce((s,r) => s + (parseFloat(r.Indirect_Members_Count)||0), 0);

    Utils.animateCounter(document.getElementById('kpi-orgs'),      orgs,          600);
    Utils.animateCounter(document.getElementById('kpi-ctry'),      ctries,        600);
    Utils.animateCounter(document.getElementById('kpi-eng'),       Math.round(engs),  600);
    Utils.animateCounter(document.getElementById('kpi-indirect'),  Math.round(indir), 600);

    /* Update active filter tags */
    this._renderActiveFilters();

    /* Update chip counts */
    this._updateChipCounts(filtered);

    /* Update section states & footer */
    this._updateSectionStates();

    /* Update views */
    this._map && this._map.update(filtered);
    if (this._view === 'table') this._tbl.render(filtered);
  }

  _updateChipCounts(filtered) {
    document.querySelectorAll('.sb-chip').forEach(chip => {
      const { filterKey, value } = chip.dataset;
      const field = this._fieldFor(filterKey);
      const n = filtered.filter(r => r[field] === value).length;
      const cnt = chip.querySelector('.sb-cnt');
      if (cnt) cnt.textContent = n > 0 ? n : '';
    });
  }

  _renderActiveFilters() {
    const af   = document.querySelector('.active-filters');
    if (!af) return;
    const active = this._dm.activeFilters();
    if (!active.length) { af.classList.remove('on'); return; }
    af.classList.add('on');
    af.innerHTML = active.map(({ key, value }) =>
      `<span class="af-tag">
        ${Utils.escapeHtml(value)}
        <button data-key="${key}" data-val="${Utils.escapeHtml(value)}" aria-label="Remove filter">×</button>
      </span>`
    ).join('') + `<button class="af-clear">Clear all</button>`;

    af.querySelectorAll('.af-tag button').forEach(btn => {
      btn.addEventListener('click', () => {
        this._dm.toggleFilter(btn.dataset.key, btn.dataset.val);
        this._syncChips();
        this._refresh();
      });
    });
    af.querySelector('.af-clear')?.addEventListener('click', () => {
      this._dm.clearFilters();
      this._syncChips();
      this._refresh();
    });
  }

  _syncChips() {
    const active = this._dm.activeFilters();
    const activeSet = new Set(active.map(f => `${f.key}::${f.value}`));
    document.querySelectorAll('.sb-chip').forEach(chip => {
      const key = `${chip.dataset.filterKey}::${chip.dataset.value}`;
      chip.classList.toggle('on', activeSet.has(key));
    });
  }

  /* ─── View switch ─── */
  _switchView(name, animate = true) {
    this._view = name;
    localStorage.setItem('mm_view', name);

    const mapPanel = document.getElementById('map-panel');
    const tblPanel = document.getElementById('table-panel');
    const btns     = document.querySelectorAll('.vs-btn');
    const indicator = document.querySelector('.vs-indicator');

    btns.forEach(b => b.classList.toggle('active', b.dataset.view === name));
    mapPanel?.classList.toggle('active', name === 'map');
    tblPanel?.classList.toggle('active', name === 'table');

    /* Slide indicator */
    if (indicator) {
      const activeBtn = document.querySelector(`.vs-btn[data-view="${name}"]`);
      if (activeBtn) {
        const switcher = activeBtn.closest('.view-switcher');
        const sw = switcher.getBoundingClientRect();
        const bw = activeBtn.getBoundingClientRect();
        indicator.style.width  = bw.width + 'px';
        indicator.style.transform = `translateX(${bw.left - sw.left - 3}px)`;
      }
    }

    if (name === 'table') {
      this._tbl.render(this._dm.filtered());
    }
  }

  /* ─── Detail Panel ─── */
  _openDetail(iso) {
    const byISO  = this._dm.byISO(this._dm.filtered());
    const data   = byISO.get(iso);
    if (!data) return;

    this._map?.setSelected(iso);

    const dp      = document.getElementById('dp');
    const overlay = document.getElementById('dp-overlay');
    if (!dp || !overlay) return;

    /* Head */
    document.getElementById('dp-flag').textContent    = Utils.flag(iso);
    document.getElementById('dp-country').textContent = data.country || iso;
    document.getElementById('dp-region').textContent  = data.region  || '';

    /* KPIs */
    document.getElementById('dp-kpi-orgs').textContent     = Utils.formatNumber(data.orgs);
    document.getElementById('dp-kpi-eng').textContent      = Utils.formatNumber(data.engagements || 0);
    document.getElementById('dp-kpi-indirect').textContent = Utils.formatNumber(data.indirectTotal || 0);

    /* Engagement chart */
    this._buildEngChart(data);

    /* Org cards */
    this._buildOrgCards(data);

    dp.classList.add('on');
    overlay.classList.add('on');
  }

  _closeDetail() {
    document.getElementById('dp')?.classList.remove('on');
    document.getElementById('dp-overlay')?.classList.remove('on');
    this._map?.setSelected(null);
  }

  _buildEngChart(data) {
    const chart  = document.getElementById('dp-chart');
    if (!chart) return;
    const orgs   = data.orgs_list || [];
    if (!orgs.length) { chart.innerHTML = ''; return; }

    const maxEng = Math.max(...orgs.map(o => o.engagements || 0), 1);

    chart.innerHTML = `<div class="dp-chart-title">Engagements by Organization</div>` +
      orgs.slice(0, 8).map(o => {
        const pct = ((o.engagements || 0) / maxEng * 100).toFixed(1);
        const col = Utils.typeColor(o.type);
        return `<div class="dp-bar-row">
          <div class="dp-bar-lbl" title="${Utils.escapeHtml(o.name)}">${Utils.escapeHtml(Utils.truncate(o.name, 22))}</div>
          <div class="dp-bar-track">
            <div class="dp-bar-fill" style="width:0%;background:${col}" data-pct="${pct}"></div>
          </div>
          <div class="dp-bar-n">${Utils.formatNumber(o.engagements || 0)}</div>
        </div>`;
      }).join('');

    /* Animate bars */
    requestAnimationFrame(() => {
      chart.querySelectorAll('.dp-bar-fill').forEach(bar => {
        const pct = bar.dataset.pct;
        setTimeout(() => { bar.style.width = pct + '%'; }, 80);
      });
    });
  }

  _buildOrgCards(data) {
    const body = document.getElementById('dp-body');
    if (!body) return;
    const orgs = data.orgs_list || [];

    body.innerHTML = orgs.map(o => {
      const hasIndirectCount = (o.indirect_members_count || 0) > 0;
      const hasIndirectText  = !!o.indirect_members_text;
      const hasIndirectMeta  = !!o.indirect_countries || !!o.indirect_commodity;
      const indirect = (hasIndirectCount || hasIndirectText || hasIndirectMeta)
        ? `<div class="dp-indirect">
            <div class="dp-indirect-title"><span class="dp-indirect-dot"></span>Indirect Members</div>
            <div class="dp-card-grid">
              ${hasIndirectCount ? `<div class="dp-card-f">
                <div class="dp-card-fl">Count</div>
                <div class="dp-card-fv">${Utils.formatNumber(o.indirect_members_count)}</div>
              </div>` : ''}
              ${hasIndirectText ? `<div class="dp-card-f dp-card-full">
                <div class="dp-card-fl">Details</div>
                <div class="dp-card-fv wrap">${Utils.escapeHtml(o.indirect_members_text)}</div>
              </div>` : ''}
              ${o.indirect_countries ? `<div class="dp-card-f">
                <div class="dp-card-fl">Countries</div>
                <div class="dp-card-fv wrap">${Utils.escapeHtml(o.indirect_countries)}</div>
              </div>` : ''}
              ${o.indirect_commodity ? `<div class="dp-card-f dp-card-full">
                <div class="dp-card-fl">Commodity</div>
                <div class="dp-card-fv wrap">${Utils.escapeHtml(o.indirect_commodity)}</div>
              </div>` : ''}
            </div>
          </div>` : '';

      const website = o.website
        ? `<a href="${Utils.escapeHtml(o.website)}" target="_blank" rel="noopener" class="dp-card-link">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 3H3a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1V9"/><path d="M10 2h4v4M14 2L7 9"/></svg>
            Visit website
          </a>` : '';

      return `<div class="dp-card">
        <div class="dp-card-hd">
          <div class="dp-card-name">${Utils.escapeHtml(o.name)}</div>
          <span class="badge ${Utils.badgeClass(o.type)}">${Utils.escapeHtml(o.type || '')}</span>
        </div>
        <div class="dp-card-grid">
          ${o.scope ? `<div class="dp-card-f">
            <div class="dp-card-fl">Scope</div>
            <div class="dp-card-fv"><span class="badge ${Utils.badgeClass(o.scope)}">${Utils.escapeHtml(o.scope)}</span></div>
          </div>` : ''}
          ${o.commodity ? `<div class="dp-card-f">
            <div class="dp-card-fl">Commodity</div>
            <div class="dp-card-fv wrap" style="display:flex;align-items:flex-start;gap:5px">
              <span style="width:8px;height:8px;border-radius:50%;background:${Utils.commodityColor(o.commodity)};flex-shrink:0"></span>
              ${Utils.escapeHtml(o.commodity)}
            </div>
          </div>` : ''}
          ${o.value_chain ? `<div class="dp-card-f">
            <div class="dp-card-fl">Value Chain</div>
            <div class="dp-card-fv"><span class="badge ${Utils.badgeClass(o.value_chain)}">${Utils.escapeHtml(o.value_chain)}</span></div>
          </div>` : ''}
          ${o.structure ? `<div class="dp-card-f">
            <div class="dp-card-fl">Structure</div>
            <div class="dp-card-fv"><span class="badge ${Utils.badgeClass(o.structure)}">${Utils.escapeHtml(o.structure)}</span></div>
          </div>` : ''}
          ${o.engagements != null ? `<div class="dp-card-f">
            <div class="dp-card-fl">Engagements</div>
            <div class="dp-card-fv" style="font-weight:700;color:var(--t0)">${Utils.formatNumber(o.engagements)}</div>
          </div>` : ''}
          ${o.activity_locations ? `<div class="dp-card-f dp-card-full">
            <div class="dp-card-fl">Activity Countries</div>
            <div class="dp-card-fv wrap">${Utils.escapeHtml(o.activity_locations)}</div>
          </div>` : ''}
        </div>
        ${indirect}
        ${website}
      </div>`;
    }).join('') || '<p style="color:var(--t3);text-align:center;padding:20px 0">No organization data available</p>';
  }

  /* ─── Export ─── */
  _exportCSV() {
    const filtered = this._dm.filtered();
    const rows = filtered.map(r => ({
      Organization:             r.Organization       || '',
      Country:                  r.Country            || '',
      ISO_Alpha3:               r.ISO_Alpha3         || '',
      Region:                   r.Region             || '',
      Scope:                    r.Scope              || '',
      Value_Chain:              r.Value_Chain        || '',
      Commodity:                r.Commodity          || '',
      Engagements:              r.Engagements        || '',
      Member_Type:              r.Member_Type        || '',
      Activity_Locations:       r.Activity_Locations || '',
      Membership_Structure:     r.Membership_Structure || '',
      Indirect_Members:         r.Indirect_Members   || '',
      Indirect_Member_Countries:r.Indirect_Member_Countries || '',
      Indirect_Member_Commodity:r.Indirect_Member_Commodity || '',
      Presence_Type:            r.Presence_Type      || '',
      Website:                  r.Website            || '',
    }));
    const orgs = new Set(rows.map(r => r.Organization)).size;
    Utils.downloadCSV(rows, `membermap-${orgs}-orgs.csv`);
  }

  /* ─── Search ─── */
  _doSearch(q) {
    this._dm.setSearch(q);
    this._syncChips();
    this._refresh();
  }

  /* ─── Sidebar toggle ─── */
  _toggleSidebar() {
    this._sbOpen = !this._sbOpen;
    const layout = document.querySelector('.layout');
    layout?.classList.toggle('sb-closed', !this._sbOpen);
    localStorage.setItem('mm_sb', this._sbOpen ? 'open' : 'closed');
    setTimeout(() => this._map?._onResize(), 380);
  }

  _closeSidebar() {
    this._sbOpen = false;
    document.querySelector('.layout')?.classList.add('sb-closed');
    localStorage.setItem('mm_sb', 'closed');
  }

  /* ─── Event binding ─── */
  _bindEvents() {
    /* Search */
    const input = document.getElementById('sb-search');
    if (input) {
      input.addEventListener('input', Utils.debounce(e => this._doSearch(e.target.value), 250));
    }

    /* View switcher */
    document.querySelectorAll('.vs-btn').forEach(btn => {
      btn.addEventListener('click', () => this._switchView(btn.dataset.view));
    });

    /* Initialise indicator position */
    requestAnimationFrame(() => this._switchView(this._view, false));

    /* Sidebar toggle (header) */
    document.getElementById('sb-toggle')?.addEventListener('click', () => this._toggleSidebar());

    /* Export */
    document.getElementById('export-btn')?.addEventListener('click', () => this._exportCSV());

    /* Detail close */
    document.getElementById('dp-close')?.addEventListener('click', () => this._closeDetail());
    document.getElementById('dp-overlay')?.addEventListener('click', () => this._closeDetail());

    /* Map SVG click-to-deselect */
    document.getElementById('map-container')?.addEventListener('click', e => {
      if (e.target.tagName === 'rect' || e.target.tagName === 'svg' || e.target.classList.contains('graticule')) {
        this._closeDetail();
      }
    });

    /* Arc toggle */
    document.getElementById('arc-btn')?.addEventListener('click', btn => {
      const el = document.getElementById('arc-btn');
      el?.classList.toggle('arc-on');
      this._map?.setArcs(el?.classList.contains('arc-on'));
    });

    /* Zoom controls */
    document.getElementById('zoom-in')?.addEventListener('click', () => {
      document.querySelector('#map-container svg') &&
        d3.select('#map-container svg').transition().call(this._map._zoom.scaleBy, 1.4);
    });
    document.getElementById('zoom-out')?.addEventListener('click', () => {
      document.querySelector('#map-container svg') &&
        d3.select('#map-container svg').transition().call(this._map._zoom.scaleBy, 0.7);
    });
    document.getElementById('zoom-reset')?.addEventListener('click', () => {
      document.querySelector('#map-container svg') &&
        d3.select('#map-container svg').transition().call(this._map._zoom.transform, d3.zoomIdentity);
    });

    /* Theme toggle */
    document.getElementById('theme-toggle')?.addEventListener('click', () => this._toggleTheme());

    /* Upload modal — open via data-badge or upload-btn */
    document.getElementById('data-badge')?.addEventListener('click', () => this._openUploadModal());
    document.getElementById('upload-btn')?.addEventListener('click', () => this._openUploadModal());

    /* Upload modal — close */
    document.getElementById('modal-close')?.addEventListener('click', () => this._closeUploadModal());
    document.getElementById('upload-modal')?.addEventListener('click', e => {
      if (e.target.id === 'upload-modal') this._closeUploadModal();
    });

    /* Drop zone — click-to-browse */
    const dropZone  = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    if (dropZone && fileInput) {
      dropZone.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', e => {
        if (e.target.files[0]) this._handleExcelFile(e.target.files[0]);
      });

      dropZone.addEventListener('dragover', e => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
      });
      dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
      dropZone.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files[0]) this._handleExcelFile(e.dataTransfer.files[0]);
      });
    }

    /* Global drag-over highlight on the modal when a file is dragged over the page */
    document.addEventListener('dragover', e => e.preventDefault());
    document.addEventListener('drop', e => {
      e.preventDefault();
      const file = e.dataTransfer?.files[0];
      if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv'))) {
        this._openUploadModal();
        setTimeout(() => this._handleExcelFile(file), 300);
      }
    });

    /* Keyboard shortcuts */
    document.addEventListener('keydown', e => {
      /* Escape → close detail */
      if (e.key === 'Escape') this._closeDetail();

      /* ⌘K / Ctrl+K → focus search */
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        const inp = document.getElementById('sb-search');
        if (!this._sbOpen) this._toggleSidebar();
        setTimeout(() => inp?.focus(), 380);
      }

      /* ⌘E / Ctrl+E → export */
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
        e.preventDefault();
        this._exportCSV();
      }

      /* ⌘D / Ctrl+D → toggle dark mode */
      if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
        e.preventDefault();
        this._toggleTheme();
      }

      /* Escape also closes upload modal */
      if (e.key === 'Escape') this._closeUploadModal();

      /* M → map view, T → table view */
      if (!e.metaKey && !e.ctrlKey && !e.altKey && document.activeElement.tagName !== 'INPUT') {
        if (e.key === 'm' || e.key === 'M') this._switchView('map');
        if (e.key === 't' || e.key === 'T') this._switchView('table');
      }
    });
  }

  /* ─────────────────────────────── THEME ─────────────────────────────── */

  _initTheme() {
    document.documentElement.setAttribute('data-theme', this._theme);
    this._applyThemeToggleIcon();
  }

  _toggleTheme() {
    this._theme = this._theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('mm_theme', this._theme);
    document.documentElement.setAttribute('data-theme', this._theme);
    this._applyThemeToggleIcon();
    this._showToast(this._theme === 'dark' ? '🌙 Dark mode on' : '☀️ Light mode on', 'info', 2000);
    /* Update map SVG gradients + data fills for new theme */
    setTimeout(() => this._map?.updateTheme(), 50);
  }

  _applyThemeToggleIcon() {
    const btn  = document.getElementById('theme-toggle');
    if (!btn) return;
    const moon = btn.querySelector('.icon-moon');
    const sun  = btn.querySelector('.icon-sun');
    if (this._theme === 'dark') {
      if (moon) moon.style.display = 'none';
      if (sun)  sun.style.display  = 'block';
      btn.title = 'Switch to light mode (⌘D)';
    } else {
      if (moon) moon.style.display = 'block';
      if (sun)  sun.style.display  = 'none';
      btn.title = 'Switch to dark mode (⌘D)';
    }
  }

  /* ──────────────────────────── UPLOAD MODAL ──────────────────────────── */

  _initUpload() {
    // Nothing extra — bindings are in _bindEvents()
  }

  _openUploadModal() {
    const m = document.getElementById('upload-modal');
    if (!m) return;
    m.classList.add('open');
    // Reset status
    const st = document.getElementById('upload-status');
    if (st) { st.style.display = 'none'; st.className = 'upload-status'; st.innerHTML = ''; }
    // Reset drop zone
    const dz = document.getElementById('drop-zone');
    if (dz) dz.classList.remove('drag-over');
    // Reset file input
    const fi = document.getElementById('file-input');
    if (fi) fi.value = '';
  }

  _closeUploadModal() {
    const m = document.getElementById('upload-modal');
    if (m) m.classList.remove('open');
  }

  async _handleExcelFile(file) {
    const st = document.getElementById('upload-status');
    const dz = document.getElementById('drop-zone');

    // Show processing state
    if (st) {
      st.style.display = 'flex';
      st.className = 'upload-status processing';
      st.innerHTML = `
        <div class="upload-spinner"></div>
        <div>
          <div style="font-weight:600">Processing <em>${file.name}</em>…</div>
          <div style="font-size:.75rem;opacity:.7;margin-top:2px">Parsing rows and resolving countries</div>
        </div>`;
    }
    if (dz) dz.style.opacity = '0.4';

    try {
      const rows = await ExcelParser.parse(file);
      const orgCount = new Set(rows.map(r => r.Organization)).size;
      const rowCount = rows.length;

      // Swap data into DataManager
      this._dm.loadFromData(rows);

      // Rebuild UI
      this._buildKPIs();
      this._buildFilters();
      this._refresh();
      this._updateDataBadge(orgCount, file.name);

      // Redraw map and table completely
      if (this._map?._world) {
        this._map._buildCentroids();
        this._map._drawCountries();
        this._map.update(this._dm.filtered());
      }
      if (this._view === 'table') {
        this._tbl.render(this._dm.filtered());
      }

      // Show success
      if (st) {
        st.className = 'upload-status success';
        st.innerHTML = `
          <span style="font-size:1.1rem">✅</span>
          <div>
            <div style="font-weight:600">${orgCount} organizations · ${rowCount} rows loaded</div>
            <div style="font-size:.75rem;opacity:.7;margin-top:2px">Dashboard updated from <em>${file.name}</em></div>
          </div>`;
      }
      this._showToast(`✅ Loaded ${orgCount} orgs from ${file.name}`, 'success');

      // Auto-close modal after a moment
      setTimeout(() => this._closeUploadModal(), 2200);

    } catch (err) {
      console.error('Excel parse error:', err);
      if (st) {
        st.className = 'upload-status error';
        st.innerHTML = `
          <span style="font-size:1.1rem">❌</span>
          <div>
            <div style="font-weight:600">Failed to parse file</div>
            <div style="font-size:.75rem;opacity:.7;margin-top:2px">${err.message}</div>
          </div>`;
      }
      this._showToast(`❌ ${err.message}`, 'error', 6000);
    } finally {
      if (dz) dz.style.opacity = '';
    }
  }

  /* ──────────────────────────── DATA BADGE ────────────────────────────── */

  _updateDataBadge(orgCount, sourceName = '') {
    const label = document.getElementById('data-badge-label');
    if (!label) return;
    const name = sourceName
      ? sourceName.replace(/\.(xlsx?|csv)$/i, '')
      : 'data';
    label.textContent = `${orgCount} orgs · ${name}`;
  }

  /* ───────────────────────────── TOAST ───────────────────────────────── */

  _showToast(msg, type = 'info', duration = 4000) {
    const stack = document.getElementById('toast-stack');
    if (!stack) return;

    const t = document.createElement('div');
    t.className = `toast toast-${type} ${type}`;
    t.textContent = msg;

    // Close on click
    t.addEventListener('click', () => {
      t.classList.add('removing');
      t.addEventListener('animationend', () => t.remove(), { once: true });
    });

    stack.appendChild(t);

    setTimeout(() => {
      t.classList.add('removing');
      t.addEventListener('animationend', () => t.remove(), { once: true });
    }, duration);
  }

}

/* Boot */
document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.bootstrap().catch(err => {
    console.error('Failed to bootstrap app:', err);
    const ls = document.getElementById('loading-screen');
    if (ls) ls.innerHTML = `<div style="text-align:center;color:#64748b;padding:40px">
      <p style="font-size:1.2rem;font-weight:700;margin-bottom:8px">Failed to load data</p>
      <p style="font-size:.85rem">${err.message}</p>
      <p style="font-size:.8rem;margin-top:12px;opacity:.6">Make sure the server is running: <code>python3 -m http.server 8080</code></p>
    </div>`;
  });
});

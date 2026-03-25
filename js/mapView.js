/* js/mapView.js — Interactive D3 world map */
'use strict';

class MapView {
  constructor(container, dm) {
    this._container  = container;
    this._dm         = dm;
    this._svg        = null;
    this._g          = null;       // countries group
    this._arcsG      = null;
    this._bubblesG   = null;
    this._labelsG    = null;
    this._projection = null;
    this._path       = null;
    this._zoom       = null;
    this._world      = null;
    this._onClickCb  = null;
    this._selectedISO = null;
    this._arcsOn     = false;
    this._tooltip    = null;
    this._byISOCache = null;
    this._k          = 1;   // current zoom scale
  }

  /* ── Initialise SVG ── */
  init() {
    const w = this._container.clientWidth  || 900;
    const h = this._container.clientHeight || 500;

    this._projection = d3.geoNaturalEarth1()
      .scale(Math.min(w / 5.4, h / 3.0))
      .translate([w / 2, h / 2]);
    this._path = d3.geoPath(this._projection);

    this._svg = d3.select(this._container).append('svg')
      .attr('width', '100%').attr('height', '100%')
      .style('display', 'block');

    /* Ocean */
    this._svg.append('rect')
      .attr('width', '100%').attr('height', '100%')
      .attr('fill', '#dde8f4');

    /* Main map group (everything that zooms/pans together) */
    this._mapG = this._svg.append('g').attr('class', 'map-g');

    /* Sphere */
    this._mapG.append('path')
      .datum({ type: 'Sphere' })
      .attr('d', this._path)
      .attr('fill', '#dde8f4')
      .attr('stroke', '#b0bfd0').attr('stroke-width', 0.5)
      .attr('class', 'sphere-outline');

    /* Graticule */
    this._mapG.append('path')
      .datum(d3.geoGraticule()())
      .attr('d', this._path)
      .attr('class', 'graticule');

    /* Layer groups (order matters for stacking) */
    this._g        = this._mapG.append('g').attr('class', 'countries-g');
    this._arcsG    = this._mapG.append('g').attr('class', 'arcs-g');
    this._bubblesG = this._mapG.append('g').attr('class', 'bubbles-g');
    this._labelsG  = this._mapG.append('g').attr('class', 'labels-g');

    /* Zoom — works on all devices. On mobile, touch-action:none on SVG
       means the browser won't try to scroll, and D3 handles pan/zoom. */
    this._zoom = d3.zoom()
      .scaleExtent([0.6, 8])
      .on('zoom', e => {
        const t = e.transform;
        this._k = t.k;
        this._mapG.attr('transform', t);
        this._rescaleBubbles(t.k);
      });
    this._svg.call(this._zoom);

    /* Tooltip */
    this._tooltip = document.createElement('div');
    this._tooltip.className = 'tooltip';
    document.body.appendChild(this._tooltip);

    window.addEventListener('resize', () => this._onResize());
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this._onResize(), 100);
    });
  }

  onCountryClick(cb) { this._onClickCb = cb; }

  /* ── Load world topology ── */
  async loadWorld() {
    const resp  = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json');
    this._world = await resp.json();
    this._buildCentroids();
    /* Recalculate projection using real container dimensions (init() may have
       run before layout was painted, falling back to 900×500 defaults) */
    const w = this._container.clientWidth  || 900;
    const h = this._container.clientHeight || 500;
    this._projection.scale(Math.min(w / 5.4, h / 3.0)).translate([w / 2, h / 2]);
    this._path = d3.geoPath(this._projection);
    /* Reset zoom to identity — fully zoomed out on every device */
    this._svg.transition().duration(0).call(this._zoom.transform, d3.zoomIdentity);
    this._drawCountries();
    this.update(this._dm.filtered());
  }

  /* ── Build centroid lookup ── */
  _buildCentroids() {
    this._centroids = new Map();
    if (!this._world) return;
    topojson.feature(this._world, this._world.objects.countries)
      .features.forEach(f => {
        const c = MapView._mainCentroid(f, this._path);
        if (c && !isNaN(c[0])) this._centroids.set(+f.id, c);
      });
  }

  /* ── Draw country fills + bind events once ── */
  _drawCountries() {
    if (!this._world) return;
    const countries = topojson.feature(this._world, this._world.objects.countries);
    const borders   = topojson.mesh(this._world, this._world.objects.countries, (a, b) => a !== b);

    this._g.selectAll('*').remove();

    this._g.selectAll('.country-path')
      .data(countries.features)
      .join('path')
      .attr('class', 'country-path')
      .attr('d', this._path)
      .attr('fill', '#e2e8f0')
      .attr('data-numeric', d => d.id)
      .on('mousemove', (event, d) => {
        const iso  = MapView._numericToISO(d.id);
        const info = iso && this._byISOCache ? this._byISOCache.get(iso) : null;
        if (info) this._showTooltip(event, iso, info);
      })
      .on('mouseleave', () => this._hideTooltip())
      .on('click', (event, d) => {
        const iso  = MapView._numericToISO(d.id);
        const info = iso && this._byISOCache ? this._byISOCache.get(iso) : null;
        if (info && this._onClickCb) this._onClickCb(iso);
      });

    this._g.append('path')
      .datum(borders)
      .attr('fill', 'none')
      .attr('stroke', '#c8d4e0')
      .attr('stroke-width', 0.4);
  }

  /* ── Full update on filter change ── */
  update(filtered) {
    if (!this._world) return;
    this._byISOCache = this._dm.byISO(filtered);
    this._updateColors(this._byISOCache);
    this._updateBubbles(this._byISOCache);
    if (this._arcsOn) this._drawArcs(this._byISOCache);
  }

  /* ── Color all countries (two-tier: HQ=orange, Activity=sky-blue) ── */
  _updateColors(byISO) {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    const C_HQ       = '#E8701A';
    const C_ACTIVITY = dark ? '#D97706' : '#FBBF24';
    const C_NONE     = dark ? '#1a2235' : '#e2e8f0';

    this._g.selectAll('.country-path')
      .attr('fill', d => {
        const iso  = MapView._numericToISO(d.id);
        const info = iso ? byISO.get(iso) : null;
        if (!info) return C_NONE;
        return info.hasHQ ? C_HQ : C_ACTIVITY;
      })
      .classed('has-data', d => {
        const iso = MapView._numericToISO(d.id);
        return iso ? byISO.has(iso) : false;
      });
  }

  /* ── Draw bubbles (HQ) and dots (Activity) ── */
  _updateBubbles(byISO) {
    this._bubblesG.selectAll('*').remove();
    this._labelsG.selectAll('*').remove();
    if (!this._world) return;

    const features = topojson.feature(this._world, this._world.objects.countries).features;
    const isoFeat  = new Map();
    features.forEach(f => {
      const iso = MapView._numericToISO(f.id);
      if (iso) isoFeat.set(iso, f);
    });

    const entries = [];
    byISO.forEach((info, iso) => {
      const feat = isoFeat.get(iso);
      if (!feat) return;
      const c = MapView._mainCentroid(feat, this._path);
      if (!c || isNaN(c[0])) return;
      entries.push({ iso, info, c });
    });

    const maxOrgs = Math.max(...entries.map(e => e.info.orgs), 1);

    entries.forEach(({ iso, info, c }) => {
      if (info.hasHQ) {
        /* Glow ring */
        const r = Math.max(7, Math.min(22, 7 + (info.orgs / maxOrgs) * 15));
        this._bubblesG.append('circle')
          .attr('class', 'bubble-glow')
          .attr('cx', c[0]).attr('cy', c[1])
          .attr('r', r + 6)
          .attr('data-r', r + 6)
          .attr('fill', 'rgba(232,112,26,0.15)')
          .attr('stroke', 'none')
          .attr('pointer-events', 'none');

        /* Main bubble */
        this._bubblesG.append('circle')
          .attr('class', 'country-bubble')
          .attr('cx', c[0]).attr('cy', c[1])
          .attr('r', r)
          .attr('data-r', r)
          .attr('data-sw', 1.5)
          .attr('fill', '#E8701A')
          .attr('stroke', '#fff').attr('stroke-width', 1.5)
          .attr('opacity', 0.92)
          .on('mousemove', ev => this._showTooltip(ev, iso, info))
          .on('mouseleave', ()  => this._hideTooltip())
          .on('click', ()       => { if (this._onClickCb) this._onClickCb(iso); });

        /* Count label */
        this._labelsG.append('text')
          .attr('class', 'country-label')
          .attr('x', c[0]).attr('y', c[1])
          .style('font-size', '9px')
          .attr('pointer-events', 'none')
          .text(info.orgs);

      } else if (info.hasActivity) {
        /* Small activity dot */
        this._bubblesG.append('circle')
          .attr('class', 'country-bubble')
          .attr('cx', c[0]).attr('cy', c[1])
          .attr('r', 4)
          .attr('data-r', 4)
          .attr('data-sw', 1)
          .attr('fill', '#FBBF24')
          .attr('stroke', '#fff').attr('stroke-width', 1)
          .attr('opacity', 0.85)
          .on('mousemove', ev => this._showTooltip(ev, iso, info))
          .on('mouseleave', ()  => this._hideTooltip())
          .on('click', ()       => { if (this._onClickCb) this._onClickCb(iso); });
      }
    });

    // Apply current zoom scale so re-renders after a pan/zoom stay consistent
    this._rescaleBubbles(this._k);
  }

  /* ── Scale bubbles / labels inversely with zoom so they stay constant on screen ── */
  _rescaleBubbles(k) {
    // HQ glow ring
    this._bubblesG.selectAll('circle.bubble-glow').each(function() {
      const el = d3.select(this);
      el.attr('r', +el.attr('data-r') / k);
    });
    // All circles (HQ bubbles + activity dots)
    this._bubblesG.selectAll('circle.country-bubble').each(function() {
      const el = d3.select(this);
      el.attr('r',            +el.attr('data-r')  / k)
        .attr('stroke-width', +el.attr('data-sw') / k);
    });
    // Count labels
    this._labelsG.selectAll('text.country-label')
      .style('font-size', (9 / k) + 'px')
      .attr('stroke-width', 2.5 / k);
  }

  /* ── Draw arcs between HQ countries ── */
  _drawArcs(byISO) {
    this._arcsG.selectAll('*').remove();
    if (!this._arcsOn || !this._world) return;

    const features = topojson.feature(this._world, this._world.objects.countries).features;
    const isoFeat  = new Map();
    features.forEach(f => {
      const iso = MapView._numericToISO(f.id);
      if (iso) isoFeat.set(iso, f);
    });

    const hqPoints = [];
    byISO.forEach((info, iso) => {
      if (!info.hasHQ) return;
      const feat = isoFeat.get(iso);
      if (!feat) return;
      const c = MapView._mainCentroid(feat, this._path);
      if (c && !isNaN(c[0])) hqPoints.push(c);
    });

    const MAX = 30;
    let n = 0;
    for (let i = 0; i < hqPoints.length && n < MAX; i++) {
      for (let j = i + 1; j < hqPoints.length && n < MAX; j++) {
        const [x1, y1] = hqPoints[i], [x2, y2] = hqPoints[j];
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - Math.abs(x2 - x1) * 0.15;
        this._arcsG.append('path')
          .attr('class', 'arc-path')
          .attr('d', `M${x1},${y1} Q${mx},${my} ${x2},${y2}`)
          .attr('fill', 'none')
          .attr('stroke', 'rgba(220,38,38,0.22)')
          .attr('stroke-width', 0.9)
          .attr('stroke-dasharray', '3,3');
        n++;
      }
    }
  }

  /* ── Public setters ── */
  setArcs(on) {
    this._arcsOn = on;
    if (this._byISOCache) {
      if (on) this._drawArcs(this._byISOCache);
      else this._arcsG.selectAll('*').remove();
    }
  }

  setSelected(iso) {
    this._selectedISO = iso;
    this._g.selectAll('.country-path')
      .classed('selected', d => MapView._numericToISO(d.id) === iso);
  }

  updateTheme() {
    if (this._byISOCache) this._updateColors(this._byISOCache);
  }

  _onResize() {
    const w = this._container.clientWidth;
    const h = this._container.clientHeight;
    if (!w || !h || !this._projection) return;
    this._projection.scale(Math.min(w / 5.4, h / 3.0)).translate([w / 2, h / 2]);
    this._path = d3.geoPath(this._projection);
    if (this._world) {
      this._buildCentroids();
      this._drawCountries();
      if (this._byISOCache) {
        this._updateColors(this._byISOCache);
        this._updateBubbles(this._byISOCache);
      }
    }
  }

  /* ── Tooltip ── */
  _showTooltip(event, iso, info) {
    const orgs  = info.orgs_list || [];
    const shown = orgs.slice(0, 4);
    const more  = orgs.length - 4;
    const badge = info.hasHQ
      ? `<span style="background:#fff7ed;color:#c2410c;padding:1px 7px;border-radius:999px;font-size:.62rem;font-weight:700">HQ</span>`
      : `<span style="background:#f0f9ff;color:#0369a1;padding:1px 7px;border-radius:999px;font-size:.62rem;font-weight:700">Activity</span>`;

    this._tooltip.innerHTML = `
      <div class="tt-head">
        <div class="tt-country-row">
          <span class="tt-flag">${Utils.flag(iso)}</span>
          ${Utils.escapeHtml(info.country)}
          ${badge}
        </div>
        <div class="tt-meta">
          ${info.region ? `<span>${Utils.escapeHtml(info.region)}</span><span class="tt-meta-sep"></span>` : ''}
          <span>${info.orgs} org${info.orgs !== 1 ? 's' : ''}</span>
        </div>
      </div>
      ${info.commodities?.length ? `
        <div class="tt-commodities">
          ${[...info.commodities].slice(0, 4).map(c =>
            `<span class="tt-comm">
              <span class="tt-comm-dot" style="background:${Utils.commodityColor(c)}"></span>
              ${Utils.escapeHtml(c)}
            </span>`).join('')}
        </div>` : ''}
      <div class="tt-list">
        ${shown.map(o => `
          <div class="tt-item">
            <span class="tt-dot" style="background:${Utils.typeColor(o.type)}"></span>
            <span class="tt-name">${Utils.escapeHtml(o.name)}</span>
            <span class="tt-type">${Utils.escapeHtml(o.presence_type || o.type || '')}</span>
          </div>`).join('')}
        ${more > 0 ? `<div class="tt-more">+${more} more…</div>` : ''}
      </div>`;

    this._tooltip.classList.add('visible');
    this._positionTooltip(event);
  }

  _positionTooltip(event) {
    const tt = this._tooltip, m = 14;
    let x = event.clientX + m, y = event.clientY + m;
    if (x + 300 > window.innerWidth)  x = event.clientX - 300 - m;
    if (y + 220 > window.innerHeight) y = event.clientY - tt.offsetHeight - m;
    tt.style.left = x + 'px';
    tt.style.top  = y + 'px';
  }

  _hideTooltip() { this._tooltip.classList.remove('visible'); }
}

/* ── ISO 3166-1 numeric → alpha-3 lookup ──
   World-atlas uses the same numeric codes as ISO 3166-1 numeric */
MapView._numericToISO = (function() {
  const MAP = {
    4:'AFG',8:'ALB',12:'DZA',20:'AND',24:'AGO',28:'ATG',32:'ARG',36:'AUS',
    40:'AUT',44:'BHS',48:'BHR',50:'BGD',51:'ARM',52:'BRB',56:'BEL',64:'BTN',
    68:'BOL',70:'BIH',72:'BWA',76:'BRA',84:'BLZ',90:'SLB',96:'BRN',100:'BGR',
    104:'MMR',108:'BDI',112:'BLR',116:'KHM',120:'CMR',124:'CAN',132:'CPV',
    140:'CAF',144:'LKA',148:'TCD',152:'CHL',156:'CHN',170:'COL',174:'COM',
    178:'COG',180:'COD',188:'CRI',191:'HRV',192:'CUB',196:'CYP',203:'CZE',
    204:'BEN',208:'DNK',212:'DMA',214:'DOM',218:'ECU',222:'SLV',226:'GNQ',
    231:'ETH',232:'ERI',233:'EST',242:'FJI',246:'FIN',250:'FRA',262:'DJI',
    266:'GAB',268:'GEO',270:'GMB',276:'DEU',288:'GHA',296:'KIR',300:'GRC',
    308:'GRD',320:'GTM',324:'GIN',328:'GUY',332:'HTI',340:'HND',344:'HKG',
    348:'HUN',352:'ISL',356:'IND',360:'IDN',364:'IRN',368:'IRQ',372:'IRL',
    376:'ISR',380:'ITA',388:'JAM',392:'JPN',398:'KAZ',400:'JOR',404:'KEN',
    408:'PRK',410:'KOR',414:'KWT',417:'KGZ',418:'LAO',422:'LBN',426:'LSO',
    428:'LVA',430:'LBR',434:'LBY',438:'LIE',440:'LTU',442:'LUX',446:'MAC',
    450:'MDG',454:'MWI',458:'MYS',462:'MDV',466:'MLI',470:'MLT',478:'MRT',
    480:'MUS',484:'MEX',492:'MCO',496:'MNG',498:'MDA',499:'MNE',504:'MAR',
    508:'MOZ',512:'OMN',516:'NAM',520:'NRU',524:'NPL',528:'NLD',540:'NCL',
    548:'VUT',554:'NZL',558:'NIC',562:'NER',566:'NGA',578:'NOR',583:'FSM',
    584:'MHL',586:'PAK',591:'PAN',598:'PNG',600:'PRY',604:'PER',608:'PHL',
    616:'POL',620:'PRT',624:'GNB',626:'TLS',634:'QAT',642:'ROU',643:'RUS',
    646:'RWA',659:'KNA',662:'LCA',670:'VCT',674:'SMR',678:'STP',682:'SAU',
    686:'SEN',688:'SRB',694:'SLE',702:'SGP',703:'SVK',704:'VNM',705:'SVN',
    706:'SOM',710:'ZAF',716:'ZWE',724:'ESP',728:'SSD',729:'SDN',740:'SUR',
    748:'SWZ',752:'SWE',756:'CHE',760:'SYR',762:'TJK',764:'THA',768:'TGO',
    776:'TON',780:'TTO',784:'ARE',788:'TUN',792:'TUR',795:'TKM',798:'TUV',
    800:'UGA',804:'UKR',807:'MKD',818:'EGY',826:'GBR',834:'TZA',840:'USA',
    858:'URY',860:'UZB',862:'VEN',882:'WSM',887:'YEM',894:'ZMB',31:'AZE',
    854:'BFA',630:'PRI',
  };
  return id => MAP[+id] || null;
})();

/* ── Use the largest polygon's centroid to avoid bubbles being pulled
   off-continent by overseas territories (e.g. France, USA, Russia) ── */
MapView._mainCentroid = function(feat, path) {
  const g = feat && (feat.geometry || feat);
  if (!g) return [NaN, NaN];
  if (g.type !== 'MultiPolygon' || !g.coordinates || g.coordinates.length === 0) {
    return path.centroid(feat);
  }
  // Use path.area() (projected screen area) to pick the largest polygon,
  // avoiding overseas territories pulling the centroid off-continent
  let maxArea = -1, bestPoly = null;
  g.coordinates.forEach(polyCoords => {
    const poly = { type: 'Polygon', coordinates: polyCoords };
    const area = Math.abs(path.area(poly));
    if (area > maxArea) { maxArea = area; bestPoly = poly; }
  });
  if (!bestPoly) return path.centroid(feat);
  return path.centroid(bestPoly);
};

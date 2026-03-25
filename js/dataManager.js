/* js/dataManager.js — Data loading, filtering, aggregation */
'use strict';

class DataManager {
  constructor() {
    this._rows = [];
    this._filter = {
      regions:       new Set(),
      scopes:        new Set(),
      commodities:   new Set(),
      types:         new Set(),
      valueChains:   new Set(),
      organizations: new Set(),
      search: '',
    };
  }

  /* ── Load CSV from server ── */
  async load(csvPath) {
    const resp = await fetch(csvPath + '?nocache=' + Date.now());
    if (!resp.ok) throw new Error(`Failed to load ${csvPath} (${resp.status})`);
    const text = await resp.text();
    this._rows = this._parseCSV(text);
    if (!this._rows.length) throw new Error('CSV is empty or malformed.');
  }

  /* ── Replace rows from Excel upload ── */
  loadFromData(rows) {
    this._rows = rows;
    this._filter = {
      regions:       new Set(),
      scopes:        new Set(),
      commodities:   new Set(),
      types:         new Set(),
      valueChains:   new Set(),
      organizations: new Set(),
      search: '',
    };
  }

  /* ── All raw rows ── */
  all() { return this._rows; }

  /* ── Filtered rows (applies all active filters + search) ── */
  filtered() {
    const f = this._filter;
    const q = f.search.toLowerCase().trim();
    return this._rows.filter(r => {
      if (f.regions.size       && !f.regions.has(r.Region))            return false;
      if (f.scopes.size        && !f.scopes.has(r.Scope))              return false;
      if (f.commodities.size   && !f.commodities.has(r.Commodity))     return false;
      if (f.types.size         && !f.types.has(r.Member_Type))         return false;
      if (f.valueChains.size   && !f.valueChains.has(r.Value_Chain))   return false;
      if (f.organizations.size && !f.organizations.has(r.Organization)) return false;
      if (q) {
        const hay = [r.Organization, r.Country, r.Region, r.Commodity,
                     r.Value_Chain, r.Member_Type, r.Scope]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  /* ── Build ISO → aggregated country data from given rows ──
     Includes ALL rows (HQ + Activity) so the map shows full footprint. */
  byISO(rows) {
    const map = new Map();

    rows.forEach(r => {
      const iso = (r.ISO_Alpha3 || '').trim();
      if (!iso) return;

      if (!map.has(iso)) {
        map.set(iso, {
          country:      r.Country || iso,
          region:       r.Region  || '',
          orgs:         0,
          engagements:  0,
          topCommodity: null,
          commodities:  new Set(),
          orgs_list:    [],
          indirectTotal:0,
          hasHQ:        false,
          hasActivity:  false,
          _orgSeen:     new Set(),
        });
      }

      const d = map.get(iso);

      /* Accumulate engagement & commodity data for every row */
      d.engagements  += parseFloat(r.Engagements) || 0;
      d.indirectTotal += parseFloat(r.Indirect_Members_Count) || 0;
      if (r.Commodity) d.commodities.add(r.Commodity);
      if (r.Presence_Type === 'HQ')       d.hasHQ       = true;
      if (r.Presence_Type === 'Activity') d.hasActivity = true;

      /* Add org to orgs_list only once per ISO */
      if (!d._orgSeen.has(r.Organization)) {
        d._orgSeen.add(r.Organization);
        d.orgs++;
        d.orgs_list.push({
          name:                   r.Organization || '',
          type:                   r.Member_Type  || '',
          scope:                  r.Scope        || '',
          commodity:              r.Commodity    || '',
          value_chain:            r.Value_Chain  || '',
          structure:              r.Membership_Structure || '',
          engagements:            parseFloat(r.Engagements) || 0,
          activity_locations:     r.Activity_Locations || '',
          indirect_members_count: parseFloat(r.Indirect_Members_Count) || 0,
          indirect_members_text:  r.Indirect_Members || '',
          indirect_countries:     r.Indirect_Member_Countries || '',
          indirect_commodity:     r.Indirect_Member_Commodity || '',
          website:                r.Website || '',
          presence_type:          r.Presence_Type || '',
        });
      }
    });

    /* Finalise each entry */
    map.forEach(d => {
      d.topCommodity = d.orgs_list[0]?.commodity || null;
      d.commodities  = [...d.commodities];
      delete d._orgSeen;
    });

    return map;
  }

  /* ── Toggle a filter value on/off; returns true if changed ── */
  toggleFilter(key, value) {
    const setMap = {
      region:       this._filter.regions,
      scope:        this._filter.scopes,
      commodity:    this._filter.commodities,
      type:         this._filter.types,
      valueChain:   this._filter.valueChains,
      organization: this._filter.organizations,
    };
    const s = setMap[key];
    if (!s) return false;
    s.has(value) ? s.delete(value) : s.add(value);
    return true;
  }

  setSearch(q) { this._filter.search = q || ''; }

  clearFilters() {
    Object.values(this._filter).forEach(v => { if (v instanceof Set) v.clear(); });
    this._filter.search = '';
  }

  activeFilters() {
    const out = [];
    const add = (key, set) => set.forEach(v => out.push({ key, value: v }));
    add('region',       this._filter.regions);
    add('scope',        this._filter.scopes);
    add('commodity',    this._filter.commodities);
    add('type',         this._filter.types);
    add('valueChain',   this._filter.valueChains);
    add('organization', this._filter.organizations);
    if (this._filter.search) out.push({ key: 'search', value: this._filter.search });
    return out;
  }

  hasActiveFilters() { return this.activeFilters().length > 0; }

  /* ── CSV parser ── */
  _parseCSV(text) {
    const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
    if (!lines.length) return [];
    const headers = this._splitLine(lines[0]);
    return lines.slice(1)
      .map(line => {
        const vals = this._splitLine(line);
        const obj  = {};
        headers.forEach((h, i) => { obj[h.trim()] = (vals[i] || '').trim(); });
        return obj;
      })
      .filter(r => r.Organization);
  }

  _splitLine(line) {
    const result = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (c === ',' && !inQ) {
        result.push(cur); cur = '';
      } else {
        cur += c;
      }
    }
    result.push(cur);
    return result;
  }
}

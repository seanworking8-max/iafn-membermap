/* js/tableView.js — Sortable data table */
'use strict';

class TableView {
  constructor(container, dm) {
    this._container = container;
    this._dm        = dm;
    this._onClickCb = null;
    this._sortCol   = 'Organization';
    this._sortDir   = 1; // 1=asc, -1=desc
  }

  onRowClick(cb) { this._onClickCb = cb; }

  render(rows) {
    const cols = [
      { key: 'Organization',  label: 'Organization'  },
      { key: 'Country',       label: 'Country'       },
      { key: 'Presence_Type', label: 'Presence'      },
      { key: 'Region',        label: 'Region'        },
      { key: 'Scope',         label: 'Scope'         },
      { key: 'Member_Type',   label: 'Type'          },
      { key: 'Value_Chain',   label: 'Value Chain'   },
      { key: 'Commodity',     label: 'Commodity'     },
      { key: 'Engagements',   label: 'Engagements'   },
    ];

    /* Sort */
    const sc = this._sortCol, sd = this._sortDir;
    const sorted = [...rows].sort((a, b) => {
      const av = a[sc] || '', bv = b[sc] || '';
      const an = parseFloat(av), bn = parseFloat(bv);
      if (!isNaN(an) && !isNaN(bn)) return (an - bn) * sd;
      return av.localeCompare(bv) * sd;
    });

    if (!sorted.length) {
      this._container.innerHTML = `
        <div class="no-results">
          <div class="no-results-icon">🔍</div>
          <div class="no-results-msg">No results found</div>
          <div class="no-results-sub">Try adjusting your filters or search query.</div>
        </div>`;
      return;
    }

    const thead = cols.map(c => {
      const isSorted = c.key === this._sortCol;
      const arrow = isSorted ? (this._sortDir === 1 ? '↑' : '↓') : '↕';
      return `<th data-col="${c.key}" class="${isSorted ? 'sorted' : ''}">
        ${Utils.escapeHtml(c.label)} <span class="sa">${arrow}</span>
      </th>`;
    }).join('');

    const tbody = sorted.map(r => {
      const iso = r.ISO_Alpha3 || '';
      const cells = cols.map(c => {
        const v = Utils.escapeHtml(r[c.key] || '');
        if (c.key === 'Organization') return `<td class="tbl-org">${v}</td>`;
        if (c.key === 'Engagements') {
          const n = parseFloat(r[c.key]);
          return `<td class="tbl-count">${isNaN(n) ? v : Utils.formatNumber(n)}</td>`;
        }
        if (c.key === 'Commodity') {
          const col = Utils.commodityColor(r[c.key]);
          return `<td>
            <span style="display:inline-flex;align-items:center;gap:5px">
              <span style="width:8px;height:8px;border-radius:50%;background:${col};flex-shrink:0"></span>
              ${v}
            </span>
          </td>`;
        }
        if (c.key === 'Member_Type') return `<td><span class="badge ${Utils.badgeClass(r[c.key])}">${v}</span></td>`;
        if (c.key === 'Presence_Type') {
          const cls  = r[c.key] === 'HQ' ? 'b-orange' : 'b-lime';
          return `<td><span class="badge ${cls}">${v}</span></td>`;
        }
        return `<td>${v}</td>`;
      }).join('');
      return `<tr data-iso="${iso}">${cells}</tr>`;
    }).join('');

    this._container.innerHTML = `
      <table class="data-table">
        <thead><tr>${thead}</tr></thead>
        <tbody>${tbody}</tbody>
      </table>`;

    /* Sort header click */
    this._container.querySelectorAll('th[data-col]').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.col;
        if (this._sortCol === col) this._sortDir *= -1;
        else { this._sortCol = col; this._sortDir = 1; }
        this.render(rows);
      });
    });

    /* Row click → open detail */
    this._container.querySelectorAll('tbody tr[data-iso]').forEach(tr => {
      tr.addEventListener('click', () => {
        const iso = tr.dataset.iso;
        if (iso && this._onClickCb) this._onClickCb(iso);
      });
    });
  }
}

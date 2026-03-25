/* js/utils.js — Shared utilities */
'use strict';

const Utils = {

  debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  },

  animateCounter(el, target, duration = 600) {
    if (!el) return;
    const start = parseFloat(el.textContent.replace(/,/g, '')) || 0;
    const delta = target - start;
    if (delta === 0) return;
    const t0 = performance.now();
    const tick = now => {
      const p = Math.min((now - t0) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      el.textContent = Utils.formatNumber(Math.round(start + delta * ease));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },

  escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  },

  truncate(str, n) {
    if (!str) return '';
    return String(str).length > n ? String(str).slice(0, n) + '…' : String(str);
  },

  formatNumber(n) {
    if (n == null || isNaN(n)) return '0';
    return Number(n).toLocaleString();
  },

  flag(iso) {
    if (!iso || iso.length !== 3) return '🌍';
    const A3_TO_A2 = {
      ABW:'AW',AFG:'AF',AGO:'AO',ALB:'AL',AND:'AD',ARE:'AE',ARG:'AR',ARM:'AM',
      AUS:'AU',AUT:'AT',AZE:'AZ',BDI:'BI',BEL:'BE',BEN:'BJ',BFA:'BF',BGD:'BD',
      BGR:'BG',BHR:'BH',BHS:'BS',BIH:'BA',BLR:'BY',BLZ:'BZ',BOL:'BO',BRA:'BR',
      BRB:'BB',BRN:'BN',BTN:'BT',BWA:'BW',CAF:'CF',CAN:'CA',CHE:'CH',CHL:'CL',
      CHN:'CN',CIV:'CI',CMR:'CM',COD:'CD',COG:'CG',COL:'CO',COM:'KM',CPV:'CV',
      CRI:'CR',CUB:'CU',CYP:'CY',CZE:'CZ',DEU:'DE',DJI:'DJ',DMA:'DM',DNK:'DK',
      DOM:'DO',DZA:'DZ',ECU:'EC',EGY:'EG',ERI:'ER',ESP:'ES',EST:'EE',ETH:'ET',
      FIN:'FI',FJI:'FJ',FRA:'FR',GAB:'GA',GBR:'GB',GEO:'GE',GHA:'GH',GIN:'GN',
      GMB:'GM',GNB:'GW',GNQ:'GQ',GRC:'GR',GRD:'GD',GTM:'GT',GUY:'GY',HND:'HN',
      HRV:'HR',HTI:'HT',HUN:'HU',IDN:'ID',IND:'IN',IRL:'IE',IRN:'IR',IRQ:'IQ',
      ISL:'IS',ISR:'IL',ITA:'IT',JAM:'JM',JOR:'JO',JPN:'JP',KAZ:'KZ',KEN:'KE',
      KGZ:'KG',KHM:'KH',KIR:'KI',KNA:'KN',KOR:'KR',KWT:'KW',LAO:'LA',LBN:'LB',
      LBR:'LR',LBY:'LY',LCA:'LC',LIE:'LI',LKA:'LK',LSO:'LS',LTU:'LT',LUX:'LU',
      LVA:'LV',MAR:'MA',MCO:'MC',MDA:'MD',MDG:'MG',MDV:'MV',MEX:'MX',MKD:'MK',
      MLI:'ML',MLT:'MT',MMR:'MM',MNE:'ME',MNG:'MN',MOZ:'MZ',MRT:'MR',MUS:'MU',
      MWI:'MW',MYS:'MY',NAM:'NA',NER:'NE',NGA:'NG',NIC:'NI',NLD:'NL',NOR:'NO',
      NPL:'NP',NRU:'NR',NZL:'NZ',OMN:'OM',PAK:'PK',PAN:'PA',PER:'PE',PHL:'PH',
      PNG:'PG',POL:'PL',PRK:'KP',PRT:'PT',PRY:'PY',QAT:'QA',ROU:'RO',RUS:'RU',
      RWA:'RW',SAU:'SA',SDN:'SD',SEN:'SN',SGP:'SG',SLE:'SL',SLV:'SV',SMR:'SM',
      SOM:'SO',SRB:'RS',SSD:'SS',STP:'ST',SUR:'SR',SVK:'SK',SVN:'SI',SWE:'SE',
      SWZ:'SZ',SYC:'SC',SYR:'SY',TCD:'TD',TGO:'TG',THA:'TH',TJK:'TJ',TKM:'TM',
      TLS:'TL',TON:'TO',TTO:'TT',TUN:'TN',TUR:'TR',TUV:'TV',TZA:'TZ',UGA:'UG',
      UKR:'UA',URY:'UY',USA:'US',UZB:'UZ',VCT:'VC',VEN:'VE',VNM:'VN',VUT:'VU',
      WSM:'WS',YEM:'YE',ZAF:'ZA',ZMB:'ZM',ZWE:'ZW',BLM:'BL',ATG:'AG',
    };
    const a2 = A3_TO_A2[iso.toUpperCase()];
    if (!a2) return '🌍';
    return a2.toUpperCase().replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt(0)));
  },

  commodityColor(commodity) {
    if (!commodity) return '#94a3b8';
    const c = commodity.toLowerCase();
    if (/grain|canola|soybean|pulses|sorghum/.test(c)) return '#f59e0b';
    if (/animal|cattle|dairy/.test(c))                 return '#10b981';
    if (/food|seafood|non-alc|processed/.test(c))      return '#3b82f6';
    if (/crop|fertil|seeds/.test(c))                   return '#8b5cf6';
    if (/multi/.test(c))                               return '#ec4899';
    return '#94a3b8';
  },

  typeColor(type) {
    if (!type) return '#94a3b8';
    const t = type.toLowerCase();
    if (/association|national/.test(t))      return '#3b6cf5';
    if (/compan/.test(t))                    return '#0891b2';
    if (/farmer|producer/.test(t))           return '#059669';
    return '#d97706';
  },

  badgeClass(type) {
    if (!type) return 'b-slate';
    const t = type.toLowerCase();
    if (/association|national/.test(t))      return 'b-blue';
    if (/compan/.test(t))                    return 'b-cyan';
    if (/farmer|producer/.test(t))           return 'b-emerald';
    if (/multi/.test(t))                     return 'b-pink';
    if (/global|international/.test(t))      return 'b-purple';
    if (/regional/.test(t))                  return 'b-amber';
    if (/trade/.test(t))                     return 'b-orange';
    if (/hq/.test(t))                        return 'b-orange';
    if (/activity/.test(t))                  return 'b-lime';
    return 'b-slate';
  },

  downloadCSV(rows, filename) {
    if (!rows || !rows.length) return;
    const keys = Object.keys(rows[0]);
    const lines = [keys.join(',')];
    rows.forEach(row => {
      lines.push(keys.map(k => {
        const v = String(row[k] ?? '');
        return (v.includes(',') || v.includes('"') || v.includes('\n'))
          ? '"' + v.replace(/"/g, '""') + '"'
          : v;
      }).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  },

  COMMODITY_CATEGORIES: [
    { label: 'Grains & Oilseeds',   color: '#f59e0b' },
    { label: 'Livestock & Dairy',   color: '#10b981' },
    { label: 'Food & Beverages',    color: '#3b82f6' },
    { label: 'Inputs & Technology', color: '#8b5cf6' },
    { label: 'Multi-Commodity',     color: '#ec4899' },
    { label: 'Other',               color: '#94a3b8' },
  ],
};

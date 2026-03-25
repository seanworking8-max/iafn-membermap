/* js/excelParser.js — Parse Excel/CSV uploads via SheetJS */
'use strict';

const ExcelParser = {

  async parse(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = e => {
        try {
          const data     = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheet    = workbook.Sheets[workbook.SheetNames[0]];
          const rawRows  = XLSX.utils.sheet_to_json(sheet, { defval: '' });

          if (!rawRows.length) throw new Error('No data rows found in the file.');

          /* Normalise: trim all keys and string values */
          const rows = rawRows.map(row => {
            const obj = {};
            Object.keys(row).forEach(k => {
              const v = row[k];
              obj[k.trim()] = typeof v === 'string' ? v.trim() : String(v ?? '').trim();
            });
            return obj;
          });

          /* Validate required columns */
          const required = ['Organization', 'Country', 'ISO_Alpha3', 'Presence_Type'];
          const sample   = rows[0] || {};
          const missing  = required.filter(c => !(c in sample));
          if (missing.length) {
            throw new Error(`Missing required columns: ${missing.join(', ')}`);
          }

          resolve(rows);
        } catch (err) {
          reject(err);
        }
      };

      reader.onerror = () => reject(new Error('Could not read the file.'));
      reader.readAsArrayBuffer(file);
    });
  },
};

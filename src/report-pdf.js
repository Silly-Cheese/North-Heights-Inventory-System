/**
 * Professional, multipage North Heights Church of Christ inventory report.
 * Accepts an already-instantiated jsPDF object; does not modify any records.
 * Text is measured and split into cell-width segments to avoid clipping.
 */
export function buildInventoryPdf(pdf, report, options = {}) {
  const workspace = options.workspace === 'official' ? 'OFFICIAL' : 'TEST';
  const type = report.reportType || 'full';
  const sourceName = report.source || 'Current working inventory';
  const [originalHeaders, ...records] = report.rows || [];
  if (!originalHeaders || !Array.isArray(originalHeaders)) throw new Error('Report data is missing column headers.');

  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const margin = 15;
  const usable = W - 2 * margin;
  const bottom = H - 24;
  const ink = [27, 53, 55];
  const forest = [23, 66, 67];
  const teal = [35, 119, 99];
  const gold = [199, 159, 91];
  const muted = [93, 109, 108];
  const outline = [224, 232, 226];
  const wash = [246, 249, 247];
  const pale = [236, 246, 239];
  let y = 0;
  let pageNumber = 1;

  function color(target, rgb) {
    pdf[target](rgb[0], rgb[1], rgb[2]);
  }
  function text(value) {
    // jsPDF standard Helvetica cannot reliably render all Unicode glyphs.
    return String(value ?? '')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/\u2022/g, '-')
      .replace(/\s+/g, ' ')
      .normalize('NFKD')
      .replace(/[^\x20-\x7e]/g, '?');
  }
  function label(str, x, yy, size = 9, rgb = ink, weight = 'normal', align) {
    color('setTextColor', rgb);
    pdf.setFont('helvetica', weight);
    pdf.setFontSize(size);
    pdf.text(text(str), x, yy, align ? {align} : undefined);
  }
  function rect(x, yy, w, h, fill, radius = 0) {
    color('setFillColor', fill);
    if (radius) pdf.roundedRect(x, yy, w, h, radius, radius, 'F');
    else pdf.rect(x, yy, w, h, 'F');
  }
  function rule(x1, yy, x2, rgb = outline) {
    color('setDrawColor', rgb);
    pdf.setLineWidth(0.3);
    pdf.line(x1, yy, x2, yy);
  }
  function wrap(value, width, size = 8.3) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(size);
    const string = text(value) || '-';
    return pdf.splitTextToSize(string, Math.max(8, width));
  }
  function addBrandHeader(continued = false) {
    const h = continued ? 25 : 31;
    rect(0, 0, W, h, forest);
    rect(margin, continued ? 7 : 8.5, 13, 13, pale, 2.8);
    label('NH', margin + 6.5, continued ? 15.2 : 16.8, 10.5, forest, 'bold', 'center');
    label('NORTH HEIGHTS CHURCH OF CHRIST', margin + 18, continued ? 13 : 14, 10, [248, 250, 247], 'bold');
    label('PROPERTY INVENTORY  /  ' + workspace, margin + 18, continued ? 19 : 20, 7.2, [200, 224, 211]);
    label(continued ? 'CONTINUED' : 'CONGREGATIONAL RECORD', W - margin, continued ? 16 : 18, 7.2, [232, 211, 171], 'bold', 'right');
    rect(0, h, W, 1.4, gold);
    y = h + 10;
  }
  function newPage() {
    pdf.addPage();
    pageNumber++;
    addBrandHeader(true);
    label(text(report.title).toUpperCase() + '  |  CONTINUED', margin, y, 8, muted, 'bold');
    y += 7;
  }
  function ensure(height, after = false) {
    if (y + height > bottom) {
      newPage();
      if (after) tableHeader();
    }
  }

  addBrandHeader(false);
  label(report.title || 'Inventory report', margin, y + 2, 19, ink, 'bold');
  y += 11;
  const dateLabel = text(report.createdAt || new Date().toLocaleString());
  const sourceLines = wrap('SOURCE  ' + sourceName, usable * 0.68, 8.2);
  label('CREATED  ' + dateLabel, W - margin, y, 8, muted, 'normal', 'right');
  sourceLines.slice(0, 3).forEach((line, i) => label(line, margin, y + i * 4.5, 8.2, muted));
  y += Math.max(12, sourceLines.length * 4.5 + 5);

  const stats = [
    ['ROOMS', Number(report.roomCount || 0).toLocaleString()],
    ['ITEM TYPES', Number(report.itemTypes || 0).toLocaleString()],
    ['INDIVIDUAL UNITS', Number(report.units || 0).toLocaleString()]
  ];
  const cardGap = 5;
  const cardWidth = (usable - cardGap * 2) / 3;
  stats.forEach((entry, i) => {
    const x = margin + i * (cardWidth + cardGap);
    rect(x, y, cardWidth, 22, i === 2 ? pale : wash, 2);
    label(entry[0], x + 5, y + 7, 7.2, muted, 'bold');
    label(entry[1], x + 5, y + 17, 16, forest, 'bold');
  });
  y += 30;
  rule(margin, y, W - margin);
  y += 8;
  label(type === 'condition' ? 'CONDITION PROFILE' : 'INVENTORY REGISTER', margin, y, 9, teal, 'bold');
  label(records.length + ' record' + (records.length === 1 ? '' : 's'), W - margin, y, 8, muted, 'normal', 'right');
  y += 8;

  const allCols = {
    full: [
      ['ROOM', 0, 0.15], ['ITEM DESCRIPTION', 1, 0.225], ['QTY', 3, 0.065],
      ['CONDITION', 4, 0.12], ['CATEGORY', 2, 0.155], ['NOTES', 5, 0.285]
    ],
    room: [
      ['ROOM', 0, 0.15], ['ITEM DESCRIPTION', 1, 0.225], ['QTY', 3, 0.065],
      ['CONDITION', 4, 0.12], ['CATEGORY', 2, 0.155], ['NOTES', 5, 0.285]
    ],
    condition: [
      ['CONDITION', 0, 0.5], ['ITEM TYPES', 1, 0.25], ['TOTAL UNITS', 2, 0.25]
    ],
    disposition: [
      ['ROOM', 0, 0.135], ['ITEM', 1, 0.185], ['QTY', 2, 0.06],
      ['REVIEW', 3, 0.125], ['PLANNED ALLOCATION', 'allocation', 0.26],
      ['NOTES', 10, 0.235]
    ]
  };
  const typeKey = Object.hasOwn(allCols, type) ? type : 'full';
  let cols = allCols[typeKey].map(([name, idx, fraction]) => ({name, idx, fraction}));
  if (typeKey === 'room' && report.roomFilter && report.roomFilter !== 'all') {
    cols = cols.filter(c => c.idx !== 0);
    const f = cols.reduce((n, c) => n + c.fraction, 0);
    cols.forEach(c => c.fraction = c.fraction / f);
  }
  let offset = margin;
  cols.forEach(c => {c.x = offset; c.w = usable * c.fraction; offset += c.w;});
  const tableHeadH = 10;
  const lineHeight = 3.9;
  const padX = 2.7;
  const padY = 2.9;
  function tableHeader() {
    ensure(tableHeadH);
    rect(margin, y, usable, tableHeadH, forest, 1.3);
    cols.forEach(col => label(col.name, col.x + padX, y + 6.4, 7.1, [255, 255, 255], 'bold'));
    y += tableHeadH;
  }
  function allocation(row) {
    const names = ['Keep', 'With property', 'Donate', 'Sell', 'Dispose', 'Unallocated'];
    const result = names.map((n, i) => {
      const v = Number(row[4 + i] ?? 0);
      return v > 0 ? n + ' ' + v.toLocaleString() : '';
    }).filter(Boolean);
    return result.length ? result.join('  /  ') : 'Not allocated';
  }
  function displayValue(row, col) {
    return col.idx === 'allocation' ? allocation(row) : row[col.idx];
  }
  function groupHeader(room) {
    if (!(typeKey === 'full' || typeKey === 'room' || typeKey === 'disposition')) return;
    const lines = wrap(room || 'Unassigned room', usable - 16, 8.8);
    const h = Math.max(10.5, lines.length * 4.5 + 5);
    ensure(h + 14, true);
    rect(margin, y, usable, h, pale, 1.3);
    rect(margin, y, 1.8, h, teal);
    lines.forEach((line, i) => label(line, margin + 6, y + 6.8 + i * 4.5, 8.8, forest, 'bold'));
    y += h;
  }
  function tableRow(row, position) {
    const segments = cols.map(col => wrap(displayValue(row, col), col.w - padX * 2, 8));
    let remaining = Math.max(...segments.map(s => s.length));
    let cursor = 0;
    while (remaining > 0) {
      if (y + 13 > bottom) {newPage();tableHeader();}
      const fit = Math.max(1, Math.floor((bottom - y - padY * 2 - 1) / lineHeight));
      const lines = Math.min(remaining, fit);
      const rh = Math.max(10.5, lines * lineHeight + padY * 2);
      rect(margin, y, usable, rh, position % 2 === 0 ? [255, 255, 255] : wash);
      cols.forEach((col, i) => {
        const chunk = segments[i].slice(cursor, cursor + lines);
        chunk.forEach((part, k) => {
          const numeric = col.name === 'QTY' || col.name === 'ITEM TYPES' || col.name === 'TOTAL UNITS';
          label(part, numeric ? col.x + col.w - padX : col.x + padX,
            y + padY + 2.8 + k * lineHeight, 8,
            i === 1 ? ink : muted,
            i === 1 || numeric ? 'bold' : 'normal', numeric ? 'right' : undefined);
        });
      });
      rule(margin, y + rh, W - margin, outline);
      y += rh;
      cursor += lines;
      remaining -= lines;
      if (remaining > 0) {newPage();tableHeader();}
    }
  }

  tableHeader();
  let previousRoom = null;
  records.forEach((row, index) => {
    const room = (typeKey === 'condition' ? null : text(row[0] || 'Unassigned room'));
    if (room !== null && room !== previousRoom) {
      previousRoom = room;
      groupHeader(room);
    }
    tableRow(row, index);
  });
  if (!records.length) {
    ensure(18, true);
    rect(margin, y, usable, 17, wash, 2);
    label('No records match the selected report filters.', margin + 6, y + 10, 9, muted);
    y += 17;
  }

  ensure(50);
  y += 8;
  rule(margin, y, W - margin, [184, 203, 194]); y += 9;
  label('RECORD REVIEW', margin, y, 9.5, forest, 'bold');
  y += 8;
  label('Prepared by', margin, y, 8.2, muted);
  label('Reviewed by', margin + usable / 2, y, 8.2, muted);
  y += 11;
  rule(margin, y, margin + usable / 2 - 12, [124, 140, 135]);
  rule(margin + usable / 2, y, W - margin, [124, 140, 135]);
  y += 8;
  label('Date  __________________', margin, y, 8, muted);
  label('Date  __________________', margin + usable / 2, y, 8, muted);
  y += 5;
  const notice = 'Internal inventory record. Counts and dispositions must be checked against current church decisions and any building-sale agreement.';
  const noticeLines = wrap(notice, usable, 7.2);
  noticeLines.forEach(line => {ensure(4.2);label(line, margin, y, 7.2, muted);y += 4;});

  const pages = pdf.getNumberOfPages();
  for (let n = 1; n <= pages; n++) {
    pdf.setPage(n);
    rule(margin, H - 19, W - margin);
    label('NORTH HEIGHTS  /  ' + workspace + '  /  ' + text(sourceName).slice(0, 54),
      margin, H - 12, 7.2, muted);
    label('PAGE ' + n + ' OF ' + pages, W - margin, H - 12, 7.2, forest, 'bold', 'right');
  }
  return pdf;
}

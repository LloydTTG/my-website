/* ============================================================
   personal.html — training, specs, photographs, journal.

   Reads: profile, body_log, lift_prs, vitals, gallery, diary_logs.
   ============================================================ */

/* ---------------- rolling average ----------------
   A calendar window, not a window of N rows: each point averages
   every reading within the preceding ROLLING_DAYS days, so missed
   days shrink the sample rather than silently stretching the window
   across a gap. */
function rollingAverage(rows, windowDays) {
    const DAY = 86400000;
    const points = rows
        .map((r) => {
            const day = parseDay(r.logged_on);
            return { t: day ? day.getTime() : NaN, kg: Number(r.weight_kg) };
        })
        .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.kg))
        .sort((a, b) => a.t - b.t);

    const out = [];
    for (let i = 0; i < points.length; i++) {
        const cutoff = points[i].t - (windowDays - 1) * DAY;
        let sum = 0, n = 0;
        for (let j = i; j >= 0 && points[j].t >= cutoff; j--) {
            sum += points[j].kg;
            n++;
        }
        out.push({ t: points[i].t, avg: sum / n, n: n });
    }
    return out;
}

/* ---------------- bodyweight ---------------- */

let weightChart = null;

function renderWeight(result) {
    if (!result.ok) { setState('sec-weight', 'error', result.message); return; }
    if (!result.rows.length) { setState('sec-weight', 'empty'); return; }

    const series = rollingAverage(result.rows, ROLLING_DAYS);
    if (!series.length) { setState('sec-weight', 'empty'); return; }

    const view = series.slice(-CHART_POINTS);
    const latestReading = result.rows[result.rows.length - 1];
    const latestAvg = series[series.length - 1];

    byId('weight-now').textContent = fmtKg(latestReading.weight_kg);
    byId('weight-sub').textContent = ROLLING_DAYS + '-day average ' + fmtKg(latestAvg.avg);

    const first = view[0];
    const delta = latestAvg.avg - first.avg;
    const days = Math.round((latestAvg.t - first.t) / 86400000);
    byId('weight-meta').textContent = days > 0
        ? (delta >= 0 ? '+' : '−') + Math.abs(delta).toFixed(1) + ' kg over ' + days + ' days'
        : result.rows.length + ' reading' + (result.rows.length === 1 ? '' : 's');

    setState('sec-weight', 'content');

    if (typeof Chart === 'undefined') return;

    const canvas = byId('weight-chart');
    const ctx = canvas.getContext('2d');

    // A flat wash rather than a glowing gradient: the line carries
    // the reading, the fill only anchors it to the axis.
    const fill = ctx.createLinearGradient(0, 0, 0, 220);
    fill.addColorStop(0, 'rgba(167, 139, 250, 0.16)');
    fill.addColorStop(1, 'rgba(167, 139, 250, 0)');

    if (weightChart) weightChart.destroy();
    weightChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: view.map((p) => fmtDay(new Date(p.t).toISOString())),
            datasets: [{
                data: view.map((p) => Number(p.avg.toFixed(2))),
                borderColor: C.accent,
                borderWidth: 1.75,
                backgroundColor: fill,
                fill: true,
                tension: 0.3,
                pointRadius: 0,
                pointHoverRadius: 4,
                pointHoverBackgroundColor: C.hover,
                pointHoverBorderColor: '#0a0a0c',
                pointHoverBorderWidth: 2,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: REDUCED ? false : { duration: 700, easing: 'easeOutQuart' },
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: C.panel,
                    borderColor: C.border,
                    borderWidth: 1,
                    cornerRadius: 2,
                    padding: 10,
                    titleColor: C.muted,
                    titleFont: { size: 12, weight: '400' },
                    bodyColor: '#ffffff',
                    bodyFont: { size: 14, weight: '500' },
                    displayColors: false,
                    callbacks: {
                        label: (item) => {
                            const p = view[item.dataIndex];
                            return fmtKg(p.avg) + '  ·  ' + p.n + ' reading' + (p.n === 1 ? '' : 's');
                        },
                    },
                },
            },
            scales: {
                x: {
                    grid: { display: false },
                    border: { color: C.border },
                    ticks: { color: C.faint, font: { size: 11 }, maxRotation: 0, autoSkipPadding: 28 },
                },
                y: {
                    grid: { color: C.line },
                    border: { display: false },
                    ticks: { color: C.faint, font: { size: 11 }, maxTicksLimit: 5, callback: (v) => v + ' kg' },
                },
            },
        },
    });
}

/* ---------------- personal records ---------------- */

const LIFTS = [
    { key: 'squat',    label: 'Squat' },
    { key: 'bench',    label: 'Bench' },
    { key: 'deadlift', label: 'Deadlift' },
];

function renderRecords(result) {
    if (!result.ok) { setState('sec-prs', 'error', result.message); return; }
    if (!result.rows.length) { setState('sec-prs', 'empty'); return; }

    // Heaviest load per lift; the more recent one wins a tie.
    const best = {};
    result.rows.forEach((row) => {
        const current = best[row.lift];
        const heavier = !current || Number(row.weight_kg) > Number(current.weight_kg);
        const sameButNewer = current
            && Number(row.weight_kg) === Number(current.weight_kg)
            && String(row.achieved_on) > String(current.achieved_on);
        if (heavier || sameButNewer) best[row.lift] = row;
    });

    const grid = byId('record-grid');
    clear(grid);

    LIFTS.forEach((lift) => {
        const row = best[lift.key];
        const card = el('div', row ? 'record' : 'record record--empty');
        card.appendChild(el('p', row ? 'label label--accent' : 'label', lift.label));

        if (!row) {
            card.appendChild(el('p', 'state-empty', 'Not recorded'));
            grid.appendChild(card);
            return;
        }

        // The unit stays welded to the number: "105.0 kg" breaking
        // across two lines was the ugliest thing on the old card.
        const value = el('p', 'record__value num');
        const num = Number(row.weight_kg);
        value.appendChild(document.createTextNode(Number.isFinite(num) ? num.toFixed(1) : BLANK));
        value.appendChild(el('span', 'record__unit', 'kg'));

        const reps = Number(row.reps);
        if (Number.isFinite(reps) && reps > 1) {
            value.appendChild(el('span', 'record__reps', '×' + reps));
        }
        card.appendChild(value);
        card.appendChild(el('p', 'label num record__when', fmtDay(row.achieved_on)));
        grid.appendChild(card);
    });

    setState('sec-prs', 'content');
}

/* ---------------- specs ---------------- */

function renderSpecs(vitals, body) {
    if (!vitals.ok) { setState('sec-vitals', 'error', vitals.message); return; }

    const list = byId('spec-list');
    clear(list);
    let shown = 0;

    // Mass leads the list and is read from the training log, never
    // typed in, so it cannot drift away from the chart above.
    const latest = body.ok ? body.rows[body.rows.length - 1] : null;
    const kg = latest ? Number(latest.weight_kg) : NaN;
    if (Number.isFinite(kg)) {
        list.appendChild(specRow('Mass', kg.toFixed(1), 'kg'));
        shown++;
    }

    vitals.rows.forEach((row) => {
        list.appendChild(specRow(row.label || BLANK, row.value == null ? BLANK : String(row.value), row.unit));
        shown++;
    });

    if (!shown) { setState('sec-vitals', 'empty'); return; }
    setState('sec-vitals', 'content');
}

function specRow(label, value, unit) {
    const row = el('div', 'specs__row');
    row.appendChild(el('dt', 'label', label));
    const dd = el('dd', 'num');
    dd.appendChild(document.createTextNode(value));
    if (unit) dd.appendChild(el('span', 'unit', String(unit)));
    row.appendChild(dd);
    return row;
}

/* ---------------- gallery ---------------- */

function renderGallery(result) {
    if (!result.ok) { setState('sec-gallery', 'error', result.message); return; }

    const grid = byId('gallery-grid');
    clear(grid);
    let shown = 0;

    result.rows.forEach((row) => {
        const href = safeUrl(row.image_url);
        if (!href) return;   // skip silently rather than leaving a dead tile

        const shot = el('figure', 'shot');
        const img = el('img');
        img.alt = String(row.alt || '');
        img.loading = 'lazy';
        img.decoding = 'async';
        img.addEventListener('error', () => shot.remove(), { once: true });
        img.src = href;
        shot.appendChild(img);

        if (row.caption) shot.appendChild(el('figcaption', null, row.caption));

        grid.appendChild(shot);
        shown++;
    });

    setState('sec-gallery', shown ? 'content' : 'empty');
}

/* ---------------- journal ---------------- */

function renderJournal(result) {
    if (!result.ok) { setState('sec-journal', 'error', result.message); return; }
    if (!result.rows.length) { setState('sec-journal', 'empty'); return; }

    byId('journal-count').textContent =
        result.rows.length + (result.rows.length === 1 ? ' entry' : ' entries');

    const list = byId('journal-list');
    clear(list);

    result.rows.forEach((row) => {
        const item = el('li', 'journal__item');
        const button = el('button', 'journal__button');
        button.type = 'button';

        button.appendChild(el('p', 'label num journal__date', fmtStamp(row.created_at)));

        const main = el('div');
        main.appendChild(el('h3', 'journal__title', row.title || 'Untitled'));

        const body = String(row.body || '');
        if (body.trim()) {
            const excerpt = body.length > 180 ? body.slice(0, 180).trimEnd() + '…' : body;
            main.appendChild(el('p', 'journal__excerpt', excerpt));
        }

        const tags = Array.isArray(row.tags) ? row.tags : [];
        if (tags.length) {
            main.appendChild(renderTags(tags, false, 'tags--gap'));
        }
        button.appendChild(main);

        const cover = safeUrl(row.cover_url);
        if (cover) {
            const frame = el('div', 'journal__thumb');
            const img = el('img');
            img.alt = '';
            img.loading = 'lazy';
            img.decoding = 'async';
            img.addEventListener('error', () => frame.remove(), { once: true });
            img.src = cover;
            frame.appendChild(img);
            button.appendChild(frame);
        }

        button.addEventListener('click', () => openEntry(row));
        item.appendChild(button);
        list.appendChild(item);
    });

    setState('sec-journal', 'content');
}

/* ---------------- overlay ---------------- */

const overlay = byId('overlay');
const overlayClose = byId('overlay-close');
let lastFocused = null;

function openEntry(row) {
    byId('overlay-date').textContent = fmtStamp(row.created_at);
    byId('overlay-title').textContent = row.title || 'Untitled';
    byId('overlay-body').textContent = String(row.body || '');

    setImage(byId('overlay-cover-frame'), byId('overlay-cover'), row.cover_url, '');

    const tagWrap = byId('overlay-tags');
    clear(tagWrap);
    const tags = Array.isArray(row.tags) ? row.tags : [];
    tags.forEach((tag) => tagWrap.appendChild(el('span', 'tag tag--accent', String(tag))));
    tagWrap.hidden = tags.length === 0;

    lastFocused = document.activeElement;
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    overlay.querySelector('.overlay__sheet').scrollTop = 0;
    overlayClose.focus();
}

function closeEntry() {
    if (overlay.hidden) return;
    overlay.hidden = true;
    document.body.style.overflow = '';
    if (lastFocused && lastFocused.isConnected) lastFocused.focus();
    lastFocused = null;
}

overlayClose.addEventListener('click', closeEntry);
overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) closeEntry(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeEntry(); });

/* ---------------- boot ---------------- */

const PERSONAL_SECTIONS = ['sec-weight', 'sec-prs', 'sec-vitals', 'sec-gallery', 'sec-journal'];

async function loadPersonal() {
    if (!sb) {
        applyIdentity(FALLBACK.name);
        PERSONAL_SECTIONS.forEach((id) => setState(id, 'error', OFFLINE_REASON));
        return;
    }

    const [profile, body, lifts, vitals, gallery, diary] = await Promise.all([
        run(sb.from('profile').select('display_name, tagline')
              .order('updated_at', { ascending: false }).limit(1)),
        run(sb.from('body_log').select('logged_on, weight_kg')
              .order('logged_on', { ascending: true })),
        run(sb.from('lift_prs').select('lift, weight_kg, reps, achieved_on')
              .order('weight_kg', { ascending: false })),
        run(sb.from('vitals').select('label, value, unit')
              .eq('published', true).order('sort_order', { ascending: true })),
        run(sb.from('gallery').select('image_url, alt, caption')
              .eq('published', true).order('sort_order', { ascending: true })),
        run(sb.from('diary_logs').select('id, title, body, tags, cover_url, created_at')
              .eq('is_public', true).order('created_at', { ascending: false })),
    ]);

    const person = profile.rows[0] || {};
    applyIdentity(person.display_name);
    document.title = 'Personal';
    if (person.tagline) byId('personal-lede').textContent = person.tagline;

    // Each renderer owns its own section: one failure leaves the rest intact.
    renderWeight(body);
    renderRecords(lifts);
    renderSpecs(vitals, body);
    renderGallery(gallery);
    renderJournal(diary);

    /* Same rule as the professional page: nothing to show means no
       section, rather than a heading over an apology. */
    collapseIfEmpty('sec-weight', body);
    collapseIfEmpty('sec-prs', lifts);
    collapseIfEmpty('frames', gallery);
    collapseIfEmpty('journal', diary);

    if (isEmpty(body) && isEmpty(lifts)) hideSection('training');

    // Mass comes from the training log, so the spec list is only
    // truly empty when both it and the log are.
    if (isEmpty(vitals) && isEmpty(body)) hideSection('specs');

    renumberSections();
}

loadPersonal();

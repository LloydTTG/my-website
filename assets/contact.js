/* ============================================================
   contact.html — the address, the other channels, and where I am.

   Reads: profile, contact_links.
   ============================================================ */

function renderContactProfile(result) {
    const row = result.rows[0] || {};
    const name = row.display_name || FALLBACK.name;

    applyIdentity(name);
    document.title = 'Contact';

    /* The address is built from the row when there is one, so the
       page never advertises a stale mailbox. */
    const address = (row.email || FALLBACK.email || '').trim();
    const link = byId('contact-email');
    if (address) {
        link.textContent = address;
        link.href = 'mailto:' + encodeURIComponent(address).replace(/%40/g, '@');
    } else {
        link.textContent = 'Not published';
        link.removeAttribute('href');
    }

    const status = byId('contact-status');
    if (row.status) {
        status.textContent = row.status;
    } else if (row.available === false) {
        status.textContent = 'Not taking on new work';
    }
    if (row.available === false) byId('contact-dot').classList.add('dot--idle');

    byId('contact-location').textContent = row.location || 'Ask and I will tell you.';
}

function renderChannels(result) {
    if (!result.ok) { setState('sec-channels', 'error', result.message); return; }

    const list = byId('channel-list');
    clear(list);
    let shown = 0;

    result.rows.forEach((row) => {
        const href = safeLink(row.url);
        if (!href) return;   // a channel with no reachable address is not a channel

        const link = el('a', 'channel');
        link.href = href;
        if (href.indexOf('http') === 0) {
            link.target = '_blank';
            link.rel = 'me noopener';
        }

        link.appendChild(el('span', 'channel__name', row.label || 'Link'));
        link.appendChild(el('span', 'channel__handle', row.handle || tidyHost(href)));

        list.appendChild(link);
        shown++;
    });

    setState('sec-channels', shown ? 'content' : 'empty');
}

/* Falls back to the bare hostname when a row has no handle, which
   reads better than repeating the whole URL. */
function tidyHost(href) {
    try {
        return new URL(href).hostname.replace(/^www\./, '');
    } catch (err) {
        return '';
    }
}

async function loadContact() {
    if (!sb) {
        renderContactProfile({ ok: false, rows: [] });
        setState('sec-channels', 'error', OFFLINE_REASON);
        return;
    }

    const [profile, channels] = await Promise.all([
        runProfile('location, status, available, email'),
        run(sb.from('contact_links').select('label, handle, url')
              .eq('published', true).order('sort_order', { ascending: true })),
    ]);

    renderContactProfile(profile);
    renderChannels(channels);

    /* With no links there is nothing under the heading but a hairline,
       so the whole block goes and the email carries the page. */
    collapseIfEmpty('elsewhere', channels);
}

loadContact();

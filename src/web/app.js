const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let state = { view: 'people', people: [], stories: [], tags: [], selected: null };

function api(path, opts = {}) {
  return fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  }).then(r => {
    if (r.status === 204) return null;
    if (!r.ok) return r.json().then(e => { throw new Error(e.error || 'API error'); });
    return r.json();
  });
}

function notify(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `notification ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => { el.remove(); }, 3000);
}

async function loadData() {
  const [people, stories] = await Promise.all([api('/people'), api('/stories')]);
  state.people = people;
  state.stories = stories;
  try { state.tags = await api('/tags'); } catch { state.tags = []; }
  render();
}

function render() {
  const app = $('#app');
  switch (state.view) {
    case 'people': app.innerHTML = renderPeople(); break;
    case 'stories': app.innerHTML = renderStories(); break;
    case 'timeline': app.innerHTML = renderTimeline(); break;
    case 'tree': app.innerHTML = renderTree(); setTimeout(renderFamilyTree, 100); break;
    case 'stats': app.innerHTML = renderStats(); break;
  }
  attachEvents();
}

// ===== DARK MODE =====
function initDarkMode() {
  const saved = localStorage.getItem('cairn-dark');
  if (saved === 'true') document.body.classList.add('dark-mode');
  $('#dark-toggle')?.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('cairn-dark', document.body.classList.contains('dark-mode'));
  });
}

// ===== PEOPLE VIEW =====
function renderPeople() {
  const list = state.people.map(p => {
    const avatar = p.photo_path ? `<img class="avatar" src="/media/${p.photo_path}" alt="">` : '';
    return `<div class="card" data-id="${p.id}" data-type="person">
      <div class="card-row">${avatar}<div>
        <h3>${esc(p.name)}</h3>
        ${p.birth_date ? `<div class="meta">${p.birth_date}${p.death_date ? ' — ' + p.death_date : ''}</div>` : ''}
        ${p.story_count ? `<div class="meta">${p.story_count} stories</div>` : ''}
      </div></div>
    </div>`;
  }).join('');

  return `
    <div class="quick-stats">
      <span>${state.people.length} people</span>
      <span>${state.stories.length} stories</span>
    </div>
    <div class="search-bar">
      <input type="text" id="search-input" placeholder="Search people..." />
      <button class="btn btn-primary" id="add-person">+ Person</button>
    </div>
    <div id="people-list">${list || '<div class="card empty">No people yet. Add your first person.</div>'}</div>`;
}

// ===== STORIES VIEW =====
function renderStories() {
  const list = state.stories.map(s => `
    <div class="card" data-id="${s.id}" data-type="story">
      <h3>${esc(s.title)}</h3>
      ${s.story_date ? `<div class="meta">${s.story_date}</div>` : ''}
      ${s.people?.length ? `<div class="meta">With: ${s.people.map(p => esc(p.name)).join(', ')}</div>` : ''}
      <div class="tags">${(s.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
    </div>`).join('');

  return `
    <div class="search-bar">
      <input type="text" id="search-input" placeholder="Search stories..." />
      <button class="btn btn-primary" id="add-story">+ Story</button>
    </div>
    <div id="stories-list">${list || '<div class="card empty">No stories yet. Start writing.</div>'}</div>`;
}

// ===== TIMELINE VIEW =====
function renderTimeline() {
  const items = [];
  for (const p of state.people) {
    if (p.birth_date) items.push({ date: p.birth_date, title: `${p.name} was born`, type: 'person', id: p.id });
    if (p.death_date) items.push({ date: p.death_date, title: `${p.name} passed away`, type: 'person', id: p.id });
  }
  for (const s of state.stories) {
    if (s.story_date) items.push({ date: s.story_date, title: s.title, type: 'story', id: s.id, subtitle: s.people?.map(p => p.name).join(', ') });
  }
  items.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  let html = '<div class="timeline">';
  let currentEra = '';
  for (const i of items) {
    const year = (i.date || '').substring(0, 4);
    const era = year ? Math.floor(parseInt(year) / 10) * 10 + 's' : 'Unknown';
    if (era !== currentEra) {
      currentEra = era;
      html += `<div class="timeline-era">${era}</div>`;
    }
    html += `<div class="timeline-item" data-id="${i.id}" data-type="${i.type}">
      <div class="timeline-date">${i.date}</div>
      <div class="timeline-title">${esc(i.title)}</div>
      ${i.subtitle ? `<div class="timeline-subtitle">${esc(i.subtitle)}</div>` : ''}
    </div>`;
  }
  html += '</div>';
  return html || '<div class="card empty">No dated events yet. Add dates to your people and stories.</div>';
}

// ===== FAMILY TREE =====
function renderTree() {
  return `<div class="tree-container" id="tree-container"><svg id="tree-svg" width="800" height="500"></svg></div>
    <p style="text-align:center;color:var(--text-muted);font-size:0.82em;font-family:var(--font-ui);margin-top:0.5em;">Drag to pan &middot; Relationships shown between people</p>`;
}

function renderFamilyTree() {
  const svg = document.getElementById('tree-svg');
  if (!svg || state.people.length === 0) return;

  const people = state.people;
  const nodes = people.map((p, i) => ({
    id: p.id, name: p.name, x: 0, y: 0,
    hasPhoto: !!p.photo_path
  }));

  const rels = [];
  const processed = new Set();

  const fetchPromises = people.map(p =>
    api(`/people/${p.id}/relationships`).then(r => {
      for (const rel of r) {
        const key = [rel.id].sort().join('-');
        if (!processed.has(key)) {
          processed.add(key);
          rels.push(rel);
        }
      }
    }).catch(() => {})
  );

  Promise.all(fetchPromises).then(() => {
    const cols = Math.ceil(Math.sqrt(nodes.length));
    nodes.forEach((n, i) => {
      n.x = 120 + (i % cols) * 180;
      n.y = 80 + Math.floor(i / cols) * 120;
    });

    const W = Math.max(800, cols * 180 + 120);
    const H = Math.max(500, Math.ceil(nodes.length / cols) * 120 + 80);
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);

    let html = '';

    for (const rel of rels) {
      const a = nodes.find(n => n.id === rel.person_a_id);
      const b = nodes.find(n => n.id === rel.related_person_id);
      if (a && b) {
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        html += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#c9a87c" stroke-width="1.5" opacity="0.5"/>`;
        const labelX = (a.x + b.x) / 2;
        const labelY = (a.y + b.y) / 2 - 10;
        html += `<text x="${labelX}" y="${labelY}" text-anchor="middle" font-size="9" fill="#8a8580" font-family="sans-serif">${esc(rel.type)}</text>`;
      }
    }

    for (const n of nodes) {
      const radius = n.hasPhoto ? 24 : 20;
      html += `<g class="tree-node" style="cursor:pointer" data-id="${n.id}">`;
      if (n.hasPhoto) {
        html += `<defs><clipPath id="clip-${n.id}"><circle cx="${n.x}" cy="${n.y}" r="24"/></clipPath></defs>`;
        html += `<image href="/media/${people.find(p => p.id === n.id)?.photo_path}" x="${n.x - 24}" y="${n.y - 24}" width="48" height="48" clip-path="url(#clip-${n.id})"/>`;
      }
      html += `<circle cx="${n.x}" cy="${n.y}" r="${radius}" fill="${n.hasPhoto ? 'transparent' : '#6b4c3b'}" stroke="#6b4c3b" stroke-width="2"/>`;
      html += `<text x="${n.x}" y="${n.y + radius + 16}" text-anchor="middle" font-size="11" fill="var(--text)" font-family="sans-serif">${esc(n.name)}</text>`;
      html += `</g>`;
    }

    svg.innerHTML = html;
    svg.querySelectorAll('.tree-node').forEach(el => {
      el.addEventListener('click', () => {
        showDetail('person', el.dataset.id);
      });
    });
  });
}

// ===== STATS VIEW =====
function renderStats() {
  return `<div id="stats-content"><div class="card empty">Loading statistics...</div></div>`;

  // Loaded async
  setTimeout(async () => {
    try {
      const stats = await api('/stats');
      const c = $('#stats-content');
      if (!c) return;

      const people = stats.people || {};
      const stories = stats.stories || {};
      const media = stats.media || {};
      const tags = stats.tags || {};

      c.innerHTML = `
        <h2 style="margin-bottom:0.5em;">Your Archive</h2>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-number">${people.total || 0}</div>
            <div class="stat-label">People</div>
            ${people.oldest ? `<div class="stat-sub">Oldest: ${esc(people.oldest.name)} (${people.oldest.birth_date})</div>` : ''}
          </div>
          <div class="stat-card">
            <div class="stat-number">${stories.total || 0}</div>
            <div class="stat-label">Stories</div>
            <div class="stat-sub">${stories.withDates || 0} dated</div>
          </div>
          <div class="stat-card">
            <div class="stat-number">${media.total || 0}</div>
            <div class="stat-label">Media Files</div>
            <div class="stat-sub">${(media.byType || []).map(m => `${m.type}: ${m.count}`).join(' &middot; ')}</div>
          </div>
          <div class="stat-card">
            <div class="stat-number">${tags.total || 0}</div>
            <div class="stat-label">Tags</div>
            <div class="stat-sub">${(tags.popular || []).slice(0, 3).map(t => `${esc(t.name)} (${t.count})`).join(', ')}</div>
          </div>
        </div>
        ${media.total > 0 ? `
          <h2 style="margin:1em 0 0.5em;">Recent Media</h2>
          <div class="media-grid" id="stats-media-grid"></div>
        ` : ''}
      `;

      if (media.total > 0) {
        const allMedia = await api('/media');
        const grid = $('#stats-media-grid');
        if (grid) {
          grid.innerHTML = allMedia.slice(0, 12).map(m => renderMediaItem(m)).join('');
        }
      }
    } catch (e) {
      const c = $('#stats-content');
      if (c) c.innerHTML = '<div class="card empty">Could not load statistics.</div>';
    }
  }, 50);

  return '';
}

// ===== MEDIA RENDER =====
function renderMediaItem(m) {
  if (m.type === 'image') {
    return `<div class="media-item" data-id="${m.id}" title="${esc(m.caption || m.original_name || '')}">
      <img src="/media/${m.file_path}" alt="${esc(m.caption || '')}" loading="lazy">
      <span class="media-type-badge">image</span>
    </div>`;
  }
  if (m.type === 'audio') {
    return `<div class="media-item" data-id="${m.id}" title="${esc(m.caption || m.original_name || '')}">
      <div class="media-icon">&#9835;</div>
      <span class="media-type-badge">audio</span>
    </div>`;
  }
  return `<div class="media-item" data-id="${m.id}">
    <div class="media-icon">&#128196;</div>
    <span class="media-type-badge">${m.type}</span>
  </div>`;
}

// ===== EVENTS =====
function attachEvents() {
  $$('.card[data-type="person"]').forEach(el => el.addEventListener('click', () => showDetail('person', el.dataset.id)));
  $$('.card[data-type="story"]').forEach(el => el.addEventListener('click', () => showDetail('story', el.dataset.id)));
  $$('.timeline-item').forEach(el => el.addEventListener('click', () => showDetail(el.dataset.type, el.dataset.id)));
  $$('.media-item').forEach(el => el.addEventListener('click', () => showMediaDetail(el.dataset.id)));

  $('#add-person')?.addEventListener('click', showAddPerson);
  $('#add-story')?.addEventListener('click', showAddStory);

  const search = $('#search-input');
  if (search) {
    let timeout;
    search.addEventListener('input', () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => searchQuery(search.value), 300);
    });
  }

  $$('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.view = tab.dataset.view;
      render();
    });
  });
}

// ===== SEARCH =====
async function searchQuery(q) {
  if (!q.trim()) return loadData();
  const results = await api(`/search?q=${encodeURIComponent(q)}`);
  if (state.view === 'people') {
    const list = $('#people-list');
    if (!list) return;
    list.innerHTML = results.people.map(p => `
      <div class="card" data-id="${p.id}" data-type="person">
        <h3>${esc(p.name)}${highlight(p.name, q)}</h3>
        ${p.birth_date ? `<div class="meta">${p.birth_date}${p.death_date ? ' — ' + p.death_date : ''}</div>` : ''}
      </div>`).join('') || '<div class="card empty">No results.</div>';
    $$('.card[data-type="person"]').forEach(el => el.addEventListener('click', () => showDetail('person', el.dataset.id)));
  } else {
    const list = $('#stories-list');
    if (!list) return;
    list.innerHTML = results.stories.map(s => `
      <div class="card" data-id="${s.id}" data-type="story">
        <h3>${esc(s.title)}${highlight(s.title, q)}</h3>
        ${s.story_date ? `<div class="meta">${s.story_date}</div>` : ''}
      </div>`).join('') || '<div class="card empty">No results.</div>';
    $$('.card[data-type="story"]').forEach(el => el.addEventListener('click', () => showDetail('story', el.dataset.id)));
  }
}

function highlight(text, query) {
  if (!query) return '';
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return '';
  return ''; // Could add highlighting spans
}

// ===== MODAL =====
function showModal(html) {
  const modal = $('#modal');
  $('#modal-content').innerHTML = html;
  modal.classList.remove('hidden');
  $('.modal-backdrop').addEventListener('click', hideModal);
  const closeBtn = $('.modal-close');
  if (closeBtn) closeBtn.addEventListener('click', hideModal);
}

function hideModal() {
  $('#modal').classList.add('hidden');
}

// ===== DETAIL VIEWS =====
async function showDetail(type, id) {
  if (type === 'person') {
    const p = await api(`/people/${id}`);
    const avatar = p.photo_url ? `<img src="${p.photo_url}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;float:right;margin-left:1em;">` : '';
    const rels = (p.relationships || []).map(r =>
      `<li><a href="#" class="rel-link" data-id="${r.related_person_id}" data-type="person">${esc(r.related_person_name)}</a> <span style="color:var(--text-muted)">(${r.type})</span>
      <button class="btn btn-small btn-danger del-rel" data-rel-id="${r.id}" style="float:right">Remove</button></li>`
    ).join('');

    const peopleOptions = state.people.filter(p2 => p2.id !== id)
      .map(p2 => `<option value="${p2.id}">${esc(p2.name)}</option>`).join('');

    const relHtml = rels ? `<h3 style="margin-top:1em;">Relationships</h3>
      <ul class="relationship-list" id="rel-list">${rels}</ul>
      <div style="margin-top:0.5em;"><button class="btn btn-small btn-success" id="add-rel-btn">+ Add Relationship</button></div>
      <div id="add-rel-form" style="display:none;margin-top:0.5em;padding:0.8em;border:1px solid var(--border);border-radius:var(--radius-sm);">
        <select id="rel-person" style="width:100%;margin-bottom:0.3em;padding:0.4em;border:1px solid var(--border);border-radius:3px;">${peopleOptions}</select>
        <select id="rel-type" style="width:100%;margin-bottom:0.3em;padding:0.4em;border:1px solid var(--border);border-radius:3px;">
          <option value="parent">Parent</option><option value="child">Child</option><option value="sibling">Sibling</option>
          <option value="partner">Partner</option><option value="grandparent">Grandparent</option><option value="grandchild">Grandchild</option>
          <option value="cousin">Cousin</option><option value="other">Other</option>
        </select>
        <button class="btn btn-primary btn-small" id="save-rel">Save</button>
        <button class="btn btn-small" id="cancel-rel">Cancel</button>
      </div>` : `<p style="color:var(--text-muted);font-size:0.9em;">No relationships yet.</p>
      <button class="btn btn-small btn-success" id="add-rel-btn">+ Add Relationship</button>
      <div id="add-rel-form" style="display:none;margin-top:0.5em;padding:0.8em;border:1px solid var(--border);border-radius:var(--radius-sm);">
        <select id="rel-person" style="width:100%;margin-bottom:0.3em;padding:0.4em;border:1px solid var(--border);border-radius:3px;">${peopleOptions}</select>
        <select id="rel-type" style="width:100%;margin-bottom:0.3em;padding:0.4em;border:1px solid var(--border);border-radius:3px;">
          <option value="parent">Parent</option><option value="child">Child</option><option value="sibling">Sibling</option>
          <option value="partner">Partner</option><option value="grandparent">Grandparent</option><option value="grandchild">Grandchild</option>
          <option value="cousin">Cousin</option><option value="other">Other</option>
        </select>
        <button class="btn btn-primary btn-small" id="save-rel">Save</button>
        <button class="btn btn-small" id="cancel-rel">Cancel</button>
      </div>`;

    const mediaHtml = (p.media || []).length ? `
      <h3 style="margin-top:1em;">Media (${p.media.length})</h3>
      <div class="media-grid">${p.media.map(m => renderMediaItem(m)).join('')}</div>` : '';

    const storiesHtml = p.stories?.length ? `
      <h3 style="margin-top:1em;">Stories (${p.stories.length})</h3>
      ${p.stories.map(s => `<div class="card" data-type="story" data-id="${s.id}"><h3>${esc(s.title)}</h3>${s.story_date ? `<div class="meta">${s.story_date}</div>` : ''}</div>`).join('')}` : '';

    showModal(`
      <button class="modal-close">&times;</button>
      ${avatar}
      <h2>${esc(p.name)}</h2>
      <div class="detail-meta">${p.birth_date || ''}${p.death_date ? ' — ' + p.death_date : ''}</div>
      ${p.bio ? `<div class="detail-body">${esc(p.bio)}</div>` : ''}
      <div style="margin:0.5em 0;">
        <button class="btn btn-small" id="upload-person-photo">Upload Photo</button>
        <input type="file" id="photo-upload-input" accept="image/*" style="display:none">
      </div>
      ${relHtml}
      ${mediaHtml}
      ${storiesHtml}
      <div class="form-actions">
        <button class="btn btn-danger" id="delete-person">Delete</button>
        <button class="btn" id="edit-person-btn">Edit</button>
        <button class="btn modal-close-btn">Close</button>
      </div>
    `);

    // Relationship add
    $('#add-rel-btn')?.addEventListener('click', () => {
      $('#add-rel-form').style.display = 'block';
    });
    $('#cancel-rel')?.addEventListener('click', () => {
      $('#add-rel-form').style.display = 'none';
    });
    $('#save-rel')?.addEventListener('click', async () => {
      const personId = $('#rel-person').value;
      const type = $('#rel-type').value;
      if (!personId) return notify('Select a person', 'error');
      await api(`/people/${id}/relationships`, { method: 'POST', body: { personId, type } });
      hideModal();
      notify('Relationship added');
      loadData();
    });

    // Relationship delete
    $$('.del-rel').forEach(el => {
      el.addEventListener('click', async (e) => {
        e.stopPropagation();
        await api(`/relationships/${el.dataset.relId}`, { method: 'DELETE' });
        hideModal();
        notify('Relationship removed');
        loadData();
      });
    });

    // Photo upload
    $('#upload-person-photo')?.addEventListener('click', () => $('#photo-upload-input').click());
    $('#photo-upload-input')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const formData = new FormData();
      formData.append('file', file);
      formData.append('personId', id);
      formData.append('type', 'image');
      formData.append('caption', `Photo of ${p.name}`);
      await fetch('/api/media/upload', { method: 'POST', body: formData });

      // Set as person photo
      const fd = new FormData();
      fd.append('file', file);
      const resp = await fetch('/api/media/upload', { method: 'POST', body: fd });
      const media = await resp.json();
      await api(`/people/${id}`, { method: 'PUT', body: { photo_path: media.file_path } });

      hideModal();
      notify('Photo uploaded');
      loadData();
    });

    // Navigate related person links
    $$('.rel-link').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        hideModal();
        showDetail('person', el.dataset.id);
      });
    });

    $$('.card[data-type="story"]').forEach(el => {
      el.addEventListener('click', () => { hideModal(); showDetail('story', el.dataset.id); });
    });

    $('#delete-person')?.addEventListener('click', async () => {
      if (confirm('Delete this person? This cannot be undone.')) {
        await api(`/people/${id}`, { method: 'DELETE' });
        hideModal();
        notify('Person deleted');
        loadData();
      }
    });
    $('#edit-person-btn')?.addEventListener('click', () => showEditPerson(p));
    $('.modal-close-btn')?.addEventListener('click', hideModal);

  } else {
    // Story detail
    const s = await api(`/stories/${id}`);
    const peopleLinks = (s.people || []).map(p =>
      `<a href="#" class="rel-link" data-id="${p.id}" data-type="person">${esc(p.name)}</a>`).join(', ');

    const mediaHtml = (s.media || []).length ? `
      <h3>Media</h3>
      <div class="media-grid">${s.media.map(m => renderMediaItem(m)).join('')}</div>` : '';

    showModal(`
      <button class="modal-close">&times;</button>
      <h2>${esc(s.title)}</h2>
      <div class="detail-meta">${s.story_date || ''}${peopleLinks ? ' &middot; ' + peopleLinks : ''}</div>
      <div class="detail-body">${simpleMarkdown(s.content)}</div>
      <div style="margin:0.5em 0;">
        <button class="btn btn-small" id="upload-story-media">+ Add Photo</button>
        <input type="file" id="story-media-input" accept="image/*" style="display:none">
        <button class="btn btn-small" id="record-story-audio">&#9835; Record Audio</button>
      </div>
      <div class="tags">${(s.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
      ${mediaHtml}
      <div id="audio-recorder-container" style="display:none;"></div>
      <div class="form-actions">
        <button class="btn btn-danger" id="delete-story">Delete</button>
        <button class="btn" id="edit-story-btn">Edit</button>
        <button class="btn modal-close-btn">Close</button>
      </div>
    `);

    $$('.rel-link').forEach(el => {
      el.addEventListener('click', (e) => { e.preventDefault(); hideModal(); showDetail('person', el.dataset.id); });
    });

    // Media upload for story
    $('#upload-story-media')?.addEventListener('click', () => $('#story-media-input').click());
    $('#story-media-input')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const formData = new FormData();
      formData.append('file', file);
      formData.append('storyId', id);
      formData.append('type', 'image');
      await fetch('/api/media/upload', { method: 'POST', body: formData });
      hideModal();
      notify('Image added to story');
      loadData();
    });

    // Audio recording
    $('#record-story-audio')?.addEventListener('click', () => {
      const container = $('#audio-recorder-container');
      container.style.display = 'block';
      container.innerHTML = buildAudioRecorder(id);
      initAudioRecorder(id, container);
    });

    $('#delete-story')?.addEventListener('click', async () => {
      if (confirm('Delete this story?')) {
        await api(`/stories/${id}`, { method: 'DELETE' });
        hideModal();
        notify('Story deleted');
        loadData();
      }
    });
    $('#edit-story-btn')?.addEventListener('click', () => showEditStory(s));
    $('.modal-close-btn')?.addEventListener('click', hideModal);
  }
}

// ===== AUDIO RECORDER =====
function buildAudioRecorder(storyId) {
  return `
    <div class="audio-recorder" id="audio-recorder">
      <div class="rec-status" id="rec-status">Click to start recording</div>
      <div class="rec-time" id="rec-time">0:00</div>
      <div class="rec-wave" id="rec-wave" style="display:none;">
        <span></span><span></span><span></span><span></span><span></span><span></span><span></span>
      </div>
      <div style="margin-top:0.8em;">
        <button class="btn btn-danger" id="rec-start">&#9673; Record</button>
        <button class="btn" id="rec-stop" disabled>&#9632; Stop</button>
      </div>
      <div id="rec-result" style="margin-top:0.5em;"></div>
    </div>`;
}

function initAudioRecorder(storyId, container) {
  let mediaRecorder = null;
  let audioChunks = [];
  let startTime = null;
  let timerInterval = null;

  const startBtn = document.getElementById('rec-start');
  const stopBtn = document.getElementById('rec-stop');
  const status = document.getElementById('rec-status');
  const timeDisplay = document.getElementById('rec-time');
  const wave = document.getElementById('rec-wave');
  const result = document.getElementById('rec-result');

  startBtn.addEventListener('click', async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      audioChunks = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        clearInterval(timerInterval);
        stream.getTracks().forEach(t => t.stop());
        wave.style.display = 'none';

        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('file', blob, `recording-${Date.now()}.webm`);
        formData.append('storyId', storyId);
        formData.append('type', 'audio');
        formData.append('caption', 'Voice recording');

        result.innerHTML = '<p style="color:var(--text-muted);">Uploading...</p>';
        try {
          await fetch('/api/media/upload', { method: 'POST', body: formData });
          result.innerHTML = '<p style="color:var(--success);">Recording saved!</p>';
          setTimeout(() => { hideModal(); loadData(); }, 1000);
        } catch (e) {
          result.innerHTML = '<p style="color:var(--danger);">Upload failed.</p>';
        }
        startBtn.disabled = false;
        stopBtn.disabled = true;
        status.textContent = 'Recording saved';
      };

      mediaRecorder.start(100);
      startBtn.disabled = true;
      stopBtn.disabled = false;
      status.textContent = 'Recording...';
      wave.style.display = 'flex';
      document.getElementById('audio-recorder').classList.add('recording');
      startTime = Date.now();
      timerInterval = setInterval(() => {
        const secs = Math.floor((Date.now() - startTime) / 1000);
        timeDisplay.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
      }, 100);
    } catch (e) {
      status.textContent = 'Microphone access denied.';
      notify('Please allow microphone access to record audio.', 'error');
    }
  });

  stopBtn.addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      status.textContent = 'Processing...';
      document.getElementById('audio-recorder').classList.remove('recording');
    }
  });
}

// ===== MEDIA DETAIL =====
async function showMediaDetail(id) {
  const m = await api(`/media/${id}`);
  const detail = m.type === 'image'
    ? `<img src="/media/${m.file_path}" style="max-width:100%;border-radius:var(--radius-sm);">`
    : m.type === 'audio'
    ? `<audio controls style="width:100%;" src="/media/${m.file_path}"></audio>`
    : `<p style="color:var(--text-muted);">File: ${esc(m.original_name || m.file_path)}</p>`;

  showModal(`
    <button class="modal-close">&times;</button>
    ${detail}
    ${m.caption ? `<p style="margin-top:0.5em;color:var(--text-secondary);">${esc(m.caption)}</p>` : ''}
    <p style="font-size:0.82em;color:var(--text-muted);font-family:var(--font-ui);margin-top:0.5em;">
      ${m.original_name ? esc(m.original_name) + ' &middot; ' : ''}${m.file_size ? Math.round(m.file_size / 1024) + ' KB' : ''}
    </p>
    <div class="form-actions">
      <button class="btn btn-danger" id="delete-media">Delete</button>
      <button class="btn modal-close-btn">Close</button>
    </div>
  `);
  $('#delete-media')?.addEventListener('click', async () => {
    await api(`/media/${id}`, { method: 'DELETE' });
    hideModal();
    notify('Media deleted');
    loadData();
  });
  $('.modal-close-btn')?.addEventListener('click', hideModal);
}

// ===== ADD / EDIT FORMS =====
function showAddPerson() {
  showModal(`
    <button class="modal-close">&times;</button>
    <h2>Add Person</h2>
    <form id="person-form">
      <div class="form-group"><label>Name</label><input name="name" required /></div>
      <div class="form-group"><label>Birth Date</label><input name="birthDate" placeholder="e.g. 1945-03-12" /></div>
      <div class="form-group"><label>Death Date</label><input name="deathDate" placeholder="e.g. 2020-08-01" /></div>
      <div class="form-group"><label>Bio</label><textarea name="bio"></textarea></div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">Save</button>
        <button type="button" class="btn modal-close-btn">Cancel</button>
      </div>
    </form>
  `);
  $('#person-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    await api('/people', { method: 'POST', body });
    hideModal();
    notify('Person added');
    loadData();
  });
  $('.modal-close-btn')?.addEventListener('click', hideModal);
}

function showEditPerson(p) {
  showModal(`
    <button class="modal-close">&times;</button>
    <h2>Edit Person</h2>
    <form id="person-form">
      <div class="form-group"><label>Name</label><input name="name" value="${esc(p.name)}" required /></div>
      <div class="form-group"><label>Birth Date</label><input name="birthDate" value="${esc(p.birth_date || '')}" /></div>
      <div class="form-group"><label>Death Date</label><input name="deathDate" value="${esc(p.death_date || '')}" /></div>
      <div class="form-group"><label>Bio</label><textarea name="bio">${esc(p.bio || '')}</textarea></div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">Save</button>
        <button type="button" class="btn modal-close-btn">Cancel</button>
      </div>
    </form>
  `);
  $('#person-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    await api(`/people/${p.id}`, { method: 'PUT', body });
    hideModal();
    notify('Person updated');
    loadData();
  });
  $('.modal-close-btn')?.addEventListener('click', hideModal);
}

function showAddStory() {
  const peopleOptions = state.people.map(p =>
    `<option value="${p.id}">${esc(p.name)}</option>`).join('');

  showModal(`
    <button class="modal-close">&times;</button>
    <h2>Add Story</h2>
    <form id="story-form">
      <div class="form-group"><label>Title</label><input name="title" required /></div>
      <div class="form-group"><label>Date</label><input name="storyDate" placeholder="e.g. 1972-06-14" /></div>
      <div class="form-group"><label>People</label><select name="personIds" multiple style="min-height:80px">${peopleOptions}</select></div>
      <div class="form-group"><label>Tags (comma-separated)</label><input name="tagNames" placeholder="childhood, wedding, recipe" /></div>
      <div class="form-group"><label>Content (markdown)</label>
        <div class="editor-tabs">
          <div class="editor-tab active" data-editor-tab="write">Write</div>
          <div class="editor-tab" data-editor-tab="preview">Preview</div>
        </div>
        <div class="editor-toolbar">
          <button type="button" class="editor-btn" data-md="bold"><b>B</b></button>
          <button type="button" class="editor-btn" data-md="italic"><i>I</i></button>
          <button type="button" class="editor-btn" data-md="heading">H1</button>
          <button type="button" class="editor-btn" data-md="list">List</button>
          <button type="button" class="editor-btn" data-md="quote">Quote</button>
        </div>
        <textarea name="content" class="editor-textarea" id="story-content-editor" placeholder="Write the story..." style="border-radius:0 0 var(--radius-sm) var(--radius-sm);"></textarea>
        <div class="editor-preview" id="story-content-preview" style="display:none;"></div>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">Save</button>
        <button type="button" class="btn modal-close-btn">Cancel</button>
      </div>
    </form>
  `);
  initEditor();
  $('#story-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    const personIds = fd.getAll('personIds').filter(Boolean);
    const tagNames = body.tagNames ? body.tagNames.split(',').map(s => s.trim()).filter(Boolean) : [];
    await api('/stories', { method: 'POST', body: { ...body, personIds, tagNames } });
    hideModal();
    notify('Story added');
    loadData();
  });
  $('.modal-close-btn')?.addEventListener('click', hideModal);
}

function showEditStory(s) {
  const peopleOptions = state.people.map(p =>
    `<option value="${p.id}" ${(s.people || []).some(sp => sp.id === p.id) ? 'selected' : ''}>${esc(p.name)}</option>`).join('');

  showModal(`
    <button class="modal-close">&times;</button>
    <h2>Edit Story</h2>
    <form id="story-form">
      <div class="form-group"><label>Title</label><input name="title" value="${esc(s.title)}" required /></div>
      <div class="form-group"><label>Date</label><input name="storyDate" value="${esc(s.story_date || '')}" /></div>
      <div class="form-group"><label>People</label><select name="personIds" multiple style="min-height:80px">${peopleOptions}</select></div>
      <div class="form-group"><label>Tags (comma-separated)</label><input name="tagNames" value="${esc((s.tags || []).join(', '))}" /></div>
      <div class="form-group"><label>Content (markdown)</label>
        <div class="editor-tabs">
          <div class="editor-tab active" data-editor-tab="write">Write</div>
          <div class="editor-tab" data-editor-tab="preview">Preview</div>
        </div>
        <div class="editor-toolbar">
          <button type="button" class="editor-btn" data-md="bold"><b>B</b></button>
          <button type="button" class="editor-btn" data-md="italic"><i>I</i></button>
          <button type="button" class="editor-btn" data-md="heading">H1</button>
          <button type="button" class="editor-btn" data-md="list">List</button>
          <button type="button" class="editor-btn" data-md="quote">Quote</button>
        </div>
        <textarea name="content" class="editor-textarea" id="story-content-editor" placeholder="Write the story..." style="border-radius:0 0 var(--radius-sm) var(--radius-sm);">${esc(s.content)}</textarea>
        <div class="editor-preview" id="story-content-preview" style="display:none;"></div>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">Save</button>
        <button type="button" class="btn modal-close-btn">Cancel</button>
      </div>
    </form>
  `);
  initEditor();
  $('#story-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    const personIds = fd.getAll('personIds').filter(Boolean);
    const tagNames = body.tagNames ? body.tagNames.split(',').map(s => s.trim()).filter(Boolean) : [];
    await api(`/stories/${s.id}`, { method: 'PUT', body: { ...body, personIds, tagNames } });
    hideModal();
    notify('Story updated');
    loadData();
  });
  $('.modal-close-btn')?.addEventListener('click', hideModal);
}

// ===== MARKDOWN EDITOR =====
function initEditor() {
  const tabs = $$('.editor-tab');
  const editor = $('#story-content-editor');
  const preview = $('#story-content-preview');

  if (!editor || !preview) return;

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      if (tab.dataset.editorTab === 'preview') {
        editor.style.display = 'none';
        preview.style.display = 'block';
        preview.innerHTML = simpleMarkdown(editor.value);
      } else {
        editor.style.display = '';
        preview.style.display = 'none';
      }
    });
  });

  // Toolbar buttons
  $$('.editor-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const cmd = btn.dataset.md;
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      const text = editor.value;
      const selected = text.substring(start, end);

      let insert = '';
      let cursorOffset = 0;
      switch (cmd) {
        case 'bold': insert = `**${selected || 'bold text'}**`; cursorOffset = 2; break;
        case 'italic': insert = `*${selected || 'italic text'}*`; cursorOffset = 1; break;
        case 'heading': insert = `\n# ${selected || 'Heading'}\n`; cursorOffset = 3; break;
        case 'list': insert = `\n- ${selected || 'item'}\n`; cursorOffset = 3; break;
        case 'quote': insert = `\n> ${selected || 'quote'}\n`; cursorOffset = 2; break;
      }
      editor.focus();
      document.execCommand('insertText', false, insert);

      // Update preview if showing
      if (preview.style.display !== 'none') {
        preview.innerHTML = simpleMarkdown(editor.value);
      }
    });
  });

  // Live preview update on input
  editor.addEventListener('input', () => {
    if (preview.style.display !== 'none') {
      preview.innerHTML = simpleMarkdown(editor.value);
    }
  });
}

// ===== SIMPLE MARKDOWN =====
function simpleMarkdown(text) {
  if (!text) return '';
  const lines = text.split('\n');
  let html = '';
  let inList = false;

  for (const line of lines) {
    if (line.startsWith('# ')) { html += closeList(inList) + `<h1>${line.slice(2)}</h1>`; inList = false; }
    else if (line.startsWith('## ')) { html += closeList(inList) + `<h2>${line.slice(3)}</h2>`; inList = false; }
    else if (line.startsWith('### ')) { html += closeList(inList) + `<h3>${line.slice(4)}</h3>`; inList = false; }
    else if (line.startsWith('- ')) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${inlineMarkdown(line.slice(2))}</li>`;
    }
    else if (line.startsWith('> ')) { html += closeList(inList) + `<blockquote>${inlineMarkdown(line.slice(2))}</blockquote>`; inList = false; }
    else if (line.trim() === '') { html += closeList(inList) + '<br>'; inList = false; }
    else { html += closeList(inList) + `<p>${inlineMarkdown(line)}</p>`; inList = false; }
  }
  html += closeList(inList);
  return html;
}

function closeList(inList) {
  return inList ? '</ul>' : '';
}

function inlineMarkdown(text) {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code style="background:var(--primary-bg);padding:0.1em 0.3em;border-radius:3px;font-size:0.9em;">$1</code>');
}

// ===== ESCAPE =====
function esc(s) {
  if (!s) return '';
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

// ===== PWA INSTALL =====
let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  setTimeout(() => {
    notify('Install Cairn for offline use', 'success');
  }, 3000);
});

// ===== INIT =====
initDarkMode();
loadData();

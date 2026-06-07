const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let state = { view: 'people', people: [], stories: [], selected: null };

function api(path, opts = {}) {
  return fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  }).then(r => {
    if (r.status === 204) return null;
    if (!r.ok) throw new Error('API error');
    return r.json();
  });
}

async function loadData() {
  const [people, stories] = await Promise.all([api('/people'), api('/stories')]);
  state.people = people;
  state.stories = stories;
  render();
}

function render() {
  const app = $('#app');
  switch (state.view) {
    case 'people': app.innerHTML = renderPeople(); break;
    case 'stories': app.innerHTML = renderStories(); break;
    case 'timeline': app.innerHTML = renderTimeline(); break;
  }
  attachEvents();
}

function renderPeople() {
  const list = state.people.map(p => `
    <div class="card" data-id="${p.id}" data-type="person">
      <h3>${esc(p.name)}</h3>
      ${p.birth_date ? `<div class="meta">${p.birth_date}${p.death_date ? ' — ' + p.death_date : ''}</div>` : ''}
      ${p.bio ? `<div class="preview">${esc(p.bio.substring(0, 150))}${p.bio.length > 150 ? '...' : ''}</div>` : ''}
    </div>`).join('');

  return `
    <div class="search-bar">
      <input type="text" id="search-input" placeholder="Search people..." />
      <button class="btn btn-primary" id="add-person">+ Add Person</button>
    </div>
    <div id="people-list">${list || '<div class="card empty">No people yet. Add your first person.</div>'}</div>`;
}

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
      <button class="btn btn-primary" id="add-story">+ Add Story</button>
    </div>
    <div id="stories-list">${list || '<div class="card empty">No stories yet. Start writing.</div>'}</div>`;
}

function renderTimeline() {
  const items = [];
  for (const p of state.people) {
    if (p.birth_date) items.push({ date: p.birth_date, title: `${p.name} was born`, type: 'person', id: p.id });
    if (p.death_date) items.push({ date: p.death_date, title: `${p.name} passed away`, type: 'person', id: p.id });
  }
  for (const s of state.stories) {
    if (s.story_date) items.push({ date: s.story_date, title: s.title, type: 'story', id: s.id });
  }
  items.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  const list = items.map(i => `
    <div class="timeline-item" data-id="${i.id}" data-type="${i.type}">
      <div class="timeline-date">${i.date}</div>
      <div class="timeline-title">${esc(i.title)}</div>
    </div>`).join('');

  return `<div id="timeline-list">${list || '<div class="card empty">No dated events yet.</div>'}</div>`;
}

function attachEvents() {
  $$('.card').forEach(el => {
    el.addEventListener('click', () => showDetail(el.dataset.type, el.dataset.id));
  });
  $$('.timeline-item').forEach(el => {
    el.addEventListener('click', () => showDetail(el.dataset.type, el.dataset.id));
  });

  const addPerson = $('#add-person');
  if (addPerson) addPerson.addEventListener('click', showAddPerson);

  const addStory = $('#add-story');
  if (addStory) addStory.addEventListener('click', showAddStory);

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

async function searchQuery(q) {
  if (!q.trim()) return loadData();
  const results = await api(`/search?q=${encodeURIComponent(q)}`);
  if (state.view === 'people') {
    $('#people-list').innerHTML = results.people.map(p => `
      <div class="card" data-id="${p.id}" data-type="person">
        <h3>${esc(p.name)}</h3>
        ${p.birth_date ? `<div class="meta">${p.birth_date}${p.death_date ? ' — ' + p.death_date : ''}</div>` : ''}
      </div>`).join('') || '<div class="card empty">No results.</div>';
    $$('.card').forEach(el => el.addEventListener('click', () => showDetail('person', el.dataset.id)));
  } else {
    $('#stories-list').innerHTML = results.stories.map(s => `
      <div class="card" data-id="${s.id}" data-type="story">
        <h3>${esc(s.title)}</h3>
        ${s.story_date ? `<div class="meta">${s.story_date}</div>` : ''}
      </div>`).join('') || '<div class="card empty">No results.</div>';
    $$('.card').forEach(el => el.addEventListener('click', () => showDetail('story', el.dataset.id)));
  }
}

function showModal(html) {
  const modal = $('#modal');
  $('#modal-content').innerHTML = html;
  modal.classList.remove('hidden');
  $('.modal-backdrop').addEventListener('click', hideModal);
  $('.modal-close')?.addEventListener('click', hideModal);
}

function hideModal() {
  $('#modal').classList.add('hidden');
}

async function showDetail(type, id) {
  if (type === 'person') {
    const p = await api(`/people/${id}`);
    const formHtml = `
      <h2>${esc(p.name)}</h2>
      <div class="detail-meta">${p.birth_date || ''}${p.death_date ? ' — ' + p.death_date : ''}</div>
      ${p.bio ? `<div class="detail-body">${esc(p.bio)}</div>` : ''}
      ${p.relationships?.length ? `
        <h3>Relationships</h3>
        <ul class="relationship-list">
          ${p.relationships.map(r => `<li>${esc(r.related_person_name)} (${r.type})</li>`).join('')}
        </ul>` : ''}
      ${p.stories?.length ? `
        <h3>Stories</h3>
        ${p.stories.map(s => `<div class="card" data-type="story" data-id="${s.id}" style="cursor:pointer"><h3>${esc(s.title)}</h3></div>`).join('')}
        ` : ''}
      <div class="form-actions">
        <button class="btn btn-danger" id="delete-person">Delete</button>
        <button class="btn" id="edit-person-btn">Edit</button>
        <button class="btn modal-close-btn">Close</button>
      </div>`;
    showModal(formHtml);
    $('#delete-person')?.addEventListener('click', async () => {
      if (confirm('Delete this person? This cannot be undone.')) {
        await api(`/people/${id}`, { method: 'DELETE' });
        hideModal();
        loadData();
      }
    });
    $('#edit-person-btn')?.addEventListener('click', () => showEditPerson(p));
    $('.modal-close-btn')?.addEventListener('click', hideModal);
    $$('.card[data-type="story"]').forEach(el => {
      el.addEventListener('click', () => { hideModal(); showDetail('story', el.dataset.id); });
    });
  } else {
    const s = await api(`/stories/${id}`);
    const formHtml = `
      <h2>${esc(s.title)}</h2>
      <div class="detail-meta">${s.story_date || ''}${s.people?.length ? ' &middot; ' + s.people.map(p => esc(p.name)).join(', ') : ''}</div>
      <div class="detail-body">${marked(s.content)}</div>
      <div class="tags">${(s.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
      <div class="form-actions">
        <button class="btn btn-danger" id="delete-story">Delete</button>
        <button class="btn" id="edit-story-btn">Edit</button>
        <button class="btn modal-close-btn">Close</button>
      </div>`;
    showModal(formHtml);
    $('#delete-story')?.addEventListener('click', async () => {
      if (confirm('Delete this story?')) {
        await api(`/stories/${id}`, { method: 'DELETE' });
        hideModal();
        loadData();
      }
    });
    $('#edit-story-btn')?.addEventListener('click', () => showEditStory(s));
    $('.modal-close-btn')?.addEventListener('click', hideModal);
  }
}

function showAddPerson() {
  showModal(`
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
    loadData();
  });
  $('.modal-close-btn')?.addEventListener('click', hideModal);
}

function showEditPerson(p) {
  showModal(`
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
    loadData();
  });
  $('.modal-close-btn')?.addEventListener('click', hideModal);
}

function showAddStory() {
  const peopleOptions = state.people.map(p =>
    `<option value="${p.id}">${esc(p.name)}</option>`).join('');

  showModal(`
    <h2>Add Story</h2>
    <form id="story-form">
      <div class="form-group"><label>Title</label><input name="title" required /></div>
      <div class="form-group"><label>Date</label><input name="storyDate" placeholder="e.g. 1972-06-14" /></div>
      <div class="form-group"><label>People</label><select name="personIds" multiple style="min-height:80px">${peopleOptions}</select></div>
      <div class="form-group"><label>Tags (comma-separated)</label><input name="tagNames" placeholder="childhood, wedding, recipe" /></div>
      <div class="form-group"><label>Content (markdown)</label><textarea name="content" placeholder="Write the story..."></textarea></div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">Save</button>
        <button type="button" class="btn modal-close-btn">Cancel</button>
      </div>
    </form>
  `);
  $('#story-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    const personIds = fd.getAll('personIds').filter(Boolean);
    const tagNames = body.tagNames ? body.tagNames.split(',').map(s => s.trim()).filter(Boolean) : [];
    await api('/stories', { method: 'POST', body: { ...body, personIds, tagNames } });
    hideModal();
    loadData();
  });
  $('.modal-close-btn')?.addEventListener('click', hideModal);
}

function showEditStory(s) {
  const peopleOptions = state.people.map(p =>
    `<option value="${p.id}" ${(s.people || []).some(sp => sp.id === p.id) ? 'selected' : ''}>${esc(p.name)}</option>`).join('');

  showModal(`
    <h2>Edit Story</h2>
    <form id="story-form">
      <div class="form-group"><label>Title</label><input name="title" value="${esc(s.title)}" required /></div>
      <div class="form-group"><label>Date</label><input name="storyDate" value="${esc(s.story_date || '')}" /></div>
      <div class="form-group"><label>People</label><select name="personIds" multiple style="min-height:80px">${peopleOptions}</select></div>
      <div class="form-group"><label>Tags (comma-separated)</label><input name="tagNames" value="${esc((s.tags || []).join(', '))}" /></div>
      <div class="form-group"><label>Content (markdown)</label><textarea name="content">${esc(s.content)}</textarea></div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">Save</button>
        <button type="button" class="btn modal-close-btn">Cancel</button>
      </div>
    </form>
  `);
  $('#story-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    const personIds = fd.getAll('personIds').filter(Boolean);
    const tagNames = body.tagNames ? body.tagNames.split(',').map(s => s.trim()).filter(Boolean) : [];
    await api(`/stories/${s.id}`, { method: 'PUT', body: { ...body, personIds, tagNames } });
    hideModal();
    loadData();
  });
  $('.modal-close-btn')?.addEventListener('click', hideModal);
}

function esc(s) {
  if (!s) return '';
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function marked(text) {
  if (!text) return '';
  return text
    .split('\n')
    .map(line => {
      if (line.startsWith('# ')) return `<h1>${line.slice(2)}</h1>`;
      if (line.startsWith('## ')) return `<h2>${line.slice(3)}</h2>`;
      if (line.startsWith('### ')) return `<h3>${line.slice(4)}</h3>`;
      if (line.startsWith('**') && line.endsWith('**')) return `<strong>${line.slice(2, -2)}</strong>`;
      if (line.startsWith('*') && line.endsWith('*')) return `<em>${line.slice(1, -1)}</em>`;
      if (line.startsWith('- ')) return `<li>${line.slice(2)}</li>`;
      if (line.startsWith('> ')) return `<blockquote>${line.slice(2)}</blockquote>`;
      if (line === '') return '<br>';
      return `<p>${line}</p>`;
    })
    .join('\n');
}

loadData();

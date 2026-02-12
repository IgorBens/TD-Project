// ===== Configuration =====
const WEBHOOK_BASE = 'http://46.225.76.46:5678/webhook';
const WEBHOOK_SAVE = WEBHOOK_BASE + '/thermoduct-admin';
const WEBHOOK_SEARCH = WEBHOOK_BASE + '/thermoduct-search';
const WEBHOOK_LOAD = WEBHOOK_BASE + '/thermoduct-load';

// Odoo stage names (must match Odoo project stages)
const STAGES = {
    BLOKKEN: 'Blokken',
    VERDIEPEN: 'Verdiepen',
    COLLECTOREN: 'Collectoren',
    KRINGEN: 'Kringen'
};

// ===== State =====
let gebouwCounter = 0;
let rollen = [];
let rolCounter = 0;
let selectedProject = null; // { id, naam, adres }
let searchTimeout = null;

// ===== DOM references =====
const gebouwenContainer = document.getElementById('blokkenContainer');
const btnAddGebouw = document.getElementById('btnAddBlok');
const btnOpslaan = document.getElementById('btnOpslaan');
const btnLaden = document.getElementById('btnLaden');
const statusMsg = document.getElementById('statusMsg');
const projectZoekInput = document.getElementById('projectZoek');
const projectDropdown = document.getElementById('projectDropdown');
const projectSelectedEl = document.getElementById('projectSelected');
const projectSelectedNaam = document.getElementById('projectSelectedNaam');
const projectSelectedAdres = document.getElementById('projectSelectedAdres');
const projectOdooIdInput = document.getElementById('projectOdooId');

// ===== Tab switching =====
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('tab-' + tab.dataset.tab).classList.add('active');

        if (tab.dataset.tab === 'rolverdeling') {
            renderRolverdeling();
        }
    });
});

// ===== Event listeners =====
btnAddGebouw.addEventListener('click', () => addGebouw());
btnOpslaan.addEventListener('click', () => opslaan());
btnLaden.addEventListener('click', () => ladenUitOdoo());
document.getElementById('btnAddRol').addEventListener('click', () => addRol());

// ===== Project search =====
projectZoekInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const q = projectZoekInput.value.trim();
    if (q.length < 2) {
        projectDropdown.classList.add('hidden');
        return;
    }
    searchTimeout = setTimeout(() => searchProjects(q), 300);
});

projectZoekInput.addEventListener('blur', () => {
    setTimeout(() => projectDropdown.classList.add('hidden'), 200);
});

async function searchProjects(query) {
    try {
        const res = await fetch(`${WEBHOOK_SEARCH}?q=${encodeURIComponent(query)}`);
        if (!res.ok) throw new Error('Zoeken mislukt');
        const projects = await res.json();

        if (!Array.isArray(projects) || projects.length === 0) {
            projectDropdown.innerHTML = '<div class="dropdown-item dropdown-empty">Geen projecten gevonden</div>';
        } else {
            projectDropdown.innerHTML = projects.map(p => `
                <div class="dropdown-item" onmousedown="selectProject(${p.id}, '${escapeHtml(p.naam)}', '${escapeHtml(p.adres || '')}')">
                    <strong>${escapeHtml(p.naam)}</strong>
                    ${p.adres ? `<span class="dropdown-adres">${escapeHtml(p.adres)}</span>` : ''}
                </div>
            `).join('');
        }
        projectDropdown.classList.remove('hidden');
    } catch (err) {
        console.error('Search error:', err);
        projectDropdown.innerHTML = '<div class="dropdown-item dropdown-empty">Fout bij zoeken</div>';
        projectDropdown.classList.remove('hidden');
    }
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function selectProject(id, naam, adres) {
    selectedProject = { id, naam, adres };
    projectOdooIdInput.value = id;
    projectSelectedNaam.textContent = naam;
    projectSelectedAdres.textContent = adres || '';
    projectSelectedEl.classList.remove('hidden');
    projectZoekInput.value = '';
    projectZoekInput.classList.add('hidden');
    projectDropdown.classList.add('hidden');
    btnLaden.disabled = false;
}

function clearProject() {
    selectedProject = null;
    projectOdooIdInput.value = '';
    projectSelectedEl.classList.add('hidden');
    projectZoekInput.value = '';
    projectZoekInput.classList.remove('hidden');
    btnLaden.disabled = true;
}

// ===== Utility: unique IDs =====
let _id = 0;
function uid() { return 'n' + (++_id); }

// ===== Accordion toggle =====
function toggleCard(headerEl) {
    const body = headerEl.nextElementSibling;
    const chevron = headerEl.querySelector('.chevron');
    body.classList.toggle('open');
    chevron.classList.toggle('open');
}

// ===== Remove item =====
function removeItem(btn) {
    const card = btn.closest('.card');
    card.remove();
}

// ===== Create card wrapper =====
function createCard(level, badgeText, titleText, odooId) {
    const card = document.createElement('div');
    card.className = `card level-${level}`;
    card.dataset.level = level;
    if (odooId) card.dataset.odooId = odooId;

    const id = uid();

    card.innerHTML = `
        <div class="card-header" onclick="toggleCard(this)">
            <span class="title">
                <span class="badge badge-${level}">${badgeText}</span>
                <span class="card-title-text">${titleText}</span>
                ${odooId ? '<span class="odoo-linked" title="Gekoppeld aan Odoo">&#x1f517;</span>' : ''}
            </span>
            <div class="card-actions">
                <button type="button" class="btn btn-remove" onclick="event.stopPropagation(); removeItem(this);" title="Verwijderen">&#x2715;</button>
                <span class="chevron open">&#9654;</span>
            </div>
        </div>
        <div class="card-body open" id="body-${id}">
        </div>
    `;

    return { card, bodyId: `body-${id}` };
}

// ===== Dynamic title update =====
function bindTitleUpdate(input, card, prefix) {
    input.addEventListener('input', () => {
        const titleSpan = card.querySelector('.card-title-text');
        titleSpan.textContent = input.value ? `${prefix} ${input.value}` : prefix;
    });
}

// ===== Format verdiep nummer as +00, +01, etc. =====
function formatVerdiep(num) {
    const n = parseInt(num);
    if (isNaN(n)) return '+00';
    const sign = n < 0 ? '-' : '+';
    return sign + String(Math.abs(n)).padStart(2, '0');
}

// ===== Add Gebouw =====
function addGebouw(data) {
    gebouwCounter++;
    const odooId = data?.odoo_id || null;
    const { card, bodyId } = createCard('blok', 'Gebouw', data?.naam ? `Gebouw ${data.naam}` : `Gebouw ${gebouwCounter}`, odooId);

    const body = card.querySelector(`#${bodyId}`);
    body.innerHTML = `
        <div class="field-row cols-1">
            <div>
                <label>Naam</label>
                <input type="text" class="blok-naam" placeholder="bijv. Blok A, Woning 1, Villa ..." value="${escapeHtml(data?.naam || '')}">
            </div>
        </div>
        <div class="children-container" data-children="verdiepen"></div>
        <button type="button" class="btn btn-add btn-add-child" onclick="addVerdiep(this)">+ Verdiep</button>
    `;

    const naamInput = body.querySelector('.blok-naam');
    bindTitleUpdate(naamInput, card, 'Gebouw');

    gebouwenContainer.appendChild(card);

    // Load child verdiepen if provided
    if (data?.verdiepen) {
        const verdiepBtn = body.querySelector('.btn-add-child');
        data.verdiepen.forEach(v => addVerdiep(verdiepBtn, v));
    }

    return card;
}

// ===== Add Verdiep =====
function addVerdiep(btn, data) {
    const container = btn.previousElementSibling;
    const count = container.children.length;
    const numVal = data?.nummer ?? count;
    const numInt = typeof numVal === 'string' ? parseInt(numVal) : numVal;

    const odooId = data?.odoo_id || null;
    const verdiepLabel = formatVerdiep(numInt);
    const { card, bodyId } = createCard('verdiep', 'Verdiep', `Verdieping ${verdiepLabel}`, odooId);
    const body = card.querySelector(`#${bodyId}`);

    body.innerHTML = `
        <div class="field-row cols-2">
            <div>
                <label>Verdieping</label>
                <input type="number" class="verdiep-nummer" placeholder="bijv. 0" min="-5" value="${numInt}">
            </div>
            <div></div>
        </div>
        <div class="children-container" data-children="collectoren"></div>
        <button type="button" class="btn btn-add btn-add-child" onclick="addCollector(this)">+ Collector</button>
    `;

    const nummerInput = body.querySelector('.verdiep-nummer');
    nummerInput.addEventListener('input', () => {
        const titleSpan = card.querySelector('.card-title-text');
        titleSpan.textContent = `Verdieping ${formatVerdiep(nummerInput.value)}`;
    });

    container.appendChild(card);

    // Load child collectoren if provided
    if (data?.collectoren) {
        const colBtn = body.querySelector('.btn-add-child');
        data.collectoren.forEach(c => addCollector(colBtn, c));
    }

    return card;
}

// ===== Add Collector =====
function addCollector(btn, data) {
    const container = btn.previousElementSibling;
    const count = container.children.length + 1;
    const numVal = data?.nummer ?? count;

    const odooId = data?.odoo_id || null;
    const naamVal = data?.naam || '';
    const titleText = naamVal ? `Collector ${numVal} — ${naamVal}` : `Collector ${numVal}`;
    const { card, bodyId } = createCard('collector', 'Collector', titleText, odooId);
    const body = card.querySelector(`#${bodyId}`);

    const drukVal = data?.druk ?? 4;
    const aantalVal = data?.aantalKringen ?? data?.kringen?.length ?? 0;

    body.innerHTML = `
        <div class="field-row cols-4">
            <div>
                <label>Nummer</label>
                <input type="number" class="collector-nummer" placeholder="bijv. 1" min="1" value="${numVal}">
            </div>
            <div>
                <label>Naam</label>
                <input type="text" class="collector-naam" placeholder="bijv. App. 3.1" value="${escapeHtml(naamVal)}">
            </div>
            <div>
                <label>Druk (bar)</label>
                <select class="collector-druk">
                    <option value="4" ${drukVal == 4 ? 'selected' : ''}>4 bar</option>
                    <option value="6" ${drukVal == 6 ? 'selected' : ''}>6 bar</option>
                </select>
            </div>
            <div>
                <label>Aantal kringen</label>
                <input type="number" class="collector-aantal-kringen" placeholder="bijv. 5" min="0" value="${aantalVal}">
            </div>
        </div>
        <div class="children-container" data-children="kringen"></div>
    `;

    const nummerInput = body.querySelector('.collector-nummer');
    const naamInput = body.querySelector('.collector-naam');
    const updateTitle = () => {
        const titleSpan = card.querySelector('.card-title-text');
        const nr = nummerInput.value || '';
        const nm = naamInput.value || '';
        titleSpan.textContent = nm ? `Collector ${nr} — ${nm}` : `Collector ${nr}`;
    };
    nummerInput.addEventListener('input', updateTitle);
    naamInput.addEventListener('input', updateTitle);

    const aantalInput = body.querySelector('.collector-aantal-kringen');
    aantalInput.addEventListener('change', () => {
        syncKringen(body);
    });

    container.appendChild(card);

    // Load child kringen if provided
    if (data?.kringen && data.kringen.length > 0) {
        const kringenContainer = body.querySelector('.children-container[data-children="kringen"]');
        data.kringen.forEach(k => addKringToContainer(kringenContainer, k.nummer || 0, k));
    }

    return card;
}

// ===== Sync kringen based on aantal =====
function syncKringen(collectorBody) {
    const aantalInput = collectorBody.querySelector('.collector-aantal-kringen');
    const kringenContainer = collectorBody.querySelector('.children-container[data-children="kringen"]');
    const desired = parseInt(aantalInput.value) || 0;
    const current = kringenContainer.children.length;

    if (desired > current) {
        for (let i = current + 1; i <= desired; i++) {
            addKringToContainer(kringenContainer, i);
        }
    } else if (desired < current) {
        while (kringenContainer.children.length > desired) {
            kringenContainer.lastChild.remove();
        }
    }
}

// ===== Add Kring to container =====
function addKringToContainer(container, num, data) {
    const odooId = data?.odoo_id || null;
    const { card, bodyId } = createCard('kring', 'Kring', `Kring ${num}`, odooId);
    const body = card.querySelector(`#${bodyId}`);

    const legVal = data?.legpatroon || '';
    const lengteVal = data?.lengte || '';
    const m2Val = data?.m2 || '';

    body.innerHTML = `
        <div class="field-row cols-4">
            <div>
                <label>Nummer</label>
                <input type="number" class="kring-nummer" placeholder="bijv. 1" min="1" value="${num}">
            </div>
            <div>
                <label>Legpatroon</label>
                <select class="kring-legpatroon">
                    <option value="" ${legVal === '' ? 'selected' : ''}>-- Kies --</option>
                    <option value="7.5" ${legVal === '7.5' ? 'selected' : ''}>7.5</option>
                    <option value="10" ${legVal === '10' ? 'selected' : ''}>10</option>
                    <option value="15" ${legVal === '15' ? 'selected' : ''}>15</option>
                    <option value="20" ${legVal === '20' ? 'selected' : ''}>20</option>
                    <option value="25" ${legVal === '25' ? 'selected' : ''}>25</option>
                    <option value="30" ${legVal === '30' ? 'selected' : ''}>30</option>
                    <option value="andere" ${legVal === 'andere' ? 'selected' : ''}>Andere</option>
                </select>
            </div>
            <div>
                <label>Lengte (m)</label>
                <input type="number" class="kring-lengte" placeholder="bijv. 80" step="any" min="0" value="${lengteVal}">
            </div>
            <div>
                <label>m&sup2;</label>
                <input type="number" class="kring-m2" placeholder="bijv. 25" step="any" min="0" value="${m2Val}">
            </div>
        </div>
    `;

    const nummerInput = body.querySelector('.kring-nummer');
    nummerInput.addEventListener('input', () => {
        const titleSpan = card.querySelector('.card-title-text');
        titleSpan.textContent = nummerInput.value ? `Kring ${nummerInput.value}` : 'Kring';
    });

    container.appendChild(card);
    return card;
}

// ===== Collect data with Odoo IDs =====
function collectData() {
    const projectId = selectedProject?.id || null;
    const projectNaam = selectedProject?.naam || '';

    const gebouwen = [];
    const gebouwCards = gebouwenContainer.querySelectorAll(':scope > .card.level-blok');

    gebouwCards.forEach(gebouwCard => {
        const body = gebouwCard.querySelector('.card-body');
        const gebouw = {
            odoo_id: gebouwCard.dataset.odooId || null,
            stage: STAGES.BLOKKEN,
            naam: body.querySelector('.blok-naam').value.trim(),
            verdiepen: []
        };

        const verdiepCards = body.querySelectorAll(':scope > .children-container > .card.level-verdiep');
        verdiepCards.forEach(vCard => {
            const vBody = vCard.querySelector('.card-body');
            const verdiep = {
                odoo_id: vCard.dataset.odooId || null,
                stage: STAGES.VERDIEPEN,
                nummer: formatVerdiep(vBody.querySelector('.verdiep-nummer').value),
                collectoren: []
            };

            const collectorCards = vBody.querySelectorAll(':scope > .children-container > .card.level-collector');
            collectorCards.forEach(cCard => {
                const cBody = cCard.querySelector('.card-body');
                const collector = {
                    odoo_id: cCard.dataset.odooId || null,
                    stage: STAGES.COLLECTOREN,
                    nummer: parseInt(cBody.querySelector('.collector-nummer').value) || 0,
                    naam: cBody.querySelector('.collector-naam').value.trim(),
                    druk: parseFloat(cBody.querySelector('.collector-druk').value),
                    aantalKringen: parseInt(cBody.querySelector('.collector-aantal-kringen').value) || 0,
                    kringen: []
                };

                const kringCards = cBody.querySelectorAll(':scope > .children-container > .card.level-kring');
                kringCards.forEach(kCard => {
                    const kBody = kCard.querySelector('.card-body');
                    collector.kringen.push({
                        odoo_id: kCard.dataset.odooId || null,
                        stage: STAGES.KRINGEN,
                        nummer: parseInt(kBody.querySelector('.kring-nummer').value) || 0,
                        legpatroon: kBody.querySelector('.kring-legpatroon').value,
                        lengte: parseFloat(kBody.querySelector('.kring-lengte').value) || 0,
                        m2: parseFloat(kBody.querySelector('.kring-m2').value) || 0
                    });
                });

                verdiep.collectoren.push(collector);
            });

            gebouw.verdiepen.push(verdiep);
        });

        gebouwen.push(gebouw);
    });

    return {
        project_id: projectId,
        project_naam: projectNaam,
        gebouwen
    };
}

// ===== Validation =====
function validate(data) {
    if (!data.project_id) return 'Selecteer eerst een project uit Odoo.';
    if (data.gebouwen.length === 0) return 'Voeg minstens één gebouw toe.';
    for (const gebouw of data.gebouwen) {
        if (!gebouw.naam) return 'Elk gebouw moet een naam hebben.';
    }
    return null;
}

// ===== Show status =====
function showStatus(message, type) {
    statusMsg.textContent = message;
    statusMsg.className = `status-msg ${type}`;
    setTimeout(() => {
        statusMsg.className = 'status-msg hidden';
    }, 5000);
}

// ===== Save to Odoo =====
async function opslaan() {
    const data = collectData();
    const error = validate(data);

    if (error) {
        showStatus(error, 'error');
        return;
    }

    btnOpslaan.disabled = true;
    btnOpslaan.textContent = 'Verzenden...';

    try {
        const response = await fetch(WEBHOOK_SAVE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'save',
                ...data
            })
        });

        if (!response.ok) {
            throw new Error(`Server antwoordde met status ${response.status}`);
        }

        // Response may contain created/updated odoo_ids
        const result = await response.json().catch(() => null);
        if (result?.gebouwen) {
            updateOdooIds(result.gebouwen);
        }

        showStatus('Data succesvol opgeslagen in Odoo!', 'success');
    } catch (err) {
        showStatus(`Fout bij opslaan: ${err.message}`, 'error');
        console.error('Save error:', err);
    } finally {
        btnOpslaan.disabled = false;
        btnOpslaan.textContent = 'Opslaan naar Odoo';
    }
}

// ===== Update Odoo IDs after save =====
function updateOdooIds(gebouwenData) {
    const gebouwCards = gebouwenContainer.querySelectorAll(':scope > .card.level-blok');
    gebouwenData.forEach((gData, gIdx) => {
        const gCard = gebouwCards[gIdx];
        if (!gCard || !gData) return;
        if (gData.odoo_id) gCard.dataset.odooId = gData.odoo_id;

        const verdiepCards = gCard.querySelectorAll(':scope .children-container > .card.level-verdiep');
        (gData.verdiepen || []).forEach((vData, vIdx) => {
            const vCard = verdiepCards[vIdx];
            if (!vCard || !vData) return;
            if (vData.odoo_id) vCard.dataset.odooId = vData.odoo_id;

            const colCards = vCard.querySelectorAll(':scope .children-container > .card.level-collector');
            (vData.collectoren || []).forEach((cData, cIdx) => {
                const cCard = colCards[cIdx];
                if (!cCard || !cData) return;
                if (cData.odoo_id) cCard.dataset.odooId = cData.odoo_id;

                const kCards = cCard.querySelectorAll(':scope .children-container > .card.level-kring');
                (cData.kringen || []).forEach((kData, kIdx) => {
                    const kCard = kCards[kIdx];
                    if (!kCard || !kData) return;
                    if (kData.odoo_id) kCard.dataset.odooId = kData.odoo_id;
                });
            });
        });
    });
}

// ===== Load from Odoo =====
async function ladenUitOdoo() {
    if (!selectedProject?.id) return;

    btnLaden.disabled = true;
    btnLaden.textContent = 'Laden...';

    try {
        const res = await fetch(`${WEBHOOK_LOAD}?project_id=${selectedProject.id}`);
        if (!res.ok) throw new Error(`Server antwoordde met status ${res.status}`);

        const data = await res.json();

        // Clear current form
        gebouwenContainer.innerHTML = '';
        gebouwCounter = 0;

        // Load gebouwen from Odoo response
        if (data.gebouwen && Array.isArray(data.gebouwen)) {
            data.gebouwen.forEach(g => addGebouw(g));
        }

        showStatus(`Project "${selectedProject.naam}" geladen uit Odoo.`, 'success');
    } catch (err) {
        showStatus(`Fout bij laden: ${err.message}`, 'error');
        console.error('Load error:', err);
    } finally {
        btnLaden.disabled = false;
        btnLaden.textContent = 'Laden uit Odoo';
    }
}

// =============================================
// ===== ROLVERDELING TAB =====
// =============================================

const rolKleuren = {
    600: '#e63946',
    240: '#457b9d',
    200: '#2a9d8f',
    120: '#e9c46a',
    100: '#f4a261'
};

function addRol() {
    const grootte = parseInt(document.getElementById('rvRolGrootte').value);
    const aantal = parseInt(document.getElementById('rvRolAantal').value) || 1;

    for (let i = 0; i < aantal; i++) {
        rolCounter++;
        rollen.push({ id: 'rol_' + rolCounter, grootte, restant: grootte, toewijzingen: [] });
    }

    renderRolverdeling();
}

function removeRol(rolId) {
    rollen = rollen.filter(r => r.id !== rolId);
    renderRolverdeling();
}

function flattenCollectoren() {
    const data = collectData();
    const result = [];

    data.gebouwen.forEach(gebouw => {
        gebouw.verdiepen.forEach(verdiep => {
            verdiep.collectoren.forEach(collector => {
                result.push({
                    label: collector.naam || `Collector ${collector.nummer}`,
                    gebouw: gebouw.naam,
                    verdiep: verdiep.nummer,
                    nummer: collector.nummer,
                    druk: collector.druk,
                    kringen: collector.kringen.map(k => ({
                        code: `${collector.nummer}.${k.nummer}`,
                        nummer: k.nummer,
                        lengte: k.lengte,
                        legpatroon: k.legpatroon,
                        m2: k.m2
                    }))
                });
            });
        });
    });

    return result;
}

function assignRolToKring(rolId, collectorIdx, kringIdx) {
    const collectoren = flattenCollectoren();
    const kring = collectoren[collectorIdx]?.kringen[kringIdx];
    if (!kring) return;

    // Remove any existing assignment for this kring from all rollen
    const kringCode = kring.code;
    rollen.forEach(r => {
        const existingIdx = r.toewijzingen.findIndex(t => t.code === kringCode);
        if (existingIdx !== -1) {
            r.restant += r.toewijzingen[existingIdx].lengte;
            r.toewijzingen.splice(existingIdx, 1);
        }
    });

    // Assign to new rol
    if (rolId !== 'none') {
        const rol = rollen.find(r => r.id === rolId);
        if (rol) {
            rol.restant -= kring.lengte;
            rol.toewijzingen.push({ code: kringCode, lengte: kring.lengte });
        }
    }

    renderRolverdeling();
}

function getAssignedRol(kringCode) {
    for (const rol of rollen) {
        if (rol.toewijzingen.find(t => t.code === kringCode)) {
            return rol;
        }
    }
    return null;
}

function renderRolverdeling() {
    const collectoren = flattenCollectoren();

    // Render rollen lijst
    const rollenLijst = document.getElementById('rvRollenLijst');
    if (rollen.length === 0) {
        rollenLijst.innerHTML = '<p class="rv-empty">Nog geen rollen toegevoegd.</p>';
    } else {
        rollenLijst.innerHTML = rollen.map(rol => {
            const kleur = rolKleuren[rol.grootte] || '#868e96';
            const gebruikt = rol.grootte - rol.restant;
            const pct = (gebruikt / rol.grootte) * 100;
            return `
                <div class="rv-rol-item">
                    <div class="rv-rol-info">
                        <span class="rv-rol-badge" style="background:${kleur}">${rol.grootte}m</span>
                        <span class="rv-rol-detail">${gebruikt}m gebruikt / ${rol.restant}m rest</span>
                    </div>
                    <div class="rv-rol-bar">
                        <div class="rv-rol-bar-fill" style="width:${pct}%;background:${kleur}"></div>
                    </div>
                    <button type="button" class="btn btn-remove" onclick="removeRol('${rol.id}')" title="Verwijderen">&#x2715;</button>
                </div>
            `;
        }).join('');
    }

    // Render collectoren overzicht
    const overzicht = document.getElementById('rvCollectorenOverzicht');
    if (collectoren.length === 0) {
        overzicht.innerHTML = '<p class="rv-empty">Geen collectoren gevonden. Vul eerst de invoer tab in.</p>';
    } else {
        overzicht.innerHTML = collectoren.map((col, cIdx) => {
            const totaalLengte = col.kringen.reduce((s, k) => s + k.lengte, 0);
            return `
                <div class="rv-collector-card">
                    <div class="rv-collector-header">
                        <div>
                            <span class="badge badge-collector">Collector ${col.nummer}</span>
                            <strong>${col.label}</strong>
                            <span class="rv-collector-meta">${col.gebouw} &middot; ${col.verdiep} &middot; ${col.druk} bar</span>
                        </div>
                        <span class="rv-collector-totaal">${totaalLengte} m totaal</span>
                    </div>
                    <table class="rv-kringen-tabel">
                        <thead>
                            <tr>
                                <th>Nr</th>
                                <th>Legpatroon</th>
                                <th>Lengte (m)</th>
                                <th>m&sup2;</th>
                                <th>Rol toewijzing</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${col.kringen.map((k, kIdx) => {
                                const assignedRol = getAssignedRol(k.code);
                                const assignedKleur = assignedRol ? (rolKleuren[assignedRol.grootte] || '#868e96') : 'transparent';
                                return `
                                    <tr>
                                        <td><strong>${k.code}</strong></td>
                                        <td>${k.legpatroon || '-'}</td>
                                        <td>${k.lengte || '-'}</td>
                                        <td>${k.m2 || '-'}</td>
                                        <td>
                                            <div class="rv-assign-cell">
                                                ${assignedRol ? `<span class="rv-assign-dot" style="background:${assignedKleur}"></span>` : ''}
                                                <select onchange="assignRolToKring(this.value, ${cIdx}, ${kIdx})">
                                                    <option value="none">-- Geen --</option>
                                                    ${rollen.map(r => {
                                                        const sel = assignedRol && assignedRol.id === r.id ? 'selected' : '';
                                                        return `<option value="${r.id}" ${sel}>${r.grootte}m (rest: ${r.restant}m)</option>`;
                                                    }).join('')}
                                                </select>
                                            </div>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }).join('');
    }

    renderStats(collectoren);
}

function renderStats(collectoren) {
    const statsEl = document.getElementById('rvStats');

    const totaalCollectoren = collectoren.length;
    const totaalKringen = collectoren.reduce((s, c) => s + c.kringen.length, 0);
    const totaalMBuisKringen = collectoren.reduce((s, c) => s + c.kringen.reduce((s2, k) => s2 + k.lengte, 0), 0);
    const totaalMBuisRollen = rollen.reduce((s, r) => s + r.grootte, 0);

    const totaalVerlies = totaalMBuisRollen - totaalMBuisKringen;

    const alleLengtes = collectoren.flatMap(c => c.kringen.map(k => k.lengte)).filter(l => l > 0);
    const grootsteKring = alleLengtes.length ? Math.max(...alleLengtes) : 0;
    const kleinsteKring = alleLengtes.length ? Math.min(...alleLengtes) : 0;
    const gemiddeldeKring = alleLengtes.length ? (alleLengtes.reduce((s, l) => s + l, 0) / alleLengtes.length) : 0;

    statsEl.innerHTML = `
        <h3>Statistieken</h3>
        <div class="rv-stat-row">
            <span>Totaal collectoren</span>
            <strong>${totaalCollectoren}</strong>
        </div>
        <div class="rv-stat-row">
            <span>Totaal kringen</span>
            <strong>${totaalKringen}</strong>
        </div>
        <hr>
        <div class="rv-stat-row">
            <span>Totaal m buis (kringen)</span>
            <strong>${totaalMBuisKringen.toFixed(1)} m</strong>
        </div>
        <div class="rv-stat-row">
            <span>Totaal m buis (rollen)</span>
            <strong>${totaalMBuisRollen} m</strong>
        </div>
        <div class="rv-stat-row ${totaalVerlies < 0 ? 'rv-stat-warning' : ''}">
            <span>${totaalVerlies < 0 ? 'Te weinig rollen' : 'Rest / verlies'}</span>
            <strong>${Math.abs(totaalVerlies).toFixed(1)} m</strong>
        </div>
        <div class="rv-stat-row">
            <span>Totaal rollen</span>
            <strong>${rollen.length}</strong>
        </div>
        <hr>
        <div class="rv-stat-row">
            <span>Grootste kring</span>
            <strong>${grootsteKring.toFixed(1)} m</strong>
        </div>
        <div class="rv-stat-row">
            <span>Kleinste kring</span>
            <strong>${kleinsteKring.toFixed(1)} m</strong>
        </div>
        <div class="rv-stat-row">
            <span>Gemiddelde kring</span>
            <strong>${gemiddeldeKring.toFixed(1)} m</strong>
        </div>
    `;
}

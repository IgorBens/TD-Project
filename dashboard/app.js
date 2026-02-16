// ===== Configuration =====
const WEBHOOK_BASE = 'http://46.225.76.46/n8n/webhook';
const WEBHOOK_AUTH = WEBHOOK_BASE + '/thermoduct-auth';
const WEBHOOK_SAVE = WEBHOOK_BASE + '/thermoduct-dashboard';
const WEBHOOK_LOAD = WEBHOOK_BASE + '/thermoduct-load';
const WEBHOOK_FOLDERS = WEBHOOK_BASE + '/thermoduct-folders';
const WEBHOOK_FOLDER_DELETE = WEBHOOK_BASE + '/thermoduct-folder-delete';
const WEBHOOK_FILES = WEBHOOK_BASE + '/thermoduct-files';
const WEBHOOK_SERVE_FILE = WEBHOOK_BASE + '/thermoduct-serve-file';
const WEBHOOK_FILE_DELETE = WEBHOOK_BASE + '/thermoduct-file-delete';
const WEBHOOK_UPLOAD_FORM = 'http://46.225.76.46/n8n/form/c939dab0-c13d-4f51-95b7-50ddc4068880';

// Odoo stage names (must match Odoo project stages)
const STAGES = {
    BLOKKEN: 'Blokken',
    VERDIEPEN: 'Verdiepen',
    COLLECTOREN: 'Collectoren',
    KRINGEN: 'Kringen'
};

// =============================================
// ===== AUTHENTICATIE =====
// =============================================

let authToken = sessionStorage.getItem('td_auth_token') || null;
let gebouwCounter = 0;
let rollen = [];
let rolCounter = 0;
let selectedProject = null;
let appInitialized = false;
let lastSavedSnapshot = null; // Snapshot for dirty tracking

// Rolverdeling sessions: array of locked sessions
// Each session: { rollen: [...], toewijzingen: { kringCode: rolId }, locked: true }
let rvSessions = [];   // Locked (previous) sessions
let currentRollen = []; // Current (active) session rollen

const loginOverlay = document.getElementById('loginOverlay');
const appContainer = document.getElementById('appContainer');
const loginForm = document.getElementById('loginForm');
const loginWachtwoord = document.getElementById('loginWachtwoord');
const loginError = document.getElementById('loginError');
const btnLogin = document.getElementById('btnLogin');
const btnLogout = document.getElementById('btnLogout');

// Check of er al een sessie is
if (authToken) {
    showApp();
} else {
    showLogin();
}

loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    login();
});
btnLogin.addEventListener('click', () => login());
btnLogout.addEventListener('click', () => logout());

async function login() {
    const wachtwoord = loginWachtwoord.value.trim();
    if (!wachtwoord) {
        showLoginError('Vul een wachtwoord in.');
        return;
    }

    btnLogin.disabled = true;
    btnLogin.textContent = 'Bezig...';
    hideLoginError();

    try {
        const res = await fetch(WEBHOOK_AUTH, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: wachtwoord })
        });

        if (res.status === 401 || res.status === 403) {
            showLoginError('Ongeldig wachtwoord.');
            return;
        }

        if (!res.ok) {
            showLoginError('Serverfout. Probeer later opnieuw.');
            return;
        }

        const data = await res.json();

        if (data.token) {
            authToken = data.token;
            sessionStorage.setItem('td_auth_token', authToken);
            showApp();
        } else {
            showLoginError('Ongeldig antwoord van server.');
        }
    } catch (err) {
        showLoginError('Kan geen verbinding maken met de server.');
        console.error('Login error:', err);
    } finally {
        btnLogin.disabled = false;
        btnLogin.textContent = 'Inloggen';
    }
}

function logout() {
    authToken = null;
    sessionStorage.removeItem('td_auth_token');
    showLogin();
}

function showApp() {
    loginOverlay.classList.add('hidden');
    appContainer.classList.remove('hidden');
    initApp();
}

function showLogin() {
    loginOverlay.classList.remove('hidden');
    appContainer.classList.add('hidden');
    loginWachtwoord.value = '';
    loginWachtwoord.focus();
}

function showLoginError(msg) {
    loginError.textContent = msg;
    loginError.classList.remove('hidden');
}

function hideLoginError() {
    loginError.classList.add('hidden');
}

// Authenticated fetch - voegt auth header toe, handelt 401 af
async function authFetch(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (authToken) {
        headers['Authorization'] = 'Bearer ' + authToken;
    }

    const res = await fetch(url, { ...options, headers });

    if (res.status === 401) {
        logout();
        throw new Error('Sessie verlopen. Log opnieuw in.');
    }

    return res;
}

// =============================================
// ===== HOOFDAPPLICATIE =====
// =============================================

function initApp() {
    if (appInitialized) return;
    appInitialized = true;

    // DOM references
    const gebouwenContainer = document.getElementById('blokkenContainer');
    const btnAddGebouw = document.getElementById('btnAddBlok');
    const btnOpslaan = document.getElementById('btnOpslaan');
    const btnLaden = document.getElementById('btnLaden');
    const statusMsg = document.getElementById('statusMsg');
    const projectIdInput = document.getElementById('projectIdInput');
    const projectInfoEl = document.getElementById('projectInfo');
    const projectInfoNaam = document.getElementById('projectInfoNaam');
    const projectInfoAdres = document.getElementById('projectInfoAdres');

    // Make functions globally accessible
    window.toggleCard = toggleCard;
    window.removeItem = removeItem;
    window.addVerdiep = addVerdiep;
    window.addCollector = addCollector;
    window.removeRol = removeRol;
    window.assignRolToKring = assignRolToKring;
    window.toggleRollenConfig = toggleRollenConfig;
    window.toggleVdGebouw = toggleVdGebouw;
    window.toggleVdVerdiep = toggleVdVerdiep;
    window.toggleVdCollector = toggleVdCollector;
    window.toggleVdKring = toggleVdKring;
    window.toggleDocGebouw = toggleDocGebouw;
    window.toggleDocVerdiep = toggleDocVerdiep;
    window.toggleDocCollector = toggleDocCollector;
    window.deleteDocFolder = deleteDocFolder;
    window.openUploadForm = openUploadForm;

    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById('tab-' + tab.dataset.tab).classList.add('active');

            if (tab.dataset.tab === 'rolverdeling') {
                renderRolverdeling();
            }
            if (tab.dataset.tab === 'vordering') {
                renderVordering();
            }
            if (tab.dataset.tab === 'documenten') {
                renderDocumenten();
            }
        });
    });

    // Event listeners
    btnAddGebouw.addEventListener('click', () => addGebouw());
    btnOpslaan.addEventListener('click', () => opslaan());
    btnLaden.addEventListener('click', () => ladenUitOdoo());

    // Auto-load project vanuit URL parameter (?project=123)
    const urlParams = new URLSearchParams(window.location.search);
    const urlProjectId = urlParams.get('project');
    if (urlProjectId && !isNaN(urlProjectId)) {
        projectIdInput.value = urlProjectId;
        setTimeout(() => ladenUitOdoo(), 100);
    }

    document.getElementById('btnAddRol').addEventListener('click', () => addRol());

    // ===== Utility =====
    let _id = 0;
    function uid() { return 'n' + (++_id); }

    function toggleCard(headerEl) {
        const body = headerEl.nextElementSibling;
        const chevron = headerEl.querySelector('.chevron');
        body.classList.toggle('open');
        chevron.classList.toggle('open');
    }

    function removeItem(btn) {
        const card = btn.closest('.card');

        // Verzamel alle odoo_ids van deze kaart + alle kinderen
        const odooIds = [];
        const allCards = [card, ...card.querySelectorAll('.card[data-odoo-id]')];
        allCards.forEach(c => {
            if (c.dataset.odooId) odooIds.push(parseInt(c.dataset.odooId));
        });

        if (odooIds.length > 0) {
            const level = card.dataset.level || 'item';
            const count = odooIds.length;
            const msg = count > 1
                ? `Dit ${level} en ${count - 1} onderliggende items verwijderen uit Odoo?`
                : `Dit ${level} verwijderen uit Odoo?`;

            if (!confirm(msg)) return;

            deleteFromOdoo(odooIds);
        }

        card.remove();
    }

    async function deleteFromOdoo(odooIds) {
        if (!selectedProject?.id || odooIds.length === 0) return;

        try {
            await authFetch(WEBHOOK_SAVE, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'delete',
                    project_id: selectedProject.id,
                    project_naam: selectedProject.naam || '',
                    odoo_ids: odooIds
                })
            });
            showStatus(`${odooIds.length} item(s) verwijderd uit Odoo.`, 'success');
        } catch (err) {
            showStatus(`Fout bij verwijderen: ${err.message}`, 'error');
            console.error('Delete error:', err);
        }
    }

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

    function bindTitleUpdate(input, card, prefix) {
        input.addEventListener('input', () => {
            const titleSpan = card.querySelector('.card-title-text');
            titleSpan.textContent = input.value ? `${prefix} ${input.value}` : prefix;
        });
    }

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

        if (data?.collectoren) {
            const colBtn = body.querySelector('.btn-add-child');
            data.collectoren.forEach(c => addCollector(colBtn, c));
        }

        return card;
    }

    // ===== Update collector m² totaal =====
    function updateCollectorM2(kringCard) {
        // Zoek de parent collector card
        const collectorBody = kringCard.closest('.card.level-collector')?.querySelector('.card-body');
        if (!collectorBody) return;
        const m2Display = collectorBody.querySelector('.collector-m2-totaal');
        if (!m2Display) return;

        const kringCards = collectorBody.querySelectorAll('.children-container .card.level-kring');
        let totaal = 0;
        kringCards.forEach(kc => {
            const val = parseFloat(kc.querySelector('.kring-m2')?.value) || 0;
            totaal += val;
        });
        m2Display.textContent = totaal.toFixed(1);
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
        const randIsoVal = data?.randisolatie ?? '';
        const uitzetVal = data?.uitzetvoegen ?? '';

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
            <div class="field-row cols-3">
                <div>
                    <label>m&sup2; totaal</label>
                    <span class="collector-m2-totaal field-display">0.0</span>
                </div>
                <div>
                    <label>Randisolatie (m)</label>
                    <input type="number" class="collector-randisolatie" placeholder="Omtrek in m" step="any" min="0" value="${randIsoVal}">
                </div>
                <div>
                    <label>Uitzetvoegen (m)</label>
                    <input type="number" class="collector-uitzetvoegen" placeholder="Lengte in m" step="any" min="0" value="${uitzetVal}">
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

        if (data?.kringen && data.kringen.length > 0) {
            const kringenContainer = body.querySelector('.children-container[data-children="kringen"]');
            data.kringen.forEach(k => addKringToContainer(kringenContainer, k.nummer || 0, k));
            // Herbereken m² totaal na laden van kringen
            const firstKring = kringenContainer.querySelector('.card.level-kring');
            if (firstKring) updateCollectorM2(firstKring);
        }

        return card;
    }

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

    function addKringToContainer(container, num, data) {
        const odooId = data?.odoo_id || null;
        const { card, bodyId } = createCard('kring', 'Kring', `Kring ${num}`, odooId);
        const body = card.querySelector(`#${bodyId}`);

        const legVal = data?.legpatroon || '';
        const lengteVal = data?.lengte || '';
        const m2Val = data?.m2 || '';
        const systeemVal = data?.systeem || '';

        body.innerHTML = `
            <div class="field-row cols-5">
                <div>
                    <label>Nummer</label>
                    <input type="number" class="kring-nummer" placeholder="bijv. 1" min="1" value="${num}">
                </div>
                <div>
                    <label>Systeem</label>
                    <select class="kring-systeem">
                        <option value="" ${systeemVal === '' ? 'selected' : ''}>-- Kies --</option>
                        <option value="staalnet" ${systeemVal === 'staalnet' ? 'selected' : ''}>Staalnet</option>
                        <option value="tacker" ${systeemVal === 'tacker' ? 'selected' : ''}>Tacker</option>
                    </select>
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

        // Update collector m² totaal bij wijziging
        const m2Input = body.querySelector('.kring-m2');
        m2Input.addEventListener('input', () => {
            updateCollectorM2(card);
        });

        container.appendChild(card);
        return card;
    }

    // ===== Collect data =====
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
                        randisolatie: parseFloat(cBody.querySelector('.collector-randisolatie').value) || 0,
                        uitzetvoegen: parseFloat(cBody.querySelector('.collector-uitzetvoegen').value) || 0,
                        kringen: []
                    };

                    const kringCards = cBody.querySelectorAll(':scope > .children-container > .card.level-kring');
                    kringCards.forEach(kCard => {
                        const kBody = kCard.querySelector('.card-body');
                        collector.kringen.push({
                            odoo_id: kCard.dataset.odooId || null,
                            stage: STAGES.KRINGEN,
                            nummer: parseInt(kBody.querySelector('.kring-nummer').value) || 0,
                            systeem: kBody.querySelector('.kring-systeem').value,
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

        return { project_id: projectId, project_naam: projectNaam, gebouwen };
    }

    // ===== Dirty tracking =====
    function createSnapshot(data) {
        // Create a flat lookup of item values keyed by odoo_id
        const snap = {};
        (data.gebouwen || []).forEach((g, gi) => {
            const gKey = g.odoo_id || `new_g_${gi}`;
            snap[gKey] = { naam: g.naam };
            (g.verdiepen || []).forEach((v, vi) => {
                const vKey = v.odoo_id || `new_v_${gi}_${vi}`;
                snap[vKey] = { nummer: v.nummer };
                (v.collectoren || []).forEach((c, ci) => {
                    const cKey = c.odoo_id || `new_c_${gi}_${vi}_${ci}`;
                    snap[cKey] = { nummer: c.nummer, naam: c.naam, druk: c.druk, randisolatie: c.randisolatie, uitzetvoegen: c.uitzetvoegen };
                    (c.kringen || []).forEach((k, ki) => {
                        const kKey = k.odoo_id || `new_k_${gi}_${vi}_${ci}_${ki}`;
                        snap[kKey] = { nummer: k.nummer, systeem: k.systeem, legpatroon: k.legpatroon, lengte: k.lengte, m2: k.m2 };
                    });
                });
            });
        });
        return snap;
    }

    function markDirtyItems(data) {
        if (!lastSavedSnapshot) {
            // No snapshot = first save, everything is dirty
            return data;
        }
        const snap = lastSavedSnapshot;
        const marked = JSON.parse(JSON.stringify(data));
        marked.gebouwen.forEach((g, gi) => {
            const gKey = g.odoo_id || `new_g_${gi}`;
            const prev = snap[gKey];
            g.dirty = !prev || prev.naam !== g.naam;

            (g.verdiepen || []).forEach((v, vi) => {
                const vKey = v.odoo_id || `new_v_${gi}_${vi}`;
                const prevV = snap[vKey];
                v.dirty = !prevV || prevV.nummer !== v.nummer;

                (v.collectoren || []).forEach((c, ci) => {
                    const cKey = c.odoo_id || `new_c_${gi}_${vi}_${ci}`;
                    const prevC = snap[cKey];
                    c.dirty = !prevC || prevC.nummer !== c.nummer || prevC.naam !== c.naam || prevC.druk !== c.druk || prevC.randisolatie !== c.randisolatie || prevC.uitzetvoegen !== c.uitzetvoegen;

                    (c.kringen || []).forEach((k, ki) => {
                        const kKey = k.odoo_id || `new_k_${gi}_${vi}_${ci}_${ki}`;
                        const prevK = snap[kKey];
                        k.dirty = !prevK || prevK.nummer !== k.nummer || prevK.systeem !== k.systeem || prevK.legpatroon !== k.legpatroon || prevK.lengte !== k.lengte || prevK.m2 !== k.m2;
                    });
                });
            });
        });
        return marked;
    }

    function validate(data) {
        if (!data.project_id) return 'Voer eerst een project ID in en klik op Laden.';
        if (data.gebouwen.length === 0) return 'Voeg minstens één gebouw toe.';
        for (const gebouw of data.gebouwen) {
            if (!gebouw.naam) return 'Elk gebouw moet een naam hebben.';
        }
        return null;
    }

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

        // Mark dirty items based on snapshot comparison
        const markedData = markDirtyItems(data);

        btnOpslaan.disabled = true;
        btnOpslaan.textContent = 'Verzenden...';

        try {
            const response = await authFetch(WEBHOOK_SAVE, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'save', ...markedData })
            });

            if (!response.ok) {
                throw new Error(`Server antwoordde met status ${response.status}`);
            }

            const result = await response.json().catch(() => null);
            if (result?.gebouwen) {
                updateOdooIds(result.gebouwen);
            }

            // Update snapshot after successful save
            lastSavedSnapshot = createSnapshot(collectData());

            showStatus('Data succesvol opgeslagen in Odoo!', 'success');
        } catch (err) {
            showStatus(`Fout bij opslaan: ${err.message}`, 'error');
            console.error('Save error:', err);
        } finally {
            btnOpslaan.disabled = false;
            btnOpslaan.textContent = 'Opslaan naar Odoo';
        }
    }

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
        const projectId = parseInt(projectIdInput.value);
        if (!projectId) {
            showStatus('Voer een project ID in.', 'error');
            return;
        }

        selectedProject = { id: projectId, naam: '', adres: '' };
        btnLaden.disabled = true;
        btnLaden.textContent = 'Laden...';

        try {
            const res = await fetch(`${WEBHOOK_LOAD}?project_id=${selectedProject.id}`);
            if (!res.ok) throw new Error(`Server antwoordde met status ${res.status}`);

            const data = await res.json();

            // Update project info uit response (ondersteunt Odoo veldnamen)
            const projectNaam = data.naam || data.name || '';
            const projectAdres = data.adres || (Array.isArray(data.partner_id) ? data.partner_id[1] : data.partner_id) || '';
            if (projectNaam) {
                selectedProject.naam = projectNaam;
                projectInfoNaam.textContent = projectNaam;
            }
            if (projectAdres) {
                selectedProject.adres = projectAdres;
                projectInfoAdres.textContent = projectAdres;
            }

            // Update directe link
            const directLink = document.getElementById('projectDirectLink');
            directLink.href = `${window.location.origin}${window.location.pathname}?project=${selectedProject.id}`;

            // Toon project info sectie
            if (projectNaam || projectAdres) {
                projectInfoEl.classList.remove('hidden');
            }

            gebouwenContainer.innerHTML = '';
            gebouwCounter = 0;

            if (data.gebouwen && Array.isArray(data.gebouwen)) {
                data.gebouwen.forEach(g => addGebouw(g));
            }

            // Store snapshot for dirty tracking
            lastSavedSnapshot = createSnapshot(collectData());

            showStatus(`Project "${selectedProject.naam}" geladen met ${data.gebouwen?.length || 0} gebouw(en).`, 'success');
        } catch (err) {
            showStatus(`Fout bij laden: ${err.message}`, 'error');
            console.error('Load error:', err);
        } finally {
            btnLaden.disabled = false;
            btnLaden.textContent = 'Herladen uit Odoo';
        }
    }

    // =============================================
    // ===== ROLVERDELING =====
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
            currentRollen.push({ id: 'rol_' + rolCounter, grootte, restant: grootte, toewijzingen: [] });
        }
        rollen = currentRollen; // Keep legacy reference in sync
        renderRolverdeling();
    }

    function removeRol(rolId) {
        currentRollen = currentRollen.filter(r => r.id !== rolId);
        rollen = currentRollen;
        renderRolverdeling();
    }
    window.removeRol = removeRol;

    function flattenCollectoren() {
        const data = collectData();
        const result = [];
        data.gebouwen.forEach(gebouw => {
            gebouw.verdiepen.forEach(verdiep => {
                verdiep.collectoren.forEach(collector => {
                    // Unique code: gebouw-verdiep-collector.kring
                    const prefix = `${gebouw.naam || 'G'}_${verdiep.nummer}_C${collector.nummer}`;
                    result.push({
                        label: collector.naam || `Collector ${collector.nummer}`,
                        gebouw: gebouw.naam,
                        verdiep: verdiep.nummer,
                        nummer: collector.nummer,
                        druk: collector.druk,
                        randisolatie: collector.randisolatie,
                        uitzetvoegen: collector.uitzetvoegen,
                        uniqueKey: prefix,
                        kringen: collector.kringen.map(k => ({
                            code: `${prefix}.K${k.nummer}`,
                            displayCode: `${collector.nummer}.${k.nummer}`,
                            nummer: k.nummer,
                            systeem: k.systeem,
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

    // Get all assigned kring codes across ALL sessions (locked + current)
    function getAllAssignedKringCodes() {
        const codes = new Set();
        // From locked sessions
        rvSessions.forEach(session => {
            session.rollen.forEach(r => {
                r.toewijzingen.forEach(t => codes.add(t.code));
            });
        });
        // From current session
        currentRollen.forEach(r => {
            r.toewijzingen.forEach(t => codes.add(t.code));
        });
        return codes;
    }

    // Get collectors that have unassigned kringen (for current active session)
    function getUnassignedCollectoren() {
        const allCollectoren = flattenCollectoren();
        const assignedCodes = new Set();

        // Collect codes from locked sessions only
        rvSessions.forEach(session => {
            session.rollen.forEach(r => {
                r.toewijzingen.forEach(t => assignedCodes.add(t.code));
            });
        });

        // Filter: only show collectors that have at least one unassigned kring
        return allCollectoren.map(col => {
            const unassignedKringen = col.kringen.filter(k => !assignedCodes.has(k.code));
            if (unassignedKringen.length === 0) return null;
            return { ...col, kringen: unassignedKringen };
        }).filter(Boolean);
    }

    function assignRolToKring(rolId, collectorIdx, kringIdx) {
        const collectoren = getUnassignedCollectoren();
        const kring = collectoren[collectorIdx]?.kringen[kringIdx];
        if (!kring) return;

        const kringCode = kring.code;
        // Remove existing assignment from current session
        currentRollen.forEach(r => {
            const existingIdx = r.toewijzingen.findIndex(t => t.code === kringCode);
            if (existingIdx !== -1) {
                r.restant += r.toewijzingen[existingIdx].lengte;
                r.toewijzingen.splice(existingIdx, 1);
            }
        });

        if (rolId !== 'none') {
            const rol = currentRollen.find(r => r.id === rolId);
            if (rol) {
                rol.restant -= kring.lengte;
                rol.toewijzingen.push({ code: kringCode, lengte: kring.lengte });
            }
        }
        rollen = currentRollen;
        renderRolverdeling();
    }
    window.assignRolToKring = assignRolToKring;

    function getAssignedRolInCurrentSession(kringCode) {
        for (const rol of currentRollen) {
            if (rol.toewijzingen.find(t => t.code === kringCode)) return rol;
        }
        return null;
    }

    function renderRolverdeling() {
        // Use only unassigned collectors (not locked ones)
        const collectoren = getUnassignedCollectoren();

        // Render locked sessions
        const sessionsContainer = document.getElementById('rvSessionsContainer');
        if (sessionsContainer) {
            if (rvSessions.length === 0) {
                sessionsContainer.innerHTML = '';
            } else {
                sessionsContainer.innerHTML = rvSessions.map((session, sIdx) => {
                    const totaalRollen = session.rollen.length;
                    const totaalKringen = session.rollen.reduce((s, r) => s + r.toewijzingen.length, 0);
                    const totaalM = session.rollen.reduce((s, r) => s + r.grootte, 0);
                    return `
                        <div class="rv-session-locked">
                            <div class="rv-session-header" onclick="toggleLockedSession(${sIdx})">
                                <div class="rv-session-title">
                                    <span class="lock-icon">&#x1F512;</span>
                                    <strong>Sessie ${sIdx + 1}</strong>
                                    <span class="rv-session-summary">${totaalRollen} rollen &middot; ${totaalKringen} kringen &middot; ${totaalM}m</span>
                                </div>
                                <div class="rv-session-actions">
                                    <button type="button" class="btn btn-remove" onclick="event.stopPropagation(); unlockSession(${sIdx})" title="Ontgrendelen">&#x1F513;</button>
                                    <span class="chevron">&#9654;</span>
                                </div>
                            </div>
                            <div class="rv-session-body" id="rvSessionBody-${sIdx}">
                                ${session.rollen.map(rol => {
                                    const kleur = rolKleuren[rol.grootte] || '#868e96';
                                    const gebruikt = rol.grootte - rol.restant;
                                    return `
                                        <div class="rv-rol-item">
                                            <div class="rv-rol-info">
                                                <span class="rv-rol-badge" style="background:${kleur}">${rol.grootte}m</span>
                                                <span class="rv-rol-detail">${gebruikt}m gebruikt / ${rol.restant}m rest</span>
                                            </div>
                                            <div class="rv-rol-bar">
                                                <div class="rv-rol-bar-fill" style="width:${(gebruikt / rol.grootte) * 100}%;background:${kleur}"></div>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                                <div class="rv-session-kringen">
                                    ${session.rollen.flatMap(rol => rol.toewijzingen.map(t => {
                                        const kleur = rolKleuren[rol.grootte] || '#868e96';
                                        return `<span class="rv-session-kring-tag" style="border-color:${kleur}"><span class="rv-assign-dot" style="background:${kleur}"></span> ${t.code.split('.').pop()} (${t.lengte}m)</span>`;
                                    })).join('')}
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }

        // Render current session rollen
        const rollenLijst = document.getElementById('rvRollenLijst');
        if (currentRollen.length === 0) {
            rollenLijst.innerHTML = '<p class="rv-empty">Nog geen rollen toegevoegd.</p>';
        } else {
            rollenLijst.innerHTML = currentRollen.map(rol => {
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

        // Render collector cards for unassigned collectors
        const overzicht = document.getElementById('rvCollectorenOverzicht');
        if (collectoren.length === 0) {
            const allCollectoren = flattenCollectoren();
            if (allCollectoren.length === 0) {
                overzicht.innerHTML = '<p class="rv-empty">Geen collectoren gevonden. Vul eerst de invoer tab in.</p>';
            } else {
                overzicht.innerHTML = '<p class="rv-empty" style="color:#2d6a4f; font-style:normal;">Alle kringen zijn toegewezen in vorige sessies.</p>';
            }
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
                                    const assignedRol = getAssignedRolInCurrentSession(k.code);
                                    const assignedKleur = assignedRol ? (rolKleuren[assignedRol.grootte] || '#868e96') : 'transparent';
                                    return `
                                        <tr>
                                            <td><strong>${k.displayCode}</strong></td>
                                            <td>${k.legpatroon || '-'}</td>
                                            <td>${k.lengte || '-'}</td>
                                            <td>${k.m2 || '-'}</td>
                                            <td>
                                                <div class="rv-assign-cell">
                                                    ${assignedRol ? `<span class="rv-assign-dot" style="background:${assignedKleur}"></span>` : ''}
                                                    <select onchange="assignRolToKring(this.value, ${cIdx}, ${kIdx})">
                                                        <option value="none">-- Geen --</option>
                                                        ${currentRollen.map(r => {
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
        // Stats for current session
        const totaalCollectoren = collectoren.length;
        const totaalKringen = collectoren.reduce((s, c) => s + c.kringen.length, 0);
        const totaalMBuisKringen = collectoren.reduce((s, c) => s + c.kringen.reduce((s2, k) => s2 + k.lengte, 0), 0);
        const totaalMBuisRollen = currentRollen.reduce((s, r) => s + r.grootte, 0);
        const totaalVerlies = totaalMBuisRollen - totaalMBuisKringen;
        const alleLengtes = collectoren.flatMap(c => c.kringen.map(k => k.lengte)).filter(l => l > 0);
        const grootsteKring = alleLengtes.length ? Math.max(...alleLengtes) : 0;
        const kleinsteKring = alleLengtes.length ? Math.min(...alleLengtes) : 0;
        const gemiddeldeKring = alleLengtes.length ? (alleLengtes.reduce((s, l) => s + l, 0) / alleLengtes.length) : 0;

        // Global stats
        const allRollen = [...rvSessions.flatMap(s => s.rollen), ...currentRollen];
        const totaalAlleRollen = allRollen.reduce((s, r) => s + r.grootte, 0);
        const totaalAlleKringenM = flattenCollectoren().reduce((s, c) => s + c.kringen.reduce((s2, k) => s2 + k.lengte, 0), 0);

        statsEl.innerHTML = `
            <h3>Huidige sessie</h3>
            <div class="rv-stat-row"><span>Collectoren</span><strong>${totaalCollectoren}</strong></div>
            <div class="rv-stat-row"><span>Kringen</span><strong>${totaalKringen}</strong></div>
            <hr>
            <div class="rv-stat-row"><span>m buis (kringen)</span><strong>${totaalMBuisKringen.toFixed(1)} m</strong></div>
            <div class="rv-stat-row"><span>m buis (rollen)</span><strong>${totaalMBuisRollen} m</strong></div>
            <div class="rv-stat-row ${totaalVerlies < 0 ? 'rv-stat-warning' : ''}">
                <span>${totaalVerlies < 0 ? 'Te weinig' : 'Rest / verlies'}</span>
                <strong>${Math.abs(totaalVerlies).toFixed(1)} m</strong>
            </div>
            <div class="rv-stat-row"><span>Rollen</span><strong>${currentRollen.length}</strong></div>
            <hr>
            <div class="rv-stat-row"><span>Grootste kring</span><strong>${grootsteKring.toFixed(1)} m</strong></div>
            <div class="rv-stat-row"><span>Kleinste kring</span><strong>${kleinsteKring.toFixed(1)} m</strong></div>
            <div class="rv-stat-row"><span>Gemiddelde</span><strong>${gemiddeldeKring.toFixed(1)} m</strong></div>
            ${rvSessions.length > 0 ? `
                <hr>
                <h3>Totaal (alle sessies)</h3>
                <div class="rv-stat-row"><span>Sessies</span><strong>${rvSessions.length + 1}</strong></div>
                <div class="rv-stat-row"><span>Totaal rollen</span><strong>${allRollen.length}</strong></div>
                <div class="rv-stat-row"><span>Totaal m buis</span><strong>${totaalAlleRollen} m</strong></div>
            ` : ''}
        `;
    }

    // =============================================
    // ===== ROLVERDELING LOCK/COLLAPSE =====
    // =============================================

    function toggleRollenConfig(headerEl) {
        const body = document.getElementById('rvRollenConfigBody');
        const chevron = headerEl.querySelector('.chevron');
        body.classList.toggle('open');
        chevron.classList.toggle('open');
    }

    function toggleLockedSession(sIdx) {
        const body = document.getElementById('rvSessionBody-' + sIdx);
        const header = body.previousElementSibling;
        const chevron = header.querySelector('.chevron');
        body.classList.toggle('open');
        chevron.classList.toggle('open');
    }
    window.toggleLockedSession = toggleLockedSession;

    function unlockSession(sIdx) {
        if (!confirm('Sessie ontgrendelen? De huidige actieve rollen worden samengevoegd.')) return;
        const session = rvSessions.splice(sIdx, 1)[0];
        // Merge session rollen into current
        currentRollen = [...session.rollen, ...currentRollen];
        rollen = currentRollen;
        renderRolverdeling();
    }
    window.unlockSession = unlockSession;

    const btnLock = document.getElementById('btnLockRolverdeling');
    btnLock.addEventListener('click', () => {
        // Check if there's anything to lock
        const hasAssignments = currentRollen.some(r => r.toewijzingen.length > 0);
        if (!hasAssignments && currentRollen.length === 0) {
            return; // Nothing to lock
        }

        if (!confirm('Huidige rolverdeling vastzetten? U start dan een nieuwe sessie voor de overige kringen.')) return;

        // Save current session as locked
        rvSessions.push({
            rollen: JSON.parse(JSON.stringify(currentRollen))
        });

        // Start fresh session
        currentRollen = [];
        rollen = currentRollen;

        renderRolverdeling();
    });

    // =============================================
    // ===== VORDERING TAB =====
    // =============================================

    const vdSelectAll = document.getElementById('vdSelectAll');
    vdSelectAll.addEventListener('change', () => {
        document.querySelectorAll('#vdContainer .vd-checkbox').forEach(cb => {
            cb.checked = vdSelectAll.checked;
        });
        updateVdCount();
    });

    function toggleVdGebouw(cb) {
        const gebouwEl = cb.closest('.vd-gebouw');
        gebouwEl.querySelectorAll('.vd-checkbox').forEach(c => { c.checked = cb.checked; });
        updateVdCount();
    }

    function toggleVdVerdiep(cb) {
        const verdiepEl = cb.closest('.vd-verdiep');
        verdiepEl.querySelectorAll('.vd-checkbox').forEach(c => { c.checked = cb.checked; });
        // Update parent gebouw state
        updateParentCheckbox(verdiepEl.closest('.vd-gebouw'));
        updateVdCount();
    }

    function toggleVdCollector(cb) {
        const collectorEl = cb.closest('.vd-collector');
        collectorEl.querySelectorAll('.vd-checkbox').forEach(c => { c.checked = cb.checked; });
        // Update parents
        updateParentCheckbox(collectorEl.closest('.vd-verdiep'));
        updateParentCheckbox(collectorEl.closest('.vd-gebouw'));
        updateVdCount();
    }

    function toggleVdKring(cb) {
        // Update parents
        updateParentCheckbox(cb.closest('.vd-collector'));
        updateParentCheckbox(cb.closest('.vd-verdiep'));
        updateParentCheckbox(cb.closest('.vd-gebouw'));
        updateVdCount();
    }

    function updateParentCheckbox(parentEl) {
        if (!parentEl) return;
        const parentCb = parentEl.querySelector(':scope > .vd-item-header .vd-checkbox');
        if (!parentCb) return;
        const children = parentEl.querySelectorAll('.vd-children .vd-checkbox');
        const allChecked = [...children].every(c => c.checked);
        const someChecked = [...children].some(c => c.checked);
        parentCb.checked = allChecked;
        parentCb.indeterminate = !allChecked && someChecked;
    }

    function updateVdCount() {
        const allKringen = document.querySelectorAll('#vdContainer .vd-kring .vd-checkbox');
        const checked = [...allKringen].filter(c => c.checked).length;
        document.getElementById('vdSelectedCount').textContent = `${checked} geselecteerd`;
    }

    function renderVordering() {
        const data = collectData();
        const container = document.getElementById('vdContainer');

        if (!data.gebouwen || data.gebouwen.length === 0) {
            container.innerHTML = '<p class="rv-empty">Laad een project en vul de invoer tab in om de vordering te bekijken.</p>';
            return;
        }

        container.innerHTML = data.gebouwen.map(gebouw => `
            <div class="vd-gebouw">
                <div class="vd-item-header vd-level-gebouw">
                    <label>
                        <input type="checkbox" class="vd-checkbox" onchange="toggleVdGebouw(this)">
                        <span class="badge badge-blok">Gebouw</span>
                        <strong>${escapeHtml(gebouw.naam || 'Naamloos')}</strong>
                    </label>
                </div>
                <div class="vd-children">
                    ${gebouw.verdiepen.map(verdiep => `
                        <div class="vd-verdiep">
                            <div class="vd-item-header vd-level-verdiep">
                                <label>
                                    <input type="checkbox" class="vd-checkbox" onchange="toggleVdVerdiep(this)">
                                    <span class="badge badge-verdiep">Verdiep</span>
                                    <strong>${verdiep.nummer}</strong>
                                </label>
                            </div>
                            <div class="vd-children">
                                ${verdiep.collectoren.map(col => `
                                    <div class="vd-collector">
                                        <div class="vd-item-header vd-level-collector">
                                            <label>
                                                <input type="checkbox" class="vd-checkbox" onchange="toggleVdCollector(this)">
                                                <span class="badge badge-collector">Col ${col.nummer}</span>
                                                <strong>${escapeHtml(col.naam || '')}</strong>
                                                <span class="vd-meta">${col.druk} bar &middot; ${col.aantalKringen} kringen</span>
                                            </label>
                                        </div>
                                        <div class="vd-children vd-kringen-grid">
                                            ${col.kringen.map(k => `
                                                <div class="vd-kring">
                                                    <label>
                                                        <input type="checkbox" class="vd-checkbox" onchange="toggleVdKring(this)">
                                                        <span class="vd-kring-info">
                                                            <span class="vd-kring-nr">K${k.nummer}</span>
                                                            <span class="vd-kring-detail">${k.lengte}m &middot; ${k.m2}m&sup2;</span>
                                                        </span>
                                                    </label>
                                                </div>
                                            `).join('')}
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');

        updateVdCount();
    }

    // =============================================
    // ===== DOCUMENTEN TAB =====
    // =============================================

    // Cache of loaded files per collector path


    function toggleDocGebouw(headerEl) {
        const body = headerEl.nextElementSibling;
        const chevron = headerEl.querySelector('.doc-chevron');
        body.classList.toggle('open');
        chevron.classList.toggle('open');
    }

    function toggleDocVerdiep(headerEl) {
        const body = headerEl.nextElementSibling;
        const chevron = headerEl.querySelector('.doc-chevron');
        body.classList.toggle('open');
        chevron.classList.toggle('open');
    }

    function toggleDocCollector(headerEl) {
        const body = headerEl.nextElementSibling;
        const chevron = headerEl.querySelector('.doc-chevron');
        body.classList.toggle('open');
        chevron.classList.toggle('open');

        // Load files when opening
        if (body.classList.contains('open')) {
            const folderPath = headerEl.dataset.folderPath;
            if (folderPath) {
                loadDocFiles(folderPath, body.querySelector('.doc-files-list'));
            }
        }
    }

    async function loadDocFiles(folderPath, filesListEl) {
        if (!selectedProject?.id) return;

        filesListEl.innerHTML = '<p class="doc-loading">Bestanden laden...</p>';

        try {
            const res = await fetch(`${WEBHOOK_FILES}?project_id=${selectedProject.id}&folder_path=${encodeURIComponent(folderPath)}`);
            const data = await res.json();

            if (!data.success || !data.exists || !data.files || data.files.length === 0) {
                filesListEl.innerHTML = '<p class="doc-loading">Nog geen bestanden.</p>';
                return;
            }

            filesListEl.innerHTML = data.files.map(file => {
                const sizeKB = Math.round(file.size / 1024);
                const isImage = /\.(jpg|jpeg|png|webp|heic|gif|bmp)$/i.test(file.name);
                const thumbUrl = isImage
                    ? `${WEBHOOK_SERVE_FILE}?project_id=${selectedProject.id}&folder_path=${encodeURIComponent(folderPath)}&file_name=${encodeURIComponent(file.name)}`
                    : '';
                const fileUrl = `${WEBHOOK_SERVE_FILE}?project_id=${selectedProject.id}&folder_path=${encodeURIComponent(folderPath)}&file_name=${encodeURIComponent(file.name)}`;
                return `
                    <div class="doc-file-item${isImage ? ' doc-file-item--image' : ''}" ${isImage ? `data-lightbox-url="${fileUrl}" data-file-name="${escapeHtml(file.name)}"` : ''} style="${isImage ? 'cursor:pointer' : ''}">
                        ${isImage
                            ? `<img class="doc-file-thumb" src="${thumbUrl}" alt="" loading="lazy">`
                            : `<a href="${fileUrl}" target="_blank" class="doc-file-icon" style="text-decoration:none">&#x1F4C4;</a>`}
                        <span class="doc-file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
                        <span class="doc-file-size">${sizeKB} KB</span>
                        <button class="doc-file-delete" data-folder-path="${escapeHtml(folderPath)}" data-file-name="${escapeHtml(file.name)}" title="Verwijder bestand">&#x1F5D1;</button>
                    </div>
                `;
            }).join('');
        } catch (err) {
            filesListEl.innerHTML = `<p class="doc-loading">Fout bij laden: ${escapeHtml(err.message)}</p>`;
        }
    }

    function openUploadForm(projectId, folderPath) {
        const url = `${WEBHOOK_UPLOAD_FORM}?project_id=${encodeURIComponent(projectId)}&folder_path=${encodeURIComponent(folderPath)}`;
        const popup = window.open(url, '_blank', 'width=500,height=400');
        // Wanneer het popup venster sluit, herlaad bestanden
        if (popup) {
            const timer = setInterval(() => {
                if (popup.closed) {
                    clearInterval(timer);
                    // Herlaad alle geopende collector bodies
                    document.querySelectorAll('.doc-collector-header').forEach(header => {
                        const body = header.nextElementSibling;
                        if (body && body.classList.contains('open')) {
                            const fp = header.dataset.folderPath;
                            if (fp) loadDocFiles(fp, body.querySelector('.doc-files-list'));
                        }
                    });
                }
            }, 500);
        }
    }

    async function deleteDocFile(folderPath, fileName, btnEl) {
        if (!selectedProject?.id) return;

        btnEl.disabled = true;
        btnEl.textContent = '...';

        try {
            const res = await authFetch(WEBHOOK_FILE_DELETE, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project_id: selectedProject.id,
                    folder_path: folderPath,
                    file_name: fileName
                })
            });

            const result = await res.json();
            if (result.success) {
                showStatus(result.message, 'success');
                // Verwijder het bestand-item uit de lijst
                const fileItem = btnEl.closest('.doc-file-item');
                const filesList = fileItem?.closest('.doc-files-list');
                fileItem?.remove();
                // Als er geen bestanden meer zijn, toon melding
                if (filesList && !filesList.querySelector('.doc-file-item')) {
                    filesList.innerHTML = '<p class="doc-loading">Nog geen bestanden.</p>';
                }
            } else {
                showStatus(result.message || 'Verwijderen mislukt.', 'error');
                btnEl.disabled = false;
                btnEl.textContent = '\u{1F5D1}';
            }
        } catch (err) {
            showStatus(`Fout bij verwijderen: ${err.message}`, 'error');
            btnEl.disabled = false;
            btnEl.textContent = '\u{1F5D1}';
        }
    }

    async function deleteDocFolder(folderPath, label, btnEl) {
        if (!confirm(`Map "${label}" en alle inhoud verwijderen van de server?`)) return;
        if (!selectedProject?.id) return;

        btnEl.disabled = true;
        btnEl.textContent = '...';

        try {
            const res = await authFetch(WEBHOOK_FOLDER_DELETE, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project_id: selectedProject.id,
                    folder_path: folderPath
                })
            });

            const result = await res.json();
            if (result.success) {
                showStatus(result.message, 'success');
                renderDocumenten(); // Herlaad van server
            } else {
                showStatus(result.message || 'Verwijderen mislukt.', 'error');
                btnEl.disabled = false;
                btnEl.textContent = '\u{1F5D1}';
            }
        } catch (err) {
            showStatus(`Fout bij verwijderen: ${err.message}`, 'error');
            btnEl.disabled = false;
            btnEl.textContent = '\u{1F5D1}';
        }
    }

    async function renderDocumenten() {
        const container = document.getElementById('docContainer');
        const statusText = document.getElementById('docStatusText');

        if (!selectedProject?.id) {
            statusText.textContent = 'Laad een project om documenten te beheren.';
            container.innerHTML = '<p class="rv-empty">Laad een project om de servermappen te bekijken.</p>';
            return;
        }

        // Toon loading state
        statusText.textContent = `Project ${selectedProject.naam || selectedProject.id} — mappen laden...`;
        container.innerHTML = '<p class="rv-empty">Mappen ophalen van server...</p>';

        try {
            const res = await fetch(`${WEBHOOK_FOLDERS}?project_id=${selectedProject.id}`);
            const data = await res.json();

            if (!data.success) {
                statusText.textContent = `Project ${selectedProject.naam || selectedProject.id}`;
                container.innerHTML = `<p class="rv-empty">Fout: ${escapeHtml(data.error || 'Kan mappen niet laden.')}</p>`;
                return;
            }

            if (!data.exists || !data.tree || data.tree.length === 0) {
                statusText.textContent = `Project ${selectedProject.naam || selectedProject.id}`;
                container.innerHTML = '<p class="rv-empty">Nog geen mappen op de server. Sla eerst data op via de Invoer tab.</p>';
                return;
            }

            // Bouw lookup voor collector namen vanuit invoerdata
            const invoerData = collectData();
            const collectorNaamLookup = {};
            (invoerData.gebouwen || []).forEach(g => {
                (g.verdiepen || []).forEach(v => {
                    (v.collectoren || []).forEach(c => {
                        const key = `${g.naam}/verdiep_${v.nummer}/collector_${c.nummer}`;
                        if (c.naam) collectorNaamLookup[key] = c.naam;
                    });
                });
            });

            // Tel totalen
            let totalVerdiepen = 0;
            let totalCollectoren = 0;
            data.tree.forEach(g => {
                totalVerdiepen += g.verdiepen.length;
                g.verdiepen.forEach(v => { totalCollectoren += v.collectoren.length; });
            });
            statusText.textContent = `Project ${selectedProject.naam || selectedProject.id} — ${data.tree.length} gebouw(en), ${totalVerdiepen} verdiep(en), ${totalCollectoren} collector(en)`;

            container.innerHTML = data.tree.map(gebouw => `
                <div class="doc-gebouw">
                    <div class="doc-gebouw-header" onclick="toggleDocGebouw(this)">
                        <div class="doc-header-left">
                            <span class="doc-chevron open">&#9654;</span>
                            <span class="doc-folder-icon">&#x1F4C1;</span>
                            <span class="badge badge-blok">Gebouw</span>
                            <strong>${escapeHtml(gebouw.name)}</strong>
                        </div>
                        <div class="doc-header-right">
                            <span class="doc-count">${gebouw.verdiepen.length} verdiep(en)</span>
                            <button class="doc-delete-btn" title="Map verwijderen" onclick="event.stopPropagation(); deleteDocFolder('${escapeHtml(gebouw.path)}', '${escapeHtml(gebouw.name)}', this)">&#x1F5D1;</button>
                        </div>
                    </div>
                    <div class="doc-gebouw-body open">
                        ${gebouw.verdiepen.map(verdiep => `
                            <div class="doc-verdiep">
                                <div class="doc-verdiep-header" onclick="toggleDocVerdiep(this)">
                                    <div class="doc-header-left">
                                        <span class="doc-chevron open">&#9654;</span>
                                        <span class="doc-folder-icon">&#x1F4C2;</span>
                                        <span class="badge badge-verdiep">Verdiep</span>
                                        <strong>${escapeHtml(verdiep.name)}</strong>
                                    </div>
                                    <div class="doc-header-right">
                                        <span class="doc-count">${verdiep.collectoren.length} collector(en)</span>
                                        <button class="doc-delete-btn" title="Map verwijderen" onclick="event.stopPropagation(); deleteDocFolder('${escapeHtml(verdiep.path)}', '${escapeHtml(verdiep.name)}', this)">&#x1F5D1;</button>
                                    </div>
                                </div>
                                <div class="doc-verdiep-body open">
                                    ${verdiep.collectoren.map(col => {
                                        const lookupKey = `${gebouw.name}/${verdiep.name}/${col.name}`;
                                        const colNaam = collectorNaamLookup[lookupKey];
                                        const displayName = colNaam ? `${col.name} — ${colNaam}` : col.name;
                                        return `
                                        <div class="doc-collector">
                                            <div class="doc-collector-header" data-folder-path="${escapeHtml(col.path)}" onclick="toggleDocCollector(this)">
                                                <div class="doc-header-left">
                                                    <span class="doc-chevron">&#9654;</span>
                                                    <span class="doc-folder-icon">&#x1F4F7;</span>
                                                    <span class="badge badge-collector">Collector</span>
                                                    <strong>${escapeHtml(displayName)}</strong>
                                                </div>
                                                <div class="doc-header-right">
                                                    <button class="doc-upload-btn" title="Foto's uploaden" onclick="event.stopPropagation(); openUploadForm('${selectedProject.id}', '${escapeHtml(col.path)}')">&#x1F4F7; Upload</button>
                                                    <button class="doc-delete-btn" title="Map verwijderen" onclick="event.stopPropagation(); deleteDocFolder('${escapeHtml(col.path)}', '${escapeHtml(col.name)}', this)">&#x1F5D1;</button>
                                                </div>
                                            </div>
                                            <div class="doc-collector-body">
                                                <div class="doc-files-list">
                                                    <p class="doc-loading">Klik om bestanden te laden...</p>
                                                </div>
                                            </div>
                                        </div>
                                    `}).join('')}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `).join('');
        } catch (err) {
            statusText.textContent = `Project ${selectedProject.naam || selectedProject.id}`;
            container.innerHTML = `<p class="rv-empty">Kan servermappen niet laden: ${escapeHtml(err.message)}</p>`;
        }
    }

    // Delegate click on file delete buttons
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.doc-file-delete');
        if (!btn) return;
        e.stopPropagation();
        const folderPath = btn.dataset.folderPath;
        const fileName = btn.dataset.fileName;
        if (folderPath && fileName) {
            deleteDocFile(folderPath, fileName, btn);
        }
    });
}

// ===== Lightbox =====
(function() {
    const overlay = document.getElementById('lightboxOverlay');
    const img = document.getElementById('lightboxImg');
    const caption = document.getElementById('lightboxCaption');
    const closeBtn = document.getElementById('lightboxClose');
    const prevBtn = document.getElementById('lightboxPrev');
    const nextBtn = document.getElementById('lightboxNext');
    let currentItems = [];
    let currentIndex = 0;

    function openLightbox(items, index) {
        currentItems = items;
        currentIndex = index;
        showCurrent();
        overlay.classList.add('active');
    }

    function closeLightbox() {
        overlay.classList.remove('active');
    }

    function showCurrent() {
        const item = currentItems[currentIndex];
        img.src = item.url;
        caption.textContent = item.name;
        prevBtn.style.display = currentItems.length > 1 ? '' : 'none';
        nextBtn.style.display = currentItems.length > 1 ? '' : 'none';
    }

    function navigate(dir) {
        currentIndex = (currentIndex + dir + currentItems.length) % currentItems.length;
        showCurrent();
    }

    closeBtn.addEventListener('click', closeLightbox);
    prevBtn.addEventListener('click', () => navigate(-1));
    nextBtn.addEventListener('click', () => navigate(1));
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeLightbox();
    });
    document.addEventListener('keydown', (e) => {
        if (!overlay.classList.contains('active')) return;
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowLeft') navigate(-1);
        if (e.key === 'ArrowRight') navigate(1);
    });

    // Delegate click on image file items (lightbox)
    document.addEventListener('click', (e) => {
        if (e.target.closest('.doc-file-delete')) return;
        const item = e.target.closest('.doc-file-item[data-lightbox-url]');
        if (!item) return;
        const list = item.closest('.doc-files-list');
        if (!list) return;
        const allImageItems = Array.from(list.querySelectorAll('.doc-file-item[data-lightbox-url]'));
        const items = allImageItems.map(el => ({
            url: el.dataset.lightboxUrl,
            name: el.dataset.fileName
        }));
        const index = allImageItems.indexOf(item);
        openLightbox(items, index);
    });

    window._openLightbox = openLightbox;
})();

// ===== Global utility =====
function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

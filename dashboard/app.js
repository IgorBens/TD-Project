// ===== Configuration =====
const WEBHOOK_BASE = 'http://46.225.76.46:5678/webhook';
const WEBHOOK_AUTH = WEBHOOK_BASE + '/thermoduct-auth';
const WEBHOOK_SAVE = WEBHOOK_BASE + '/thermoduct-dashboard';
const WEBHOOK_LOAD = WEBHOOK_BASE + '/thermoduct-load';

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
let rolverdelingLocked = false;

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
        });
    });

    // Event listeners
    btnAddGebouw.addEventListener('click', () => addGebouw());
    btnOpslaan.addEventListener('click', () => opslaan());
    btnLaden.addEventListener('click', () => ladenUitOdoo());
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

        btnOpslaan.disabled = true;
        btnOpslaan.textContent = 'Verzenden...';

        try {
            const response = await authFetch(WEBHOOK_SAVE, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'save', ...data })
            });

            if (!response.ok) {
                throw new Error(`Server antwoordde met status ${response.status}`);
            }

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

            // Toon project info sectie
            if (projectNaam || projectAdres) {
                projectInfoEl.classList.remove('hidden');
            }

            gebouwenContainer.innerHTML = '';
            gebouwCounter = 0;

            if (data.gebouwen && Array.isArray(data.gebouwen)) {
                data.gebouwen.forEach(g => addGebouw(g));
            }

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
            rollen.push({ id: 'rol_' + rolCounter, grootte, restant: grootte, toewijzingen: [] });
        }
        renderRolverdeling();
    }

    function removeRol(rolId) {
        rollen = rollen.filter(r => r.id !== rolId);
        renderRolverdeling();
    }
    window.removeRol = removeRol;

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
                        randisolatie: collector.randisolatie,
                        uitzetvoegen: collector.uitzetvoegen,
                        kringen: collector.kringen.map(k => ({
                            code: `${collector.nummer}.${k.nummer}`,
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

    function assignRolToKring(rolId, collectorIdx, kringIdx) {
        const collectoren = flattenCollectoren();
        const kring = collectoren[collectorIdx]?.kringen[kringIdx];
        if (!kring) return;

        const kringCode = kring.code;
        rollen.forEach(r => {
            const existingIdx = r.toewijzingen.findIndex(t => t.code === kringCode);
            if (existingIdx !== -1) {
                r.restant += r.toewijzingen[existingIdx].lengte;
                r.toewijzingen.splice(existingIdx, 1);
            }
        });

        if (rolId !== 'none') {
            const rol = rollen.find(r => r.id === rolId);
            if (rol) {
                rol.restant -= kring.lengte;
                rol.toewijzingen.push({ code: kringCode, lengte: kring.lengte });
            }
        }
        renderRolverdeling();
    }
    window.assignRolToKring = assignRolToKring;

    function getAssignedRol(kringCode) {
        for (const rol of rollen) {
            if (rol.toewijzingen.find(t => t.code === kringCode)) return rol;
        }
        return null;
    }

    function renderRolverdeling() {
        const collectoren = flattenCollectoren();

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
            <div class="rv-stat-row"><span>Totaal collectoren</span><strong>${totaalCollectoren}</strong></div>
            <div class="rv-stat-row"><span>Totaal kringen</span><strong>${totaalKringen}</strong></div>
            <hr>
            <div class="rv-stat-row"><span>Totaal m buis (kringen)</span><strong>${totaalMBuisKringen.toFixed(1)} m</strong></div>
            <div class="rv-stat-row"><span>Totaal m buis (rollen)</span><strong>${totaalMBuisRollen} m</strong></div>
            <div class="rv-stat-row ${totaalVerlies < 0 ? 'rv-stat-warning' : ''}">
                <span>${totaalVerlies < 0 ? 'Te weinig rollen' : 'Rest / verlies'}</span>
                <strong>${Math.abs(totaalVerlies).toFixed(1)} m</strong>
            </div>
            <div class="rv-stat-row"><span>Totaal rollen</span><strong>${rollen.length}</strong></div>
            <hr>
            <div class="rv-stat-row"><span>Grootste kring</span><strong>${grootsteKring.toFixed(1)} m</strong></div>
            <div class="rv-stat-row"><span>Kleinste kring</span><strong>${kleinsteKring.toFixed(1)} m</strong></div>
            <div class="rv-stat-row"><span>Gemiddelde kring</span><strong>${gemiddeldeKring.toFixed(1)} m</strong></div>
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

    const btnLock = document.getElementById('btnLockRolverdeling');
    btnLock.addEventListener('click', () => {
        rolverdelingLocked = !rolverdelingLocked;
        const lockIcon = btnLock.querySelector('.lock-icon');
        const lockStatus = document.getElementById('rvLockStatus');

        if (rolverdelingLocked) {
            btnLock.innerHTML = '<span class="lock-icon">&#x1F512;</span> Rolverdeling ontgrendelen';
            btnLock.classList.add('locked');
            lockStatus.textContent = 'Vastzezet — toewijzingen zijn vergrendeld';
            lockStatus.classList.add('active');

            // Disable all selects in rolverdeling
            document.querySelectorAll('#rvCollectorenOverzicht select').forEach(s => s.disabled = true);
            document.querySelectorAll('#rvRollenConfig button, #rvRollenConfig select, #rvRollenConfig input').forEach(el => el.disabled = true);
        } else {
            btnLock.innerHTML = '<span class="lock-icon">&#x1F513;</span> Rolverdeling vastzetten';
            btnLock.classList.remove('locked');
            lockStatus.textContent = '';
            lockStatus.classList.remove('active');

            // Re-enable
            document.querySelectorAll('#rvCollectorenOverzicht select').forEach(s => s.disabled = false);
            document.querySelectorAll('#rvRollenConfig button, #rvRollenConfig select, #rvRollenConfig input').forEach(el => el.disabled = false);
        }
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
}

// ===== Global utility =====
function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

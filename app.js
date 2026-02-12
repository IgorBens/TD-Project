// ===== Configuration =====
const WEBHOOK_URL = 'http://46.225.76.46:5678/webhook/thermoduct-admin';

// ===== State =====
let gebouwCounter = 0;
let rollen = []; // { grootte: 600, id: 'rol_1' }
let rolCounter = 0;

// ===== DOM references =====
const gebouwenContainer = document.getElementById('blokkenContainer');
const btnAddGebouw = document.getElementById('btnAddBlok');
const btnOpslaan = document.getElementById('btnOpslaan');
const statusMsg = document.getElementById('statusMsg');
const projectNaamInput = document.getElementById('projectNaam');

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
document.getElementById('btnAddRol').addEventListener('click', () => addRol());

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
function createCard(level, badgeText, titleText) {
    const card = document.createElement('div');
    card.className = `card level-${level}`;
    card.dataset.level = level;

    const id = uid();

    card.innerHTML = `
        <div class="card-header" onclick="toggleCard(this)">
            <span class="title">
                <span class="badge badge-${level}">${badgeText}</span>
                <span class="card-title-text">${titleText}</span>
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

// ===== Add Gebouw (was Blok) =====
function addGebouw() {
    gebouwCounter++;
    const { card, bodyId } = createCard('blok', 'Gebouw', `Gebouw ${gebouwCounter}`);

    const body = card.querySelector(`#${bodyId}`);
    body.innerHTML = `
        <div class="field-row cols-1">
            <div>
                <label>Naam</label>
                <input type="text" class="blok-naam" placeholder="bijv. Blok A, Woning 1, Villa ...">
            </div>
        </div>
        <div class="children-container" data-children="verdiepen"></div>
        <button type="button" class="btn btn-add btn-add-child" onclick="addVerdiep(this)">+ Verdiep</button>
    `;

    const naamInput = body.querySelector('.blok-naam');
    bindTitleUpdate(naamInput, card, 'Gebouw');

    gebouwenContainer.appendChild(card);
}

// ===== Add Verdiep =====
function addVerdiep(btn) {
    const container = btn.previousElementSibling;
    const count = container.children.length;

    const verdiepLabel = formatVerdiep(count);
    const { card, bodyId } = createCard('verdiep', 'Verdiep', `Verdieping ${verdiepLabel}`);
    const body = card.querySelector(`#${bodyId}`);

    body.innerHTML = `
        <div class="field-row cols-2">
            <div>
                <label>Verdieping</label>
                <input type="number" class="verdiep-nummer" placeholder="bijv. 0" min="-5" value="${count}">
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
}

// ===== Add Collector =====
function addCollector(btn) {
    const container = btn.previousElementSibling;
    const count = container.children.length + 1;

    const { card, bodyId } = createCard('collector', 'Collector', `Collector ${count}`);
    const body = card.querySelector(`#${bodyId}`);

    body.innerHTML = `
        <div class="field-row cols-4">
            <div>
                <label>Nummer</label>
                <input type="number" class="collector-nummer" placeholder="bijv. 1" min="1" value="${count}">
            </div>
            <div>
                <label>Naam</label>
                <input type="text" class="collector-naam" placeholder="bijv. App. 3.1">
            </div>
            <div>
                <label>Druk (bar)</label>
                <select class="collector-druk">
                    <option value="4" selected>4 bar</option>
                    <option value="6">6 bar</option>
                </select>
            </div>
            <div>
                <label>Aantal kringen</label>
                <input type="number" class="collector-aantal-kringen" placeholder="bijv. 5" min="0" value="0">
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
function addKringToContainer(container, num) {
    const { card, bodyId } = createCard('kring', 'Kring', `Kring ${num}`);
    const body = card.querySelector(`#${bodyId}`);

    body.innerHTML = `
        <div class="field-row cols-4">
            <div>
                <label>Nummer</label>
                <input type="number" class="kring-nummer" placeholder="bijv. 1" min="1" value="${num}">
            </div>
            <div>
                <label>Legpatroon</label>
                <select class="kring-legpatroon">
                    <option value="">-- Kies --</option>
                    <option value="7.5">7.5</option>
                    <option value="10">10</option>
                    <option value="15">15</option>
                    <option value="20">20</option>
                    <option value="25">25</option>
                    <option value="30">30</option>
                    <option value="andere">Andere</option>
                </select>
            </div>
            <div>
                <label>Lengte (m)</label>
                <input type="number" class="kring-lengte" placeholder="bijv. 80" step="any" min="0">
            </div>
            <div>
                <label>m&sup2;</label>
                <input type="number" class="kring-m2" placeholder="bijv. 25" step="any" min="0">
            </div>
        </div>
    `;

    const nummerInput = body.querySelector('.kring-nummer');
    nummerInput.addEventListener('input', () => {
        const titleSpan = card.querySelector('.card-title-text');
        titleSpan.textContent = nummerInput.value ? `Kring ${nummerInput.value}` : 'Kring';
    });

    container.appendChild(card);
}

// ===== Collect data =====
function collectData() {
    const project = projectNaamInput.value.trim();

    const gebouwen = [];
    const gebouwCards = gebouwenContainer.querySelectorAll(':scope > .card.level-blok');

    gebouwCards.forEach(gebouwCard => {
        const body = gebouwCard.querySelector('.card-body');
        const gebouw = {
            naam: body.querySelector('.blok-naam').value.trim(),
            verdiepen: []
        };

        const verdiepCards = body.querySelectorAll(':scope > .children-container > .card.level-verdiep');
        verdiepCards.forEach(vCard => {
            const vBody = vCard.querySelector('.card-body');
            const verdiep = {
                nummer: formatVerdiep(vBody.querySelector('.verdiep-nummer').value),
                collectoren: []
            };

            const collectorCards = vBody.querySelectorAll(':scope > .children-container > .card.level-collector');
            collectorCards.forEach(cCard => {
                const cBody = cCard.querySelector('.card-body');
                const collector = {
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

    return { project, gebouwen };
}

// ===== Validation =====
function validate(data) {
    if (!data.project) return 'Vul een projectnaam in.';
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

// ===== Submit =====
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
        const response = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw new Error(`Server antwoordde met status ${response.status}`);
        }

        showStatus('Data succesvol verzonden!', 'success');
    } catch (err) {
        showStatus(`Fout bij verzenden: ${err.message}`, 'error');
        console.error('Webhook error:', err);
    } finally {
        btnOpslaan.disabled = false;
        btnOpslaan.textContent = 'Opslaan & Versturen';
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

// ===== Add rol =====
function addRol() {
    const grootte = parseInt(document.getElementById('rvRolGrootte').value);
    const aantal = parseInt(document.getElementById('rvRolAantal').value) || 1;

    for (let i = 0; i < aantal; i++) {
        rolCounter++;
        rollen.push({ id: 'rol_' + rolCounter, grootte, restant: grootte, toewijzingen: [] });
    }

    renderRolverdeling();
}

// ===== Remove rol =====
function removeRol(rolId) {
    rollen = rollen.filter(r => r.id !== rolId);
    renderRolverdeling();
}

// ===== Flatten all collectors with kringen from invoer =====
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

// ===== Assign rol to kring =====
function assignRolToKring(rolId, collectorIdx, kringIdx) {
    const collectoren = flattenCollectoren();
    const kring = collectoren[collectorIdx]?.kringen[kringIdx];
    if (!kring) return;

    const rol = rollen.find(r => r.id === rolId);
    if (!rol) return;

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
        rol.restant -= kring.lengte;
        rol.toewijzingen.push({ code: kringCode, lengte: kring.lengte });
    }

    renderRolverdeling();
}

// ===== Get assigned rol for a kring code =====
function getAssignedRol(kringCode) {
    for (const rol of rollen) {
        if (rol.toewijzingen.find(t => t.code === kringCode)) {
            return rol;
        }
    }
    return null;
}

// ===== Render rolverdeling =====
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

    // Render stats
    renderStats(collectoren);
}

// ===== Render statistics =====
function renderStats(collectoren) {
    const statsEl = document.getElementById('rvStats');

    const totaalCollectoren = collectoren.length;
    const totaalKringen = collectoren.reduce((s, c) => s + c.kringen.length, 0);
    const totaalMBuisKringen = collectoren.reduce((s, c) => s + c.kringen.reduce((s2, k) => s2 + k.lengte, 0), 0);
    const totaalMBuisRollen = rollen.reduce((s, r) => s + r.grootte, 0);

    const totaalGebruikt = rollen.reduce((s, r) => s + (r.grootte - r.restant), 0);
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

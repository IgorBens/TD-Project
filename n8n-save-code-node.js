// ============================================
// n8n Code Node — Opslaan naar Odoo
// ============================================
// Plak dit in een "Code" node in n8n
// Zet de mode op "Run Once for All Items"
//
// Configuratie: pas deze variabelen aan:
const ODOO_URL = 'https://jouw-odoo-url.com';  // <-- Pas aan
const ODOO_DB = 'jouw-database';                // <-- Pas aan
const ODOO_USER = 'admin';                      // <-- Pas aan
const ODOO_PASSWORD = 'jouw-api-key';           // <-- Pas aan (API key of wachtwoord)

// ============================================
// Odoo JSON-RPC helper
// ============================================
async function odooCall(service, method, args) {
  const response = await $http.request({
    method: 'POST',
    url: `${ODOO_URL}/jsonrpc`,
    headers: { 'Content-Type': 'application/json' },
    body: {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'call',
      params: { service, method, args }
    },
    json: true
  });
  if (response.error) {
    throw new Error(response.error.data?.message || response.error.message || JSON.stringify(response.error));
  }
  return response.result;
}

// Authenticeren
async function authenticate() {
  return await odooCall('common', 'authenticate', [ODOO_DB, ODOO_USER, ODOO_PASSWORD, {}]);
}

// Record aanmaken of updaten
async function createOrUpdate(uid, model, odooId, values) {
  if (odooId) {
    // Update bestaand record
    await odooCall('object', 'execute_kw', [
      ODOO_DB, uid, ODOO_PASSWORD,
      model, 'write',
      [[odooId], values]
    ]);
    return odooId;
  } else {
    // Nieuw record aanmaken
    return await odooCall('object', 'execute_kw', [
      ODOO_DB, uid, ODOO_PASSWORD,
      model, 'create',
      [values]
    ]);
  }
}

// Stage ID opzoeken op basis van naam
async function findStageId(uid, stageName) {
  const ids = await odooCall('object', 'execute_kw', [
    ODOO_DB, uid, ODOO_PASSWORD,
    'project.task.type', 'search',
    [[['name', '=', stageName]]]
  ]);
  return ids.length > 0 ? ids[0] : false;
}

// ============================================
// Hoofdlogica
// ============================================
const input = $input.first().json;
const projectId = input.project_id;
const gebouwen = input.gebouwen || [];

// Authenticeer met Odoo
const uid = await authenticate();
if (!uid) throw new Error('Odoo authenticatie mislukt');

// Cache stage IDs
const stageCache = {};
async function getStageId(stageName) {
  if (!stageCache[stageName]) {
    stageCache[stageName] = await findStageId(uid, stageName);
  }
  return stageCache[stageName];
}

// Resultaat met odoo_ids
const resultGebouwen = [];

for (const gebouw of gebouwen) {
  const gebouwStageId = await getStageId('Blokken');

  const gebouwId = await createOrUpdate(uid, 'project.task', gebouw.odoo_id ? parseInt(gebouw.odoo_id) : null, {
    name: gebouw.naam,
    project_id: projectId,
    stage_id: gebouwStageId || false,
    parent_id: false  // Top-level taak onder project
  });

  const resultVerdiepen = [];

  for (const verdiep of gebouw.verdiepen || []) {
    const verdiepStageId = await getStageId('Verdiepen');

    const verdiepId = await createOrUpdate(uid, 'project.task', verdiep.odoo_id ? parseInt(verdiep.odoo_id) : null, {
      name: `Verdieping ${verdiep.nummer}`,
      project_id: projectId,
      stage_id: verdiepStageId || false,
      parent_id: gebouwId
    });

    const resultCollectoren = [];

    for (const collector of verdiep.collectoren || []) {
      const collectorStageId = await getStageId('Collectoren');

      const collectorId = await createOrUpdate(uid, 'project.task', collector.odoo_id ? parseInt(collector.odoo_id) : null, {
        name: collector.naam || `Collector ${collector.nummer}`,
        project_id: projectId,
        stage_id: collectorStageId || false,
        parent_id: verdiepId,
        // Custom fields (pas de veldnamen aan naar jouw Odoo configuratie):
        // x_druk: collector.druk,
        // x_aantal_kringen: collector.aantalKringen,
      });

      const resultKringen = [];

      for (const kring of collector.kringen || []) {
        const kringStageId = await getStageId('Kringen');

        const kringId = await createOrUpdate(uid, 'project.task', kring.odoo_id ? parseInt(kring.odoo_id) : null, {
          name: `Kring ${kring.nummer}`,
          project_id: projectId,
          stage_id: kringStageId || false,
          parent_id: collectorId,
          // Custom fields (pas aan):
          // x_legpatroon: kring.legpatroon,
          // x_lengte: kring.lengte,
          // x_m2: kring.m2,
        });

        resultKringen.push({
          odoo_id: kringId,
          nummer: kring.nummer
        });
      }

      resultCollectoren.push({
        odoo_id: collectorId,
        nummer: collector.nummer,
        kringen: resultKringen
      });
    }

    resultVerdiepen.push({
      odoo_id: verdiepId,
      nummer: verdiep.nummer,
      collectoren: resultCollectoren
    });
  }

  resultGebouwen.push({
    odoo_id: gebouwId,
    naam: gebouw.naam,
    verdiepen: resultVerdiepen
  });
}

// Return resultaat — dit gaat naar de Respond to Webhook node
return [{
  json: {
    success: true,
    project_id: projectId,
    gebouwen: resultGebouwen
  }
}];

const $ = (id) => document.getElementById(id);

function apiBase() {
  return $("apiBase").value.replace(/\/$/, "");
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBase()}${path}`, {
    headers: options.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    ...options,
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = text;
  }
  if (!response.ok) {
    throw { status: response.status, payload };
  }
  return payload;
}

function show(id, value) {
  $(id).textContent = JSON.stringify(value, null, 2);
}

function showError(id, error) {
  show(id, { error: true, status: error.status, payload: error.payload || String(error) });
}

async function run(id, fn) {
  show(id, { loading: true });
  try {
    show(id, await fn());
  } catch (error) {
    showError(id, error);
  }
}

$("healthBtn").onclick = () => run("healthOut", () => request("/health"));

$("livenessBtn").onclick = () =>
  run("livenessOut", async () => {
    const payload = {
      blink_count: Number($("blinkCount").value),
      head_turn_degrees: Number($("headTurn").value),
      confidence: Number($("liveConfidence").value),
      attempts: 1,
    };
    const response = await request("/ai/liveness/evaluate", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return { request: payload, response };
  });

$("deepfakeStatusBtn").onclick = () => run("deepfakeOut", () => request("/ai/deepfake/status"));

$("deepfakeBtn").onclick = () =>
  run("deepfakeOut", () => {
    const file = $("frameFile").files[0];
    if (!file) throw "Choose an image first";
    const form = new FormData();
    form.append("file", file);
    return request("/ai/deepfake/classify-frame", { method: "POST", body: form });
  });

$("seedBtn").onclick = () =>
  run("seedOut", async () => {
    const result = await request("/demo/seed", {
      method: "POST",
      body: JSON.stringify({
        count: Number($("workerCount").value),
        ghost_count: Number($("ghostCount").value),
        seed: Number($("seedValue").value),
        ministry: "Lagos State Ministry of Education",
      }),
    });
    $("anomalyPayCycleId").value = result.pay_cycle_id;
    $("verifyPayCycleId").value = result.pay_cycle_id;
    $("viqPayCycleId").value = result.pay_cycle_id;
    $("workerMinistry").value = result.ministry;
    return result;
  });

$("anomalyBtn").onclick = () =>
  run("anomalyOut", () =>
    request(`/demo/anomalies?pay_cycle_id=${encodeURIComponent($("anomalyPayCycleId").value)}`),
  );

$("workersBtn").onclick = () =>
  run("workersOut", async () => {
    const ministry = $("workerMinistry").value;
    const query = ministry ? `?ministry=${encodeURIComponent(ministry)}&limit=20` : "?limit=20";
    const workers = await request(`/workers${query}`);
    if (workers[0]) $("verifyWorkerId").value = workers[0].id;
    return workers;
  });

$("documentsCleanBtn").onclick = () =>
  run("documentsOut", () =>
    request("/ai/document-consistency/evaluate", {
      method: "POST",
      body: JSON.stringify({
        worker_record: {
          worker_id: "OGUN-001",
          full_name: "Adebayo Adeyemi",
          payroll_dob: "1988-04-12",
          bvn_dob: "1988-04-12",
          file_dob: "1988-04-12",
          appointment_date: "2014-09-01",
          first_salary_date: "2014-09-30",
          confirmation_date: "2016-09-01",
          last_promotion_date: "2020-01-01",
          document_numbers: { appointment_letter: "OG/APP/001" },
          required_documents: ["appointment_letter", "birth_certificate"],
          submitted_documents: ["appointment_letter", "birth_certificate"],
        },
      }),
    }),
  );

$("documentsBadBtn").onclick = () =>
  run("documentsOut", () =>
    request("/ai/document-consistency/evaluate", {
      method: "POST",
      body: JSON.stringify({
        worker_record: {
          worker_id: "OGUN-002",
          full_name: "Kemi Bello",
          payroll_dob: "2010-01-01",
          bvn_dob: "1988-04-12",
          file_dob: "1988-04-12",
          appointment_date: "2020-01-01",
          first_salary_date: "2019-12-01",
          confirmation_date: "2019-01-01",
          last_promotion_date: "2018-01-01",
          document_numbers: { appointment_letter: "OG/APP/DUP" },
          required_documents: ["appointment_letter", "birth_certificate"],
          submitted_documents: ["appointment_letter"],
        },
        cohort_records: [
          {
            worker_id: "OGUN-002",
            full_name: "Kemi Bello",
            document_numbers: { appointment_letter: "OG/APP/DUP" },
          },
          {
            worker_id: "OGUN-003",
            full_name: "Tunde Sani",
            document_numbers: { appointment_letter: "OG/APP/DUP" },
          },
        ],
      }),
    }),
  );

$("payCyclesBtn").onclick = () => run("payCyclesOut", () => request("/pay-cycles"));

$("createSessionBtn").onclick = () =>
  run("verificationOut", async () => {
    const session = await request("/verification/sessions", {
      method: "POST",
      body: JSON.stringify({
        worker_id: $("verifyWorkerId").value,
        pay_cycle_id: $("verifyPayCycleId").value,
      }),
    });
    $("sessionId").value = session.id;
    return session;
  });

$("submitEvidenceBtn").onclick = () =>
  run("verificationOut", () =>
    request(`/verification/sessions/${$("sessionId").value}/evidence`, {
      method: "POST",
      body: JSON.stringify({
        liveness: {
          status: "PASSED",
          confidence: 0.96,
          attempts: 1,
          challenge: "blink_twice_turn_left",
        },
        deepfake: {
          status: $("verifyDeepfakeStatus").value,
          synthetic_probability: $("verifyDeepfakeStatus").value === "CLEAN" ? 0.03 : 0.97,
          model_name: "EfficientNet-B0",
          model_version: "Xicor9/efficientnet-b0-ffpp-c23",
        },
        face_match: { status: "MATCH", similarity: 0.94 },
        bvn: {
          status: $("verifyBvnStatus").value,
          provider: "SQUAD",
          provider_reference: "endpoint-tester",
          resolved_name: "Endpoint Tester Worker",
          matched_name: "Endpoint Tester Worker",
        },
      }),
    }),
  );

$("finalizeBtn").onclick = () =>
  run("verificationOut", async () => {
    const result = await request(`/verification/sessions/${$("sessionId").value}/finalize`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    $("viqPayCycleId").value = result.viq.pay_cycle_id;
    return result;
  });

$("viqBtn").onclick = () =>
  run("viqOut", () => {
    const payCycleId = $("viqPayCycleId").value;
    const query = payCycleId ? `?pay_cycle_id=${encodeURIComponent(payCycleId)}` : "";
    return request(`/viq${query}`);
  });

$("sdkBtn").onclick = () =>
  run("sdkOut", async () => {
    const { seed, worker, payload } = await buildCleanSdkPayload();
    const result = await request("/sdk/verify-and-disburse", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return { seed, worker_code: worker.worker_code, result };
  });

$("biasAuditBtn").onclick = () =>
  run("biasAuditOut", () =>
    request("/ai/bias-audit/liveness/demo", {
      method: "POST",
      body: JSON.stringify({ live_cases_per_group: 40, spoof_cases_per_group: 40, seed: 42 }),
    }),
  );

$("queueBtn").onclick = () =>
  run("queueOut", async () => {
    const { seed, worker, payload } = await buildCleanSdkPayload();
    const queued = await request("/jobs/sdk-verification", {
      method: "POST",
      body: JSON.stringify({ request: payload }),
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const job = await request(`/jobs/${queued.job_id}`);
    return { seed, worker_code: worker.worker_code, queued, job };
  });

async function buildCleanSdkPayload() {
  const seed = await request("/demo/seed", {
    method: "POST",
    body: JSON.stringify({
      count: 100,
      ghost_count: 5,
      seed: 42,
      ministry: "Ogun State Ministry of Education",
    }),
  });
  const workers = await request(`/workers?ministry=${encodeURIComponent(seed.ministry)}&limit=100`);
  const worker = workers.find((item) => !item.risk_metadata.is_injected_ghost) || workers[0];
  return {
    seed,
    worker,
    payload: {
      worker_id: worker.id,
      pay_cycle_id: seed.pay_cycle_id,
      evidence: {
        liveness: { status: "PASSED", confidence: 0.96, attempts: 1 },
        deepfake: { status: "CLEAN", synthetic_probability: 0.02 },
        face_match: { status: "MATCH", similarity: 0.98 },
        bvn: { status: "BVN_MATCH", provider: "SQUAD" },
      },
      initiate_transfer: false,
    },
  };
}

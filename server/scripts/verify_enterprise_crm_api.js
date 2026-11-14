const http = require('http');

const BASE_HOST = 'localhost';
const BASE_PORT = Number(process.env.PORT || 5000);

function req(method, path, body = null, token = null, expectBinary = false) {
  return new Promise((resolve, reject) => {
    const payload = body !== null && body !== undefined ? JSON.stringify(body) : null;
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const r = http.request({ hostname: BASE_HOST, port: BASE_PORT, path, method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (expectBinary) {
          resolve({ status: res.statusCode, headers: res.headers, buffer: buf, text: buf.toString('utf8', 0, 200) });
          return;
        }
        const text = buf.toString('utf8');
        let json = {};
        try {
          json = JSON.parse(text);
        } catch {
          json = { raw: text };
        }
        resolve({ status: res.statusCode, headers: res.headers, data: json, raw: text });
      });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function main() {
  const results = [];
  const step = async (name, fn) => {
    try {
      await fn();
      results.push({ name, ok: true });
      console.log(`PASS: ${name}`);
    } catch (e) {
      results.push({ name, ok: false, error: e.message });
      console.error(`FAIL: ${name} -> ${e.message}`);
    }
  };

  let adminToken = '';
  let adminRefresh = '';
  let mgrToken = '';
  let couToken = '';
  let schoolId = '';
  let secondSchoolId = '';
  let leadAId = '';
  let leadBId = '';
  let leadVersion = 1;
  let appId = '';
  let commId = '';

  await step('01. Login Admin/Manager/Counsellor + /v1 rewrite', async () => {
    const a = await req('POST', '/api/auth/login', { email: 'adminboarding123@gmail.com', password: 'Admin@123' });
    assert(a.status === 200 || a.status === 201, `Admin login status=${a.status}`);
    adminToken = a.data.accessToken || a.data.token || a.data.data?.accessToken;
    adminRefresh = a.data.refreshToken || a.data.data?.refreshToken;
    assert(Boolean(adminToken) && Boolean(adminRefresh), 'Admin access+refresh tokens present');

    const m = await req('POST', '/api/auth/login', { email: 'managerborading123@gmail.com', password: 'Manager@123' });
    assert(m.status === 200 || m.status === 201, `Manager login status=${m.status}`);
    mgrToken = m.data.accessToken || m.data.token || m.data.data?.accessToken;

    const c = await req('POST', '/api/auth/login', { email: 'priya@boardingedu.com', password: 'Password@123' });
    assert(c.status === 200 || c.status === 201, `Counsellor login status=${c.status}`);
    couToken = c.data.accessToken || c.data.token || c.data.data?.accessToken;

    const v1Me = await req('GET', '/api/v1/auth/me', null, adminToken);
    assert(v1Me.status === 200 && (v1Me.data.user?.email || v1Me.data.data?.email), 'v1 prefix rewrite works');
  });

  await step('02. Refresh Token Rotation + Reuse Rejection', async () => {
    const r1 = await req('POST', '/api/auth/refresh', { refreshToken: adminRefresh });
    assert(r1.status === 200 || r1.status === 201, `Refresh 1 status=${r1.status}`);
    const rotated = r1.data.refreshToken || r1.data.data?.refreshToken;
    assert(rotated && rotated !== adminRefresh, 'Refresh token rotated');
    const reuse = await req('POST', '/api/auth/refresh', { refreshToken: adminRefresh });
    assert(reuse.status === 401, `Reused refresh expected 401, got ${reuse.status}`);
    // Re-login cleanly so session stays active after reuse family revocation
    const relog = await req('POST', '/api/auth/login', { email: 'adminboarding123@gmail.com', password: 'Admin@123' });
    adminToken = relog.data.accessToken || relog.data.data?.accessToken;
  });

  await step('03. Role Guard Matrix Enforcement', async () => {
    const couScore = await req('PUT', '/api/scoring/criteria', {
      budgetFit: 30, parentEngagement: 25, locationPreference: 20, academicReadiness: 15, decisionTimeline: 10,
    }, couToken);
    assert(couScore.status === 403, `Counsellor scoring update expected 403, got ${couScore.status}`);

    const mgrRate = await req('PUT', '/api/settings/rate-limits', { lead_create_per_hour: 99 }, mgrToken);
    assert(mgrRate.status === 403, `Manager rate-limit update expected 403, got ${mgrRate.status}`);
  });

  await step('04. Lead Scoring 5 Weights = 100 Validation', async () => {
    const bad99 = await req('PUT', '/api/scoring/criteria', {
      budgetFit: 29, parentEngagement: 25, locationPreference: 20, academicReadiness: 15, decisionTimeline: 10,
    }, adminToken);
    assert(bad99.status === 400, `Sum 99 expected 400, got ${bad99.status}`);

    const bad101 = await req('PUT', '/api/scoring/criteria', {
      budgetFit: 31, parentEngagement: 25, locationPreference: 20, academicReadiness: 15, decisionTimeline: 10,
    }, adminToken);
    assert(bad101.status === 400, `Sum 101 expected 400, got ${bad101.status}`);

    const ok100 = await req('PUT', '/api/scoring/criteria', {
      budgetFit: 30, parentEngagement: 25, locationPreference: 20, academicReadiness: 15, decisionTimeline: 10,
    }, adminToken);
    assert(ok100.status === 200 && ok100.data.total === 100, `Sum 100 failed: ${ok100.status}`);
  });

  await step('05. Matching Criteria 8 Weights = 100 + Suggest/Shortlist', async () => {
    const bad99 = await req('PUT', '/api/match/criteria', {
      feeBudget: 24, boardCurriculum: 15, locationDistance: 15, academicScore: 15,
      sportsFacility: 10, hostelRating: 10, entranceExamScore: 5, parentIncomeRatio: 5,
    }, adminToken);
    assert(bad99.status === 400, `Matching 99 expected 400, got ${bad99.status}`);

    const ok100 = await req('PUT', '/api/match/criteria', {
      feeBudget: 25, boardCurriculum: 15, locationDistance: 15, academicScore: 15,
      sportsFacility: 10, hostelRating: 10, entranceExamScore: 5, parentIncomeRatio: 5,
    }, adminToken);
    assert(ok100.status === 200 && ok100.data.total === 100, `Matching 100 failed: ${ok100.status}`);

    const schoolsRes = await req('GET', '/api/schools?limit=5', null, adminToken);
    const schools = schoolsRes.data.schools || schoolsRes.data.items || schoolsRes.data.data || [];
    assert(schools.length >= 2, 'At least 2 seeded schools exist');
    schoolId = schools[0].id;
    secondSchoolId = schools[1].id;
  });

  await step('06. Lead Create + Duplicate Check + Optimistic Locking 409', async () => {
    const uniq = String(Date.now()).slice(-6);
    const createRes = await req('POST', '/api/leads', {
      studentName: `Test Enterprise ${uniq}`,
      parentName: `Parent ${uniq}`,
      mobile: `9898${uniq}`,
      email: `parent${uniq}@example.com`,
      admissionClass: 'Class 8',
      preferredBoard: 'CBSE',
      budgetMax: 600000,
      city: 'Dehradun',
      state: 'Uttarakhand',
      leadSource: 'Website',
      dpdpConsent: true,
    }, couToken);
    assert(createRes.status === 201 || createRes.status === 200, `Lead create status=${createRes.status} ${createRes.raw}`);
    const leadObj = createRes.data.lead || createRes.data.data?.lead || createRes.data.data || createRes.data;
    leadAId = leadObj.id;
    leadVersion = Number(leadObj.version || 1);
    assert(Boolean(leadAId), 'Lead ID created');

    const dup = await req('POST', '/api/leads/check-duplicate', {
      mobile: `9898${uniq}`, studentName: `Test Enterprise ${uniq}`,
    }, couToken);
    assert(dup.status === 200 || dup.status === 201, `Duplicate check status=${dup.status}`);

    const suggest = await req('POST', '/api/match/suggest', { leadId: leadAId, topN: 5 }, couToken);
    assert(suggest.status === 200 || suggest.status === 201, `Suggest status=${suggest.status}`);

    const shortlist = await req('POST', `/api/leads/${leadAId}/shortlist`, {
      school_id: schoolId, priority_rank: 1,
    }, couToken);
    assert(shortlist.status === 200 || shortlist.status === 201, `Shortlist status=${shortlist.status}`);

    const updOk = await req('PUT', `/api/leads/${leadAId}`, {
      city: 'Mussoorie', version: leadVersion,
    }, couToken);
    assert(updOk.status === 200, `Lead update status=${updOk.status}`);

    const updStale = await req('PUT', `/api/leads/${leadAId}`, {
      city: 'Nainital', version: leadVersion,
    }, couToken);
    assert(updStale.status === 409, `Stale version expected 409, got ${updStale.status}`);
  });

  await step('07. Sub-Stage C Only Commission + Receive/Payout/Reverse FNF', async () => {
    const createApp = await req('POST', '/api/applications', {
      leadId: leadAId, schoolId, appliedClass: 'Class 8', academicYear: '2026-27', annualFee: 500000,
    }, adminToken);
    assert(createApp.status === 201 || createApp.status === 200, `App create status=${createApp.status} ${createApp.raw}`);
    const appObj = createApp.data.application || createApp.data.data?.application || createApp.data.data || createApp.data;
    appId = appObj.id;

    const subA = await req('PUT', `/api/applications/${appId}/sub-stage`, { sub_stage: 'A_waiting' }, adminToken);
    assert(subA.status === 200, `SubStage A status=${subA.status}`);
    assert(!subA.data.commission && !subA.data.data?.commission, 'SubStage A must NOT generate commission');

    const subB = await req('PUT', `/api/applications/${appId}/sub-stage`, { sub_stage: 'B_only_registration' }, adminToken);
    assert(subB.status === 200, `SubStage B status=${subB.status}`);
    assert(!subB.data.commission && !subB.data.data?.commission, 'SubStage B must NOT generate commission');

    const subC = await req('PUT', `/api/applications/${appId}/sub-stage`, {
      sub_stage: 'C_formalities_done', annualFee: 500000,
    }, adminToken);
    assert(subC.status === 200, `SubStage C status=${subC.status} ${subC.raw}`);
    const commObj = subC.data.commission || subC.data.data?.commission;
    assert(Boolean(commObj?.id), 'SubStage C generated commission');
    commId = commObj.id;

    // Idempotent repeat SubStage C must NOT duplicate
    const subC2 = await req('PUT', `/api/applications/${appId}/sub-stage`, { sub_stage: 'C_formalities_done' }, adminToken);
    assert(subC2.status === 200, 'Repeat SubStage C status 200');
    const ledger = await req('GET', `/api/commissions/ledger?applicationId=${appId}`, null, adminToken);
    const entries = (ledger.data.commissions || ledger.data.items || ledger.data.data || []).filter(
      (x) => (x.admissionId === appId || x.applicationId === appId || x.admission?.id === appId || x.application?.id === appId) && Number(x.amount) >= 0,
    );
    assert(entries.length === 1, `Expected 1 non-negative commission entry, got ${entries.length}`);

    const rcv = await req('POST', `/api/commissions/${commId}/receive`, {
      utrReference: 'UTR123456789', bankName: 'HDFC',
    }, adminToken);
    assert(rcv.status === 200 || rcv.status === 201, `Receive status=${rcv.status}`);

    const pay = await req('POST', `/api/commissions/${commId}/payout`, {
      utrReference: 'PAYOUT999',
    }, adminToken);
    assert(pay.status === 200 || pay.status === 201, `Payout status=${pay.status}`);

    const badRev = await req('POST', `/api/commissions/${commId}/reverse`, { reason: 'no' }, adminToken);
    assert(badRev.status === 400, `Short reversal reason expected 400, got ${badRev.status}`);

    const rev = await req('POST', `/api/commissions/${commId}/reverse`, {
      reason: 'Parent withdrew admission before term start',
    }, adminToken);
    assert(rev.status === 200 || rev.status === 201, `Reverse status=${rev.status} ${rev.raw}`);
    const adj = rev.data.adjustmentEntry || rev.data.data?.adjustmentEntry;
    assert(Boolean(adj?.id) && Number(adj.amount) < 0, `Negative adjustment entry expected on paid reversal, got ${rev.raw}`);
  });

  await step('08. Force-Expired Reopen Restriction (400 vs 200)', async () => {
    const exp1 = await req('POST', `/api/leads/${leadAId}/expire`, { action: 'EXPIRE', reason: 'Day 90 inactivity', force: false }, adminToken);
    assert(exp1.status === 200 || exp1.status === 201, `Soft expire status=${exp1.status}`);
    const reop1 = await req('POST', `/api/leads/${leadAId}/reopen`, { reason: 'Parent called back' }, adminToken);
    assert(reop1.status === 200 || reop1.status === 201, `Normal reopen status=${reop1.status}`);

    const expForce = await req('POST', `/api/leads/${leadAId}/expire`, { action: 'EXPIRE', reason: 'Day 360 force expiry', force: true }, adminToken);
    assert(expForce.status === 200 || expForce.status === 201, `Force expire status=${expForce.status}`);
    const reopForce = await req('POST', `/api/leads/${leadAId}/reopen`, { reason: 'Attempt bypass' }, adminToken);
    assert(reopForce.status === 400 && reopForce.raw.includes('Please create a new lead.'), `Force reopen expected 400 message, got ${reopForce.status}: ${reopForce.raw}`);
  });

  await step('09. ACID Lead Merge Transaction', async () => {
    const u2 = String(Date.now() + 5).slice(-6);
    const l2Res = await req('POST', '/api/leads', {
      studentName: `Merge Secondary ${u2}`,
      parentName: `Parent2 ${u2}`,
      mobile: `9797${u2}`,
      admissionClass: 'Class 8',
      leadSource: 'Referral',
      dpdpConsent: true,
    }, adminToken);
    leadBId = (l2Res.data.lead || l2Res.data.data?.lead || l2Res.data.data || l2Res.data).id;
    await req('POST', `/api/leads/${leadBId}/remarks`, { note: 'Important secondary note' }, adminToken);

    const mergeRes = await req('POST', '/api/leads/merge', {
      target_lead_id: leadAId,
      source_lead_id: leadBId,
      reason: 'Confirmed duplicate student record',
    }, adminToken);
    assert(mergeRes.status === 200 || mergeRes.status === 201, `Merge status=${mergeRes.status} ${mergeRes.raw}`);
    const secCheck = await req('GET', `/api/leads/${leadBId}`, null, adminToken);
    const secLead = secCheck.data.lead || secCheck.data.data || secCheck.data;
    assert(secLead.status === 'merged', `Secondary status expected merged, got ${secLead.status}`);
  });

  await step('10. 3-Layer WA/Call Logging Lock + Char Limits', async () => {
    const preQueue = await req('GET', '/api/pending-logging-queue', null, couToken);
    for (const q of (preQueue.data.items || preQueue.data.queue || preQueue.data.data || [])) {
      if (q.id) {
        await req('POST', `/api/pending-logging-queue/${q.id}/resolve`, {
          confirmed: true, status: 'sent', outcome: 'Pre-test cleanup',
        }, couToken);
      }
    }

    const waGen = await req('POST', '/api/whatsapp/generate-link', {
      lead_id: leadAId, message: 'Hello parent from BoardingEdu!',
    }, couToken);
    assert(waGen.status === 200 || waGen.status === 201, `WA link status=${waGen.status} ${waGen.raw}`);
    const queueId = waGen.data.queueId || waGen.data.data?.queueId || waGen.data.queueItem?.id;

    // Contacting ANOTHER lead while unresolved triggers Layer-3 409 PENDING_LOGGING_BLOCK
    const leadsList = await req('GET', '/api/leads?limit=5', null, adminToken);
    const allLeads = leadsList.data.leads || leadsList.data.data?.leads || leadsList.data.data || [];
    const otherLead = allLeads.find((l) => l.id && l.id !== leadAId);
    if (otherLead) {
      const blocked = await req('POST', '/api/whatsapp/generate-link', {
        lead_id: otherLead.id, message: 'Blocked other lead message',
      }, couToken);
      assert(blocked.status === 409, `Layer-3 lock expected 409 on different lead, got ${blocked.status}`);
    }

    const longMsg = 'A'.repeat(2001);
    const tooLong = await req('POST', '/api/whatsapp/log', {
      lead_id: leadAId, direction: 'outbound', message: longMsg,
    }, couToken);
    assert(tooLong.status === 400, `2001-char WA message expected 400, got ${tooLong.status}`);

    if (queueId) {
      const resQ = await req('POST', `/api/pending-logging-queue/${queueId}/resolve`, {
        confirmed: true, status: 'sent', outcome: 'Sent successfully',
      }, couToken);
      assert(resQ.status === 200 || resQ.status === 201, `Queue resolve status=${resQ.status}`);
    }
  });

  await step('11. All 20 Reports + Excel/PDF + Async Job', async () => {
    const slugs = [
      'leads', 'pipeline', 'admissions', 'school-wise', 'commission',
      'revenue', 'performance/jr', 'performance/sr', 'login-logout', 'audit',
      'follow-ups', 'duplicates', 'source-conversion', 'counsellor-funnel',
      'time-to-conversion', 'lost-lead-analysis', 'school-revenue',
      'whatsapp-activity', 'call-activity', 'commission-reversal',
    ];
    for (const s of slugs) {
      const r = await req('GET', `/api/reports/${s}`, null, adminToken);
      assert(r.status === 200, `Report /reports/${s} returned ${r.status}`);
    }
    const xl = await req('GET', '/api/reports/leads?format=excel', null, adminToken, true);
    assert(xl.status === 200 && xl.buffer.length > 100, `Excel export size=${xl.buffer.length}`);
    const pdf = await req('GET', '/api/reports/leads?format=pdf', null, adminToken, true);
    assert(pdf.status === 200 && pdf.text.startsWith('%PDF-'), `PDF export invalid header: ${pdf.text.slice(0, 20)}`);
    const asyncRep = await req('GET', '/api/reports/leads?async=true', null, adminToken);
    assert(asyncRep.status === 200 || asyncRep.status === 202, `Async report status=${asyncRep.status}`);
  });

  await step('12. Bulk Import Preview/ErrorCSV + Audit Archive + Data Integrity + Dashboards', async () => {
    const csvSample = 'studentName,parentName,mobile,admissionClass\nRohan Test,Mr Test,9811112233,Class 6\n=EVIL,Bad Row,123,Class 6';
    const prev = await req('POST', '/api/settings/import-excel/preview', {
      entity: 'leads', filename: 'leads.csv', csvText: csvSample, mode: 'lenient',
    }, adminToken);
    assert(prev.status === 200 || prev.status === 201, `Import preview status=${prev.status} ${prev.raw}`);
    const prevId = prev.data.previewId || prev.data.data?.previewId;
    if (prevId) {
      const conf = await req('POST', '/api/settings/import-excel/confirm', {
        previewId: prevId, entity: 'leads', mode: 'lenient',
      }, adminToken);
      assert(conf.status === 200 || conf.status === 201, `Import confirm status=${conf.status} ${conf.raw}`);
    }

    const badExt = await req('POST', '/api/settings/import-excel/preview', {
      entity: 'leads', filename: 'malware.xlsm', csvText: 'a,b\n1,2',
    }, adminToken);
    assert(badExt.status === 400, `.xlsm expected 400, got ${badExt.status}`);

    const ret = await req('POST', '/api/audit/retention-check', {}, adminToken);
    assert(ret.status === 200 || ret.status === 201, `Retention status=${ret.status}`);

    const integ = await req('GET', '/api/data-integrity/check', null, adminToken);
    assert(integ.status === 200, `Integrity check status=${integ.status}`);

    for (const d of ['admin', 'sr', 'jr', 'pending-confirmations']) {
      const dr = await req('GET', `/api/dashboard/${d}`, null, adminToken);
      assert(dr.status === 200, `Dashboard /${d} status=${dr.status}`);
    }
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== SUMMARY: ${results.length - failed.length}/${results.length} PASSED ===`);
  if (failed.length) {
    console.error('Failed checks:', failed);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

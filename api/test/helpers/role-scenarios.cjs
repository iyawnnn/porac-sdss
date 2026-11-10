const assert = require('node:assert/strict');

module.exports = async function scenarios(c) {
  const { pg, actors, fixture, request, status, ok } = c;
  async function call(method, url, actor, body, expected = 201) {
    const res = await request(method, url, actor, { body });
    status(res, expected, method + ' ' + url);
    const retired = new Set([
      'report_acknowledgments',
      'urgency_score',
      'urgency_band',
      'urgency_level',
      'priority_score',
      'cluster_factor',
      'elevation_factor',
      'precipitation_factor',
      'elevation_m',
    ]);
    function scan(value) {
      if (!value || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) {
        assert(!retired.has(key), `${url}: retired field ${key}`);
        scan(child);
      }
    }
    scan(res.body);
    return res.body;
  }
  const get = (url, actor = actors.meo) =>
    call('GET', url, actor, undefined, 200);
  async function unchanged(fn) {
    const tables =
      await pg`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'spatial_ref_sys' ORDER BY tablename`;
    async function snapshot() {
      const rows = [];
      for (const { tablename } of tables)
        rows.push(
          (
            await pg`SELECT md5(coalesce(string_agg(to_jsonb(r)::text,'' ORDER BY to_jsonb(r)::text),'')) hash FROM ${pg(tablename)} r`
          )[0].hash,
        );
      return rows;
    }
    const before = await snapshot();
    await fn();
    assert.deepEqual(
      await snapshot(),
      before,
      'Refused action changed persistent data',
    );
  }
  const t = await fixture('MEO', 'Reported', 3);
  const created = new Date(Date.now() - 3.5 * 86400000).toISOString();
  await pg`UPDATE tickets SET created_at=${created}::timestamptz WHERE id=${t.id}`;
  for (const [i, severity] of ['Low', 'High', 'Critical'].entries())
    await pg`UPDATE reports SET citizen_severity=${severity} WHERE id=${t.reports[i].id}`;
  const { breakdown } = await get(`/admin/tickets/${t.id}/priority-context`);
  assert(Math.abs(breakdown.ageFactor - 0.5) < 0.0001);
  assert.equal(breakdown.severityFactor, 0.75);
  ok(
    'P1/P4: real API computes 3.5-day age 0.5 and Low/High/Critical median 0.75',
  );
  const even = await fixture('MEO', 'Reported', 2);
  await pg`UPDATE reports SET citizen_severity='Medium' WHERE id=${even.reports[0].id}`;
  await pg`UPDATE reports SET citizen_severity='Critical' WHERE id=${even.reports[1].id}`;
  assert.equal(
    (await get(`/admin/tickets/${even.id}/priority-context`)).breakdown
      .severityFactor,
    0.75,
  );
  ok('P4: real API computes Medium/Critical median 0.75');

  const survivor = await fixture('MEO');
  const merged = await fixture('MDRRMO');
  await pg`UPDATE reports SET citizen_severity='Low' WHERE ticket_id=${survivor.id}`;
  await pg`UPDATE reports SET citizen_severity='Critical' WHERE ticket_id=${merged.id}`;
  const beforeMerge = (
    await get(`/admin/tickets/${survivor.id}/priority-context`)
  ).breakdown.priorityIndex;
  // Same category, different offices: isolate the office refusal from category validation.
  await pg`UPDATE tickets SET category=${survivor.category} WHERE id=${merged.id}`;
  const mergeBody = {
    survivorTicketId: survivor.id,
    mergedTicketId: merged.id,
    reason: 'Staff reviewed the related incident',
  };
  await unchanged(() =>
    call('POST', '/admin/ticket-grouping/merge', actors.meo, mergeBody, 409),
  );
  await call('POST', `/admin/tickets/${merged.id}/reassign`, actors.mdrrmo, {
    toOffice: 'MEO',
    reason: 'Road damage belongs with MEO',
  });
  await call('POST', '/admin/ticket-grouping/merge', actors.meo, mergeBody);
  const [stored] =
    await pg`SELECT member_count,priority_index FROM tickets WHERE id=${survivor.id}`;
  assert.equal(stored.member_count, 2);
  assert(stored.priority_index >= 1 && stored.priority_index <= 100);
  assert(
    stored.priority_index > beforeMerge,
    'Merge must recalculate priority from changed member severity',
  );
  assert.equal(
    (
      await pg`SELECT merged_into_ticket_id FROM tickets WHERE id=${merged.id}`
    )[0].merged_into_ticket_id,
    survivor.id,
  );
  assert.equal(
    (
      await pg`SELECT ticket_id FROM reports WHERE id=${merged.reports[0].id}`
    )[0].ticket_id,
    survivor.id,
  );
  const detail = await get(`/admin/tickets/${survivor.id}`);
  assert.deepEqual(detail.mergedFrom, [merged.id]);
  const queue = await get('/admin/tickets?limit=100');
  assert(!queue.tickets.some((row) => row.id === merged.id));
  const [reference] =
    await pg`SELECT tracking_reference FROM reports WHERE id=${merged.reports[0].id}`;
  assert.equal(
    (
      await get(
        '/reports/mine/by-reference/' + reference.tracking_reference,
        actors.citizen,
      )
    ).id,
    merged.reports[0].id,
  );
  const citizen = await get(
    '/reports/mine/' + merged.reports[0].id,
    actors.citizen,
  );
  assert.equal(citizen.report.ticket_id, survivor.id);
  ok(
    'P3: cross-office merge refused until reassignment; survivor membership/priority, history, queues and original reference follow the merge',
  );

  const woTicket = await fixture('MEO', 'Under Review');
  const orderInput = {
    ticketId: woTicket.id,
    title: 'Scenario repair',
    assignedAdminId: actors.meo.id,
  };
  await unchanged(() =>
    call('POST', '/admin/work-orders', actors.meo, orderInput, 409),
  );
  ok(
    'P5: no-assessment Work Order refused with no resource/history/audit writes',
  );
  await call('POST', `/admin/tickets/${woTicket.id}/assessment`, actors.meo, {
    assessedConditions: 'Observed surface damage',
    safetyImplications: 'Traffic risk',
    operationalConstraints: ['manpower'],
    recommendedAction: 'Repair surface',
    interimMitigation: 'Mark area',
  });
  const result = await call(
    'POST',
    '/admin/work-orders',
    actors.meo,
    orderInput,
  );
  const wo = result.workOrder ?? result;
  assert(Number.isInteger(wo.id));
  await unchanged(() =>
    call('POST', `/admin/work-orders/${wo.id}/cancel`, actors.meo, {}, 400),
  );
  ok(
    'P5: assessment permits creation; cancellation without reason refused atomically',
  );
  for (const next of ['in_progress', 'completed'])
    await call('POST', `/admin/work-orders/${wo.id}/status`, actors.meo, {
      status: next,
    });
  await unchanged(() =>
    call(
      'POST',
      `/admin/work-orders/${wo.id}/status`,
      actors.meo,
      { status: 'in_progress' },
      409,
    ),
  );
  assert.equal(
    (await pg`SELECT status FROM work_orders WHERE id=${wo.id}`)[0].status,
    'completed',
  );
  ok(
    'P5: actual pending/in-progress/completed lifecycle; Completed cannot reopen',
  );

  const route = await fixture('MEO', 'Under Review');
  await unchanged(() =>
    call(
      'POST',
      `/admin/tickets/${route.id}/reassign`,
      actors.meo,
      { toOffice: 'MDRRMO' },
      400,
    ),
  );
  for (const action of ['reassign', 'refer'])
    await unchanged(() =>
      call(
        'POST',
        `/admin/intake/${route.reports[0].id}/${action}`,
        actors.focal,
        {
          toOffice: 'MDRRMO',
          agency: 'External agency',
          reason: 'Scenario routing reason',
        },
        403,
      ),
    );
  ok(
    'P5: missing routing reason and Focal routing in Under Review refuse without writes',
  );

  const resolution = await fixture('MEO', 'In Progress');
  await call('POST', `/admin/tickets/${resolution.id}/refer`, actors.meo, {
    agency: 'External road agency',
    reason: 'Outside municipal jurisdiction',
  });
  await call('POST', `/admin/tickets/${resolution.id}/status`, actors.meo, {
    outcome: 'EXTERNAL_REFERRAL',
    notes: 'Agency accepted referral',
  });
  assert.equal(
    (
      await pg`SELECT status,resolution_outcome FROM tickets WHERE id=${resolution.id}`
    )[0].resolution_outcome,
    'EXTERNAL_REFERRAL',
  );
  await call(
    'POST',
    `/admin/tickets/${resolution.id}/return-to-review`,
    actors.meo,
    { reason: 'Referral requires municipal follow-up' },
  );
  assert.deepEqual(
    (
      await pg`SELECT status,resolution_outcome FROM tickets WHERE id=${resolution.id}`
    )[0],
    { status: 'Under Review', resolution_outcome: null },
  );
  const history =
    await pg`SELECT status,resolution_outcome,reason FROM status_history WHERE ticket_id=${resolution.id} ORDER BY id`;
  assert(
    history.some(
      (r) =>
        r.status === 'Resolved' && r.resolution_outcome === 'EXTERNAL_REFERRAL',
    ),
  );
  assert(
    history.some(
      (r) =>
        r.status === 'Under Review' &&
        r.reason === 'Referral requires municipal follow-up',
    ),
  );
  ok(
    'P5: External Referral resolves then returns to review; history preserves both facts',
  );

  const system = actors.systemAdmin;
  const input = {
    email: 'scenario-staff@fixture.invalid',
    password: 'Offline-scenario-123!',
    firstName: 'Scenario',
    lastName: 'Staff',
    accountType: 'PERSONNEL',
    office: 'MEO',
    isFocal: false,
  };
  for (const fields of [
    { accountType: 'SYSTEM_ADMIN', office: 'MEO' },
    { accountType: 'SYSTEM_ADMIN', office: null, isFocal: true },
    { office: null },
    { office: 'MEO', isFocal: true },
  ])
    await unchanged(() =>
      call('POST', '/admin/admins', system, { ...input, ...fields }, 400),
    );
  ok('P7: invalid account/office/Focal combinations rejected without writes');
  const staff = await call('POST', '/admin/admins', system, input);
  const claims = {
    adminId: staff.id,
    adminName: 'Scenario Staff',
    email: input.email,
    accountType: 'PERSONNEL',
    office: 'MEO',
    isFocal: false,
  };
  const actor = {
    kind: 'meo',
    id: staff.id,
    cookieName: actors.meo.cookieName,
    token: await c.sessions.signAdminSession(claims),
  };
  await get('/auth/me', actor);
  await call(
    'PATCH',
    `/admin/admins/${staff.id}`,
    system,
    { accountType: 'PERSONNEL', office: 'MDRRMO', isFocal: true },
    200,
  );
  await call('GET', '/auth/me', actor, undefined, 401);
  const cutoff = (
    await pg`SELECT session_valid_after FROM admins WHERE id=${staff.id}`
  )[0].session_valid_after;
  await call(
    'PATCH',
    `/admin/admins/${staff.id}`,
    system,
    { accountType: 'PERSONNEL', office: 'MDRRMO', isFocal: true },
    200,
  );
  assert.equal(
    String(
      (await pg`SELECT session_valid_after FROM admins WHERE id=${staff.id}`)[0]
        .session_valid_after,
    ),
    String(cutoff),
  );
  ok(
    'P7: office/Focal change invalidates old session once; identical edit preserves cutoff',
  );
  for (const action of ['deactivate', 'reactivate']) {
    await call('POST', `/admin/admins/${staff.id}/${action}`, system, {}, 200);
    assert.equal(
      (await pg`SELECT is_active FROM admins WHERE id=${staff.id}`)[0]
        .is_active,
      action === 'reactivate',
    );
  }
  await unchanged(() =>
    call(
      'PATCH',
      `/admin/admins/${system.id}`,
      system,
      { accountType: 'PERSONNEL', office: 'MEO', isFocal: false },
      403,
    ),
  );
  await unchanged(() =>
    call('POST', `/admin/admins/${system.id}/deactivate`, system, {}, 409),
  );
  ok(
    'P7: deactivate/reactivate persisted; self-edit and last-active-admin protections hold',
  );
  const actions = (
    await pg`SELECT action_type FROM admin_audit_events WHERE target_type='admin' AND target_id=${staff.id}`
  ).map((r) => r.action_type);
  for (const name of [
    'admin_created',
    'admin_role_updated',
    'admin_deactivated',
    'admin_reactivated',
  ])
    assert(actions.includes(name), name);
  await assert.rejects(
    () =>
      pg`UPDATE admin_audit_events SET target_summary='tamper' WHERE target_id=${staff.id}`,
    /append.only|immutable|not allowed/i,
  );
  ok(
    'P7: staff lifecycle produces real audit rows; append-only trigger rejects mutation',
  );
  const screened = await fixture('MDRRMO');
  await call(
    'POST',
    `/admin/intake/${screened.reports[0].id}/severity-screening`,
    actors.focal,
    { status: 'NO_CONCERN_NOTED', remarks: 'Reviewed scenario evidence' },
  );
  const auditView = await get('/admin/activity-log', system);
  const focalEvent = auditView.events.find(
    (row) => row.actor.id === actors.focal.id,
  );
  assert(focalEvent, 'Focal action must appear in the real audit view');
  assert.equal(focalEvent.actor.account_type, 'PERSONNEL');
  assert.equal(focalEvent.actor.is_focal, true);
  const systemEvent = auditView.events.find(
    (row) => row.actor.id === system.id,
  );
  assert(systemEvent);
  assert.equal(systemEvent.actor.account_type, 'SYSTEM_ADMIN');
  assert.equal(systemEvent.actor.is_focal, false);
  ok('P7: real audit HTTP view projects stored account type and Focal flag');
};

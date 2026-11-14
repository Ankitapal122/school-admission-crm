import { PrismaClient } from '@prisma/client';

async function applyBlueprintSql() {
  const prisma = new PrismaClient();
  await prisma.$connect();

  console.log('--- Applying Blueprint PostgreSQL Partial Indexes, Sequences, FTS & Monthly Partitioning ---');

  // 1. Backfill newly added columns from existing rows
  await prisma.$executeRawUnsafe(`
    UPDATE leads
    SET class_grade = COALESCE(NULLIF(regexp_replace(applying_for_grade, '[^0-9]', '', 'g'), '')::int, 6),
        academic_year = COALESCE(admission_session, '2026-27'),
        created_by = COALESCE(created_by, assigned_to)
    WHERE class_grade = 6 OR academic_year IS NULL OR created_by IS NULL;
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE schools
    SET net_profit = GREATEST(0, COALESCE(company_commission, 0) - COALESCE(jr_commission, 0) - COALESCE(sr_commission, 0))
    WHERE net_profit = 23000 OR net_profit = 0;
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE applications a
    SET school_id = a.school_id,
        stage = CASE
          WHEN LOWER(a.status) LIKE '%confirm%' OR LOWER(a.status) LIKE '%enroll%' THEN 'admission_done'
          WHEN LOWER(a.status) LIKE '%cancel%' OR LOWER(a.status) LIKE '%closed%' THEN 'closed'
          ELSE 'applied'
        END
    WHERE a.stage = 'applied';
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE commission_ledger c
    SET school_id = COALESCE(c.school_id, a.school_id),
        original_amount = CASE WHEN c.original_amount = 0 THEN c.company_amount ELSE c.original_amount END
    FROM applications a
    WHERE c.app_id = a.id;
  `);

  // 2. Partial Unique Indexes (WHERE deleted_at IS NULL) + Duplicate lookup + FTS GIN
  const sqlStatements = [
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_active ON users (LOWER(email)) WHERE deleted_at IS NULL;`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_users_employee_id_active ON users (employee_id) WHERE deleted_at IS NULL;`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_lead_id_active ON leads (lead_id) WHERE deleted_at IS NULL;`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_schools_school_code_active ON schools (school_code) WHERE deleted_at IS NULL;`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_applications_app_id_active ON applications (app_id) WHERE deleted_at IS NULL;`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_applications_lead_school_active ON applications (lead_id, school_id) WHERE deleted_at IS NULL;`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_commission_id_active ON commission_ledger (commission_id) WHERE deleted_at IS NULL;`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_shortlists_lead_school_active ON shortlists (lead_id, school_id) WHERE deleted_at IS NULL;`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_templates_key_active ON whatsapp_templates (template_key) WHERE is_active = true;`,
    `CREATE INDEX IF NOT EXISTS idx_leads_dup_lookup ON leads (mobile_primary, LOWER(student_name), class_grade) WHERE deleted_at IS NULL;`,
    `CREATE INDEX IF NOT EXISTS idx_leads_fts ON leads USING GIN (to_tsvector('english', coalesce(lead_id,'') || ' ' || coalesce(student_name,'') || ' ' || coalesce(parent_name,'') || ' ' || coalesce(mobile_primary,'') || ' ' || coalesce(city_resident,'') || ' ' || coalesce(city_preferred,'')));`,
  ];

  for (const stmt of sqlStatements) {
    try {
      await prisma.$executeRawUnsafe(stmt);
    } catch (e: any) {
      console.warn('Warning on index statement:', stmt.slice(0, 60), e.message);
    }
  }

  // 3. Check constraints for scoring & matching weights (0..100 each)
  for (const sql of [
    `ALTER TABLE matching_criteria_weights DROP CONSTRAINT IF EXISTS chk_mcw_weight_range`,
    `ALTER TABLE matching_criteria_weights ADD CONSTRAINT chk_mcw_weight_range CHECK (weight >= 0 AND weight <= 100)`,
    `ALTER TABLE lead_scoring_config DROP CONSTRAINT IF EXISTS chk_lsc_weight_range`,
    `ALTER TABLE lead_scoring_config ADD CONSTRAINT chk_lsc_weight_range CHECK (weight >= 0 AND weight <= 100)`,
  ]) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch (e: any) {
      console.warn('Check constraint note:', e.message);
    }
  }

  // 4. PostgreSQL Sequences for deterministic sequential codes
  const initSeq = async (seqName: string, table: string, col: string, prefixLen: number) => {
    await prisma.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS ${seqName} START 1`);
    const rows: any[] = await prisma.$queryRawUnsafe(`
      SELECT COALESCE(MAX(NULLIF(regexp_replace(substring(${col} from ${prefixLen + 1}), '[^0-9]', '', 'g'), '')::bigint), 0) AS max_num
      FROM ${table}
      WHERE length(${col}) <= 10
    `);
    const nextVal = Math.max(1, Number(rows[0]?.max_num || 0) + 1);
    await prisma.$executeRawUnsafe(`SELECT setval('${seqName}', ${nextVal}, false);`);
    console.log(`Sequence ${seqName} synced to start at ${nextVal}`);
  };

  await initSeq('seq_lead_id', 'leads', 'lead_id', 2);
  await initSeq('seq_school_code', 'schools', 'school_code', 2);
  await initSeq('seq_app_id', 'applications', 'app_id', 2);
  await initSeq('seq_commission_id', 'commission_ledger', 'commission_id', 2);
  await initSeq('seq_wa_log_id', 'whatsapp_log', 'log_id', 2);
  await initSeq('seq_call_log_id', 'call_log', 'log_id', 2);
  await initSeq('seq_lifecycle_log_id', 'lead_expiry_log', 'log_id', 2);

  // 5. Convert audit_log to PostgreSQL Month-Partitioned Table (PARTITION BY RANGE (created_at))
  const kindRes: any[] = await prisma.$queryRawUnsafe(
    `SELECT relkind::text AS relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'audit_log'`,
  );
  const relkind = kindRes[0]?.relkind;
  if (relkind !== 'p') {
    console.log('Converting audit_log to monthly partitioned table...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS audit_log_part (
        id TEXT NOT NULL,
        user_id TEXT,
        user_name TEXT,
        user_role TEXT,
        action TEXT NOT NULL,
        module TEXT NOT NULL,
        entity TEXT NOT NULL,
        entity_id TEXT,
        old_value JSONB,
        new_value JSONB,
        details JSONB,
        ip_address TEXT,
        user_agent TEXT,
        special_flag BOOLEAN NOT NULL DEFAULT false,
        is_archived BOOLEAN NOT NULL DEFAULT false,
        archived_at TIMESTAMP(3),
        archive_s3_uri TEXT,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id, created_at)
      ) PARTITION BY RANGE (created_at);
    `);

    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS audit_log_default PARTITION OF audit_log_part DEFAULT;`);

    const now = new Date();
    for (let offset = -3; offset <= 6; offset++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
      const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const partName = `audit_log_${yyyy}_${mm}`;
      const fromIso = d.toISOString().slice(0, 10);
      const toIso = next.toISOString().slice(0, 10);
      await prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS ${partName} PARTITION OF audit_log_part FOR VALUES FROM ('${fromIso}') TO ('${toIso}');`,
      );
    }

    await prisma.$executeRawUnsafe(`
      INSERT INTO audit_log_part (
        id, user_id, user_name, user_role, action, module, entity, entity_id,
        old_value, new_value, details, ip_address, user_agent, special_flag,
        is_archived, archived_at, archive_s3_uri, created_at
      )
      SELECT
        id, user_id, user_name, user_role, action, module, entity, entity_id,
        old_value, new_value, details, ip_address, user_agent, special_flag,
        is_archived, archived_at, archive_s3_uri, created_at
      FROM audit_log
      ON CONFLICT DO NOTHING;
    `);

    await prisma.$executeRawUnsafe(`DROP TABLE audit_log;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE audit_log_part RENAME TO audit_log;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE audit_log ADD CONSTRAINT fk_audit_log_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_audit_module_created ON audit_log (module, created_at DESC);`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_audit_user_created ON audit_log (user_id, created_at DESC);`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log (entity_id);`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_audit_special_flag ON audit_log (special_flag, created_at DESC) WHERE special_flag = true;`);
    console.log('audit_log monthly range partitioning complete!');
  } else {
    console.log('audit_log is already partitioned.');
  }

  // Ensure current + next 2 month partitions always exist
  const now = new Date();
  for (let offset = 0; offset <= 3; offset++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const partName = `audit_log_${yyyy}_${mm}`;
    const fromIso = d.toISOString().slice(0, 10);
    const toIso = next.toISOString().slice(0, 10);
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS ${partName} PARTITION OF audit_log FOR VALUES FROM ('${fromIso}') TO ('${toIso}');`,
    ).catch(() => {});
  }

  console.log('--- Blueprint PostgreSQL Setup Finished ---');
  await prisma.$disconnect();
}

applyBlueprintSql().catch((err) => {
  console.error('Blueprint SQL failed:', err);
  process.exit(1);
});

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeBoard(boardsArr) {
  if (!Array.isArray(boardsArr) || boardsArr.length === 0) return 'CBSE';
  const joined = boardsArr.join(' ').toUpperCase();
  if (joined.includes('IB')) return 'IB';
  if (joined.includes('ICSE') || joined.includes('CISCE') || joined.includes('ISC')) return 'ICSE';
  if (joined.includes('IGCSE') || joined.includes('CAMBRIDGE') || joined.includes('CAIE')) return 'IGCSE';
  if (joined.includes('CBSE')) return 'CBSE';
  return boardsArr[0].replace(/\s+Board$/i, '').trim() || 'State Board';
}

function normalizeGender(genderStr) {
  const g = String(genderStr || '').toLowerCase();
  if (g.includes('boy')) return 'boys';
  if (g.includes('girl')) return 'girls';
  return 'co_ed';
}

function normalizeCategory(boardingTypeStr, typeStr) {
  const b = String(boardingTypeStr || typeStr || '').toLowerCase();
  if (b.includes('day') && b.includes('boarding')) return 'semi_boarding';
  if (b.includes('semi') || b.includes('weekly')) return 'semi_boarding';
  return 'boarding';
}

function formatInrLakh(amount) {
  const n = Number(amount || 0);
  if (!n || n <= 0) return null;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2).replace(/\.00$/, '')}L`;
  return `₹${n.toLocaleString('en-IN')}`;
}

function collectLocalImages(docsDir, stateSlug, schoolName, schoolSlug) {
  const stateImgDir = path.join(docsDir, 'school_images', stateSlug);
  if (!fs.existsSync(stateImgDir)) return { localLogo: null, localImages: [] };

  let entries = [];
  try {
    entries = fs.readdirSync(stateImgDir);
  } catch {
    return { localLogo: null, localImages: [] };
  }

  const targetSlug = slugify(schoolSlug || schoolName);
  if (!targetSlug) return { localLogo: null, localImages: [] };

  let localLogo = null;
  const localImages = [];

  for (const entry of entries) {
    const lower = entry.toLowerCase();
    if (!lower.startsWith(targetSlug)) continue;
    const fullPath = path.join(stateImgDir, entry);
    let stat;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      try {
        const subFiles = fs.readdirSync(fullPath);
        for (const sf of subFiles) {
          if (/\.(jpg|jpeg|png|webp|gif|avif)$/i.test(sf)) {
            const urlPath = `/school-images/${stateSlug}/${entry}/${sf}`;
            if (sf.toLowerCase().includes('logo') && !localLogo) {
              localLogo = urlPath;
            } else {
              localImages.push(urlPath);
            }
          }
        }
      } catch {}
    } else if (/\.(jpg|jpeg|png|webp|gif|avif)$/i.test(entry)) {
      const urlPath = `/school-images/${stateSlug}/${entry}`;
      if (lower.includes('_logo') && !localLogo) {
        localLogo = urlPath;
      } else {
        localImages.push(urlPath);
      }
    }
  }

  return { localLogo, localImages };
}

async function importAllDocumentsSchools() {
  const docsDir = path.resolve(__dirname, '..', '..', 'Documents');
  if (!fs.existsSync(docsDir)) {
    throw new Error(`Documents directory not found at ${docsDir}`);
  }

  console.log('📂 Ensuring schools.details JSONB column exists...');
  await prisma.$executeRawUnsafe(`ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "details" JSONB;`);

  const allFiles = fs
    .readdirSync(docsDir)
    .filter((f) => f.startsWith('scrape_ezy_boarding_') && f.endsWith('.json'));

  // Place Uttarakhand first so SC001..SC116 are Uttarakhand boarding schools
  allFiles.sort((a, b) => {
    if (a.includes('uttarakhand')) return -1;
    if (b.includes('uttarakhand')) return 1;
    return a.localeCompare(b);
  });

  const allRawSchools = [];
  for (const file of allFiles) {
    const stateSlug = file.replace(/^scrape_ezy_boarding_/, '').replace(/\.json$/, '');
    const filePath = path.join(docsDir, file);
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const list = Array.isArray(parsed) ? parsed : parsed.schools || [];
    for (const item of list) {
      if (item && item.name) {
        allRawSchools.push({ raw: item, stateSlug });
      }
    }
  }

  console.log(`🏫 Found ${allRawSchools.length} real schools across ${allFiles.length} state files in Documents/`);

  // Order flagship 8 Uttarakhand schools at index 0..7 if present so SC001..SC008 preserve exact flagship identities
  const flagshipMatchers = [
    /the doon school/i,
    /welham girls/i,
    /woodstock school/i,
    /sherwood college/i,
    /st\.?\s*george'?s college/i,
    /welham boys/i,
    /kasiga school/i,
    /selaqui international/i,
  ];

  const flagshipPicked = [];
  const usedIndices = new Set();

  for (const rx of flagshipMatchers) {
    const idx = allRawSchools.findIndex((entry, i) => !usedIndices.has(i) && rx.test(entry.raw.name));
    if (idx !== -1) {
      usedIndices.add(idx);
      flagshipPicked.push(allRawSchools[idx]);
    }
  }

  const orderedSchools = [
    ...flagshipPicked,
    ...allRawSchools.filter((_, i) => !usedIndices.has(i)),
  ];

  let imported = 0;
  for (let i = 0; i < orderedSchools.length; i++) {
    const { raw, stateSlug } = orderedSchools[i];
    const rankNum = i + 1;
    const schoolCode = `SC${String(rankNum).padStart(3, '0')}`;

    // Extract fee range from fee_min/fee_max or class_fees
    let minFee = Number(raw.fee_min || 0);
    let maxFee = Number(raw.fee_max || 0);
    if ((!minFee || !maxFee) && Array.isArray(raw.class_fees) && raw.class_fees.length > 0) {
      const annuals = raw.class_fees
        .map((cf) => Number(cf.annual_fee || cf.first_year_total || 0))
        .filter((n) => n > 0);
      if (annuals.length > 0) {
        if (!minFee) minFee = Math.min(...annuals);
        if (!maxFee) maxFee = Math.max(...annuals);
      }
    }
    if (!minFee && maxFee) minFee = maxFee;
    if (!maxFee && minFee) maxFee = minFee;

    const minLakh = formatInrLakh(minFee);
    const maxLakh = formatInrLakh(maxFee);
    const feesDisplay =
      minLakh && maxLakh
        ? minFee === maxFee
          ? `${minLakh} / yr`
          : `${minLakh} - ${maxLakh}`
        : 'Contact School';

    // Compute realistic commission tier based on fee bracket
    const effectiveFee = maxFee || minFee || 350000;
    const defaultCommission =
      effectiveFee >= 1000000
        ? 65000
        : effectiveFee >= 600000
          ? 50000
          : effectiveFee >= 350000
            ? 38000
            : 28000;
    const jrCommission = Math.round(defaultCommission * 0.16);
    const srCommission = Math.round(defaultCommission * 0.22);
    const netProfit = defaultCommission - jrCommission - srCommission;

    const board = normalizeBoard(raw.boards);
    const genderType = normalizeGender(raw.gender);
    const category = normalizeCategory(raw.boarding_type, raw.type);
    const rating = Number(raw.rating || 4.3);
    const classesOffered = String(raw.classes || '1 - 12').replace(/\s+/g, '');

    const { localLogo, localImages } = collectLocalImages(docsDir, stateSlug, raw.name, raw.slug);
    const remoteImages = Array.isArray(raw.images) ? raw.images.filter(Boolean) : [];
    const mergedImages = Array.from(new Set([...localImages, ...remoteImages]));
    const logoUrl = localLogo || raw.logo || mergedImages[0] || null;

    const facilitiesList = Array.isArray(raw.facilities) && raw.facilities.length > 0
      ? raw.facilities
      : ['Hostel', 'Smart Classes', 'Sports'];

    const detailsObj = {
      slug: raw.slug || slugify(raw.name),
      area: raw.area || null,
      locality: raw.locality || null,
      pincode: raw.pincode || null,
      type: raw.type || 'Boarding School',
      boarding_type: raw.boarding_type || 'Full Boarding',
      boards: Array.isArray(raw.boards) && raw.boards.length > 0 ? raw.boards : [board],
      classes: raw.classes || classesOffered,
      gender: raw.gender || (genderType === 'boys' ? 'Boys' : genderType === 'girls' ? 'Girls' : 'Co-ed'),
      about: raw.about || raw.description || null,
      hostel: raw.hostel !== undefined ? Boolean(raw.hostel) : true,
      rating,
      reviews: Number(raw.reviews || 0),
      fee_min: minFee || null,
      fee_max: maxFee || null,
      address: raw.address || `${raw.city || ''}, ${raw.state || ''}`.replace(/^,\s*/, ''),
      lat: raw.lat || null,
      lng: raw.lng || null,
      phone: raw.phone || null,
      email: raw.email || null,
      website: raw.website || null,
      social: raw.social || {},
      logo: logoUrl,
      images: mergedImages,
      local_images: localImages,
      facilities: facilitiesList,
      facility_groups: raw.facility_groups || {},
      founded: raw.founded || null,
      medium: raw.medium || 'English',
      academic_session: raw.academic_session || 'April to March',
      student_teacher_ratio: raw.student_teacher_ratio || null,
      campus_size: raw.campus_size || null,
      languages: Array.isArray(raw.languages) ? raw.languages : ['English'],
      food_options: raw.food_options || null,
      verified: raw.verified !== undefined ? Boolean(raw.verified) : true,
      page_last_updated: raw.page_last_updated || null,
      affiliation_no: raw.affiliation_no || null,
      school_timing: raw.school_timing || null,
      student_count: raw.student_count || null,
      teacher_count: raw.teacher_count || null,
      source_site: raw.source_site || 'ezy',
      source_url: raw.source_url || null,
      latest_fee_session: raw.latest_fee_session || '2026-2027',
      current_admission_session: raw.current_admission_session || '2026-2027',
      class_fees: Array.isArray(raw.class_fees) ? raw.class_fees : [],
      admissions: Array.isArray(raw.admissions) ? raw.admissions : [],
    };

    const cleanState = String(raw.state || 'Uttarakhand').split('|')[0].trim() || 'Uttarakhand';
    const cleanCity = String(raw.city || 'Dehradun').split('|')[0].trim() || 'Dehradun';

    const schoolRecord = await prisma.school.upsert({
      where: { schoolCode },
      update: {
        name: raw.name,
        board,
        genderType,
        category,
        state: cleanState,
        city: cleanCity,
        rank: rankNum,
        rating,
        minFeeAnnual: minFee,
        maxFeeAnnual: maxFee,
        feesDisplay,
        defaultCommission,
        jrCommission,
        srCommission,
        netProfit,
        phone: raw.phone || null,
        sports: facilitiesList,
        hostelQuality: raw.boarding_type || 'Full Boarding',
        description: raw.about || raw.description || `${raw.name} in ${raw.city}, ${raw.state}`,
        website: raw.website || null,
        admissionsEmail: raw.email || null,
        classesOffered,
        isPartner: true,
        status: 'active',
        deletedAt: null,
      },
      create: {
        schoolCode,
        name: raw.name,
        board,
        genderType,
        category,
        state: cleanState,
        city: cleanCity,
        rank: rankNum,
        rating,
        minFeeAnnual: minFee,
        maxFeeAnnual: maxFee,
        feesDisplay,
        defaultCommission,
        jrCommission,
        srCommission,
        netProfit,
        paymentTermsDays: 30,
        whatsappGroupId: `GRP-${schoolCode}`,
        phone: raw.phone || null,
        sports: facilitiesList,
        hostelQuality: raw.boarding_type || 'Full Boarding',
        description: raw.about || raw.description || `${raw.name} in ${raw.city}, ${raw.state}`,
        website: raw.website || null,
        admissionsEmail: raw.email || null,
        classesOffered,
        isPartner: true,
        status: 'active',
      },
    });

    await prisma.$executeRawUnsafe(
      `UPDATE "schools" SET "details" = $1::jsonb WHERE "id" = $2`,
      JSON.stringify(detailsObj),
      schoolRecord.id,
    );

    imported++;
    if (imported % 250 === 0 || imported === orderedSchools.length) {
      console.log(`   ✅ Upserted ${imported} / ${orderedSchools.length} schools...`);
    }
  }

  await prisma
    .$executeRawUnsafe(
      `DELETE FROM "schools" WHERE "details" IS NULL AND id NOT IN (SELECT school_id FROM applications WHERE school_id IS NOT NULL) AND id NOT IN (SELECT school_id FROM shortlists WHERE school_id IS NOT NULL);`,
    )
    .catch(() => 0);

  await prisma.$executeRawUnsafe(
    `SELECT setval('seq_school_code', GREATEST(${orderedSchools.length + 1}, 1400), true);`,
  );

  const totalCount = await prisma.school.count({ where: { deletedAt: null } });
  console.log(`🎉 Successfully imported ${imported} real schools from Documents! Total active in DB: ${totalCount}`);
}

async function verifyImportedSchools() {
  await prisma.$executeRawUnsafe(`
    UPDATE "schools"
    SET
      state = TRIM(SPLIT_PART(state, '|', 1)),
      city = TRIM(SPLIT_PART(city, '|', 1))
    WHERE state LIKE '%|%' OR city LIKE '%|%';
  `);
  const removed = await prisma
    .$executeRawUnsafe(
      `DELETE FROM "schools" WHERE "details" IS NULL AND id NOT IN (SELECT school_id FROM applications WHERE school_id IS NOT NULL) AND id NOT IN (SELECT school_id FROM shortlists WHERE school_id IS NOT NULL);`,
    )
    .catch(() => 0);
  const totalCount = await prisma.school.count({ where: { deletedAt: null } });
  const byState = await prisma.$queryRawUnsafe(`
    SELECT state, COUNT(*)::int AS count
    FROM "schools"
    WHERE deleted_at IS NULL
    GROUP BY state
    ORDER BY count DESC
  `);
  const samples = await prisma.$queryRawUnsafe(`
    SELECT
      school_code AS "schoolCode",
      name,
      city,
      state,
      board,
      fees_display AS "feesDisplay",
      details->>'founded' AS founded,
      details->>'campus_size' AS "campusSize",
      jsonb_array_length(COALESCE(details->'class_fees', '[]'::jsonb))::int AS "classFeesCount",
      jsonb_array_length(COALESCE(details->'facilities', '[]'::jsonb))::int AS "facilitiesCount",
      jsonb_array_length(COALESCE(details->'images', '[]'::jsonb))::int AS "imagesCount"
    FROM "schools"
    WHERE school_code IN ('SC001', 'SC002', 'SC003', 'SC004', 'SC117', 'SC500', 'SC1000', 'SC1368')
    ORDER BY ranking ASC
  `);
  console.log('Removed non-Documents test schools:', removed);
  console.log('Total active schools in PostgreSQL:', totalCount);
  console.log('States count:', byState.length, byState.slice(0, 10));
  console.log('Sample schools:', samples);
}

if (require.main === module) {
  const fn = process.argv.includes('--verify') ? verifyImportedSchools : importAllDocumentsSchools;
  fn()
    .catch((err) => {
      console.error('Failed to process schools from Documents:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

module.exports = { importAllDocumentsSchools, verifyImportedSchools };

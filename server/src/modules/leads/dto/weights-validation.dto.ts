import {
  BadRequestException,
} from '@nestjs/common';

export const BLUEPRINT_SCORING_KEYS = [
  { key: 'budget_match', aliases: ['budgetFit', 'budget_fit', 'budgetMatch'], name: 'Budget Clarity & Tier Match', defaultWeight: 25 },
  { key: 'engagement', aliases: ['parentEngagement', 'parent_engagement'], name: 'Parent Engagement (Calls & WA)', defaultWeight: 25 },
  { key: 'source_quality', aliases: ['sourceQuality', 'locationPreference', 'location_preference'], name: 'Lead Source Intent Quality', defaultWeight: 20 },
  { key: 'timeline_urgency', aliases: ['decisionTimeline', 'decision_timeline', 'timelineUrgency'], name: 'Academic Session & Follow-up Urgency', defaultWeight: 15 },
  { key: 'class_demand', aliases: ['academicReadiness', 'academic_readiness', 'classDemand'], name: 'Class Demand & Readiness', defaultWeight: 15 },
] as const;

export const BLUEPRINT_MATCHING_KEYS = [
  { key: 'class', aliases: ['classGrade', 'class_grade', 'entranceExamScore'], name: 'Target Class Availability', defaultWeight: 15 },
  { key: 'board', aliases: ['boardCurriculum', 'board_curriculum'], name: 'Curriculum Board (CBSE/ICSE/IB/State)', defaultWeight: 15 },
  { key: 'fees_range', aliases: ['budget', 'feeBudget', 'feesRange', 'fees_budget'], name: 'Budget & Annual Fee Alignment', defaultWeight: 15 },
  { key: 'state', aliases: ['location', 'locationDistance', 'city_state'], name: 'State / Location Preference', defaultWeight: 10 },
  { key: 'gender', aliases: ['genderPreference', 'parentIncomeRatio'], name: 'Gender Preference (Boys/Girls/Co-Ed)', defaultWeight: 15 },
  { key: 'school_type', aliases: ['schoolType', 'hostelQuality', 'hostelRating'], name: 'Boarding Type (Boarding/Semi/Online)', defaultWeight: 10 },
  { key: 'facilities', aliases: ['sportsFacility', 'campusFacilities'], name: 'Campus & Sports Facilities', defaultWeight: 10 },
  { key: 'ranking', aliases: ['rating', 'academicScore'], name: 'School Ranking & Standing', defaultWeight: 10 },
] as const;

export function parseAndValidateSum100Criteria(
  body: any,
  spec: ReadonlyArray<{ key: string; aliases: readonly string[]; name: string }>,
  label: string,
): Array<{ criteriaKey: string; criteriaName: string; weight: number }> {
  const rawMap = new Map<string, number>();

  if (Array.isArray(body?.criteria)) {
    for (const item of body.criteria) {
      const k = String(item.name || item.criteriaKey || item.criteria_key || item.key || '').trim();
      const w = Number(item.weight);
      if (k) rawMap.set(k, w);
    }
  } else if (Array.isArray(body)) {
    for (const item of body) {
      const k = String(item.name || item.criteriaKey || item.criteria_key || item.key || '').trim();
      const w = Number(item.weight);
      if (k) rawMap.set(k, w);
    }
  } else if (body && typeof body === 'object') {
    const src = body.weights && typeof body.weights === 'object' ? body.weights : body;
    for (const [k, v] of Object.entries(src)) {
      if (['criteria', 'weights'].includes(k)) continue;
      if (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)))) {
        rawMap.set(k, Number(v));
      }
    }
  }

  const normalized: Array<{ criteriaKey: string; criteriaName: string; weight: number }> = [];
  for (const def of spec) {
    let val: number | undefined;
    if (rawMap.has(def.key)) {
      val = rawMap.get(def.key);
    } else {
      for (const alias of def.aliases) {
        if (rawMap.has(alias)) {
          val = rawMap.get(alias);
          break;
        }
      }
    }

    if (val === undefined || !Number.isFinite(val)) {
      throw new BadRequestException({
        success: false,
        message: `${label} requires all ${spec.length} criteria (${spec.map((s) => s.key).join(', ')}). Missing: ${def.key}.`,
        error: { code: 'MISSING_CRITERIA_WEIGHT', missing: def.key },
      });
    }
    if (!Number.isInteger(val) || val < 0 || val > 100) {
      throw new BadRequestException({
        success: false,
        message: `Weight for "${def.key}" must be an integer between 0 and 100 (got ${val}).`,
        error: { code: 'INVALID_WEIGHT_VALUE', criteria: def.key, value: val },
      });
    }
    normalized.push({ criteriaKey: def.key, criteriaName: def.name, weight: val });
  }

  const total = normalized.reduce((sum, item) => sum + item.weight, 0);
  if (total !== 100) {
    throw new BadRequestException({
      success: false,
      message: `Total weight must equal 100. Current: ${total}`,
      error: `Total weight must equal 100. Current: ${total}`,
      total,
    });
  }

  return normalized;
}

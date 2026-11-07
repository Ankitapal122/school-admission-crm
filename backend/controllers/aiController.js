const School = require('../models/School');
const Lead = require('../models/Lead');

// AI Lead Scoring Algorithm
exports.scoreLead = async (req, res) => {
  try {
    const { leadId } = req.body;
    const lead = await Lead.findById(leadId).populate('parentId').populate('studentId');

    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found.' });

    let score = 50; // base score
    const factors = [];

    // Factor 1: Parent Income & Budget
    if (lead.annualBudget && lead.annualBudget.includes('10L')) {
      score += 20;
      factors.push({ name: 'Budget Alignment', points: '+20', note: 'High budget tier matches top boarding schools' });
    } else if (lead.annualBudget && lead.annualBudget.includes('6L')) {
      score += 15;
      factors.push({ name: 'Budget Alignment', points: '+15', note: 'Standard fee tier match' });
    } else {
      score += 10;
      factors.push({ name: 'Budget Alignment', points: '+10', note: 'Affordable boarding tier' });
    }

    // Factor 2: Class & Academic Year
    if (lead.admissionSession === '2026-27') {
      score += 15;
      factors.push({ name: 'Admission Timeline', points: '+15', note: 'Active immediate session 2026-27' });
    }

    // Factor 3: Lead Priority & Source
    if (lead.leadPriority === 'Hot') {
      score += 15;
      factors.push({ name: 'Parent Urgency', points: '+15', note: 'Marked Hot priority by counsellor' });
    } else if (lead.leadPriority === 'Warm') {
      score += 8;
      factors.push({ name: 'Parent Urgency', points: '+8', note: 'Warm engagement' });
    }

    const finalScore = Math.min(98, score);
    lead.leadScore = finalScore;
    await lead.save();

    return res.status(200).json({
      success: true,
      leadScore: finalScore,
      rating: finalScore >= 80 ? 'Hot Lead' : finalScore >= 65 ? 'Warm Lead' : 'Cold Lead',
      factors,
      recommendation: finalScore >= 80 ? 'High probability of admission. Schedule campus visit immediately.' : 'Follow up with curriculum brochure and fee breakdown.'
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to calculate AI lead score.' });
  }
};

// AI School Recommendation for Uttarakhand Boarding Schools
exports.recommendSchools = async (req, res) => {
  try {
    const { studentGender, targetClass, budgetMax, targetBoard, locationPref } = req.body;

    const query = { deletedAt: null };
    if (studentGender) {
      query.genderType = { $in: [studentGender, 'co_ed'] };
    }

    const schools = await School.find(query);

    const scoredSchools = schools.map(s => {
      let matchScore = 60;
      const reasons = [];

      // Board match
      if (targetBoard && s.board.toLowerCase() === targetBoard.toLowerCase()) {
        matchScore += 15;
        reasons.push(`Curriculum matches ${targetBoard}`);
      }

      // Budget fit
      if (budgetMax && s.annualFeesMin <= budgetMax) {
        matchScore += 15;
        reasons.push(`Annual fee (${s.feesDisplay}) fits parent budget`);
      }

      // Location match
      if (locationPref && s.city.toLowerCase() === locationPref.toLowerCase()) {
        matchScore += 10;
        reasons.push(`Preferred hill station location: ${s.city}`);
      }

      return {
        ...s.toObject(),
        aiMatchScore: Math.min(99, matchScore),
        reasons
      };
    });

    scoredSchools.sort((a, b) => b.aiMatchScore - a.aiMatchScore);

    return res.status(200).json({
      success: true,
      count: scoredSchools.length,
      recommendations: scoredSchools
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to generate recommendations.' });
  }
};

// AI Message Generator (WhatsApp / Email)
exports.generateMessage = async (req, res) => {
  try {
    const { parentName, studentName, schoolName, templateType } = req.body;

    let message = '';
    if (templateType === 'shortlist') {
      message = `Dear ${parentName || 'Parent'},\n\nGreetings from Uttarakhand Boarding Admissions!\n\nBased on your preference for ${studentName || 'your child'}, we have shortlisted top verified residential schools in Dehradun & Mussoorie, including ${schoolName || 'The Doon School'}.\n\nOur senior education counsellor is available to schedule your campus visit and entrance assessment.\n\nWarm regards,\nUttarakhand Boarding Admissions Team`;
    } else if (templateType === 'followup') {
      message = `Dear ${parentName || 'Parent'},\n\nHope you are having a wonderful week! Just following up regarding ${studentName || 'your child'}'s admission application for Academic Session 2026-27.\n\nWould you have 10 minutes tomorrow for a brief counsellor call?\n\nBest regards,\nAdmissions Desk`;
    } else {
      message = `Dear ${parentName || 'Parent'},\n\nThank you for reaching out regarding boarding school admissions in Uttarakhand for ${studentName || 'your child'}. Your application profile has been reviewed and approved by our Senior Academic Director.\n\nHelpline: +91 1800-BOARDING`;
    }

    return res.status(200).json({ success: true, message });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to generate AI message.' });
  }
};

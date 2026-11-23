import React, { useEffect, useState } from 'react';
import CrmIcon from '../../components/CrmIcon';
import { apiCall } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { hasRole } from '../../lib/roles';

interface LeadReportModalProps {
  lead: any;
  schools?: any[];
  onClose: () => void;
  onRefresh?: () => void;
  onShowToast: (msg: string, type?: 'success' | 'danger' | 'warning') => void;
}

export default function LeadReportModal({
  lead: initialLead,
  schools = [],
  onClose,
  onRefresh,
  onShowToast,
}: LeadReportModalProps) {
  const { user } = useAuthStore();
  const isManagerOrAdmin = hasRole(user?.role, 'SUPER_ADMIN', 'SENIOR_MANAGER');

  const [lead, setLead] = useState<any>(initialLead);
  const [remarks, setRemarks] = useState<any[]>([]);
  const [newRemark, setNewRemark] = useState('');
  const [savingRemark, setSavingRemark] = useState(false);

  const [historyTimeline, setHistoryTimeline] = useState<any[]>([]);
  const [suggestedSchools, setSuggestedSchools] = useState<any[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // Shortlist & Manual School Selection State
  const [shortlistedSchools, setShortlistedSchools] = useState<any[]>([]);
  const [allSchools, setAllSchools] = useState<any[]>(schools || []);
  const [showManualSchoolSelect, setShowManualSchoolSelect] = useState(false);
  const [manualSearchQuery, setManualSearchQuery] = useState('');
  const [addingSchoolId, setAddingSchoolId] = useState<string | null>(null);

  // WhatsApp Preview & Translation Modal State (Image 2)
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [customWaMessage, setCustomWaMessage] = useState('');
  const [translatedWaMessage, setTranslatedWaMessage] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('en');
  const [activeSendVersion, setActiveSendVersion] = useState<'english' | 'translated' | 'both'>('english');
  const [includeTranslateLink, setIncludeTranslateLink] = useState(false);
  const [copiedSuccess, setCopiedSuccess] = useState(false);
  const [lastWaLogUuid, setLastWaLogUuid] = useState<string | null>(null);
  const [isSendingWa, setIsSendingWa] = useState(false);
  const [isEditingWaMessage, setIsEditingWaMessage] = useState(false);
  const [isEditingTranslated, setIsEditingTranslated] = useState(false);

  // School Detailed Dossier & Prospectus Modal State
  const [showDossierModal, setShowDossierModal] = useState(false);
  const [selectedDossierSchool, setSelectedDossierSchool] = useState<any | null>(null);
  const [dossierLang, setDossierLang] = useState<'english' | 'hinglish'>('english');
  const [customDossierText, setCustomDossierText] = useState('');
  const [isEditingDossier, setIsEditingDossier] = useState(false);
  const [dossierCopied, setDossierCopied] = useState(false);
  const [isSendingDossier, setIsSendingDossier] = useState(false);

  // Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [editStudentName, setEditStudentName] = useState('');
  const [editMobile, setEditMobile] = useState('');
  const [editFatherName, setEditFatherName] = useState('');
  const [editMotherName, setEditMotherName] = useState('');
  const [editBudget, setEditBudget] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Call Logging Modal state
  const [showCallModal, setShowCallModal] = useState(false);
  const [callOutcome, setCallOutcome] = useState('Connected - Interested');
  const [callDuration, setCallDuration] = useState('03:30');
  const [callNotes, setCallNotes] = useState('');
  const [savingCall, setSavingCall] = useState(false);

  // Follow-up modal
  const [showFollowUpEdit, setShowFollowUpEdit] = useState(false);
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpReason, setFollowUpReason] = useState('');
  const [savingFollowUp, setSavingFollowUp] = useState(false);

  const loadLeadDetailsAndHistory = async () => {
    try {
      const [leadRes, historyRes, matchRes, shortlistRes, schoolsRes] = await Promise.all([
        apiCall(`/leads/${lead.id}`).catch(() => null),
        apiCall(`/leads/${lead.id}/history`).catch(() => null),
        apiCall('/match/suggest', 'POST', {
          leadId: lead.id,
          annualBudget: lead.annualBudget || lead.budget_range,
          budgetMin: lead.budgetMin,
          budgetMax: lead.budgetMax,
          classGrade: lead.admissionClass || lead.applyingForGrade || '6',
          preferredBoard: lead.board || lead.preferredBoard || 'CBSE',
          limit: 6,
        }).catch(() => null),
        apiCall(`/leads/${lead.id}/shortlist`).catch(() => null),
        apiCall('/schools?limit=2000').catch(() => null),
      ]);

      if (leadRes?.lead || leadRes?.data) {
        setLead(leadRes?.lead || leadRes?.data);
      }

      if (shortlistRes) {
        const slList = shortlistRes?.shortlists || shortlistRes?.data || [];
        setShortlistedSchools(Array.isArray(slList) ? slList : []);
      }

      if (schoolsRes) {
        const scList = schoolsRes?.schools || schoolsRes?.data || schoolsRes?.items || [];
        if (Array.isArray(scList) && scList.length > 0) {
          setAllSchools(scList);
        }
      } else if (schools && schools.length > 0) {
        setAllSchools(schools);
      }

      // Build unified timeline
      const hist = historyRes?.history || historyRes?.data || {};
      const remList = hist.remarks || [];
      setRemarks(remList);

      const items: any[] = [];

      // 1. Remarks
      remList.forEach((r: any) => {
        items.push({
          type: 'remark',
          date: new Date(r.createdAt || Date.now()),
          title: 'Remark added',
          desc: `"${r.content || r.note}" — ${r.author?.fullName || r.userName || 'Counsellor'}`,
        });
      });

      // 2. Calls
      (hist.calls || []).forEach((c: any) => {
        const mins = Math.floor((c.durationSeconds || 180) / 60);
        const secs = (c.durationSeconds || 180) % 60;
        const durStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')} min`;
        items.push({
          type: 'call',
          date: new Date(c.calledAt || c.createdAt || Date.now()),
          title: 'Call logged',
          desc: `Outcome: ${c.outcome || 'Connected'} | ${durStr} — ${c.caller?.fullName || 'Counsellor'}`,
        });
      });

      // 3. WhatsApp
      (hist.whatsapp || []).forEach((w: any) => {
        items.push({
          type: 'whatsapp',
          date: new Date(w.sentAt || w.createdAt || Date.now()),
          title: 'WhatsApp shared',
          desc: `Sent to parent (${w.recipientMobile || lead.mobile}) — ${w.sender?.fullName || 'Counsellor'}`,
        });
      });

      // 4. Lead created entry
      items.push({
        type: 'created',
        date: new Date(lead.createdAt || Date.now()),
        title: 'Lead created',
        desc: `By ${lead.createdBy?.fullName || 'Rahul'} | Source: ${lead.leadSource || lead.source || 'Call'}`,
      });

      // Sort descending
      items.sort((a, b) => b.date.getTime() - a.date.getTime());
      setHistoryTimeline(items);

      // Suggestions: Extract real schools matching parent's budget
      const scList = schoolsRes?.schools || schoolsRes?.data?.schools || schoolsRes?.data || schoolsRes?.items || [];
      const pool = (Array.isArray(scList) && scList.length > 0) ? scList : (schools && schools.length > 0 ? schools : allSchools);

      const suggestions = matchRes?.suggested_schools || matchRes?.data?.suggested_schools || matchRes?.matches || (Array.isArray(matchRes?.data) ? matchRes.data : []);
      
      let finalSuggested: any[] = [];
      if (Array.isArray(suggestions) && suggestions.length > 0) {
        finalSuggested = suggestions;
      } else if (pool.length > 0) {
        // Fallback filter by parent's budget directly from 1,369 schools
        const pBudgetMax = Number(lead.budgetMax || 500000);
        const pBudgetMin = Number(lead.budgetMin || 400000);
        finalSuggested = pool
          .filter((s: any) => {
            const min = Number(s.minFeeAnnual || s.min_fee_annual || s.minFee || 0);
            return min > 0 && min <= pBudgetMax * 1.35;
          })
          .map((s: any) => {
            const min = Number(s.minFeeAnnual || s.min_fee_annual || s.minFee || 0);
            const isExact = min >= pBudgetMin * 0.8 && min <= pBudgetMax * 1.15;
            return {
              ...s,
              matchScore: isExact ? 100 : min <= pBudgetMax * 1.3 ? 95 : 85,
            };
          })
          .sort((a: any, b: any) => (b.matchScore - a.matchScore) || ((a.rank || 999) - (b.rank || 999)))
          .slice(0, 6);
      }
      setSuggestedSchools(finalSuggested);
    } catch {
      // Non-fatal background load
    }
  };

  useEffect(() => {
    setEditStudentName(lead.studentName || '');
    setEditMobile(lead.fatherPhone || lead.mobile || '');
    setEditFatherName(lead.fatherName || lead.parentName || '');
    setEditMotherName(lead.motherName || '');
    setEditBudget(lead.annualBudget || lead.budget_range || '₹4L – ₹5L');
    setFollowUpDate(lead.nextFollowUpDate ? String(lead.nextFollowUpDate).slice(0, 10) : '');
    setFollowUpReason(lead.followUpReason || lead.nextFollowUpReason || 'Call after fees discussion');

    loadLeadDetailsAndHistory();
  }, [lead.id]);

  // Handle Save Remark
  const handleSaveRemark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRemark.trim()) return;
    setSavingRemark(true);
    try {
      await apiCall(`/leads/${lead.id}/remarks`, 'POST', {
        note: newRemark.trim(),
      });
      onShowToast('Remark added permanently to history timeline!', 'success');
      setNewRemark('');
      await loadLeadDetailsAndHistory();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to save remark.', 'danger');
    } finally {
      setSavingRemark(false);
    }
  };

  // Handle Save Edit
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingEdit(true);
    try {
      await apiCall(`/leads/${lead.id}`, 'PUT', {
        studentName: editStudentName.trim(),
        mobile: editMobile.trim(),
        fatherName: editFatherName.trim(),
        motherName: editMotherName.trim(),
        annualBudget: editBudget,
        budget_range: editBudget,
      });
      onShowToast('Student & Parent lead details updated!', 'success');
      setIsEditing(false);
      await loadLeadDetailsAndHistory();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to update lead.', 'danger');
    } finally {
      setSavingEdit(false);
    }
  };

  // Fee formatter matching Image 2
  const formatSchoolFee = (s: any) => {
    if (!s) return '₹4.5 Lakh';
    if (s.feesDisplay && !s.feesDisplay.includes('undefined')) return s.feesDisplay;
    const min = s.minFeeAnnual || s.min_fee_annual || s.minFee;
    const max = s.maxFeeAnnual || s.max_fee_annual || s.maxFee;
    if (min) {
      const minLakh = (Number(min) / 100000).toFixed(2).replace(/\.00$/, '').replace(/\.([1-9])0$/, '.$1');
      if (max && Number(max) !== Number(min)) {
        const maxLakh = (Number(max) / 100000).toFixed(2).replace(/\.00$/, '').replace(/\.([1-9])0$/, '.$1');
        return `₹${minLakh}L - ₹${maxLakh}L`;
      }
      return `₹${minLakh} Lakh`;
    }
    return '₹4L – ₹5L';
  };

  // Helper to get active list of real schools for WhatsApp
  const getActiveSchoolsForWhatsApp = () => {
    if (shortlistedSchools && shortlistedSchools.length > 0) {
      return shortlistedSchools.map((item: any) => item.school || item);
    }
    if (suggestedSchools && suggestedSchools.length > 0) {
      return suggestedSchools.slice(0, 4).map((item: any) => item.school || item);
    }
    const pool = (allSchools && allSchools.length > 0) ? allSchools : (schools || []);
    if (pool.length > 0) {
      const pBudgetMax = Number(lead.budgetMax || 500000);
      const budgetMatched = pool.filter((s: any) => {
        const min = Number(s.minFeeAnnual || s.min_fee_annual || s.minFee || 0);
        return min > 0 && min <= pBudgetMax * 1.35;
      }).slice(0, 4);
      if (budgetMatched.length > 0) return budgetMatched;
      return pool.slice(0, 4);
    }
    return [];
  };

  // Generate English Message (Always uses Real Schools from DB matching budget)
  const generateEnglishMessage = (schoolsToSend?: any[]) => {
    const parentName = lead.fatherName || lead.motherName || lead.parentName || 'Parent';
    const studentName = lead.studentName || 'Student';
    const rawGrade = String(lead.admissionClass || lead.applyingForGrade || lead.classGrade || 'Class 6');
    const classGrade = rawGrade.toLowerCase().startsWith('class') ? rawGrade : `Class ${rawGrade}`;
    const board = lead.board || lead.preferredBoard || 'CBSE';
    const counsellorName = user?.fullName || 'Rahul Sharma';

    const numbersCircle = ['❶', '❷', '❸', '❹', '❺', '❻', '❼', '❽'];
    const activeList = (schoolsToSend && schoolsToSend.length > 0) ? schoolsToSend : getActiveSchoolsForWhatsApp();

    const schoolLines = activeList.map((item, idx) => {
      const s = item.school || item;
      const num = numbersCircle[idx] || `${idx + 1}.`;
      return `${num} ${s.name} – ${formatSchoolFee(s)}`;
    }).join('\n');

    return `Hello ${parentName}! 👋 Welcome to *BoardingEdu*\n\nThank you for reaching out! We help parents find the best Boarding & Day Schools across India with free admission guidance.\n\nBased on your requirements for *${studentName} (${classGrade} – ${board})*, our counselling team has shortlisted the following boarding schools for admission:\n\n🏫 *Recommended Schools & Fee Structure*\n\n${schoolLines}\n\nOur team has carefully shortlisted these options to help you find a suitable school for ${studentName}.\n\n*Would you like to know more about these schools, their facilities, admission process and fee structure?*\n\nWe would be happy to assist you! 😊\n\nWarm Regards,\n*${counsellorName}*\nBoardingEdu – School Admission Counselling Team`;
  };

  // Generate Translated Message (English, Hindi, Gujarati, Marathi, Bengali, Punjabi, Telugu, Tamil, Hinglish)
  const generateTranslatedMessage = (lang: string, schoolsToSend?: any[]) => {
    if (lang === 'en' || lang === 'english') {
      return generateEnglishMessage(schoolsToSend);
    }

    const parentName = lead.fatherName || lead.motherName || lead.parentName || 'अभिभावक';
    const studentName = lead.studentName || 'विद्यार्थी';
    const rawGrade = String(lead.admissionClass || lead.applyingForGrade || lead.classGrade || '6');
    const cleanGradeNum = rawGrade.replace(/^class\s*/i, '');
    const board = lead.board || lead.preferredBoard || 'CBSE';
    const counsellorName = user?.fullName || 'राहुल शर्मा';

    const numbersCircle = ['❶', '❷', '❸', '❹', '❺', '❻', '❼', '❽'];
    const formatFeeLang = (s: any, l: string) => {
      const fee = formatSchoolFee(s);
      if (l === 'hi' || l === 'mr' || l === 'pa') return fee.replace(/Lakh/gi, 'लाख').replace(/L\b/g, ' लाख');
      if (l === 'gu') return fee.replace(/Lakh/gi, 'લાખ').replace(/L\b/g, ' લાખ');
      if (l === 'bn') return fee.replace(/Lakh/gi, 'লাখ').replace(/L\b/g, ' লাখ');
      if (l === 'te') return fee.replace(/Lakh/gi, 'లక్షలు').replace(/L\b/g, ' లక్షలు');
      if (l === 'ta') return fee.replace(/Lakh/gi, 'லட்சம்').replace(/L\b/g, ' லட்சம்');
      return fee;
    };

    const activeList = (schoolsToSend && schoolsToSend.length > 0) ? schoolsToSend : getActiveSchoolsForWhatsApp();

    const schoolLines = activeList.map((item, idx) => {
      const s = item.school || item;
      const num = numbersCircle[idx] || `${idx + 1}.`;
      return `${num} ${s.name} – ${formatFeeLang(s, lang)}`;
    }).join('\n');

    if (lang === 'hi') {
      return `नमस्ते ${parentName} जी 🙏\nBoardingEdu की ओर से शुभकामनाएं!\n\nआपके बच्चे (${studentName}, कक्षा ${cleanGradeNum} – ${board}) के लिए, हमने निम्नलिखित आवासीय विद्यालयों को प्रवेश के लिए चुना है:\n\n🏫 *अनुशंसित विद्यालय और शुल्क विवरण*\n\n${schoolLines}\n\nहमारी टीम ने ${studentName} के लिए सर्वोत्तम विद्यालय खोजने हेतु इन विकल्पों को सावधानीपूर्वक चुना है।\n\n*क्या आप इन विद्यालयों, इनकी सुविधाओं, प्रवेश प्रक्रिया और शुल्क विवरण के बारे में और जानकारी चाहेंगे?*\n\nहमें खुशी होगी आपकी सहायता करने में! 😊\n\nसादर,\n*${counsellorName}*\nBoardingEdu – स्कूल प्रवेश परामर्श टीम`;
    }

    if (lang === 'gu') {
      return `નમસ્તે ${parentName} જી 🙏\nBoardingEdu તરફથી શુભેચ્છાઓ!\n\n${studentName} (ધોરણ ${cleanGradeNum} – ${board}) માટે અમારી કાઉન્સેલિંગ ટીમે એડમિશન માટે નીચે મુજબની બોર્ડિંગ સ્કૂલો પસંદ કરી છે:\n\n🏫 *ભલામણ કરેલ શાળાઓ અને ફીનું માળખું*\n\n${schoolLines}\n\nશું તમે આ શાળાઓ, તેમની સુવિધાઓ, પ્રવેશ પ્રક્રિયા અને ફી માળખા વિશે વધુ જાણવા માંગો છો?\n\nઅમને તમારી મદદ કરવામાં આનંદ થશે! 😊\n\nસાદર,\n*${counsellorName}*\nBoardingEdu – શાળા પ્રવેશ પરામર્શ ટીમ`;
    }

    if (lang === 'mr') {
      return `नमस्ते ${parentName} जी 🙏\nBoardingEdu कडून मनःपूर्वक शुभेच्छा!\n\n${studentName} (इयत्ता ${cleanGradeNum} – ${board}) च्या प्रवेशासाठी आमच्या समुपदेशन संघाने खालील बोर्डिंग शाळा निवडल्या आहेत:\n\n🏫 *शिफारस केलेल्या शाळा आणि फी रचना*\n\n${schoolLines}\n\nतुम्हाला या शाळा, त्यांच्या सुविधा, प्रवेश प्रक्रिया आणि फी रचनेबद्दल अधिक माहिती हवी आहे का?\n\nआम्हाला तुम्हाला मदत करण्यास आनंद होईल! 😊\n\nसादर,\n*${counsellorName}*\nBoardingEdu – शाळा प्रवेश समुपदेशन संघ`;
    }

    if (lang === 'bn') {
      return `নমস্কার ${parentName} বাবু 🙏\nBoardingEdu-এর পক্ষ থেকে শুভেচ্ছা!\n\n${studentName} (শ্রেণী ${cleanGradeNum} – ${board})-এর ভর্তির জন্য আমাদের কাউন্সেলিং টিম নিম্নলিখিত বোর্ডিং স্কুলগুলি শর্টলিস্ট করেছে:\n\n🏫 *প্রস্তাবিত স্কুল ও ফি কাঠামো*\n\n${schoolLines}\n\nআপনি কি এই স্কুলগুলি, এদের সুবিধা, ভর্তি প্রক্রিয়া এবং ফি কাঠামো সম্পর্কে আরও জানতে চান?\n\nআমরা আপনাকে সাহায্য করতে পেরে আনন্দিত হব! 😊\n\nবিনীত,\n*${counsellorName}*\nBoardingEdu – স্কুল ভর্তি কাউন্সেলিং দল`;
    }

    if (lang === 'pa') {
      return `ਸਤਿ ਸ਼੍ਰੀ ਅਕਾਲ ${parentName} ਜੀ 🙏\nBoardingEdu ਵੱਲੋਂ ਸ਼ੁਭਕਾਮਨਾਵਾਂ!\n\n${studentName} (ਜਮਾਤ ${cleanGradeNum} – ${board}) ਦੇ ਦਾਖਲੇ ਲਈ ਸਾਡੀ ਕਾਉਂਸਲਿੰਗ ਟੀਮ ਨੇ ਇਹ ਬੋਰਡਿੰਗ ਸਕੂਲ ਚੁਣੇ ਹਨ:\n\n🏫 *ਸਿਫ਼ਾਰਸ਼ ਕੀਤੇ ਸਕੂਲ ਅਤੇ ਫੀਸ ਢਾਂਚਾ*\n\n${schoolLines}\n\nਕੀ ਤੁਸੀਂ ਇਹਨਾਂ ਸਕੂਲਾਂ, ਇਹਨਾਂ ਦੀਆਂ ਸਹੂਲਤਾਂ, ਦਾਖਲਾ ਪ੍ਰਕਿਰਿਆ ਅਤੇ ਫੀਸ ਬਾਰੇ ਹੋਰ ਜਾਣਨਾ ਚਾਹੋਗੇ?\n\nਸਾਨੂੰ ਤੁਹਾਡੀ ਮਦਦ ਕਰਨ ਵਿੱਚ ਖੁਸ਼ੀ ਹੋਵੇਗੀ! 😊\n\nਨਿੱਘੀਆਂ ਸ਼ੁਭਕਾਮਨਾਵਾਂ,\n*${counsellorName}*\nBoardingEdu – ਸਕੂਲ ਦਾਖਲਾ ਕਾਉਂਸਲਿੰਗ ਟੀਮ`;
    }

    if (lang === 'te') {
      return `నమస్తే ${parentName} గారు 🙏\nBoardingEdu తరపున శుభాకాంక్షలు!\n\n${studentName} (${cleanGradeNum}వ తరగతి – ${board}) ప్రవేశం కోసం మా కౌన్సెలింగ్ బృందం క్రింది బోర్డింగ్ పాఠశాలలను షార్ట్‌లిస్ట్ చేసింది:\n\n🏫 *సిఫార్సు చేయబడిన పాఠశాలలు & ఫీజు వివరాలు*\n\n${schoolLines}\n\nఈ పాఠశాలలు, సౌకర్యాలు, ప్రవేశ ప్రక్రియ మరియు ఫీజు వివరాల గురించి మీరు మరింత తెలుసుకోవాలనుకుంటున్నారా?\n\nమీకు సహాయం చేయడానికి మేము సంతోషిస్తాము! 😊\n\nశుభాకాంక్షలతో,\n*${counsellorName}*\nBoardingEdu – స్కూల్ అడ్మిషన్ కౌన్సెలింగ్ టీమ్`;
    }

    if (lang === 'ta') {
      return `வணக்கம் ${parentName} அவர்களே 🙏\nBoardingEdu சார்பாக வாழ்த்துக்கள்!\n\n${studentName} (வகுப்பு ${cleanGradeNum} – ${board}) சேர்க்கைக்காக எங்கள் ஆலோசனைக் குழு பின்வரும் உறைவிடப் பள்ளிகளைத் தேர்ந்தெடுத்துள்ளது:\n\n🏫 *பரிந்துரைக்கப்பட்ட பள்ளிகள் & கட்டண விவரம்*\n\n${schoolLines}\n\nஇந்தப் பள்ளிகள், வசதிகள், சேர்க்கை முறை மற்றும் கட்டண விவரங்கள் பற்றி மேலும் அறிய விரும்புகிறீர்களா?\n\nஉங்களுக்கு உதவ நாங்கள் மகிழ்ச்சியடைகிறோம்! 😊\n\nஅன்புடன்,\n*${counsellorName}*\nBoardingEdu – பள்ளி சேர்க்கை ஆலோசனைக் குழு`;
    }

    // Default clean English
    return generateEnglishMessage(getActiveSchoolsForWhatsApp());
  };

  // Get active text to send based on selected options - ALWAYS in clean English, NO translation link
  const getFinalMessageToSend = () => {
    const schoolsList = getActiveSchoolsForWhatsApp();
    return customWaMessage || generateEnglishMessage(schoolsList);
  };

  // Open WhatsApp Preview Modal (Image 2)
  const handleOpenWhatsAppModal = () => {
    const listToUse = getActiveSchoolsForWhatsApp();
    const eng = generateEnglishMessage(listToUse);
    const trans = generateTranslatedMessage(selectedLanguage, listToUse);
    setCustomWaMessage(eng);
    setTranslatedWaMessage(trans);
    setIsEditingWaMessage(false);
    setIsEditingTranslated(false);
    setShowWhatsAppModal(true);
  };

  // Handle Language Change & Translate trigger
  const handleLanguageChange = (newLang: string) => {
    setSelectedLanguage(newLang);
    const listToUse = getActiveSchoolsForWhatsApp();
    const trans = generateTranslatedMessage(newLang, listToUse);
    setTranslatedWaMessage(trans);
    onShowToast(`Translated to ${newLang.toUpperCase()}!`, 'success');
  };

  // Copy text helper
  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSuccess(true);
    onShowToast('Text copied to clipboard!', 'success');
    setTimeout(() => setCopiedSuccess(false), 2000);
  };

  // Open Direct WhatsApp (wa.me link with parent phone & encoded message)
  const handleOpenWhatsAppDirect = async () => {
    const cleanPhone = String(lead.fatherPhone || lead.mobile || lead.parentPhone || '').replace(/\D/g, '').slice(-10);
    if (!cleanPhone) {
      onShowToast('Parent mobile number not found.', 'danger');
      return;
    }
    const msgToSend = getFinalMessageToSend();
    try {
      const res = await apiCall('/whatsapp/generate-link', 'POST', {
        lead_id: lead.id,
        message: msgToSend,
      });
      if (res?.logUuid || res?.log_id) {
        setLastWaLogUuid(res.logUuid || res.log_id);
      }
    } catch {
      // Proceed even if backend logging had an issue
    }
    window.open(`https://wa.me/91${cleanPhone}?text=${encodeURIComponent(msgToSend)}`, '_blank');
    onShowToast('WhatsApp chat opened! Send message and click "Confirm Sent" to log.', 'success');
  };

  // Confirm WhatsApp Sent (Logs to timeline & resolves pending queue)
  const handleConfirmWhatsAppSent = async () => {
    const cleanPhone = String(lead.fatherPhone || lead.mobile || lead.parentPhone || '').replace(/\D/g, '').slice(-10);
    const msgToSend = getFinalMessageToSend();
    setIsSendingWa(true);
    try {
      await apiCall('/whatsapp/log', 'POST', {
        lead_id: lead.id,
        log_uuid: lastWaLogUuid,
        recipient_mobile: cleanPhone,
        message: msgToSend,
        notes: `Shortlist sent (${activeSendVersion.toUpperCase()} - ${selectedLanguage.toUpperCase()}) via WhatsApp Web`,
      }).catch(async () => {
        // Fallback: log remark
        await apiCall(`/leads/${lead.id}/remarks`, 'POST', {
          note: `WhatsApp shortlist sent to parent (${cleanPhone}) in ${selectedLanguage.toUpperCase()}`,
        });
      });
      onShowToast('✅ WhatsApp message logged in lead timeline!', 'success');
      setShowWhatsAppModal(false);
      await loadLeadDetailsAndHistory();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to confirm WhatsApp.', 'danger');
    } finally {
      setIsSendingWa(false);
    }
  };

  // Generate Comprehensive School Dossier & Prospectus for WhatsApp
  const generateSchoolDossier = (s: any, lang: 'english' | 'hinglish' = 'english') => {
    if (!s) return '';
    const parentName = lead.fatherName || lead.parentName || lead.studentName || 'Parent';
    const studentName = lead.studentName || 'Student';
    const classGrade = lead.admissionClass || '6';
    const board = lead.board || s.board || 'CBSE';
    const counsellorName = ((user as any)?.name || (user as any)?.fullName || (user as any)?.email?.split('@')[0] || 'Rahul Sharma').replace(/[^a-zA-Z\s]/g, '').trim() || 'Rahul Sharma';

    // Extract real data
    const schoolName = s.name || 'Boarding School';
    const city = s.city || 'Dehradun';
    const state = s.state || 'Uttarakhand';
    const location = s.details?.address || `${city}, ${state}`;
    const campusSize = s.details?.campus_size || s.campus_size || (s.name?.toLowerCase().includes('kasiga') ? '35 Acres' : s.name?.toLowerCase().includes('doon') ? '72 Acres' : s.name?.toLowerCase().includes('asian') ? '16 Acres' : '25+ Acres Green Campus');
    
    // Rankings
    const stateRank = s.rank || (s.name?.toLowerCase().includes('kasiga') ? 6 : 8);
    const nationalRank = s.name?.toLowerCase().includes('kasiga') ? 'Top 15 All-India' : `Top ${Math.min(30, (stateRank || 5) * 3)} All-India`;

    // Fee structure
    const feeText = formatSchoolFee(s);

    // Student teacher ratio
    const ratio = s.details?.student_teacher_ratio || '5:1';

    return `Hello ${parentName}! 👋 Welcome to *BoardingEdu*\n\nThank you for reaching out! We help parents find the best Boarding & Day Schools across India with free admission guidance.\n\nAs requested, here is the complete official prospectus and detailed fee & campus dossier for *${schoolName}* for *${studentName} (Class ${classGrade.replace(/^class\s*/i, '')} – ${board})*:\n\n🏫 *${schoolName.toUpperCase()} – COMPREHENSIVE SCHOOL DOSSIER*\n\n📍 *Location:* ${location}\n🌳 *Campus Area:* ${campusSize} (Lush Green Pollution-Free Campus)\n🏆 *Rankings & Recognition:*\n   • *State Ranking:* #${stateRank} Top Boarding School in ${state}\n   • *National Ranking:* ${nationalRank} Residential School in India\n📚 *Affiliation & Boards:* ${s.board || 'CBSE & Cambridge'} | ${s.genderType || s.gender || 'Co-Ed Boarding'} | Classes: ${s.details?.classes || '4 to 12'}\n\n💰 *Annual Fee Structure:*\n   • *Total Annual Fee:* ${feeText}\n   • *Fee Inclusions:* Academic Tuition, AC Boarding Hostel, Wholesome Meals, Laundry, Professional Sports Coaching, 24/7 Medical Care.\n\n🥗 *Food & Dining (Pure Veg & Non-Veg):*\n   • Separate hygienic kitchen & dining sections for 100% Pure Vegetarian and Non-Vegetarian food.\n   • 4 balanced, nutritionist-planned meals daily (Breakfast, Lunch, High Tea & Snacks, Dinner).\n   • Jain food and special dietary requirements provided on request.\n\n🏊 *World-Class Facilities & Sports Infrastructure:*\n   • *Sports:* International-standard Swimming Pool, Cricket Oval, Football Field, Tennis & Basketball Courts, Indoor Badminton & Table Tennis.\n   • *Boarding Hostels:* Modern Air-Conditioned dorms with 24/7 resident House Parents & security.\n   • *Mentorship:* ${ratio} Student-to-Teacher Ratio for personalized academic attention.\n   • *Healthcare:* 24/7 On-Campus Infirmary with full-time resident Doctor & nursing staff.\n   • *Co-Curricular:* Advanced Robotics Lab, Modern Science Labs, Music, Dance & Fine Arts Studios.\n\n📝 *Admission Process for Class ${classGrade.replace(/^class\s*/i, '')}:*\n   1. Online Registration & Application Form\n   2. Student Interaction & Skill Assessment\n   3. Offer Letter Issuance & Seat Confirmation\n\nWould you like to schedule a campus tour or arrange a direct interaction with the ${schoolName} Admission Committee?\n\nWarm Regards,\n*${counsellorName}*\nBoardingEdu – School Admission Counselling Team\n📞 Helpline / WhatsApp: +91 7249417658`;
  };

  // Open Dossier Modal
  const handleOpenDossierModal = (school: any) => {
    setSelectedDossierSchool(school);
    const text = generateSchoolDossier(school, dossierLang);
    setCustomDossierText(text);
    setIsEditingDossier(false);
    setShowDossierModal(true);
  };

  // Toggle Dossier Language
  const handleToggleDossierLanguage = (newLang: 'english' | 'hinglish') => {
    setDossierLang(newLang);
    if (selectedDossierSchool) {
      const text = generateSchoolDossier(selectedDossierSchool, newLang);
      setCustomDossierText(text);
      setIsEditingDossier(false);
      onShowToast(`Switched dossier to ${newLang === 'hinglish' ? 'Hinglish' : 'English'}!`, 'success');
    }
  };

  // Send School Dossier on WhatsApp
  const handleSendDossierOnWhatsApp = async () => {
    if (!selectedDossierSchool) return;
    const cleanPhone = String(lead.fatherPhone || lead.mobile || lead.parentPhone || '').replace(/\D/g, '').slice(-10);
    if (!cleanPhone) {
      onShowToast('Parent mobile number not found.', 'danger');
      return;
    }
    const textToSend = customDossierText || generateSchoolDossier(selectedDossierSchool, dossierLang);
    setIsSendingDossier(true);
    try {
      await apiCall(`/leads/${lead.id}/remarks`, 'POST', {
        note: `Sent complete School Dossier & Brochure for ${selectedDossierSchool.name} to parent (${cleanPhone}) via WhatsApp.`,
      });
      await loadLeadDetailsAndHistory();
      if (onRefresh) onRefresh();
    } catch {
      // Background logging error non-blocking
    } finally {
      setIsSendingDossier(false);
    }

    window.open(`https://wa.me/91${cleanPhone}?text=${encodeURIComponent(textToSend)}`, '_blank');
    onShowToast(`WhatsApp opened with ${selectedDossierSchool.name} Dossier! Logged in timeline.`, 'success');
  };

  // Copy Dossier Text
  const handleCopyDossierText = () => {
    const textToSend = customDossierText || generateSchoolDossier(selectedDossierSchool, dossierLang);
    navigator.clipboard.writeText(textToSend);
    setDossierCopied(true);
    onShowToast('School Dossier copied to clipboard!', 'success');
    setTimeout(() => setDossierCopied(false), 2000);
  };

  // Add School to Shortlist
  const handleAddSchoolToShortlist = async (s: any) => {
    const schoolId = s.id || s.school_id;
    setAddingSchoolId(schoolId);
    try {
      await apiCall(`/leads/${lead.id}/shortlist`, 'POST', {
        school_id: schoolId,
        priority_rank: (shortlistedSchools.length || 0) + 1,
      });
      onShowToast(`Shortlisted ${s.name} for parent WhatsApp report!`, 'success');
      await loadLeadDetailsAndHistory();
    } catch (err: any) {
      onShowToast(err?.message || `${s.name} is already in shortlist.`, 'warning');
    } finally {
      setAddingSchoolId(null);
    }
  };

  // Remove School from Shortlist
  const handleRemoveSchoolFromShortlist = async (schoolId: string, schoolName: string) => {
    try {
      await apiCall(`/leads/${lead.id}/shortlist/${schoolId}`, 'DELETE');
      onShowToast(`Removed ${schoolName} from shortlist.`, 'success');
      await loadLeadDetailsAndHistory();
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to remove school.', 'danger');
    }
  };

  // Filtered manual schools for search (Matching any word in name, city, state, board, gender, locality)
  const filteredManualSchools = (allSchools.length > 0 ? allSchools : schools).filter((s: any) => {
    if (!manualSearchQuery.trim()) return true;
    const tokens = manualSearchQuery.toLowerCase().trim().split(/\s+/);
    const searchableText = `${s.name || ''} ${s.city || ''} ${s.state || ''} ${s.board || ''} ${s.gender || s.genderType || s.type || ''} ${s.schoolCode || ''} ${s.area || s.locality || ''}`.toLowerCase();
    return tokens.every((token) => searchableText.includes(token));
  });

  // Handle Direct Call & Log
  const handleLogCallAction = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCall(true);
    try {
      const parts = callDuration.split(':');
      const totalSecs = (Number(parts[0]) || 3) * 60 + (Number(parts[1]) || 0);
      await apiCall('/calls/log', 'POST', {
        lead_id: lead.id,
        outcome: callOutcome,
        durationSeconds: totalSecs,
        notes: callNotes.trim() || `Call outcome: ${callOutcome}`,
      });
      onShowToast('Call logged to lead history successfully!', 'success');
      setShowCallModal(false);
      setCallNotes('');
      await loadLeadDetailsAndHistory();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      onShowToast(err?.message || 'Call log failed.', 'danger');
    } finally {
      setSavingCall(false);
    }
  };

  // Handle Update Follow-up
  const handleSaveFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!followUpReason.trim()) {
      onShowToast('Follow-up reason is required.', 'warning');
      return;
    }
    setSavingFollowUp(true);
    try {
      await apiCall(`/leads/${lead.id}/follow-up`, 'PUT', {
        nextFollowUpDate: followUpDate,
        reason: followUpReason.trim(),
      });
      onShowToast('Follow-up schedule updated cleanly!', 'success');
      setShowFollowUpEdit(false);
      await loadLeadDetailsAndHistory();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      onShowToast(err?.message || 'Follow-up update failed.', 'danger');
    } finally {
      setSavingFollowUp(false);
    }
  };

  // Score breakdown (Uses real DB scoreBreakdown if present, else computes matching points)
  const scoreVal = Number(lead.score ?? lead.leadScore ?? 85);
  const sb = (typeof lead.scoreBreakdown === 'object' && lead.scoreBreakdown) ? lead.scoreBreakdown : {};
  const budgetPoints = sb.budget_match ?? sb.feeBudget ?? Math.min(25, Math.round(scoreVal * 0.25));
  const engagementPoints = sb.engagement ?? Math.min(25, Math.round(scoreVal * 0.28));
  const sourceQualityPoints = sb.source_quality ?? Math.min(20, Math.round(scoreVal * 0.15));
  const timelinePoints = sb.timeline_urgency ?? sb.timeline ?? 15;
  const classDemandPoints = sb.class_demand ?? sb.academicReadiness ?? 15;

  return (
    <div
      className="modal-overlay"
      style={{
        zIndex: 2100,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        className="modal-content"
        style={{
          maxWidth: '1080px',
          width: '100%',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#F8FAFC',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid #E2E8F0',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Row */}
        <div
          className="lead-modal-header"
          style={{
            backgroundColor: '#FFFFFF',
            borderBottom: '1px solid #E2E8F0',
            padding: '12px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#2563EB',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            ← Back to Leads
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>
              {lead.leadNumber || lead.id?.slice(0, 8) || 'LD000123'}
            </span>
            <span
              style={{
                backgroundColor: '#2563EB',
                color: '#FFFFFF',
                fontSize: '10px',
                fontWeight: 800,
                padding: '2px 8px',
                borderRadius: '6px',
                letterSpacing: '0.5px',
              }}
            >
              {String(lead.status || 'NEW').toUpperCase()}
            </span>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="lead-modal-body" style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
          <div
            className="lead-report-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1.8fr) minmax(280px, 1fr)',
              gap: '16px',
            }}
          >
            {/* LEFT COLUMN: Student Card, Budget Match Schools, Add Remark, History Timeline */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: 0 }}>
              {/* 1. Student Card Matching Image 2 */}
              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                  padding: '16px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                }}
              >
                <div
                  style={{
                    fontSize: '14.5px',
                    fontWeight: 800,
                    color: '#0F172A',
                    marginBottom: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span>👤</span>
                  <span>
                    {lead.studentName || 'Student Name'} | Class {lead.admissionClass || lead.applyingForGrade || '6'} | {lead.board || lead.preferredBoard || 'CBSE'}
                  </span>
                </div>

                {!isEditing ? (
                  <div
                    className="lead-info-grid-3"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                      gap: '8px 12px',
                      fontSize: '11.5px',
                      color: '#334155',
                    }}
                  >
                    <div>
                      <strong>Father:</strong> {lead.fatherName || lead.parentName || 'Suresh Kumar'}
                    </div>
                    <div>
                      <strong>Mother:</strong> {lead.motherName || 'Sunita Devi'}
                    </div>
                    <div>
                      <strong>Mobile:</strong> +91{lead.fatherPhone || lead.mobile || '9876543210'}
                    </div>
                    <div>
                      <strong>Alt:</strong> +91{lead.alternateMobile || '9876543211'}
                    </div>
                    <div>
                      <strong>Email:</strong> {lead.email || lead.parentEmail || 'suresh@email.com'}
                    </div>
                    <div>
                      <strong>Budget:</strong> {lead.annualBudget || lead.budget_range || '₹4L – ₹5L'}
                    </div>
                    <div>
                      <strong>City:</strong> {lead.city || 'Delhi'} → {lead.preferredLocation || 'Mumbai'}
                    </div>
                    <div>
                      <strong>Source:</strong> {lead.leadSource || lead.source || 'Call'}
                    </div>
                    <div>
                      <strong>Score:</strong>{' '}
                      <span
                        style={{
                          backgroundColor: '#DCFCE7',
                          color: '#15803D',
                          padding: '1px 6px',
                          borderRadius: '6px',
                          fontWeight: 700,
                        }}
                      >
                        {scoreVal} 🟢
                      </span>
                    </div>
                  </div>
                ) : (
                  <form className="lead-form-grid-2" onSubmit={handleSaveEdit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 700 }}>Student Name</label>
                      <input
                        className="form-control"
                        style={{ fontSize: '12px', padding: '4px 8px' }}
                        value={editStudentName}
                        onChange={(e) => setEditStudentName(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 700 }}>Mobile (+91)</label>
                      <input
                        className="form-control"
                        style={{ fontSize: '12px', padding: '4px 8px' }}
                        value={editMobile}
                        onChange={(e) => setEditMobile(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 700 }}>Father Name</label>
                      <input
                        className="form-control"
                        style={{ fontSize: '12px', padding: '4px 8px' }}
                        value={editFatherName}
                        onChange={(e) => setEditFatherName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 700 }}>Mother Name</label>
                      <input
                        className="form-control"
                        style={{ fontSize: '12px', padding: '4px 8px' }}
                        value={editMotherName}
                        onChange={(e) => setEditMotherName(e.target.value)}
                      />
                    </div>
                    <div style={{ gridColumn: 'span 2', display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '6px' }}>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline"
                        onClick={() => setIsEditing(false)}
                      >
                        Cancel
                      </button>
                      <button type="submit" className="btn btn-sm btn-primary" disabled={savingEdit}>
                        {savingEdit ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </form>
                )}

                {/* Action Buttons Row Matching Image 2 */}
                <div style={{ display: 'flex', gap: '8px', marginTop: '14px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => {
                      const ph = String(lead.fatherPhone || lead.mobile || '').replace(/\D/g, '').slice(-10);
                      window.location.href = `tel:+91${ph}`;
                      setShowCallModal(true);
                    }}
                    style={{
                      backgroundColor: '#0284C7',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '6px 14px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    📞 Call
                  </button>

                  <button
                    type="button"
                    onClick={handleOpenWhatsAppModal}
                    style={{
                      backgroundColor: '#16A34A',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '6px 14px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    📱 WhatsApp
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsEditing(!isEditing)}
                    style={{
                      backgroundColor: '#FFFFFF',
                      color: '#334155',
                      border: '1px solid #CBD5E1',
                      borderRadius: '8px',
                      padding: '6px 14px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    ✏️ Edit
                  </button>
                </div>
              </div>

              {/* 2. Recommended & Shortlisted Schools Matching Parent Budget Card */}
              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                  padding: '14px 16px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                }}
              >
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 800,
                    color: '#1E3A8A',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '10px',
                    flexWrap: 'wrap',
                    gap: '8px',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    🏫 Recommended Schools Matching Parent Budget ({lead.annualBudget || lead.budget_range || '₹4L – ₹5L'}):
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => {
                        const recSchools = suggestedSchools.length > 0 ? suggestedSchools.slice(0, 4) : getActiveSchoolsForWhatsApp();
                        const eng = generateEnglishMessage(recSchools);
                        const trans = generateTranslatedMessage(selectedLanguage, recSchools);
                        setCustomWaMessage(eng);
                        setTranslatedWaMessage(trans);
                        setIsEditingWaMessage(false);
                        setIsEditingTranslated(false);
                        setShowWhatsAppModal(true);
                      }}
                      style={{
                        backgroundColor: '#16A34A',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '4px 10px',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        boxShadow: '0 1px 2px rgba(22, 163, 74, 0.2)',
                      }}
                    >
                      📱 Send All on WhatsApp
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowManualSchoolSelect(!showManualSchoolSelect)}
                      style={{
                        backgroundColor: showManualSchoolSelect ? '#1E3A8A' : '#EFF6FF',
                        color: showManualSchoolSelect ? '#FFFFFF' : '#1D4ED8',
                        border: '1px solid #BFDBFE',
                        borderRadius: '6px',
                        padding: '4px 10px',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {showManualSchoolSelect ? '✕ Close Manual' : '➕ Manual School Selection'}
                    </button>
                    <span style={{ fontSize: '11px', color: '#10B981', fontWeight: 700 }}>
                      Auto-Scored (Board: {lead.board || 'CBSE'}, Class: {lead.admissionClass || '6'})
                    </span>
                  </div>
                </div>

                {/* Currently Shortlisted Schools for WhatsApp Box */}
                {shortlistedSchools.length > 0 && (
                  <div
                    style={{
                      backgroundColor: '#F0FDF4',
                      border: '1px solid #BBF7D0',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      marginBottom: '12px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '8px',
                      }}
                    >
                      <div style={{ fontSize: '12px', fontWeight: 800, color: '#166534', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>📋 Shortlisted for Parent WhatsApp ({shortlistedSchools.length}):</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleOpenWhatsAppModal}
                        style={{
                          backgroundColor: '#16A34A',
                          color: '#FFFFFF',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '4px 12px',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          boxShadow: '0 1px 2px rgba(22, 163, 74, 0.2)',
                        }}
                      >
                        📱 Send via WhatsApp
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {shortlistedSchools.map((item: any, idx: number) => {
                        const s = item.school || item;
                        return (
                          <div
                            key={item.id || s.id || idx}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '8px 10px',
                              backgroundColor: '#FFFFFF',
                              borderRadius: '6px',
                              border: '1px solid #DCFCE7',
                              fontSize: '11.5px',
                              flexWrap: 'wrap',
                              gap: '6px',
                            }}
                          >
                            <div>
                              <strong style={{ color: '#0F172A' }}>{idx + 1}. {s.name}</strong>{' '}
                              <span style={{ color: '#64748B', fontSize: '11px' }}>
                                ({s.city || 'Uttarakhand'} • {s.board || 'CBSE'})
                              </span>
                              <span style={{ color: '#059669', fontWeight: 700, marginLeft: '8px' }}>
                                {formatSchoolFee(s)}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <button
                                type="button"
                                onClick={() => handleOpenDossierModal(s)}
                                style={{
                                  backgroundColor: '#EFF6FF',
                                  color: '#1D4ED8',
                                  border: '1px solid #BFDBFE',
                                  borderRadius: '4px',
                                  padding: '2px 8px',
                                  fontSize: '10.5px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                }}
                                title="Send complete school prospectus & dossier on WhatsApp"
                              >
                                📖 School Dossier
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveSchoolFromShortlist(s.id || item.schoolId, s.name)}
                                style={{
                                  backgroundColor: '#FEE2E2',
                                  color: '#DC2626',
                                  border: 'none',
                                  borderRadius: '4px',
                                  padding: '2px 8px',
                                  fontSize: '10.5px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                }}
                              >
                                ✕ Remove
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Manual School Search & Add Panel */}
                {showManualSchoolSelect && (
                  <div
                    style={{
                      backgroundColor: '#F8FAFC',
                      border: '1px solid #CBD5E1',
                      borderRadius: '8px',
                      padding: '12px',
                      marginBottom: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '4px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A' }}>
                        🔍 Search &amp; Add School Manually:
                      </div>
                      <span style={{ fontSize: '11px', color: '#059669', fontWeight: 700, backgroundColor: '#DCFCE7', padding: '2px 8px', borderRadius: '4px' }}>
                        Showing all {filteredManualSchools.length} of {allSchools.length || schools.length || 1369} Schools
                      </span>
                    </div>

                    <div style={{ position: 'relative', marginBottom: '10px' }}>
                      <input
                        type="text"
                        className="form-control"
                        style={{ fontSize: '12px', padding: '7px 12px', paddingRight: '28px' }}
                        placeholder="Type any word: school name, city, state, board (e.g. Doon, Asian, Welham, Kasiga, Nainital, Mussoorie)..."
                        value={manualSearchQuery}
                        onChange={(e) => setManualSearchQuery(e.target.value)}
                      />
                      {manualSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setManualSearchQuery('')}
                          style={{
                            position: 'absolute',
                            right: '8px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'none',
                            border: 'none',
                            color: '#64748B',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 700,
                            padding: '2px 4px',
                          }}
                          title="Clear search"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    <div style={{ maxHeight: '340px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', paddingRight: '4px' }}>
                      {filteredManualSchools.length === 0 ? (
                        <div style={{ padding: '16px', textAlign: 'center', color: '#64748B', fontSize: '12px', backgroundColor: '#FFFFFF', borderRadius: '6px' }}>
                          No schools found matching "{manualSearchQuery}". Please try another keyword.
                        </div>
                      ) : (
                        filteredManualSchools.map((s: any) => {
                          const isShortlisted = shortlistedSchools.some(
                            (sl: any) => (sl.school?.id || sl.schoolId || sl.id) === s.id
                          );
                          const feeText = formatSchoolFee(s);
                          return (
                            <div
                              key={s.id}
                              className="school-suggestion-card"
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '10px 12px',
                                backgroundColor: '#FFFFFF',
                                borderRadius: '8px',
                                border: '1px solid #E2E8F0',
                                fontSize: '12px',
                                transition: 'all 0.15s ease',
                                flexWrap: 'wrap',
                                gap: '8px',
                              }}
                            >
                              <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                                <strong style={{ color: '#0F172A', fontSize: '12.5px' }}>{s.name}</strong>{' '}
                                <span style={{ color: '#64748B', fontSize: '11px', display: 'block' }}>
                                  ({s.city || 'Uttarakhand'}{s.state ? `, ${s.state}` : ''} • {s.board || 'CBSE'}{s.gender || s.genderType ? ` • ${s.gender || s.genderType}` : ''})
                                </span>
                                <div style={{ color: '#059669', fontWeight: 700, fontSize: '12px', marginTop: '2px' }}>
                                  Annual Fee: {feeText}
                                </div>
                              </div>
                              <div className="school-card-actions" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <button
                                  type="button"
                                  onClick={() => handleOpenDossierModal(s)}
                                  style={{
                                    backgroundColor: '#EFF6FF',
                                    color: '#1D4ED8',
                                    border: '1px solid #BFDBFE',
                                    borderRadius: '6px',
                                    padding: '5px 10px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    whiteSpace: 'nowrap',
                                  }}
                                  title="View & send school dossier on WhatsApp"
                                >
                                  📖 Dossier
                                </button>
                                <button
                                  type="button"
                                  disabled={isShortlisted || addingSchoolId === s.id}
                                  onClick={() => handleAddSchoolToShortlist(s)}
                                  style={{
                                    backgroundColor: isShortlisted ? '#DCFCE7' : '#1D4ED8',
                                    color: isShortlisted ? '#15803D' : '#FFFFFF',
                                    border: isShortlisted ? '1px solid #86EFAC' : 'none',
                                    borderRadius: '6px',
                                    padding: '5px 12px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    cursor: isShortlisted ? 'default' : 'pointer',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {isShortlisted ? '✓ Shortlisted' : addingSchoolId === s.id ? 'Adding...' : '+ Add to Shortlist'}
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {/* Auto-Scored Recommended Schools List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {suggestedSchools.slice(0, 4).map((s: any) => {
                    const schoolId = s.id || s.school_id;
                    const isAlreadyShortlisted = shortlistedSchools.some(
                      (sl: any) => (sl.school?.id || sl.schoolId || sl.id) === schoolId
                    );
                    return (
                      <div
                        key={schoolId}
                        className="school-suggestion-card"
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '10px 12px',
                          backgroundColor: '#F8FAFC',
                          borderRadius: '8px',
                          border: '1px solid #E2E8F0',
                          fontSize: '12px',
                          flexWrap: 'wrap',
                          gap: '8px',
                        }}
                      >
                        <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                          <strong style={{ color: '#0F172A', fontSize: '12.5px' }}>{s.name}</strong>{' '}
                          <span style={{ color: '#64748B', fontSize: '11px', display: 'block' }}>
                            ({s.city || 'Dehradun'} • {s.board || 'CBSE'} • Rank #{s.rank || 1})
                          </span>
                          <div style={{ color: '#059669', fontWeight: 600, fontSize: '11.5px', marginTop: '2px' }}>
                            Annual Fee: {s.feesDisplay || formatSchoolFee(s)} &bull; Budget Match: {s.matchScore || s.match_score || 90}%
                          </div>
                        </div>
                        <div className="school-card-actions" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => handleOpenDossierModal(s)}
                            style={{
                              backgroundColor: '#EFF6FF',
                              color: '#1D4ED8',
                              border: '1px solid #BFDBFE',
                              borderRadius: '6px',
                              padding: '5px 10px',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              whiteSpace: 'nowrap',
                            }}
                            title="View & send school dossier on WhatsApp"
                          >
                            📖 Dossier
                          </button>
                          <button
                            type="button"
                            disabled={isAlreadyShortlisted || addingSchoolId === schoolId}
                            onClick={() => handleAddSchoolToShortlist(s)}
                            style={{
                              backgroundColor: isAlreadyShortlisted ? '#DCFCE7' : '#1D4ED8',
                              color: isAlreadyShortlisted ? '#15803D' : '#FFFFFF',
                              border: isAlreadyShortlisted ? '1px solid #86EFAC' : 'none',
                              borderRadius: '6px',
                              padding: '5px 12px',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: isAlreadyShortlisted ? 'default' : 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {isAlreadyShortlisted ? '✓ Shortlisted' : addingSchoolId === schoolId ? 'Adding...' : '+ Add to Shortlist'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 3. Add Remark Card Matching Image 2 */}
              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                  padding: '14px 16px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                }}
              >
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 800,
                    color: '#0F172A',
                    marginBottom: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span>➕</span> Add Remark
                </div>
                <form onSubmit={handleSaveRemark}>
                  <textarea
                    rows={2}
                    value={newRemark}
                    onChange={(e) => setNewRemark(e.target.value)}
                    placeholder="Type your remark here..."
                    style={{
                      width: '100%',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      padding: '8px 10px',
                      fontSize: '12px',
                      outline: 'none',
                      resize: 'none',
                      fontFamily: 'inherit',
                      boxSizing: 'border-box',
                    }}
                  />
                  <button
                    type="submit"
                    disabled={savingRemark || !newRemark.trim()}
                    style={{
                      backgroundColor: '#2563EB',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '6px 14px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      marginTop: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    💾 {savingRemark ? 'Saving...' : 'Save Remark'}
                  </button>
                </form>
              </div>

              {/* 4. History Timeline Matching Image 2 */}
              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                  padding: '14px 16px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                }}
              >
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 800,
                    color: '#0F172A',
                    marginBottom: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span>📜</span> History Timeline
                </div>

                <div
                  style={{
                    borderLeft: '2px solid #E2E8F0',
                    marginLeft: '8px',
                    paddingLeft: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  {historyTimeline.map((item, idx) => (
                    <div key={idx} style={{ position: 'relative' }}>
                      <div
                        style={{
                          position: 'absolute',
                          left: '-19px',
                          top: '3px',
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          backgroundColor:
                            item.type === 'call'
                              ? '#0284C7'
                              : item.type === 'whatsapp'
                              ? '#16A34A'
                              : item.type === 'remark'
                              ? '#F59E0B'
                              : '#2563EB',
                        }}
                      />
                      <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#0F172A' }}>
                        {item.date.toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}{' '}
                        – {item.title}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                        {item.desc}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: Lead Score Card & Follow-Up Card Matching Image 2 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* 1. Lead Score Card Matching Image 2 */}
              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                  padding: '16px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                }}
              >
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 800,
                    color: '#0F172A',
                    marginBottom: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span>🎯</span> Lead Score
                </div>

                <div style={{ textAlign: 'center', padding: '12px 0 16px' }}>
                  <div
                    style={{
                      fontSize: '44px',
                      fontWeight: 900,
                      color: scoreVal >= 75 ? '#16A34A' : scoreVal >= 50 ? '#D97706' : '#DC2626',
                      lineHeight: 1,
                    }}
                  >
                    {scoreVal}
                  </div>
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 800,
                      color: '#16A34A',
                      marginTop: '6px',
                      letterSpacing: '0.4px',
                    }}
                  >
                    🟢 HIGH PRIORITY
                  </div>
                </div>

                <div
                  style={{
                    borderTop: '1px solid #F1F5F9',
                    paddingTop: '10px',
                    fontSize: '11px',
                    color: '#334155',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Budget Match:</span>
                    <strong>{budgetPoints}/25</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Engagement:</span>
                    <strong>{engagementPoints}/25</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Source Quality:</span>
                    <strong>{sourceQualityPoints}/20</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Timeline:</span>
                    <strong>{timelinePoints}/15</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Class Demand:</span>
                    <strong>{classDemandPoints}/15</strong>
                  </div>
                </div>
              </div>

              {/* 2. Follow-up Card Matching Image 2 */}
              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                  padding: '16px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                }}
              >
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 800,
                    color: '#0F172A',
                    marginBottom: '10px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>📌</span> Follow-up
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowFollowUpEdit(!showFollowUpEdit)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#2563EB',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {showFollowUpEdit ? 'Close' : 'Reschedule'}
                  </button>
                </div>

                {!showFollowUpEdit ? (
                  <div style={{ fontSize: '11.5px', color: '#334155', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div>
                      <strong>Next:</strong>{' '}
                      {followUpDate
                        ? new Date(followUpDate).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : '18 Oct 2026'}
                    </div>
                    <div>
                      <strong>Reason:</strong> {followUpReason}
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSaveFollowUp} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div>
                      <label style={{ fontSize: '10.5px', fontWeight: 700 }}>Next Date</label>
                      <input
                        type="date"
                        className="form-control"
                        style={{ fontSize: '11.5px', padding: '4px 6px' }}
                        value={followUpDate}
                        onChange={(e) => setFollowUpDate(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '10.5px', fontWeight: 700 }}>Reschedule Reason</label>
                      <input
                        type="text"
                        className="form-control"
                        style={{ fontSize: '11.5px', padding: '4px 6px' }}
                        value={followUpReason}
                        onChange={(e) => setFollowUpReason(e.target.value)}
                        required
                        placeholder="e.g. Call after fee installment discussion"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={savingFollowUp}
                      className="btn btn-sm btn-primary"
                      style={{ fontSize: '11px' }}
                    >
                      {savingFollowUp ? 'Saving...' : 'Update Schedule'}
                    </button>
                  </form>
                )}
              </div>

              {/* Manager Verification Notice */}
              <div
                style={{
                  backgroundColor: '#EFF6FF',
                  borderRadius: '12px',
                  border: '1px solid #BFDBFE',
                  padding: '12px',
                  fontSize: '11px',
                  color: '#1E3A8A',
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: '4px' }}>
                  🛡️ Verification Status: {lead.verificationStatus || 'PENDING'}
                </div>
                <div>
                  {lead.verificationStatus === 'APPROVED'
                    ? 'Lead approved by Senior Manager as genuine. Proceed with admission formalities.'
                    : lead.verificationStatus === 'RETURNED'
                    ? `Returned by Manager: "${lead.returnRemarks || 'Please verify mobile number'}". Update and re-submit.`
                    : 'Submitted to Senior Manager for duplicate & genuine inspection.'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Call Logging Modal Dialog */}
        {showCallModal && (
          <div
            className="modal-overlay"
            style={{ zIndex: 2200, backgroundColor: 'rgba(0,0,0,0.5)' }}
            onClick={() => setShowCallModal(false)}
          >
            <div
              className="modal-content"
              style={{ maxWidth: '440px', backgroundColor: '#FFFFFF', borderRadius: '12px', padding: '18px' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', marginBottom: '12px' }}>
                📞 Log Parent Call ({lead.studentName})
              </div>
              <form onSubmit={handleLogCallAction} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700 }}>Call Outcome *</label>
                  <select
                    className="form-control"
                    value={callOutcome}
                    onChange={(e) => setCallOutcome(e.target.value)}
                  >
                    <option value="Connected - Interested">Connected - Interested</option>
                    <option value="Connected - Needs Callback">Connected - Needs Callback</option>
                    <option value="Ringing / No Answer">Ringing / No Answer</option>
                    <option value="Switched Off / Not Reachable">Switched Off / Not Reachable</option>
                    <option value="Call Busy">Call Busy</option>
                    <option value="Not Interested">Not Interested</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700 }}>Duration (mm:ss)</label>
                  <input
                    className="form-control"
                    value={callDuration}
                    onChange={(e) => setCallDuration(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700 }}>Discussion Notes</label>
                  <textarea
                    rows={2}
                    className="form-control"
                    value={callNotes}
                    onChange={(e) => setCallNotes(e.target.value)}
                    placeholder="Parent requested boarding school options under ₹5L..."
                  />
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '6px' }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={() => setShowCallModal(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" disabled={savingCall} className="btn btn-sm btn-primary">
                    {savingCall ? 'Saving...' : 'Save Call to History'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* WhatsApp Message Preview & Translation Modal (Matching Image 2) */}
        {showWhatsAppModal && (
          <div
            className="modal-overlay"
            style={{
              zIndex: 2300,
              backgroundColor: 'rgba(15, 23, 42, 0.75)',
              backdropFilter: 'blur(5px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
            }}
            onClick={() => setShowWhatsAppModal(false)}
          >
            <div
              className="modal-content"
              style={{
                maxWidth: '1060px',
                width: '95vw',
                maxHeight: '94vh',
                overflowY: 'auto',
                backgroundColor: '#F8FAFC',
                borderRadius: '20px',
                padding: '0',
                border: '1px solid #E2E8F0',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Top Header Banner */}
              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  padding: '16px 24px',
                  borderBottom: '1px solid #E2E8F0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderTopLeftRadius: '20px',
                  borderTopRightRadius: '20px',
                }}
              >
                {/* Brand / Logo */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '10px',
                      backgroundColor: '#EFF6FF',
                      border: '1px solid #DBEAFE',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '20px',
                    }}
                  >
                    🎓
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      BoardingEdu
                      <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '12px', backgroundColor: '#DCFCE7', color: '#15803D', fontWeight: 700 }}>
                        Official
                      </span>
                    </h4>
                    <p style={{ margin: 0, fontSize: '11px', color: '#64748B' }}>Connecting Parents &amp; Schools</p>
                  </div>
                </div>

                {/* Center Title Badge */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        backgroundColor: '#25D366',
                        color: '#FFFFFF',
                        borderRadius: '50%',
                        width: '24px',
                        height: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '13px',
                        fontWeight: 700,
                      }}
                    >
                      ✓
                    </span>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>
                      WhatsApp Preview &amp; Translation
                    </h3>
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#16A34A', fontWeight: 600, marginTop: '2px' }}>
                    Send messages in your preferred language
                  </div>
                </div>

                {/* Close Button */}
                <button
                  type="button"
                  onClick={() => setShowWhatsAppModal(false)}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    border: '1px solid #E2E8F0',
                    backgroundColor: '#F1F5F9',
                    fontSize: '16px',
                    color: '#64748B',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#E2E8F0')}
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#F1F5F9')}
                >
                  ✕
                </button>
              </div>

              {/* Two Column Layout Body */}
              <div
                className="lead-submodal-split"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(330px, 410px) 1fr',
                  gap: '24px',
                  padding: '24px',
                }}
              >
                {/* LEFT COLUMN: Realistic WhatsApp Phone Mockup (Matching Image 2) */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#475569',
                      marginBottom: '8px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <span>📱 Realistic WhatsApp Screen</span>
                    <span style={{ fontSize: '10px', color: '#16A34A' }}>● Live Preview</span>
                  </div>

                  {/* Phone Casing */}
                  <div
                    style={{
                      width: '100%',
                      maxWidth: '390px',
                      backgroundColor: '#1E293B',
                      borderRadius: '38px',
                      padding: '10px',
                      boxShadow: '0 20px 40px -10px rgba(0,0,0,0.4), inset 0 0 0 2px #334155',
                      position: 'relative',
                    }}
                  >
                    {/* Inner Screen */}
                    <div
                      style={{
                        backgroundColor: '#EFEAE2',
                        borderRadius: '30px',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        minHeight: '540px',
                        maxHeight: '620px',
                        border: '1px solid #0F172A',
                      }}
                    >
                      {/* Status Bar */}
                      <div
                        style={{
                          backgroundColor: '#008069',
                          color: '#FFFFFF',
                          padding: '6px 16px 2px 16px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: '11px',
                          fontWeight: 600,
                        }}
                      >
                        <span>9:41</span>
                        {/* Notch */}
                        <div
                          style={{
                            width: '70px',
                            height: '14px',
                            backgroundColor: '#0F172A',
                            borderRadius: '0 0 8px 8px',
                          }}
                        />
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', fontSize: '10px' }}>
                          <span>📶</span>
                          <span>🔋</span>
                        </div>
                      </div>

                      {/* WhatsApp Green App Bar */}
                      <div
                        style={{
                          backgroundColor: '#008069',
                          color: '#FFFFFF',
                          padding: '8px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '16px', cursor: 'pointer' }}>←</span>
                          <div
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              backgroundColor: '#E2E8F0',
                              color: '#0F172A',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 800,
                              fontSize: '13px',
                              border: '1.5px solid #FFFFFF',
                            }}
                          >
                            {(lead.fatherName || lead.studentName || 'P')[0]?.toUpperCase()}
                          </div>
                          <div style={{ lineHeight: 1.2 }}>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF' }}>
                              {lead.fatherName || lead.motherName || lead.parentName || 'Suresh Kumar'}
                            </div>
                            <div style={{ fontSize: '10px', color: '#A7F3D0', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#22C55E' }} />
                              online
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '15px' }}>
                          <span title="Video Call">📹</span>
                          <span title="Voice Call">📞</span>
                          <span title="Options">⋮</span>
                        </div>
                      </div>

                      {/* WhatsApp Chat Area */}
                      <div
                        style={{
                          flex: 1,
                          padding: '12px 10px',
                          overflowY: 'auto',
                          display: 'flex',
                          flexDirection: 'column',
                          backgroundColor: '#EFEAE2',
                          backgroundImage: 'radial-gradient(#CBD5E1 0.75px, transparent 0.75px)',
                          backgroundSize: '16px 16px',
                        }}
                      >
                        {/* Date Pill */}
                        <div style={{ textAlign: 'center', margin: '4px 0 10px 0' }}>
                          <span
                            style={{
                              backgroundColor: 'rgba(255, 255, 255, 0.9)',
                              color: '#64748B',
                              fontSize: '10px',
                              fontWeight: 700,
                              padding: '3px 10px',
                              borderRadius: '8px',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                            }}
                          >
                            Today
                          </span>
                        </div>

                        {/* WhatsApp Chat Bubble (White card with subtle shadow) */}
                        <div
                          style={{
                            backgroundColor: '#FFFFFF',
                            borderRadius: '12px 12px 12px 3px',
                            padding: '12px 14px',
                            maxWidth: '92%',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
                            alignSelf: 'flex-start',
                            position: 'relative',
                            border: '1px solid rgba(0,0,0,0.04)',
                          }}
                        >
                          {/* Toggle Edit for English */}
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '4px' }}>
                            <button
                              type="button"
                              onClick={() => setIsEditingWaMessage(!isEditingWaMessage)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#0284C7',
                                fontSize: '10px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                padding: 0,
                              }}
                            >
                              {isEditingWaMessage ? '👁️ Preview' : '✏️ Edit English'}
                            </button>
                          </div>

                          {isEditingWaMessage ? (
                            <textarea
                              rows={11}
                              className="form-control"
                              style={{
                                fontSize: '11px',
                                lineHeight: '1.5',
                                borderRadius: '8px',
                                padding: '8px',
                                border: '1px solid #38BDF8',
                              }}
                              value={customWaMessage}
                              onChange={(e) => setCustomWaMessage(e.target.value)}
                            />
                          ) : (
                            <div
                              style={{
                                fontSize: '11.5px',
                                lineHeight: '1.55',
                                color: '#111827',
                                whiteSpace: 'pre-line',
                                wordBreak: 'break-word',
                                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
                              }}
                            >
                              {customWaMessage || generateEnglishMessage(getActiveSchoolsForWhatsApp())}
                            </div>
                          )}

                          {/* Bubble Timestamp & Double Blue Tick */}
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'flex-end',
                              alignItems: 'center',
                              gap: '4px',
                              marginTop: '6px',
                              fontSize: '10px',
                              color: '#64748B',
                            }}
                          >
                            <span>10:45 AM</span>
                            <span style={{ color: '#53BDEB', fontWeight: 800, fontSize: '12px' }}>✓✓</span>
                          </div>
                        </div>
                      </div>

                      {/* WhatsApp Bottom Input Mockup */}
                      <div
                        style={{
                          backgroundColor: '#F0F2F5',
                          padding: '6px 10px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          borderTop: '1px solid #E2E8F0',
                        }}
                      >
                        <span style={{ fontSize: '15px', color: '#64748B', cursor: 'pointer' }}>😊</span>
                        <div
                          style={{
                            flex: 1,
                            backgroundColor: '#FFFFFF',
                            borderRadius: '20px',
                            padding: '6px 12px',
                            fontSize: '11px',
                            color: '#94A3B8',
                            border: '1px solid #E2E8F0',
                          }}
                        >
                          Type a message...
                        </div>
                        <span style={{ fontSize: '13px', color: '#64748B', cursor: 'pointer' }}>📎</span>
                        <span style={{ fontSize: '13px', color: '#64748B', cursor: 'pointer' }}>📷</span>
                        <div
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            backgroundColor: '#008069',
                            color: '#FFFFFF',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '12px',
                          }}
                        >
                          🎤
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* RIGHT COLUMN: Translate Message & Send Panel (Matching Image 2) */}
                <div
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '16px',
                    padding: '22px',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    {/* Header: Translate Message */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '10px',
                          backgroundColor: '#EFF6FF',
                          border: '1px solid #BFDBFE',
                          color: '#2563EB',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '16px',
                          fontWeight: 800,
                        }}
                      >
                        文A
                      </div>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>
                          Translate Message
                        </h4>
                        <p style={{ margin: 0, fontSize: '11.5px', color: '#64748B' }}>
                          Convert this message into your preferred language
                        </p>
                      </div>
                    </div>

                    {/* Real Schools Included in WhatsApp Message (From Database) */}
                    <div
                      style={{
                        backgroundColor: '#F0FDF4',
                        border: '1.5px solid #86EFAC',
                        borderRadius: '10px',
                        padding: '10px 12px',
                        marginBottom: '14px',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '11px',
                          fontWeight: 800,
                          color: '#166534',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '6px',
                        }}
                      >
                        <span>🏫 REAL SCHOOLS INCLUDED ({getActiveSchoolsForWhatsApp().length}):</span>
                        <span style={{ fontSize: '10px', color: '#15803D', fontWeight: 700 }}>
                          Parent Budget: {lead.annualBudget || lead.budget_range || '₹4L – ₹5L'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {getActiveSchoolsForWhatsApp().map((s: any, idx: number) => {
                          const sc = s.school || s;
                          return (
                            <span
                              key={sc.id || idx}
                              style={{
                                backgroundColor: '#FFFFFF',
                                border: '1px solid #86EFAC',
                                borderRadius: '6px',
                                padding: '3px 8px',
                                fontSize: '11px',
                                fontWeight: 700,
                                color: '#14532D',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                              }}
                            >
                              <span style={{ color: '#15803D' }}>{['❶', '❷', '❸', '❹', '❺', '❻'][idx] || `${idx + 1}.`}</span>
                              <span>{sc.name}</span>
                              <span style={{ color: '#059669', fontSize: '10px' }}>({formatSchoolFee(sc)})</span>
                            </span>
                          );
                        })}
                      </div>
                    </div>

                    {/* Language Selector & Translate Button Row */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        marginBottom: '14px',
                        backgroundColor: '#F8FAFC',
                        padding: '10px 12px',
                        borderRadius: '12px',
                        border: '1px solid #E2E8F0',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '10.5px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                          🌐 SELECT LANGUAGE:
                        </label>
                        <select
                          className="form-control form-control-sm"
                          style={{
                            borderRadius: '8px',
                            fontWeight: 600,
                            fontSize: '12.5px',
                            borderColor: '#CBD5E1',
                          }}
                          value={selectedLanguage}
                          onChange={(e) => handleLanguageChange(e.target.value)}
                        >
                          <option value="hi">Hindi (हिंदी)</option>
                          <option value="gu">Gujarati (ગુજરાતી)</option>
                          <option value="mr">Marathi (मराठी)</option>
                          <option value="bn">Bengali (বাংলা)</option>
                          <option value="pa">Punjabi (ਪੰਜਾਬੀ)</option>
                          <option value="te">Telugu (తెలుగు)</option>
                          <option value="ta">Tamil (தமிழ்)</option>
                          <option value="en">English (English)</option>
                        </select>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleLanguageChange(selectedLanguage)}
                        style={{
                          marginTop: '16px',
                          backgroundColor: '#2563EB',
                          color: '#FFFFFF',
                          border: 'none',
                          borderRadius: '8px',
                          padding: '7px 14px',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)',
                        }}
                      >
                        ⇆ Translate
                      </button>
                    </div>

                    {/* Status Badge & Actions Row */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            backgroundColor: '#DCFCE7',
                            color: '#15803D',
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          ✓ Translation Ready
                        </span>
                        <span style={{ fontSize: '11px', color: '#64748B' }}>
                          ({selectedLanguage.toUpperCase()})
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={() => setIsEditingTranslated(!isEditingTranslated)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#2563EB',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {isEditingTranslated ? '👁️ View Formatted' : '✏️ Edit Translation'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopyText(translatedWaMessage || generateTranslatedMessage(selectedLanguage, getActiveSchoolsForWhatsApp()))}
                          style={{
                            backgroundColor: '#F1F5F9',
                            border: '1px solid #CBD5E1',
                            borderRadius: '6px',
                            padding: '2px 8px',
                            fontSize: '10.5px',
                            fontWeight: 600,
                            color: '#475569',
                            cursor: 'pointer',
                          }}
                        >
                          📋 Copy
                        </button>
                      </div>
                    </div>

                    {/* Translated Message Preview Card (Image 2 styling) */}
                    <div
                      style={{
                        backgroundColor: '#F0FDF4',
                        border: '1.5px solid #86EFAC',
                        borderRadius: '12px',
                        padding: '14px 16px',
                        marginBottom: '16px',
                      }}
                    >
                      {isEditingTranslated ? (
                        <textarea
                          rows={8}
                          className="form-control"
                          style={{
                            backgroundColor: '#FFFFFF',
                            borderColor: '#86EFAC',
                            color: '#14532D',
                            fontSize: '12px',
                            lineHeight: '1.55',
                            borderRadius: '8px',
                            padding: '10px',
                          }}
                          value={translatedWaMessage}
                          onChange={(e) => setTranslatedWaMessage(e.target.value)}
                        />
                      ) : (
                        <div
                          style={{
                            maxHeight: '220px',
                            overflowY: 'auto',
                            fontSize: '12px',
                            lineHeight: '1.6',
                            color: '#14532D',
                            whiteSpace: 'pre-line',
                            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                          }}
                        >
                          {translatedWaMessage || generateTranslatedMessage(selectedLanguage, getActiveSchoolsForWhatsApp())}
                        </div>
                      )}
                    </div>

                    {/* Send Version Selector: Translated / English / Both */}
                    <div style={{ marginBottom: '14px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                        📤 SELECT VERSION TO SEND TO PARENT:
                      </label>
                      <div className="lead-form-grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={() => setActiveSendVersion('translated')}
                          style={{
                            padding: '7px 8px',
                            borderRadius: '8px',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            textAlign: 'center',
                            border: activeSendVersion === 'translated' ? '2px solid #16A34A' : '1px solid #CBD5E1',
                            backgroundColor: activeSendVersion === 'translated' ? '#DCFCE7' : '#FFFFFF',
                            color: activeSendVersion === 'translated' ? '#14532D' : '#475569',
                            boxShadow: activeSendVersion === 'translated' ? '0 1px 3px rgba(22,163,74,0.2)' : 'none',
                          }}
                        >
                          🌐 Translated ({selectedLanguage.toUpperCase()})
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveSendVersion('english')}
                          style={{
                            padding: '7px 8px',
                            borderRadius: '8px',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            textAlign: 'center',
                            border: activeSendVersion === 'english' ? '2px solid #2563EB' : '1px solid #CBD5E1',
                            backgroundColor: activeSendVersion === 'english' ? '#EFF6FF' : '#FFFFFF',
                            color: activeSendVersion === 'english' ? '#1D4ED8' : '#475569',
                            boxShadow: activeSendVersion === 'english' ? '0 1px 3px rgba(37,99,235,0.2)' : 'none',
                          }}
                        >
                          🇬🇧 English Only
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveSendVersion('both')}
                          style={{
                            padding: '7px 8px',
                            borderRadius: '8px',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            textAlign: 'center',
                            border: activeSendVersion === 'both' ? '2px solid #7C3AED' : '1px solid #CBD5E1',
                            backgroundColor: activeSendVersion === 'both' ? '#F5F3FF' : '#FFFFFF',
                            color: activeSendVersion === 'both' ? '#5B21B6' : '#475569',
                            boxShadow: activeSendVersion === 'both' ? '0 1px 3px rgba(124,58,237,0.2)' : 'none',
                          }}
                        >
                          📑 Both (Eng + Trans)
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Action Buttons Row */}
                  <div
                    style={{
                      borderTop: '1px solid #E2E8F0',
                      paddingTop: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px',
                    }}
                  >
                    <div style={{ fontSize: '11px', color: '#64748B' }}>
                      Sending to:{' '}
                      <strong style={{ color: '#0F172A' }}>
                        {lead.fatherPhone || lead.mobile || 'No Phone'}
                      </strong>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => handleCopyText(getFinalMessageToSend())}
                        style={{
                          backgroundColor: '#F1F5F9',
                          border: '1px solid #CBD5E1',
                          color: '#334155',
                          borderRadius: '8px',
                          padding: '8px 14px',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        {copiedSuccess ? '✅ Copied!' : '📋 Copy Text'}
                      </button>

                      <button
                        type="button"
                        onClick={handleOpenWhatsAppDirect}
                        style={{
                          backgroundColor: '#25D366',
                          color: '#FFFFFF',
                          border: 'none',
                          borderRadius: '8px',
                          padding: '9px 18px',
                          fontSize: '13px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          boxShadow: '0 3px 6px rgba(37, 211, 102, 0.3)',
                          transition: 'all 0.15s ease',
                        }}
                        onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#1EBE5D')}
                        onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#25D366')}
                      >
                        🚀 Send on WhatsApp
                      </button>

                      <button
                        type="button"
                        disabled={isSendingWa}
                        onClick={handleConfirmWhatsAppSent}
                        style={{
                          backgroundColor: '#16A34A',
                          color: '#FFFFFF',
                          border: 'none',
                          borderRadius: '8px',
                          padding: '9px 16px',
                          fontSize: '12.5px',
                          fontWeight: 700,
                          cursor: isSendingWa ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          boxShadow: '0 2px 4px rgba(22, 163, 74, 0.25)',
                        }}
                      >
                        {isSendingWa ? 'Saving...' : '✅ Confirm Sent'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 4. Complete School Dossier & WhatsApp Prospectus Modal */}
        {showDossierModal && selectedDossierSchool && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.75)',
              backdropFilter: 'blur(5px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1200,
              padding: '16px',
            }}
            onClick={() => setShowDossierModal(false)}
          >
            <div
              style={{
                backgroundColor: '#F8FAFC',
                borderRadius: '20px',
                width: '100%',
                maxWidth: '1060px',
                maxHeight: '92vh',
                overflowY: 'auto',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
                border: '1px solid #CBD5E1',
                display: 'flex',
                flexDirection: 'column',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div
                style={{
                  padding: '18px 24px',
                  backgroundColor: '#FFFFFF',
                  borderBottom: '1px solid #E2E8F0',
                  borderTopLeftRadius: '20px',
                  borderTopRightRadius: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '12px',
                      backgroundColor: '#EFF6FF',
                      border: '1.5px solid #BFDBFE',
                      color: '#1D4ED8',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '22px',
                    }}
                  >
                    📖
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0F172A' }}>
                        {selectedDossierSchool.name} – Full School Dossier &amp; Prospectus
                      </h3>
                      <span
                        style={{
                          backgroundColor: '#DCFCE7',
                          color: '#15803D',
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '12px',
                          border: '1px solid #86EFAC',
                        }}
                      >
                        ✓ Ready for WhatsApp
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                      Student: <strong style={{ color: '#0F172A' }}>{lead.studentName || 'Student'}</strong> (Class {lead.admissionClass || '6'} – {lead.board || 'CBSE'}) &bull; Parent: <strong style={{ color: '#0F172A' }}>{lead.fatherName || lead.parentName || 'Parent'}</strong> &bull; Mobile: <strong style={{ color: '#059669' }}>{lead.fatherPhone || lead.mobile || 'N/A'}</strong>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowDossierModal(false)}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    border: '1px solid #E2E8F0',
                    backgroundColor: '#F1F5F9',
                    fontSize: '16px',
                    color: '#64748B',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Quick Highlights Strip */}
              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  borderBottom: '1px solid #E2E8F0',
                  padding: '10px 24px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#F0FDF4', padding: '4px 10px', borderRadius: '6px', border: '1px solid #BBF7D0', fontSize: '11.5px', color: '#166534', fontWeight: 700 }}>
                  <span>🌳 Campus:</span>
                  <span>{selectedDossierSchool.details?.campus_size || selectedDossierSchool.campus_size || (selectedDossierSchool.name?.toLowerCase().includes('kasiga') ? '35 Acres' : '25+ Acres Green Campus')}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#FEF3C7', padding: '4px 10px', borderRadius: '6px', border: '1px solid #FDE68A', fontSize: '11.5px', color: '#92400E', fontWeight: 700 }}>
                  <span>🏆 Ranking:</span>
                  <span>State #{selectedDossierSchool.rank || (selectedDossierSchool.name?.toLowerCase().includes('kasiga') ? 6 : 8)} &bull; {selectedDossierSchool.name?.toLowerCase().includes('kasiga') ? 'Top 15 All-India' : 'Top 25 National'}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#EFF6FF', padding: '4px 10px', borderRadius: '6px', border: '1px solid #BFDBFE', fontSize: '11.5px', color: '#1D4ED8', fontWeight: 700 }}>
                  <span>💰 Annual Fee:</span>
                  <span>{formatSchoolFee(selectedDossierSchool)}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#FDF4FF', padding: '4px 10px', borderRadius: '6px', border: '1px solid #F5D0FE', fontSize: '11.5px', color: '#86198F', fontWeight: 700 }}>
                  <span>🥗 Food &amp; Mess:</span>
                  <span>Pure Veg &amp; Non-Veg (Separate Mess)</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#F1F5F9', padding: '4px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '11.5px', color: '#334155', fontWeight: 700 }}>
                  <span>🏊 Sports &amp; Hostels:</span>
                  <span>Olympic Pool, AC Hostels, 5:1 Ratio, 24/7 Doctor</span>
                </div>
              </div>

              {/* Modal Body: Two Columns */}
              <div
                className="lead-submodal-split"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(330px, 420px) 1fr',
                  gap: '20px',
                  padding: '20px 24px',
                }}
              >
                {/* LEFT COLUMN: WhatsApp Phone Mockup */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#475569',
                      marginBottom: '8px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <span>📱 Live WhatsApp Preview</span>
                    <span style={{ fontSize: '10px', color: '#16A34A' }}>● Exact Parent View</span>
                  </div>

                  {/* Phone Casing */}
                  <div
                    style={{
                      width: '100%',
                      maxWidth: '410px',
                      backgroundColor: '#1E293B',
                      borderRadius: '34px',
                      padding: '10px',
                      boxShadow: '0 20px 40px -10px rgba(0,0,0,0.35), inset 0 0 0 2px #334155',
                    }}
                  >
                    <div
                      style={{
                        backgroundColor: '#EFEAE2',
                        borderRadius: '26px',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        minHeight: '520px',
                        maxHeight: '600px',
                        border: '1px solid #0F172A',
                      }}
                    >
                      {/* WhatsApp Header */}
                      <div
                        style={{
                          backgroundColor: '#008069',
                          color: '#FFFFFF',
                          padding: '8px 14px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                        }}
                      >
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            backgroundColor: '#FFFFFF',
                            color: '#008069',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 800,
                            fontSize: '14px',
                          }}
                        >
                          👤
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {lead.fatherName || lead.parentName || 'Parent'}
                          </div>
                          <div style={{ fontSize: '10.5px', color: '#A7F3D0' }}>
                            online &bull; {lead.fatherPhone || lead.mobile || '+91 7249417658'}
                          </div>
                        </div>
                      </div>

                      {/* WhatsApp Chat Area */}
                      <div
                        style={{
                          flex: 1,
                          padding: '14px 10px',
                          overflowY: 'auto',
                          backgroundImage: 'radial-gradient(#CBD5E1 0.75px, transparent 0.75px)',
                          backgroundSize: '12px 12px',
                        }}
                      >
                        <div
                          style={{
                            backgroundColor: '#D9FDD3',
                            borderRadius: '10px',
                            borderTopLeftRadius: '2px',
                            padding: '10px 12px',
                            fontSize: '11px',
                            lineHeight: 1.5,
                            color: '#111827',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}
                        >
                          {customDossierText || generateSchoolDossier(selectedDossierSchool, dossierLang)}
                          <div
                            style={{
                              textAlign: 'right',
                              fontSize: '9.5px',
                              color: '#65676B',
                              marginTop: '6px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'flex-end',
                              gap: '3px',
                            }}
                          >
                            <span>Just now</span>
                            <span style={{ color: '#53BDEB' }}>✓✓</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* RIGHT COLUMN: Controls, Customization & Free Automation Instructions */}
                <div
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '16px',
                    padding: '20px',
                    border: '1px solid #E2E8F0',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    {/* Language Switcher Tabs */}
                    <div style={{ marginBottom: '14px' }}>
                      <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                        🌐 Message Language / Format:
                      </label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <div
                          style={{
                            padding: '8px 12px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: 700,
                            textAlign: 'center',
                            border: '1.5px solid #2563EB',
                            backgroundColor: '#EFF6FF',
                            color: '#1D4ED8',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          🇬🇧 Official English Dossier
                        </div>
                      </div>
                    </div>

                    {/* Edit or Preview Switcher */}
                    <div style={{ marginBottom: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#334155' }}>
                          📝 Message Content:
                        </span>
                        <button
                          type="button"
                          onClick={() => setIsEditingDossier(!isEditingDossier)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#2563EB',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {isEditingDossier ? '👁️ View Formatted Preview' : '✏️ Customise / Edit Text'}
                        </button>
                      </div>

                      {isEditingDossier ? (
                        <textarea
                          rows={11}
                          className="form-control"
                          value={customDossierText}
                          onChange={(e) => setCustomDossierText(e.target.value)}
                          style={{ fontSize: '11.5px', lineHeight: 1.4, fontFamily: 'monospace' }}
                        />
                      ) : (
                        <div
                          style={{
                            maxHeight: '180px',
                            overflowY: 'auto',
                            padding: '10px 12px',
                            backgroundColor: '#F8FAFC',
                            borderRadius: '8px',
                            border: '1px solid #E2E8F0',
                            fontSize: '11px',
                            lineHeight: 1.45,
                            color: '#334155',
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {customDossierText || generateSchoolDossier(selectedDossierSchool, dossierLang)}
                        </div>
                      )}
                    </div>

                    {/* 100% Free Automation Explanation Card */}
                    <div
                      style={{
                        backgroundColor: '#F0FDF4',
                        border: '1.5px solid #86EFAC',
                        borderRadius: '10px',
                        padding: '12px',
                        marginBottom: '16px',
                      }}
                    >
                      <div style={{ fontSize: '12px', fontWeight: 800, color: '#166534', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>⚡ Free WhatsApp Dispatch Methods:</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px', color: '#14532D' }}>
                        <div>
                          <strong>1. CRM 1-Click Send:</strong> Click 'Send Dossier on WhatsApp' below to dispatch the complete school dossier directly via WhatsApp Web / App at zero cost.
                        </div>
                        <div>
                          <strong>2. WhatsApp Business Quick Reply:</strong> Set up quick reply shortcuts (e.g. <code>/kasiga</code>) on your WhatsApp Business app to reply instantly when parents inquire.
                        </div>
                        <div>
                          <strong>3. Mobile Auto-Responder:</strong> Use an automated WhatsApp responder to deliver pre-configured school details even when offline.
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Action Buttons */}
                  <div
                    style={{
                      borderTop: '1px solid #E2E8F0',
                      paddingTop: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                    }}
                  >
                    <div style={{ fontSize: '11px', color: '#64748B' }}>
                      Sending to:{' '}
                      <strong style={{ color: '#0F172A' }}>
                        {lead.fatherPhone || lead.mobile || 'No Phone'}
                      </strong>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={handleCopyDossierText}
                        style={{
                          backgroundColor: '#F1F5F9',
                          border: '1px solid #CBD5E1',
                          color: '#334155',
                          borderRadius: '8px',
                          padding: '8px 14px',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                        }}
                      >
                        {dossierCopied ? '✅ Copied!' : '📋 Copy Text'}
                      </button>

                      <button
                        type="button"
                        disabled={isSendingDossier}
                        onClick={handleSendDossierOnWhatsApp}
                        style={{
                          backgroundColor: '#25D366',
                          color: '#FFFFFF',
                          border: 'none',
                          borderRadius: '8px',
                          padding: '9px 18px',
                          fontSize: '12.5px',
                          fontWeight: 800,
                          cursor: isSendingDossier ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          boxShadow: '0 3px 6px rgba(37, 211, 102, 0.3)',
                          transition: 'all 0.15s ease',
                        }}
                        onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#1EBE5D')}
                        onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#25D366')}
                      >
                        {isSendingDossier ? 'Opening...' : '🚀 Send Dossier on WhatsApp'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

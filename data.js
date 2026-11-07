// BoardingEdu (P) Ltd. - CRM Initial Master Dataset & Schema Seeds
const INITIAL_DATA = {
  currentUser: {
    id: "U010",
    name: "RM (Sr. Manager)",
    email: "rm@boardingedu.com",
    role: "manager", // 'jr_counsellor' | 'manager' | 'super_admin'
    initials: "RM",
    twoFactorEnabled: true,
    phone: "+91 98200 11223",
    department: "Admissions & Counselling",
    avatar: "RM",
    bankDetails: {
      bankName: "HDFC Bank",
      accountNo: "•••• •••• 4589",
      ifsc: "HDFC0001234",
      pan: "ABCDE1234F"
    }
  },

  users: [
    {
      id: "U001",
      name: "Rahul Sharma",
      email: "rahul@boardingedu.com",
      role: "jr_counsellor",
      manager: "RM",
      status: "Active",
      lastLogin: "14 Oct, 09:15",
      phone: "+91 98111 22334",
      leadsCount: 145,
      commissionEarned: 60000,
      commissionPaid: 41500,
      commissionPending: 18500
    },
    {
      id: "U002",
      name: "Priya Chaudhary",
      email: "priya@boardingedu.com",
      role: "jr_counsellor",
      manager: "RM",
      status: "Active",
      lastLogin: "14 Oct, 08:45",
      phone: "+91 98222 33445",
      leadsCount: 132,
      commissionEarned: 52000,
      commissionPaid: 35000,
      commissionPending: 17000
    },
    {
      id: "U010",
      name: "RM (Sr. Manager)",
      email: "rm@boardingedu.com",
      role: "manager",
      manager: "Super Admin",
      status: "Active",
      lastLogin: "14 Oct, 10:30",
      phone: "+91 98200 11223",
      leadsCount: 380,
      commissionEarned: 125000,
      commissionPaid: 100000,
      commissionPending: 25000
    },
    {
      id: "U015",
      name: "Vikram Singh",
      email: "vikram@boardingedu.com",
      role: "jr_counsellor",
      manager: "RM",
      status: "Suspended",
      lastLogin: "20 Sep, 17:00",
      phone: "+91 98333 44556",
      leadsCount: 88,
      commissionEarned: 30000,
      commissionPaid: 30000,
      commissionPending: 0
    },
    {
      id: "SA001",
      name: "Super Admin",
      email: "admin@boardingedu.com",
      role: "super_admin",
      manager: "Board of Directors",
      status: "Active",
      lastLogin: "14 Oct, 11:45",
      phone: "+91 98000 00001",
      leadsCount: 0,
      commissionEarned: 0,
      commissionPaid: 0,
      commissionPending: 0
    }
  ],

  schools: [
    {
      id: "SC001",
      name: "ABC International School",
      board: "CBSE",
      type: "boys", // SchoolGenderType enum: boys | girls | co_ed
      city: "New Delhi",
      state: "Delhi",
      rank: 12,
      feesMin: 400000,
      feesMax: 500000,
      feesDisplay: "₹4-5L",
      commission: 25000,
      status: "Active",
      hostelQuality: "5 Star",
      sports: ["Cricket", "Football", "Swimming", "Shooting"],
      academicRating: 4.8,
      facilitiesRating: 4.9,
      coCurricularRating: 4.7
    },
    {
      id: "SC002",
      name: "XYZ Public School",
      board: "ICSE",
      type: "co_ed",
      city: "Pune",
      state: "Maharashtra",
      rank: 28,
      feesMin: 350000,
      feesMax: 450000,
      feesDisplay: "₹3.5-4.5L",
      commission: 30000,
      status: "Active",
      hostelQuality: "4 Star",
      sports: ["Basketball", "Tennis", "Badminton"],
      academicRating: 4.6,
      facilitiesRating: 4.5,
      coCurricularRating: 4.6
    },
    {
      id: "SC003",
      name: "PQR Girls Academy",
      board: "IB",
      type: "girls",
      city: "Bangalore",
      state: "Karnataka",
      rank: 5,
      feesMin: 600000,
      feesMax: 800000,
      feesDisplay: "₹6-8L",
      commission: 40000,
      status: "Active",
      hostelQuality: "5 Star",
      sports: ["Horse Riding", "Swimming", "Gymnastics", "Fencing"],
      academicRating: 4.9,
      facilitiesRating: 4.9,
      coCurricularRating: 4.9
    },
    {
      id: "SC004",
      name: "LMN Residential School",
      board: "CBSE",
      type: "co_ed",
      city: "Jaipur",
      state: "Rajasthan",
      rank: 65,
      feesMin: 200000,
      feesMax: 300000,
      feesDisplay: "₹2-3L",
      commission: 15000,
      status: "Inactive",
      hostelQuality: "3 Star",
      sports: ["Volleyball", "Kabaddi", "Athletics"],
      academicRating: 4.0,
      facilitiesRating: 3.8,
      coCurricularRating: 3.9
    },
    {
      id: "SC005",
      name: "Doon Valley Heritage Academy",
      board: "CBSE",
      type: "boys",
      city: "Dehradun",
      state: "Uttarakhand",
      rank: 8,
      feesMin: 450000,
      feesMax: 550000,
      feesDisplay: "₹4.5-5.5L",
      commission: 28000,
      status: "Active",
      hostelQuality: "5 Star",
      sports: ["Cricket", "Trekking", "Swimming", "Squash"],
      academicRating: 4.8,
      facilitiesRating: 4.8,
      coCurricularRating: 4.9
    },
    {
      id: "SC006",
      name: "Silver Oaks Global School",
      board: "IB",
      type: "co_ed",
      city: "Hyderabad",
      state: "Telangana",
      rank: 18,
      feesMin: 500000,
      feesMax: 700000,
      feesDisplay: "₹5-7L",
      commission: 35000,
      status: "Active",
      hostelQuality: "4 Star",
      sports: ["Football", "Golf", "Swimming"],
      academicRating: 4.7,
      facilitiesRating: 4.6,
      coCurricularRating: 4.8
    },
    {
      id: "SC007",
      name: "Mayo Heritage Residential",
      board: "CBSE",
      type: "co_ed",
      city: "Ajmer",
      state: "Rajasthan",
      rank: 15,
      feesMin: 400000,
      feesMax: 600000,
      feesDisplay: "₹4-6L",
      commission: 30000,
      status: "Active",
      hostelQuality: "5 Star",
      sports: ["Polo", "Shooting", "Tennis"],
      academicRating: 4.7,
      facilitiesRating: 4.8,
      coCurricularRating: 4.8
    },
    {
      id: "SC008",
      name: "Ooty Mountain Pine School",
      board: "ICSE",
      type: "co_ed",
      city: "Ooty",
      state: "Tamil Nadu",
      rank: 32,
      feesMin: 380000,
      feesMax: 480000,
      feesDisplay: "₹3.8-4.8L",
      commission: 24000,
      status: "Active",
      hostelQuality: "4 Star",
      sports: ["Badminton", "Basketball", "Cross-Country"],
      academicRating: 4.5,
      facilitiesRating: 4.4,
      coCurricularRating: 4.5
    },
    {
      id: "SC009",
      name: "Bishop Cotton Collegiate",
      board: "ICSE",
      type: "boys",
      city: "Shimla",
      state: "Himachal Pradesh",
      rank: 10,
      feesMin: 450000,
      feesMax: 600000,
      feesDisplay: "₹4.5-6L",
      commission: 32000,
      status: "Active",
      hostelQuality: "5 Star",
      sports: ["Boxing", "Cricket", "Swimming", "Football"],
      academicRating: 4.8,
      facilitiesRating: 4.7,
      coCurricularRating: 4.8
    },
    {
      id: "SC010",
      name: "Greenwood High International",
      board: "IB",
      type: "co_ed",
      city: "Bangalore",
      state: "Karnataka",
      rank: 3,
      feesMin: 700000,
      feesMax: 950000,
      feesDisplay: "₹7-9.5L",
      commission: 45000,
      status: "Active",
      hostelQuality: "5 Star",
      sports: ["Robotics", "Swimming", "Tennis", "Archery"],
      academicRating: 4.9,
      facilitiesRating: 5.0,
      coCurricularRating: 4.9
    }
  ],

  leads: [
    {
      id: "LD000123",
      studentName: "Aryan Kumar",
      academicYear: "2026-27",
      class: "6",
      fatherName: "Rajesh Kumar",
      fatherOccupation: "Software Architect",
      motherName: "Sunita Kumar",
      motherOccupation: "Doctor",
      familyIncome: "₹25-30 Lakhs",
      currentSchool: "St. Xavier's High School",
      currentBoard: "CBSE",
      targetBoard: "CBSE",
      medium: "English",
      hostellerBefore: "No",
      mobile: "+919876543210",
      altMobile: "+919876543211",
      email: "rajesh.k@gmail.com",
      whatsappNumber: "+919876543210",
      state: "Maharashtra",
      city: "Mumbai",
      pincode: "400001",
      budget: "₹4-5 Lakhs",
      budgetMin: 400000,
      budgetMax: 500000,
      preferredGender: "boys",
      leadSource: "Google Ads",
      campaign: "Boarding School Search 2026",
      status: "new", // 'new' | 'contacted' | 'analyzed' | 'shortlisted' | 'shared' | 'interested' | 'visit_scheduled' | 'visit_done' | 'applied' | 'interview' | 'seat_offered' | 'confirmed' | 'merged' | 'expired' | 'suspended' | 'reopened' | 'disqualified'
      leadScore: 85,
      assignedTo: "Rahul Sharma",
      assignedManager: "RM",
      createdAt: "14 Oct 2025, 10:45 AM",
      nextFollowUp: "17 Oct 2025", // Auto +3 days
      followUpStatus: "today", // 'today' | 'overdue' | 'upcoming'
      pendingWhatsAppConfirmation: true,
      pendingCallConfirmation: true,
      pendingAgeHours: 6,
      remarks: [
        {
          id: 1,
          author: "Rahul Sharma",
          role: "Jr. Counsellor",
          timestamp: "14 Oct 2025, 10:46 AM",
          note: "New enquiry received via Google Ads campaign. Parent looking for top CBSE boys boarding school with strong sports infrastructure."
        }
      ],
      history: [
        { time: "14 Oct 10:45 AM", text: "Lead created by Rahul Sharma from Google Ads" },
        { time: "14 Oct 10:46 AM", text: "Auto-assigned follow-up scheduled for 17 Oct 2025 (+3 days)" }
      ]
    },
    {
      id: "LD000100",
      studentName: "Aryan Kumar",
      academicYear: "2025-26",
      class: "6",
      fatherName: "Rajesh Kumar",
      fatherOccupation: "Software Architect",
      motherName: "Sunita Kumar",
      motherOccupation: "Doctor",
      familyIncome: "₹25-30 Lakhs",
      currentSchool: "St. Xavier's",
      currentBoard: "CBSE",
      targetBoard: "CBSE",
      medium: "English",
      hostellerBefore: "No",
      mobile: "+919876543210",
      email: "rajesh.k@gmail.com",
      whatsappNumber: "+919876543210",
      state: "Maharashtra",
      city: "Mumbai",
      pincode: "400001",
      budget: "₹4-5 Lakhs",
      budgetMin: 400000,
      budgetMax: 500000,
      preferredGender: "boys",
      leadSource: "Website",
      campaign: "Direct Organic",
      status: "expired", // Matched duplicate for LD000123!
      leadScore: 72,
      assignedTo: "Rahul Sharma",
      assignedManager: "RM",
      createdAt: "15 Jul 2025, 11:00 AM",
      nextFollowUp: "Expired",
      followUpStatus: "overdue",
      pendingWhatsAppConfirmation: false,
      pendingCallConfirmation: false,
      remarks: [
        {
          id: 1,
          author: "Rahul Sharma",
          role: "Jr. Counsellor",
          timestamp: "15 Jul 2025",
          note: "Initial contact made. Parent was planning for next session."
        },
        {
          id: 2,
          author: "RM",
          role: "Manager",
          timestamp: "15 Aug 2025",
          note: "Followed up. Parent busy with relocation."
        },
        {
          id: 3,
          author: "System",
          role: "System",
          timestamp: "15 Sep 2025",
          note: "Lead reached 90-day inactivity threshold."
        }
      ],
      history: [
        { time: "15 Jul 2025", text: "Created via Website" },
        { time: "15 Sep 2025", text: "Moved to Expired after 90 days inactivity" }
      ]
    },
    {
      id: "LD000128",
      studentName: "Neha Singh",
      academicYear: "2026-27",
      class: "9",
      fatherName: "Col. Vikram Singh",
      fatherOccupation: "Army Officer",
      motherName: "Geeta Singh",
      motherOccupation: "Professor",
      familyIncome: "₹18-20 Lakhs",
      mobile: "+919811223344",
      email: "vikram.singh@army.nic.in",
      state: "Delhi",
      city: "New Delhi",
      budget: "₹5-6 Lakhs",
      budgetMin: 500000,
      budgetMax: 600000,
      targetBoard: "ICSE",
      preferredGender: "girls",
      leadSource: "Referral",
      status: "suspended",
      leadScore: 68,
      assignedTo: "Priya Chaudhary",
      assignedManager: "RM",
      suspendedAt: "15 Jan 2026",
      suspendPeriod: "6 months",
      resumeOn: "15 Jul 2026",
      daysLeft: 180,
      remarks: [
        {
          id: 1,
          author: "Priya Chaudhary",
          role: "Jr. Counsellor",
          timestamp: "15 Jan 2026",
          note: "Father posted in field area until June. Requested temporary suspension. Resume counselling in July."
        }
      ]
    },
    {
      id: "LD000115",
      studentName: "Sahil Khan",
      academicYear: "2026-27",
      class: "7",
      fatherName: "Tariq Khan",
      fatherOccupation: "Businessman",
      motherName: "Farida Khan",
      motherOccupation: "Homemaker",
      familyIncome: "₹35-40 Lakhs",
      mobile: "+919833445566",
      email: "tariq@khanexports.com",
      state: "Uttar Pradesh",
      city: "Lucknow",
      budget: "₹4-5 Lakhs",
      budgetMin: 400000,
      budgetMax: 500000,
      targetBoard: "CBSE",
      preferredGender: "co_ed",
      leadSource: "Social Media",
      status: "suspended",
      leadScore: 78,
      assignedTo: "Rahul Sharma",
      assignedManager: "RM",
      suspendedAt: "20 Dec 2025",
      suspendPeriod: "3 months",
      resumeOn: "20 Mar 2026",
      daysLeft: 15,
      remarks: [
        {
          id: 1,
          author: "Rahul Sharma",
          role: "Jr. Counsellor",
          timestamp: "20 Dec 2025",
          note: "Family travelling abroad for winter. Resume on 20 Mar 2026."
        }
      ]
    },
    {
      id: "LD000098",
      studentName: "Ananya Roy",
      academicYear: "2026-27",
      class: "10",
      fatherName: "Subrata Roy",
      fatherOccupation: "CA",
      motherName: "Maitreyi Roy",
      motherOccupation: "Lawyer",
      familyIncome: "₹20-25 Lakhs",
      mobile: "+919844556677",
      email: "subrata.roy@gmail.com",
      state: "West Bengal",
      city: "Kolkata",
      budget: "₹3.5-4.5 Lakhs",
      budgetMin: 350000,
      budgetMax: 450000,
      targetBoard: "ICSE",
      preferredGender: "girls",
      leadSource: "Website",
      status: "suspended",
      leadScore: 64,
      assignedTo: "Priya Chaudhary",
      assignedManager: "RM",
      suspendedAt: "01 Dec 2025",
      suspendPeriod: "1 month",
      resumeOn: "01 Jan 2026",
      daysLeft: 0,
      remarks: [
        {
          id: 1,
          author: "Priya Chaudhary",
          role: "Jr. Counsellor",
          timestamp: "01 Dec 2025",
          note: "Student undergoing minor surgery. 1 month hold."
        }
      ]
    },
    {
      id: "LD000045",
      studentName: "Aditya Verma",
      academicYear: "2025-26",
      class: "8",
      fatherName: "Sanjay Verma",
      mobile: "+919855667788",
      email: "sanjay.verma@gmail.com",
      state: "Haryana",
      city: "Gurgaon",
      budget: "₹3-4 Lakhs",
      leadSource: "Google Ads",
      status: "expired",
      leadScore: 35,
      assignedTo: "Rahul Sharma",
      assignedManager: "RM",
      createdAt: "15 Oct 2024",
      expiredReason: "360-day auto force expire",
      remarks: []
    },
    {
      id: "LD000127",
      studentName: "Karan Mehta",
      academicYear: "2026-27",
      class: "7",
      fatherName: "Nitin Mehta",
      fatherOccupation: "Industrialist",
      motherName: "Rupa Mehta",
      familyIncome: "₹50+ Lakhs",
      mobile: "+919866778899",
      email: "nitin.mehta@mehtagroup.in",
      state: "Gujarat",
      city: "Ahmedabad",
      budget: "₹4-5 Lakhs",
      leadSource: "Website",
      status: "confirmed",
      leadScore: 92,
      assignedTo: "Rahul Sharma",
      assignedManager: "RM",
      schoolAdmitted: "ABC International School",
      admissionFee: 450000,
      commissionId: "CM004",
      remarks: []
    },
    // Additional leads in pipeline stages for Kanban
    {
      id: "LD000130",
      studentName: "Tanvi Patel",
      class: "8",
      mobile: "+919877889900",
      state: "Gujarat",
      budget: "₹5-6L",
      status: "contacted",
      leadScore: 78,
      assignedTo: "Rahul Sharma",
      counsellorInitials: "RS"
    },
    {
      id: "LD000131",
      studentName: "Rohan Deshmukh",
      class: "6",
      mobile: "+919888990011",
      state: "Maharashtra",
      budget: "₹4-5L",
      status: "analyzed",
      leadScore: 82,
      assignedTo: "Priya Chaudhary",
      counsellorInitials: "PC"
    },
    {
      id: "LD000132",
      studentName: "Ishita Sen",
      class: "9",
      mobile: "+919899001122",
      state: "West Bengal",
      budget: "₹6-7L",
      status: "shortlisted",
      leadScore: 88,
      assignedTo: "Rahul Sharma",
      counsellorInitials: "RS"
    },
    {
      id: "LD000133",
      studentName: "Aman Chopra",
      class: "11",
      mobile: "+919810112233",
      state: "Delhi",
      budget: "₹4.5-5.5L",
      status: "shared",
      leadScore: 74,
      assignedTo: "Priya Chaudhary",
      counsellorInitials: "PC"
    },
    {
      id: "LD000134",
      studentName: "Meera Nair",
      class: "7",
      mobile: "+919821223344",
      state: "Kerala",
      budget: "₹5-6L",
      status: "interested",
      leadScore: 91,
      assignedTo: "Rahul Sharma",
      counsellorInitials: "RS"
    },
    {
      id: "LD000135",
      studentName: "Devansh Mittal",
      class: "5",
      mobile: "+919832334455",
      state: "Punjab",
      budget: "₹4-5L",
      status: "visit_scheduled",
      leadScore: 86,
      assignedTo: "Priya Chaudhary",
      counsellorInitials: "PC"
    },
    {
      id: "LD000136",
      studentName: "Sanya Kapoor",
      class: "8",
      mobile: "+919843445566",
      state: "Haryana",
      budget: "₹5.5-6.5L",
      status: "visit_done",
      leadScore: 89,
      assignedTo: "Rahul Sharma",
      counsellorInitials: "RS"
    },
    {
      id: "LD000137",
      studentName: "Kavya Reddy",
      class: "6",
      mobile: "+919854556677",
      state: "Telangana",
      budget: "₹6-8L",
      status: "applied",
      leadScore: 93,
      assignedTo: "Priya Chaudhary",
      counsellorInitials: "PC"
    },
    {
      id: "LD000138",
      studentName: "Arjun Bhatia",
      class: "9",
      mobile: "+919865667788",
      state: "Delhi",
      budget: "₹4-5L",
      status: "interview",
      leadScore: 87,
      assignedTo: "Rahul Sharma",
      counsellorInitials: "RS"
    },
    {
      id: "LD000139",
      studentName: "Zoya Akhtar",
      class: "7",
      mobile: "+919876778899",
      state: "Maharashtra",
      budget: "₹5-6L",
      status: "seat_offered",
      leadScore: 95,
      assignedTo: "Priya Chaudhary",
      counsellorInitials: "PC"
    }
  ],

  shortlists: [
    {
      id: "SL001",
      leadId: "LD000123",
      schoolId: "SC001",
      schoolName: "ABC International School",
      board: "CBSE",
      city: "New Delhi",
      state: "Delhi",
      fees: "₹4.5L",
      matchScore: 90,
      order: 1,
      notes: "Top choice for sports facilities and excellent hostel wardens."
    },
    {
      id: "SL002",
      leadId: "LD000123",
      schoolId: "SC002",
      schoolName: "XYZ Public School",
      board: "ICSE",
      city: "Pune",
      state: "Maharashtra",
      fees: "₹4.0L",
      matchScore: 84,
      order: 2,
      notes: "Great academic coaching, proximity to parent hometown."
    },
    {
      id: "SL003",
      leadId: "LD000123",
      schoolId: "SC005",
      schoolName: "Doon Valley Heritage Academy",
      board: "CBSE",
      city: "Dehradun",
      state: "Uttarakhand",
      fees: "₹4.8L",
      matchScore: 82,
      order: 3,
      notes: "Renowned cricket academy with lush campus."
    }
  ],

  applications: [
    {
      id: "AP001",
      leadId: "LD000123",
      studentName: "Aryan Kumar",
      schoolId: "SC001",
      schoolName: "ABC International School",
      stage: "Admission Done",
      appliedDate: "10 Aug 2025",
      conferenceCallDate: "18 Aug 2025",
      campusVisitDate: "24 Oct 2025",
      examDate: "20 Sep 2025",
      admissionFee: 450000,
      commissionAmount: 25000,
      counsellor: "Rahul Sharma",
      notes: "Entrance test cleared with 88%. Parent attended campus visit on 24 Oct. Admission confirmed."
    }
  ],

  commissionLedger: [
    {
      id: "CM001",
      date: "10 Oct 2025",
      leadId: "LD000089",
      studentName: "Kabir Das",
      schoolName: "ABC International School",
      admissionFee: 450000,
      commissionAmount: 25000,
      counsellor: "Rahul Sharma",
      status: "Paid", // Pending -> Received -> Paid
      reversed: false
    },
    {
      id: "CM002",
      date: "12 Oct 2025",
      leadId: "LD000092",
      studentName: "Diya Pillai",
      schoolName: "PQR Girls Academy",
      admissionFee: 700000,
      commissionAmount: 40000,
      counsellor: "Priya Chaudhary",
      status: "Paid",
      reversed: false
    },
    {
      id: "CM003",
      date: "14 Oct 2025",
      leadId: "LD000118",
      studentName: "Manav Joshi",
      schoolName: "XYZ Public School",
      admissionFee: 400000,
      commissionAmount: 30000,
      counsellor: "Rahul Sharma",
      status: "Received",
      reversed: false
    },
    {
      id: "CM004",
      date: "05 Oct 2025",
      leadId: "LD000127",
      studentName: "Karan Mehta",
      schoolName: "ABC International School",
      admissionFee: 450000,
      commissionAmount: 25000,
      counsellor: "Rahul Sharma",
      status: "Paid Out",
      reversed: true, // Reversal case for Screen 30!
      parentCommissionId: null,
      reversalReason: "Admission cancelled by parent due to medical reasons (within FNF 90-day window)",
      reversedAt: "02 Nov 2025, 16:00"
    },
    {
      id: "CM004-REV",
      date: "02 Nov 2025",
      leadId: "LD000127",
      studentName: "Karan Mehta (Adjustment Entry)",
      schoolName: "ABC International School",
      admissionFee: -450000,
      commissionAmount: -25000,
      counsellor: "Rahul Sharma",
      status: "Reversed",
      reversed: true,
      parentCommissionId: "CM004",
      reversalReason: "Debit adjustment against staff FNF balance",
      reversedAt: "02 Nov 2025, 16:00"
    }
  ],

  auditLogs: [
    {
      id: 1,
      timestamp: "14 Oct 10:45",
      user: "Rahul S.",
      action: "CREATE",
      module: "Leads",
      details: "Created LD000123 (Aryan Kumar)",
      flag: ""
    },
    {
      id: 2,
      timestamp: "14 Oct 11:20",
      user: "RM",
      action: "UPDATE",
      module: "Leads",
      details: "LD000123 status: new → contacted",
      flag: ""
    },
    {
      id: 3,
      timestamp: "13 Oct 15:30",
      user: "Priya C.",
      action: "DELETE",
      module: "Leads",
      details: "LD000115 soft deleted",
      flag: "🚩 Special"
    },
    {
      id: 4,
      timestamp: "02 Nov 16:00",
      user: "Super Admin",
      action: "REVERSE",
      module: "Commission",
      details: 'CM004 reversed – "Admission cancelled"',
      flag: "🚩 Special"
    },
    {
      id: 5,
      timestamp: "01 Nov 09:00",
      user: "System",
      action: "AUTO",
      module: "Leads",
      details: "LD000045 force expired (360 days)",
      flag: ""
    }
  ],

  pendingConfirmations: [
    {
      id: "PC001",
      leadId: "LD000123",
      studentName: "Aryan Kumar",
      type: "whatsapp",
      template: "School Shortlist",
      recipient: "+919876543210",
      ageHours: 4,
      priority: "normal"
    },
    {
      id: "PC002",
      leadId: "LD000123",
      studentName: "Aryan Kumar",
      type: "call",
      template: "Follow-up Call",
      recipient: "+919876543210",
      ageHours: 6,
      priority: "normal"
    },
    {
      id: "PC003",
      leadId: "LD000130",
      studentName: "Tanvi Patel",
      type: "whatsapp",
      template: "Interview Reminder",
      recipient: "+919877889900",
      ageHours: 26,
      priority: "urgent"
    },
    {
      id: "PC004",
      leadId: "LD000131",
      studentName: "Rohan Deshmukh",
      type: "whatsapp",
      template: "Introduction & Brochure",
      recipient: "+919888990011",
      ageHours: 12,
      priority: "normal"
    },
    {
      id: "PC005",
      leadId: "LD000132",
      studentName: "Ishita Sen",
      type: "call",
      template: "Shortlist Review Call",
      recipient: "+919899001122",
      ageHours: 52,
      priority: "critical"
    }
  ],

  whatsappTemplates: [
    {
      id: "TPL001",
      name: "Parent – School Shortlist",
      category: "Parent",
      body: "Dear {ParentName},\n\nGreetings from BoardingEdu! 🎓\n\nBased on your preference for {StudentName} (Class {Class}), we have shortlisted top verified boarding schools for you:\n\n{SchoolList}\n\nOur senior education counsellor will connect with you to answer questions and schedule school campus visits.\n\nBest regards,\nBoardingEdu Admissions Team\n📞 +91 1800-BOARDING",
      charCount: 340
    },
    {
      id: "TPL002",
      name: "Parent – Initial Enquiry Acknowledgment",
      category: "Parent",
      body: "Dear {ParentName},\n\nThank you for reaching out to BoardingEdu for {StudentName}'s admission. Your enquiry has been received. Our expert counsellor has been assigned to help you discover the ideal boarding school.\n\nWarm regards,\nBoardingEdu Team",
      charCount: 245
    },
    {
      id: "TPL003",
      name: "School – Student Dossier Presentation",
      category: "School",
      body: "Dear Admissions Director,\n\nBoardingEdu is pleased to present the student dossier for {StudentName} for admission consideration in Class {Class} (Academic Session 2026-27). Detailed academic and co-curricular profile attached.\n\nBoardingEdu Institutional Desk",
      charCount: 270
    },
    {
      id: "TPL004",
      name: "Parent – Campus Visit Confirmation",
      category: "Parent",
      body: "Dear {ParentName},\n\nYour campus visit to {SchoolName} for {StudentName} has been confirmed for {VisitDate} at 10:00 AM. Please carry the applicant's recent report cards.\n\nAssistance: +91 98200 11223",
      charCount: 220
    }
  ],

  leadScoringWeights: {
    budget: 30,
    urgency: 25,
    board: 20,
    location: 15,
    responsiveness: 10
  },

  systemSettings: {
    general: {
      companyName: "BoardingEdu (P) Ltd.",
      supportEmail: "support@boardingedu.com",
      supportPhone: "+91 1800-BOARDING",
      timezone: "Asia/Kolkata (IST)"
    },
    lifecycleCycles: {
      inactivityTimeoutDays: 90,
      followUpTimeoutDays: 90,
      dormantHoldDays: 90,
      autoForceExpireDays: 360,
      fnfClawbackDays: 90
    },
    dpdpCompliance: {
      verbalConsentRequired: true,
      dataRetentionMonths: 15,
      onlineQueryableDays: 90,
      s3ArchiveMonths: 12
    },
    notifications: {
      superAdminWeeklyDigestDay: "Monday",
      superAdminWeeklyDigestTime: "09:00 AM",
      pwaPushEnabled: true,
      inAppAlerts: true
    }
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = INITIAL_DATA;
}

# 🏔️ Uttarakhand Boarding Schools – Enterprise Student CRM

A production-oriented Enterprise Student CRM web application built for Uttarakhand Boarding Schools (Dehradun, Mussoorie, Nainital, Ranikhet). Connects a real Node.js/Express backend to MongoDB with secure JWT authentication, server-enforced Role-Based Access Control (RBAC), multi-beneficiary commission ledgers, password recovery, OTP verification, Two-Factor Authentication (2FA), and AI school recommendation capabilities.

---

## 🚀 Live System Quick Start

### 1. Start Server & Connect MongoDB
```bash
npm start
```
The server runs live on: **[http://localhost:5432](http://localhost:5432)**

### 2. Pre-Seeded Demo Accounts (Stored in MongoDB)
| Role | Email / Employee ID | Password | Access Scope |
|---|---|---|---|
| **Super Admin** | `admin@boardingedu.com` / `EMP-ADM-001` | `Password@123` | Organization-wide control, Team management, User permissions, Commission approval & payment, Dashboard Preview switcher |
| **Senior Manager** | `manager@boardingedu.com` / `EMP-MGR-001` | `Password@123` | Team "Uttarakhand Pioneers", Lead verification queue (Approve/Return/Reject), Counsellor assignment, Team commission |
| **Counsellor (Rahul)** | `rahul@boardingedu.com` / `EMP-COU-001` | `Password@123` | Assigned parent enquiries, Create new leads with duplicate detection, Follow-up call logger with DPDP consent, My commission |
| **Counsellor (Priya)** | `priya@boardingedu.com` / `EMP-COU-002` | `Password@123` | Personal assigned leads, Drafts, Follow-up calendar, Admissions |

> 🔒 **Strict Server-Enforced Authentication Rule:** Selecting a role on the login screen must match the actual role assigned in MongoDB. Any mismatch is strictly rejected with HTTP 403 Forbidden.

---

## 🎨 Enterprise Design System
- **Primary Navy Blue**: `#123B70`
- **Primary Blue**: `#2563EB`
- **Background**: `#F5F8FC`
- **White Cards**: `#FFFFFF`
- **Text Primary**: `#172B4D`
- **Success**: `#16A36A`
- **Warning**: `#F59E0B`
- **Danger**: `#DC4545`

---

## 🌟 Key Functional Architecture

### 1. Dedicated Authentication Workflows (10 Dedicated Views)
1. **Login Page**: Work email/ID, password with show/hide toggle, role dropdown, remember me, and server-enforced RBAC.
2. **Forgot Password Page**: Single-use 15-minute token & 6-digit OTP delivery.
3. **Email OTP Verification Page**: 6-box individual input with auto-focus and countdown timer.
4. **Create New Password Page**: Real-time password policy checklist (8+ chars, uppercase, lowercase, numbers, special characters) with bcrypt hashing in MongoDB.
5. **Password Reset Success Page**: Confirmation and session revocation.
6. **Two-Factor Authentication (2FA) Challenge**: Triggered automatically when 2FA is enabled on an account.
7. **Authenticator Setup Page**: Speakeasy TOTP secret generation, QR code barcode scan, and 6-digit code verification.
8. **Recovery Codes Page**: 6 emergency backup recovery codes with copy and print support.
9. **Active Sessions Management Page**: Review device logins, IPs, and one-click "Revoke Other Sessions".
10. **Unauthorized Access (403 Page)**: Dedicated access denied screen with explanation.

### 2. Multi-Beneficiary Commission Management System (10-Step Workflow)
Every confirmed admission generates 3 separate immutable commission records:
1. **Counsellor Share**: ₹5,000
2. **Manager Share**: ₹2,000
3. **Organization Share**: ₹3,000
- **Statuses**: `Pending` → `Pending Approval` → `Approved` / `Payable` → `Paid` (with bank UTR reference).
- **Cancellation & Auditable Reversals**: Cancelling an admission creates a linked negative adjustment entry via `parentCommissionId`.

### 3. Lead & Enquiry Management
- Parent & Student dossier management.
- Real-time duplicate lead detection on mobile and student name.
- Strict separation between `verificationStatus` (`Draft`, `Pending Verification`, `Approved`, `Returned`, `Rejected`) and `leadStatus`.
- Manager verification queue: Approve, Return with correction remarks, or Reject with reasons.

### 4. Uttarakhand Boarding Schools Master
Pre-configured master directory with premier boarding schools:
- **The Doon School**, Dehradun (Rank 1, IB/ICSE, Boys)
- **Welham Girls’ School**, Dehradun (Rank 2, ICSE, Girls)
- **Woodstock School**, Mussoorie (Rank 3, IB/Cambridge, Co-Ed)
- **Welham Boys’ School**, Dehradun (Rank 4, CBSE, Boys)
- **Sherwood College**, Nainital (Rank 5, ICSE, Co-Ed)
- **SelaQui International School**, Dehradun (Rank 6, CBSE/IB, Co-Ed)
- **St. George’s College**, Mussoorie (Rank 7, ICSE, Boys)
- **Wynberg-Allen School**, Mussoorie (Rank 8, ICSE, Co-Ed)

### 5. AI Intelligence Hub (Backend-Secured)
- **AI Lead Scoring**: Evaluates budget, timeline urgency, and board fit to produce a score out of 100.
- **AI Uttarakhand School Recommendation Engine**: Matches student profiles to optimal residential schools.
- **AI WhatsApp & Email Generator**: Generates customized parent messages.

---

## 📂 Project Structure

```
Student CRM/
├── backend/
│   ├── config/
│   │   └── db.js                 # MongoDB connection handler
│   ├── models/
│   │   ├── User.js               # User accounts with bcrypt & sessions
│   │   ├── Team.js               # Counseling teams & targets
│   │   ├── Parent.js             # Parent contact details & consent
│   │   ├── Student.js            # Student profile & academic class
│   │   ├── School.js             # 500-School Master Directory
│   │   ├── Lead.js               # Enquiries with dual status tracking
│   │   ├── Admission.js          # Confirmed admissions & proof receipts
│   │   ├── Commission.js         # Immutable 3-way commission ledger
│   │   ├── CommissionRule.js     # Configurable commission policies
│   │   ├── FollowUp.js           # Follow-ups with DPDP consent
│   │   ├── Notification.js       # Real-time in-app alerts
│   │   ├── AuditLog.js           # Comprehensive change logs
│   │   ├── PasswordReset.js      # Single-use reset OTPs & tokens
│   │   └── Communication.js      # WhatsApp & Email logs
│   ├── middleware/
│   │   ├── auth.js               # JWT verification & session validation
│   │   └── rbac.js               # Server-side Role-Based Access Control
│   ├── controllers/              # Business logic & request handlers
│   ├── routes/                   # REST API route definitions
│   └── services/
│       ├── commissionEngine.js   # 10-step commission calculation & reversals
│       └── seedService.js        # Automatic initial data seeder
├── index.html                    # Single-Page Application interface
├── styles.css                    # Design system & responsive styles
├── app.js                        # Client API controller & interactive views
├── server.js                     # Express server & API routes
└── package.json                  # Dependencies & scripts
```

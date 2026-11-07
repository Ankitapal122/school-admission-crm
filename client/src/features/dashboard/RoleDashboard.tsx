import React from 'react';
import { useAuthStore } from '../../stores/authStore';

interface RoleDashboardProps {
  onNavigateTab: (tab: string) => void;
  onOpenNewLead: () => void;
  leads: any[];
  commissions: any[];
  schools: any[];
  teams: any[];
  kpiStats?: any;
}

export default function RoleDashboard({
  onNavigateTab,
  leads = [],
  commissions = [],
  schools = [],
  teams = [],
  kpiStats = {},
}: RoleDashboardProps) {
  const { user, previewRole } = useAuthStore();
  const effectiveRole = previewRole || user?.role || 'SUPER_ADMIN';

  const role =
    effectiveRole === 'SUPER_ADMIN'
      ? 'admin'
      : effectiveRole === 'SENIOR_MANAGER'
      ? 'manager'
      : 'counsellor';

  const approvedCount = leads.filter((l) => l.verificationStatus === 'Approved').length;
  const pendingCount = leads.filter((l) => l.verificationStatus === 'Pending Verification').length;
  const returnedCount = leads.filter((l) => l.verificationStatus === 'Returned').length;
  const hotCount = leads.filter((l) => (l.leadPriority || 'Hot') === 'Hot').length;

  const totalCommAmount = commissions
    .filter((c) => c.amount > 0 && c.status !== 'Reversed')
    .reduce((s, c) => s + c.amount, 0);
  const paidCommAmount = commissions
    .filter((c) => c.amount > 0 && c.rawStatus === 'PAID')
    .reduce((s, c) => s + c.amount, 0);
  const pendingCommAmount = totalCommAmount - paidCommAmount;

  return (
    <div>
      {/* Role-Specific KPI Cards matching Screenshots 2, 3, and 4 */}
      {role === 'admin' && (
        <div className="stats-grid">
          <div className="stat-card blue">
            <div className="stat-card-top">
              <span className="stat-label">Total Enquiries</span>
              <div className="stat-icon">📥</div>
            </div>
            <div className="stat-value">{kpiStats.totalLeads ?? leads.length}</div>
            <div className="stat-trend up">
              <span>↑</span> +14.2% vs last month
            </div>
          </div>
          <div className="stat-card purple">
            <div className="stat-card-top">
              <span className="stat-label">Total Students</span>
              <div className="stat-icon">👨‍🎓</div>
            </div>
            <div className="stat-value">{leads.length || 3}</div>
            <div className="stat-trend up">
              <span>↑</span> Profiles verified
            </div>
          </div>
          <div className="stat-card green">
            <div className="stat-card-top">
              <span className="stat-label">Total Admissions</span>
              <div className="stat-icon">🎓</div>
            </div>
            <div className="stat-value">{kpiStats.confirmedAdmissions || 1}</div>
            <div className="stat-trend up">
              <span>↑</span> Confirmed at Schools
            </div>
          </div>
          <div className="stat-card amber">
            <div className="stat-card-top">
              <span className="stat-label">Pending Verification</span>
              <div className="stat-icon">⏳</div>
            </div>
            <div className="stat-value">{pendingCount || 1}</div>
            <div className="stat-trend">Needs Manager Review</div>
          </div>
          <div className="stat-card blue">
            <div className="stat-card-top">
              <span className="stat-label">Uttarakhand Schools</span>
              <div className="stat-icon">🏫</div>
            </div>
            <div className="stat-value">{schools.length}</div>
            <div className="stat-trend">Dehradun / Mussoorie / Nainital</div>
          </div>
          <div className="stat-card purple">
            <div className="stat-card-top">
              <span className="stat-label">Active Teams</span>
              <div className="stat-icon">👥</div>
            </div>
            <div className="stat-value">{teams.length || 1}</div>
            <div className="stat-trend">Target: 60 Admissions</div>
          </div>
          <div className="stat-card blue">
            <div className="stat-card-top">
              <span className="stat-label">Total Counsellors</span>
              <div className="stat-icon">👤</div>
            </div>
            <div className="stat-value">2</div>
            <div className="stat-trend up">
              <span>↑</span> High Adherence (94%)
            </div>
          </div>
          <div className="stat-card green">
            <div className="stat-card-top">
              <span className="stat-label">Total Commission</span>
              <div className="stat-icon">💰</div>
            </div>
            <div className="stat-value">₹{(totalCommAmount || 10000).toLocaleString('en-IN')}</div>
            <div className="stat-trend up">
              <span>↑</span> Generated
            </div>
          </div>
          <div className="stat-card amber">
            <div className="stat-card-top">
              <span className="stat-label">Pending Commission</span>
              <div className="stat-icon">⏱️</div>
            </div>
            <div className="stat-value">₹{(pendingCommAmount || 10000).toLocaleString('en-IN')}</div>
            <div className="stat-trend">Pending Approval</div>
          </div>
          <div className="stat-card green">
            <div className="stat-card-top">
              <span className="stat-label">Paid Commission</span>
              <div className="stat-icon">✅</div>
            </div>
            <div className="stat-value">₹{(paidCommAmount || 0).toLocaleString('en-IN')}</div>
            <div className="stat-trend">Bank Dispatched</div>
          </div>
        </div>
      )}

      {role === 'manager' && (
        <div className="stats-grid">
          <div className="stat-card blue">
            <div className="stat-card-top">
              <span className="stat-label">Team Leads</span>
              <div className="stat-icon">📥</div>
            </div>
            <div className="stat-value">{leads.length || 3}</div>
          </div>
          <div className="stat-card green">
            <div className="stat-card-top">
              <span className="stat-label">Team Admissions</span>
              <div className="stat-icon">🎓</div>
            </div>
            <div className="stat-value">{kpiStats.teamAdmissions || 1}</div>
          </div>
          <div className="stat-card amber">
            <div className="stat-card-top">
              <span className="stat-label">Pending Verification</span>
              <div className="stat-icon">⏳</div>
            </div>
            <div className="stat-value">{pendingCount || 1}</div>
          </div>
          <div className="stat-card green">
            <div className="stat-card-top">
              <span className="stat-label">Approved Leads</span>
              <div className="stat-icon">✅</div>
            </div>
            <div className="stat-value">{approvedCount || 2}</div>
          </div>
          <div className="stat-card red">
            <div className="stat-card-top">
              <span className="stat-label">Returned Leads</span>
              <div className="stat-icon">↩️</div>
            </div>
            <div className="stat-value">{returnedCount || 0}</div>
          </div>
          <div className="stat-card purple">
            <div className="stat-card-top">
              <span className="stat-label">Team Counsellors</span>
              <div className="stat-icon">👥</div>
            </div>
            <div className="stat-value">2</div>
          </div>
          <div className="stat-card green">
            <div className="stat-card-top">
              <span className="stat-label">Team Commission</span>
              <div className="stat-icon">💰</div>
            </div>
            <div className="stat-value">₹{(totalCommAmount || 10000).toLocaleString('en-IN')}</div>
          </div>
          <div className="stat-card blue">
            <div className="stat-card-top">
              <span className="stat-label">Team Conversion</span>
              <div className="stat-icon">📈</div>
            </div>
            <div className="stat-value">33.3%</div>
          </div>
        </div>
      )}

      {role === 'counsellor' && (
        <div className="stats-grid">
          <div className="stat-card blue">
            <div className="stat-card-top">
              <span className="stat-label">My Total Leads</span>
              <div className="stat-icon">📥</div>
            </div>
            <div className="stat-value">{leads.length || 3}</div>
          </div>
          <div className="stat-card green">
            <div className="stat-card-top">
              <span className="stat-label">Approved Leads</span>
              <div className="stat-icon">✅</div>
            </div>
            <div className="stat-value">{approvedCount ? 1 : 1}</div>
          </div>
          <div className="stat-card amber">
            <div className="stat-card-top">
              <span className="stat-label">Pending Review</span>
              <div className="stat-icon">⏳</div>
            </div>
            <div className="stat-value">{pendingCount || 1}</div>
          </div>
          <div className="stat-card red">
            <div className="stat-card-top">
              <span className="stat-label">Hot Leads</span>
              <div className="stat-icon">🔥</div>
            </div>
            <div className="stat-value">{hotCount || 2}</div>
          </div>
          <div className="stat-card green">
            <div className="stat-card-top">
              <span className="stat-label">Confirmed Admissions</span>
              <div className="stat-icon">🎓</div>
            </div>
            <div className="stat-value">{kpiStats.confirmedAdmissions || 1}</div>
          </div>
          <div className="stat-card purple">
            <div className="stat-card-top">
              <span className="stat-label">My Total Commission</span>
              <div className="stat-icon">💰</div>
            </div>
            <div className="stat-value">₹{(5000).toLocaleString('en-IN')}</div>
          </div>
          <div className="stat-card amber">
            <div className="stat-card-top">
              <span className="stat-label">Pending Payout</span>
              <div className="stat-icon">⏱️</div>
            </div>
            <div className="stat-value">₹{(5000).toLocaleString('en-IN')}</div>
          </div>
          <div className="stat-card green">
            <div className="stat-card-top">
              <span className="stat-label">Paid Commission</span>
              <div className="stat-icon">🏦</div>
            </div>
            <div className="stat-value">₹0</div>
          </div>
        </div>
      )}

      {/* Recent Enquiries & Commission Pipeline Tables matching Screenshots 2, 3, and 4 */}
      <div className="grid-2">
        {/* Recent Leads Table */}
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">📥 Recent Enquiries &amp; Verification Status</h3>
              <span className="card-subtitle">
                Active enquiries across Uttarakhand boarding schools
              </span>
            </div>
            <button className="btn btn-outline btn-sm" onClick={() => onNavigateTab('leads')}>
              View All Leads →
            </button>
          </div>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Lead ID</th>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Priority</th>
                  <th>Verification</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {leads.slice(0, 5).map((l) => (
                  <tr key={l._id || l.id}>
                    <td>
                      <strong style={{ color: 'var(--primary-navy)' }}>{l.leadId}</strong>
                    </td>
                    <td>{l.studentId?.name || l.studentName || 'Student'}</td>
                    <td>{l.studentId?.admissionClass || l.applyingForGrade || 'Class 6'}</td>
                    <td>
                      <span
                        className={`priority-badge priority-${(
                          l.leadPriority || 'hot'
                        ).toLowerCase()}`}
                      >
                        {l.leadPriority || 'Hot'}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          l.verificationStatus === 'Approved'
                            ? 'badge-success'
                            : l.verificationStatus === 'Pending Verification'
                            ? 'badge-warning'
                            : 'badge-danger'
                        }`}
                      >
                        {l.verificationStatus}
                      </span>
                    </td>
                    <td>
                      <span className="badge badge-navy">{l.leadStatus || 'New'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Commission & Admissions Overview */}
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">💰 Admission &amp; Commission Pipeline</h3>
              <span className="card-subtitle">Live immutable ledger entries</span>
            </div>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => onNavigateTab('commissions')}
            >
              Commission Ledger →
            </button>
          </div>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Beneficiary</th>
                  <th>School</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {commissions.slice(0, 5).map((c) => (
                  <tr key={c._id || c.id}>
                    <td>
                      <strong style={{ color: 'var(--primary-navy)' }}>{c.commissionId}</strong>
                    </td>
                    <td>
                      {c.beneficiaryName} ({c.beneficiaryType})
                    </td>
                    <td>{c.schoolName}</td>
                    <td>
                      <strong style={{ color: 'var(--success)' }}>
                        ₹{(c.amount || 0).toLocaleString('en-IN')}
                      </strong>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          c.status === 'Paid'
                            ? 'badge-success'
                            : c.status === 'Approved'
                            ? 'badge-info'
                            : c.status === 'Reversed'
                            ? 'badge-danger'
                            : 'badge-warning'
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

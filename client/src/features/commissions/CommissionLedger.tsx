import React, { useState } from 'react';
import { DollarSign, CheckCircle, Clock, ShieldAlert, FileText, Check } from 'lucide-react';

interface CommissionItem {
  id: string;
  admissionNo: string;
  studentName: string;
  schoolName: string;
  beneficiaryName: string;
  role: string;
  amount: number;
  status: 'PENDING' | 'PENDING_APPROVAL' | 'APPROVED' | 'PAID';
  reference?: string;
  date: string;
}

const SAMPLE_COMMISSIONS: CommissionItem[] = [
  {
    id: 'comm-1',
    admissionNo: 'ADM-2026-0001',
    studentName: 'Aarav Malhotra',
    schoolName: 'The Doon School, Dehradun',
    beneficiaryName: 'Rahul Sharma (EMP-COU-001)',
    role: 'Counsellor',
    amount: 5000,
    status: 'PAID',
    reference: 'HDFC982341123',
    date: '02 Nov 2026',
  },
  {
    id: 'comm-2',
    admissionNo: 'ADM-2026-0001',
    studentName: 'Aarav Malhotra',
    schoolName: 'The Doon School, Dehradun',
    beneficiaryName: 'Sunita Rawat (EMP-MGR-001)',
    role: 'Senior Manager',
    amount: 2000,
    status: 'APPROVED',
    date: '02 Nov 2026',
  },
  {
    id: 'comm-3',
    admissionNo: 'ADM-2026-0001',
    studentName: 'Aarav Malhotra',
    schoolName: 'The Doon School, Dehradun',
    beneficiaryName: 'BoardingEdu Central Ledger',
    role: 'Organization',
    amount: 3000,
    status: 'APPROVED',
    date: '02 Nov 2026',
  },
  {
    id: 'comm-4',
    admissionNo: 'ADM-2026-0002',
    studentName: 'Ananya Singhal',
    schoolName: 'Welham Girls, Dehradun',
    beneficiaryName: 'Priya Bisht (EMP-COU-002)',
    role: 'Counsellor',
    amount: 5000,
    status: 'PENDING_APPROVAL',
    date: '04 Nov 2026',
  },
];

export default function CommissionLedger() {
  const [items, setItems] = useState<CommissionItem[]>(SAMPLE_COMMISSIONS);

  const handleApprove = (id: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: 'APPROVED' } : item))
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-[#123B70]">3-Way Commission Ledger</h2>
          <p className="text-xs text-slate-500 mt-1">
            Immutable 10-step commission workflow: Counsellor (₹5k) &bull; Manager (₹2k) &bull; Organization (₹3k)
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs uppercase font-bold tracking-wider">
              <tr>
                <th className="py-3.5 px-4">Admission #</th>
                <th className="py-3.5 px-4">Student & School</th>
                <th className="py-3.5 px-4">Beneficiary</th>
                <th className="py-3.5 px-4">Split Amount</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-4 px-4 font-mono font-bold text-xs text-[#123B70]">
                    {item.admissionNo}
                    <span className="block text-[11px] font-normal text-slate-400">{item.date}</span>
                  </td>
                  <td className="py-4 px-4">
                    <div className="font-bold text-slate-800">{item.studentName}</div>
                    <div className="text-xs text-slate-500">{item.schoolName}</div>
                  </td>
                  <td className="py-4 px-4">
                    <div className="font-semibold text-slate-700 text-xs">{item.beneficiaryName}</div>
                    <span className="inline-block px-2 py-0.5 mt-0.5 text-[10px] font-bold rounded-md bg-slate-100 text-slate-600">
                      {item.role}
                    </span>
                  </td>
                  <td className="py-4 px-4 font-black text-[#123B70]">
                    ₹{item.amount.toLocaleString('en-IN')}
                  </td>
                  <td className="py-4 px-4">
                    {item.status === 'PAID' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle size={12} /> Paid
                      </span>
                    )}
                    {item.status === 'APPROVED' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                        <Check size={12} /> Approved
                      </span>
                    )}
                    {item.status === 'PENDING_APPROVAL' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                        <Clock size={12} /> Pending Approval
                      </span>
                    )}
                  </td>
                  <td className="py-4 px-4 text-right">
                    {item.status === 'PENDING_APPROVAL' && (
                      <button
                        onClick={() => handleApprove(item.id)}
                        className="px-3 py-1.5 text-xs font-bold bg-[#123B70] text-white rounded-lg hover:bg-[#0e2f5a] transition-colors"
                      >
                        Approve
                      </button>
                    )}
                    {item.status === 'APPROVED' && (
                      <span className="text-xs text-slate-400 font-semibold">Ready for Payout</span>
                    )}
                    {item.status === 'PAID' && (
                      <span className="text-[11px] font-mono text-slate-500 block">Ref: {item.reference}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

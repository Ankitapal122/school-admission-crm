import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { TrendingUp, Users, Award, DollarSign } from 'lucide-react';

const MONTHLY_DATA = [
  { month: 'Jun', leads: 45, admissions: 8, commission: 80000 },
  { month: 'Jul', leads: 62, admissions: 12, commission: 120000 },
  { month: 'Aug', leads: 78, admissions: 19, commission: 190000 },
  { month: 'Sep', leads: 95, admissions: 24, commission: 240000 },
  { month: 'Oct', leads: 120, admissions: 31, commission: 310000 },
  { month: 'Nov', leads: 140, admissions: 38, commission: 380000 },
];

const SCHOOL_SHARE = [
  { name: 'The Doon School', value: 32, color: '#123B70' },
  { name: "Welham Girls'", value: 24, color: '#2563EB' },
  { name: 'Woodstock School', value: 22, color: '#0284C7' },
  { name: 'Sherwood College', value: 14, color: '#10B981' },
  { name: 'Others', value: 8, color: '#94A3B8' },
];

export default function AnalyticsDashboard() {
  return (
    <div className="p-6 space-y-6">
      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Leads</p>
            <h3 className="text-2xl font-black text-[#123B70] mt-1">540</h3>
            <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1 mt-1">
              <TrendingUp size={12} /> +18.4% this month
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Users size={22} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Admissions Confirmed</p>
            <h3 className="text-2xl font-black text-emerald-600 mt-1">132</h3>
            <span className="text-[11px] font-bold text-slate-500 mt-1 block">Session 2026-27</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Award size={22} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Commission Disbursed</p>
            <h3 className="text-2xl font-black text-[#123B70] mt-1">₹13.2 L</h3>
            <span className="text-[11px] font-bold text-slate-500 mt-1 block">3-Way Split Verified</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <DollarSign size={22} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Conversion Ratio</p>
            <h3 className="text-2xl font-black text-blue-600 mt-1">24.4%</h3>
            <span className="text-[11px] font-bold text-emerald-600 mt-1 block">Exceeds 20% Target</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
            <TrendingUp size={22} />
          </div>
        </div>
      </div>

      {/* Main Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Admissions & Leads Bar Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-[#123B70] text-base">Enquiries vs Confirmed Admissions</h3>
              <p className="text-xs text-slate-500">Track monthly conversion velocity across Uttarakhand boarding schools</p>
            </div>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={MONTHLY_DATA} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: '#64748B', fontSize: 12 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: '#64748B', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1E293B', borderRadius: '8px', border: 'none', color: '#fff' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Bar dataKey="leads" name="Leads" fill="#93C5FD" radius={[6, 6, 0, 0]} />
                <Bar dataKey="admissions" name="Admissions" fill="#123B70" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* School Placement Distribution Pie Chart */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col">
          <h3 className="font-bold text-[#123B70] text-base mb-1">Top School Placements</h3>
          <p className="text-xs text-slate-500 mb-4">Distribution by residential institution</p>
          <div className="h-64 w-full flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={SCHOOL_SHARE}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={85}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {SCHOOL_SHARE.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: any) => [`${value}% Share`, 'Volume']}
                  contentStyle={{ backgroundColor: '#1E293B', borderRadius: '8px', border: 'none', color: '#fff' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Commission Earnings Area Chart */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <h3 className="font-bold text-[#123B70] text-base mb-1">Commission Inflow & Payable Growth</h3>
        <p className="text-xs text-slate-500 mb-4">Cumulative monthly 3-way ledger allocations (INR)</p>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={MONTHLY_DATA} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="commGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563EB" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#2563EB" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: '#64748B', fontSize: 12 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: '#64748B', fontSize: 12 }} />
              <Tooltip
                formatter={(val: any) => [`₹${Number(val).toLocaleString('en-IN')}`, 'Commission']}
                contentStyle={{ backgroundColor: '#1E293B', borderRadius: '8px', border: 'none', color: '#fff' }}
              />
              <Area type="monotone" dataKey="commission" stroke="#2563EB" strokeWidth={3} fillOpacity={1} fill="url(#commGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

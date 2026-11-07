import React, { useState } from 'react';
import { School, MapPin, Award, CheckCircle, ExternalLink, IndianRupee } from 'lucide-react';

interface SchoolData {
  id: string;
  name: string;
  city: string;
  board: string;
  type: string;
  minFee: string;
  maxFee: string;
  rank: number;
  rating: number;
  badge?: string;
  commission: string;
}

const SCHOOLS: SchoolData[] = [
  {
    id: 'sch-1',
    name: 'The Doon School',
    city: 'Dehradun',
    board: 'IB / ICSE',
    type: 'Boys Only',
    minFee: '₹11.0 Lakhs',
    maxFee: '₹14.5 Lakhs',
    rank: 1,
    rating: 4.9,
    badge: 'Premier Heritage',
    commission: '₹10,000 / seat',
  },
  {
    id: 'sch-2',
    name: "Welham Girls' School",
    city: 'Dehradun',
    board: 'ICSE',
    type: 'Girls Only',
    minFee: '₹8.5 Lakhs',
    maxFee: '₹10.5 Lakhs',
    rank: 2,
    rating: 4.8,
    badge: 'Rank 1 All-Girls',
    commission: '₹10,000 / seat',
  },
  {
    id: 'sch-3',
    name: 'Woodstock School',
    city: 'Mussoorie',
    board: 'IB / Cambridge',
    type: 'Co-Ed',
    minFee: '₹17.0 Lakhs',
    maxFee: '₹22.0 Lakhs',
    rank: 3,
    rating: 4.9,
    badge: 'Global Curriculum',
    commission: '₹10,000 / seat',
  },
  {
    id: 'sch-4',
    name: "Welham Boys' School",
    city: 'Dehradun',
    board: 'CBSE',
    type: 'Boys Only',
    minFee: '₹7.5 Lakhs',
    maxFee: '₹9.5 Lakhs',
    rank: 4,
    rating: 4.7,
    commission: '₹10,000 / seat',
  },
  {
    id: 'sch-5',
    name: 'Sherwood College',
    city: 'Nainital',
    board: 'ICSE',
    type: 'Co-Ed',
    minFee: '₹6.8 Lakhs',
    maxFee: '₹8.5 Lakhs',
    rank: 5,
    rating: 4.7,
    commission: '₹10,000 / seat',
  },
];

export default function SchoolsDirectory() {
  const [filterCity, setFilterCity] = useState('ALL');

  const filtered = SCHOOLS.filter(
    (s) => filterCity === 'ALL' || s.city.toLowerCase() === filterCity.toLowerCase()
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-[#123B70]">Uttarakhand Boarding Schools Master</h2>
          <p className="text-xs text-slate-500 mt-1">
            Official residential admissions directory across Dehradun, Mussoorie, and Nainital
          </p>
        </div>

        <div className="flex items-center gap-2">
          {['ALL', 'Dehradun', 'Mussoorie', 'Nainital'].map((city) => (
            <button
              key={city}
              onClick={() => setFilterCity(city)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors ${
                filterCity === city
                  ? 'bg-[#123B70] text-white border-[#123B70]'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {city}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map((school) => (
          <div
            key={school.id}
            className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                    Rank #{school.rank} in UK
                  </span>
                  <h3 className="text-lg font-bold text-[#123B70] mt-1">{school.name}</h3>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                    ★ {school.rating}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-500 mb-3">
                <span className="flex items-center gap-1">
                  <MapPin size={12} className="text-slate-400" />
                  {school.city}
                </span>
                <span>&bull;</span>
                <span>{school.type}</span>
                <span>&bull;</span>
                <span className="font-semibold text-slate-700">{school.board}</span>
              </div>

              <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-1.5 text-xs mb-4">
                <div className="flex justify-between">
                  <span className="text-slate-500">Annual Boarding Fee:</span>
                  <span className="font-bold text-slate-800">{school.minFee} - {school.maxFee}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Fixed Commission:</span>
                  <span className="font-bold text-emerald-600">{school.commission}</span>
                </div>
              </div>
            </div>

            <button className="w-full py-2.5 text-xs font-bold text-white bg-[#123B70] hover:bg-[#0e2f5a] rounded-xl transition-colors shadow-xs">
              Direct Admission Seat Lock
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

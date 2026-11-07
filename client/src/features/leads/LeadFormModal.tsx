import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { X, UserPlus, ShieldCheck } from 'lucide-react';

const leadSchema = z.object({
  studentName: z.string().min(2, 'Student name must have at least 2 characters'),
  applyingForGrade: z.string().min(1, 'Please select applying grade'),
  parentName: z.string().min(2, 'Parent name must have at least 2 characters'),
  parentPhone: z
    .string()
    .regex(/^[6-9]\d{9}$/, 'Must be a valid 10-digit Indian mobile number'),
  parentEmail: z.string().email('Invalid email address').optional().or(z.literal('')),
  city: z.string().min(2, 'City is required'),
  budgetMin: z.number().min(100000, 'Minimum budget ₹1,00,000'),
  budgetMax: z.number().min(200000, 'Maximum budget must exceed ₹2,00,000'),
  preferredBoard: z.enum(['CBSE', 'ICSE', 'IB', 'Cambridge']),
  dpdpConsent: z.literal(true, {
    errorMap: () => ({ message: 'DPDP compliance consent is mandatory under Indian law' }),
  }),
});

type LeadFormData = z.infer<typeof leadSchema>;

export default function LeadFormModal({
  isOpen,
  onClose,
  onSubmitLead,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmitLead: (data: LeadFormData) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<LeadFormData>({
    resolver: zodResolver(leadSchema),
    defaultValues: {
      budgetMin: 500000,
      budgetMax: 1000000,
      preferredBoard: 'ICSE',
      dpdpConsent: false as any,
    },
  });

  if (!isOpen) return null;

  const onFormSubmit = (data: LeadFormData) => {
    onSubmitLead(data);
    reset();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <UserPlus size={18} />
            </div>
            <div>
              <h3 className="font-bold text-lg text-[#123B70]">New Parent Enquiry</h3>
              <p className="text-xs text-slate-500">Fast entry with real-time duplicate detection</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4 pt-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700">Student Name *</label>
              <input
                {...register('studentName')}
                placeholder="e.g. Aarav Sharma"
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              {errors.studentName && (
                <p className="text-[11px] text-red-500 mt-0.5">{errors.studentName.message}</p>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Applying Grade *</label>
              <select
                {...register('applyingForGrade')}
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
              >
                <option value="">Select Grade</option>
                <option value="Class 4">Class 4</option>
                <option value="Class 5">Class 5</option>
                <option value="Class 6">Class 6</option>
                <option value="Class 7">Class 7</option>
                <option value="Class 8">Class 8</option>
                <option value="Class 9">Class 9</option>
                <option value="Class 10">Class 10</option>
                <option value="Class 11">Class 11</option>
                <option value="Class 12">Class 12</option>
              </select>
              {errors.applyingForGrade && (
                <p className="text-[11px] text-red-500 mt-0.5">{errors.applyingForGrade.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700">Parent / Guardian Name *</label>
              <input
                {...register('parentName')}
                placeholder="e.g. Ramesh Sharma"
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              {errors.parentName && (
                <p className="text-[11px] text-red-500 mt-0.5">{errors.parentName.message}</p>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Parent Mobile (10-digits) *</label>
              <input
                {...register('parentPhone')}
                placeholder="e.g. 9811122334"
                maxLength={10}
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              {errors.parentPhone && (
                <p className="text-[11px] text-red-500 mt-0.5">{errors.parentPhone.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700">Current City *</label>
              <input
                {...register('city')}
                placeholder="e.g. Delhi NCR / Lucknow"
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              {errors.city && (
                <p className="text-[11px] text-red-500 mt-0.5">{errors.city.message}</p>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Preferred Board *</label>
              <select
                {...register('preferredBoard')}
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
              >
                <option value="ICSE">ICSE / ISC</option>
                <option value="CBSE">CBSE</option>
                <option value="IB">IB (International Baccalaureate)</option>
                <option value="Cambridge">Cambridge (IGCSE)</option>
              </select>
            </div>
          </div>

          {/* DPDP Consent */}
          <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                {...register('dpdpConsent')}
                className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
              />
              <span className="text-xs text-amber-900 leading-relaxed">
                Parent has given explicit consent under <strong>DPDP Act 2023</strong> to be contacted via WhatsApp/Phone for boarding school admissions counseling.
              </span>
            </label>
            {errors.dpdpConsent && (
              <p className="text-[11px] text-red-600 font-semibold mt-1">
                {errors.dpdpConsent.message}
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-bold text-white bg-[#123B70] hover:bg-[#0e2f5a] rounded-lg transition-colors shadow-sm"
            >
              {isSubmitting ? 'Registering...' : 'Submit & Check Duplicates'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { Shield, Building2, LockKeyhole } from "lucide-react";

export function SecuritySection() {
  return (
    <section id="security" className="py-24 bg-white border-y border-[#e3e8ef]">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center mb-16 reveal">
          <h2 className="text-[32px] leading-[1.2] sm:text-[40px] font-[700] tracking-tight text-[#0e1116] mb-6">
            Built for multi-company SaaS access.
          </h2>
          <p className="text-[16.5px] leading-relaxed text-[#4d5663]">
            TransportFlow uses organization-based access, user roles, and tenant-separated business records so each transport company works inside its own secure workspace.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-8 max-w-5xl mx-auto">
          <div className="flex flex-col items-center text-center reveal delay-100">
            <div className="flex h-14 w-14 items-center justify-center rounded-[14px] bg-[#ecf1f7] text-[#486688] mb-5">
              <Building2 size={26} strokeWidth={1.5} />
            </div>
            <h3 className="text-[16.5px] font-[600] text-[#0e1116] mb-2 font-['Inter_Tight']">Organization Access</h3>
            <p className="text-[14.5px] leading-relaxed text-[#4d5663]">Your company data is strictly isolated to your own organizational tenant.</p>
          </div>
          
          <div className="flex flex-col items-center text-center reveal delay-200">
            <div className="flex h-14 w-14 items-center justify-center rounded-[14px] bg-[#ecf1f7] text-[#486688] mb-5">
              <Shield size={26} strokeWidth={1.5} />
            </div>
            <h3 className="text-[16.5px] font-[600] text-[#0e1116] mb-2 font-['Inter_Tight']">User Roles</h3>
            <p className="text-[14.5px] leading-relaxed text-[#4d5663]">Control who can view financials, edit shipments, or manage the directory.</p>
          </div>
          
          <div className="flex flex-col items-center text-center reveal delay-300">
            <div className="flex h-14 w-14 items-center justify-center rounded-[14px] bg-[#ecf1f7] text-[#486688] mb-5">
              <LockKeyhole size={26} strokeWidth={1.5} />
            </div>
            <h3 className="text-[16.5px] font-[600] text-[#0e1116] mb-2 font-['Inter_Tight']">Secure Records</h3>
            <p className="text-[14.5px] leading-relaxed text-[#4d5663]">All data is protected by strict row-level security policies at the database layer.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

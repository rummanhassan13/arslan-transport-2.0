import { ArrowUpRight, CheckCircle2, CircleDollarSign, Clock, FileText, Truck } from "lucide-react";

export function DashboardMockup() {
  return (
    <div className="relative w-full max-w-[800px] rounded-xl border border-[#e3e8ef] bg-white shadow-[0_32px_64px_rgba(14,17,22,0.12)] overflow-hidden text-left" style={{ transform: 'perspective(1200px) rotateY(-4deg) rotateX(4deg)', transformStyle: 'preserve-3d' }}>
      {/* Mockup Header */}
      <div className="flex items-center gap-4 border-b border-[#eef2f7] bg-white px-5 py-3.5">
        <div className="flex gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-[#e3e8ef]" />
          <div className="h-2.5 w-2.5 rounded-full bg-[#e3e8ef]" />
          <div className="h-2.5 w-2.5 rounded-full bg-[#e3e8ef]" />
        </div>
        <div className="flex gap-4 ml-4">
          <div className="h-2 w-12 rounded-full bg-[#eef1f5]" />
          <div className="h-2 w-16 rounded-full bg-[#eef1f5]" />
          <div className="h-2 w-14 rounded-full bg-[#eef1f5]" />
        </div>
      </div>

      {/* Mockup Body */}
      <div className="bg-[#f5f7fa] p-7">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="h-2.5 w-24 rounded-full bg-[#8993a3] mb-3" />
            <div className="h-7 w-40 rounded-lg bg-[#0e1116]" />
          </div>
          <div className="h-8 w-28 rounded-lg bg-[#6886a8]" />
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="rounded-xl border border-[#e3e8ef] bg-white p-5">
            <div className="flex items-center gap-2 text-[10.5px] font-[700] text-[#8993a3] uppercase tracking-wider mb-3">
              <Truck size={14} /> Active Shipments
            </div>
            <div className="text-[26px] font-[700] font-['Inter_Tight'] text-[#0e1116] tracking-tight">47</div>
          </div>
          <div className="rounded-xl border border-[#e3e8ef] bg-white p-5">
            <div className="flex items-center gap-2 text-[10.5px] font-[700] text-[#8993a3] uppercase tracking-wider mb-3">
              <Clock size={14} /> Pending Payments
            </div>
            <div className="text-[26px] font-[700] font-['Inter_Tight'] text-[#0e1116] tracking-tight">12</div>
          </div>
          <div className="rounded-xl border border-[#e3e8ef] bg-white p-5">
            <div className="flex items-center gap-2 text-[10.5px] font-[700] text-[#8993a3] uppercase tracking-wider mb-3">
              <CircleDollarSign size={14} /> Monthly Profit
            </div>
            <div className="text-[26px] font-[700] font-['Inter_Tight'] text-[#0e1116] tracking-tight">SAR 128,500</div>
          </div>
          <div className="rounded-xl border border-[#e3e8ef] bg-white p-5">
            <div className="flex items-center gap-2 text-[10.5px] font-[700] text-[#8993a3] uppercase tracking-wider mb-3">
              <FileText size={14} /> Unpaid Invoices
            </div>
            <div className="text-[26px] font-[700] font-['Inter_Tight'] text-[#0e1116] tracking-tight">8</div>
          </div>
        </div>

        {/* Table Mockup */}
        <div className="rounded-xl border border-[#e3e8ef] bg-white overflow-hidden">
          <div className="border-b border-[#eef2f7] bg-[#eef1f5] px-5 py-3">
            <div className="h-2 w-20 rounded-full bg-[#8993a3]" />
          </div>
          <div className="px-5 py-3.5 flex items-center justify-between border-b border-[#eef2f7]">
            <div className="flex items-center gap-4">
              <div className="h-2 w-16 rounded-full bg-[#0e1116]" />
              <div className="h-2 w-24 rounded-full bg-[#8993a3]" />
            </div>
            <div className="flex items-center gap-2 bg-[#ecf1f7] text-[#486688] px-2.5 py-1 rounded-full">
              <CheckCircle2 size={12} />
              <div className="text-[10px] font-[600] uppercase tracking-wide">Paid</div>
            </div>
          </div>
          <div className="px-5 py-3.5 flex items-center justify-between border-b border-[#eef2f7]">
            <div className="flex items-center gap-4">
              <div className="h-2 w-16 rounded-full bg-[#0e1116]" />
              <div className="h-2 w-24 rounded-full bg-[#8993a3]" />
            </div>
            <div className="flex items-center gap-2 bg-[#b8923a]/10 text-[#b8923a] px-2.5 py-1 rounded-full">
              <Clock size={12} />
              <div className="text-[10px] font-[600] uppercase tracking-wide">Pending</div>
            </div>
          </div>
          <div className="px-5 py-3.5 flex items-center justify-between border-b border-[#eef2f7]">
            <div className="flex items-center gap-4">
              <div className="h-2 w-16 rounded-full bg-[#0e1116]" />
              <div className="h-2 w-24 rounded-full bg-[#8993a3]" />
            </div>
            <div className="flex items-center gap-2 bg-[#ecf1f7] text-[#486688] px-2.5 py-1 rounded-full">
              <CheckCircle2 size={12} />
              <div className="text-[10px] font-[600] uppercase tracking-wide">Paid</div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Card */}
      <div className="absolute -right-4 md:-right-8 top-40 rounded-[14px] border border-[#e3e8ef] bg-white/95 backdrop-blur-md p-4 shadow-xl animate-float z-10 hidden sm:block">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#ecf1f7] text-[#486688]">
            <ArrowUpRight size={20} strokeWidth={2.5} />
          </div>
          <div>
            <div className="text-[10px] font-[700] text-[#8993a3] uppercase tracking-wider mb-0.5">Profit Margin</div>
            <div className="text-xl font-[700] font-['Inter_Tight'] text-[#0e1116]">+24%</div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { LayoutDashboard, Package, Users, Wallet, BarChart3, ChevronRight } from "lucide-react";

const modules = [
  {
    id: "dashboard",
    title: "Dashboard",
    description: "See operational and financial overview.",
    icon: LayoutDashboard,
    content: "A centralized view of your transport operation. Monitor active shipments, pending payments, outstanding invoices, and monthly profit at a glance."
  },
  {
    id: "shipments",
    title: "Shipments",
    description: "Track details, expenses, and status.",
    icon: Package,
    content: "Manage every trip from loading to delivery. Record waybill details, assign drivers and vehicles, and capture operational expenses directly on the shipment record."
  },
  {
    id: "directory",
    title: "Directory",
    description: "Manage clients, drivers, and fleet.",
    icon: Users,
    content: "Your central database for transport assets. Keep track of client billing details, driver contact information, vehicle assignments, and truck types."
  },
  {
    id: "finance",
    title: "Finance",
    description: "Track invoices and all payments.",
    icon: Wallet,
    content: "Full visibility into your cash flow. Generate client invoices, record received payments, manage driver advances, and track settlements."
  },
  {
    id: "reports",
    title: "Reports",
    description: "Review comprehensive profit data.",
    icon: BarChart3,
    content: "Automated reporting that replaces manual Excel consolidation. Export detailed breakdowns of shipment margins, client statements, and driver ledgers."
  }
];

export function ProductModulesSection() {
  const [activeModule, setActiveModule] = useState(modules[0].id);

  return (
    <section id="features" className="py-24 bg-white">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center mb-16 reveal">
          <h2 className="text-[32px] leading-[1.2] sm:text-[40px] font-[700] tracking-tight text-[#0e1116] mb-6">
            Built around the way transport teams work.
          </h2>
        </div>

        {/* Desktop View */}
        <div className="hidden lg:grid grid-cols-12 gap-8 max-w-5xl mx-auto items-start">
          <div className="col-span-5 flex flex-col gap-2 reveal">
            {modules.map((m) => {
              const Icon = m.icon;
              const isActive = activeModule === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setActiveModule(m.id)}
                  className={`flex items-center justify-between p-4 rounded-xl text-left transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-[#6886a8] ${
                    isActive 
                      ? "bg-[#f5f7fa] border border-[#e3e8ef] shadow-sm" 
                      : "border border-transparent hover:bg-[#f5f7fa]/50"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${isActive ? "bg-[#6886a8] text-white" : "bg-[#ecf1f7] text-[#486688]"}`}>
                      <Icon size={20} strokeWidth={isActive ? 2 : 1.5} />
                    </div>
                    <div>
                      <div className={`text-[15px] font-[600] font-['Inter_Tight'] ${isActive ? "text-[#0e1116]" : "text-[#4d5663]"}`}>{m.title}</div>
                      <div className="text-[13px] text-[#8993a3] mt-0.5">{m.description}</div>
                    </div>
                  </div>
                  {isActive && <ChevronRight size={18} className="text-[#6886a8] shrink-0" />}
                </button>
              );
            })}
          </div>
          
          <div className="col-span-7 reveal delay-200">
            <div className="rounded-[16px] border border-[#e3e8ef] bg-[#f5f7fa] p-10 h-[380px] flex flex-col justify-center relative overflow-hidden shadow-[inset_0_2px_10px_rgba(14,17,22,0.02)]">
              {modules.map((m) => (
                <div 
                  key={m.id} 
                  className={`transition-all duration-500 ${activeModule === m.id ? 'opacity-100 translate-y-0 relative z-10' : 'opacity-0 translate-y-4 pointer-events-none absolute z-0'}`}
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-[14px] bg-white text-[#486688] mb-6 shadow-sm border border-[#e3e8ef]">
                    <m.icon size={26} strokeWidth={1.5} />
                  </div>
                  <h3 className="text-[24px] font-[700] text-[#0e1116] mb-4 font-['Inter_Tight']">{m.title}</h3>
                  <p className="text-[16px] leading-[1.7] text-[#4d5663] max-w-md">{m.content}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Mobile View */}
        <div className="lg:hidden flex flex-col gap-3 max-w-lg mx-auto reveal">
          {modules.map((m) => {
            const Icon = m.icon;
            const isActive = activeModule === m.id;
            return (
              <div key={m.id} className={`rounded-[14px] border transition-all duration-200 overflow-hidden ${isActive ? "border-[#cfd6e0] bg-[#f5f7fa]" : "border-[#e3e8ef] bg-white"}`}>
                <button
                  onClick={() => setActiveModule(isActive ? "" : m.id)}
                  className="flex w-full items-center justify-between p-5 text-left outline-none focus-visible:bg-[#f5f7fa]"
                >
                  <div className="flex items-center gap-4">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${isActive ? "bg-[#6886a8] text-white" : "bg-[#ecf1f7] text-[#486688]"}`}>
                      <Icon size={20} strokeWidth={isActive ? 2 : 1.5} />
                    </div>
                    <div>
                      <div className="text-[15px] font-[600] font-['Inter_Tight'] text-[#0e1116]">{m.title}</div>
                      <div className="text-[13px] text-[#8993a3] mt-0.5">{m.description}</div>
                    </div>
                  </div>
                </button>
                {isActive && (
                  <div className="px-5 pb-5 pt-1 animate-fade-up" style={{ animationDuration: '200ms' }}>
                    <p className="text-[14.5px] leading-[1.6] text-[#4d5663]">{m.content}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

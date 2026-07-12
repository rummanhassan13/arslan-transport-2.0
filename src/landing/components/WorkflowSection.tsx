import { ClipboardEdit, UserPlus, Receipt, CreditCard, LineChart } from "lucide-react";

const workflowSteps = [
  {
    number: "1",
    title: "Add shipment details",
    icon: ClipboardEdit
  },
  {
    number: "2",
    title: "Assign client, driver, and vehicle",
    icon: UserPlus
  },
  {
    number: "3",
    title: "Record expenses and bill evidence",
    icon: Receipt
  },
  {
    number: "4",
    title: "Track client and driver payments",
    icon: CreditCard
  },
  {
    number: "5",
    title: "Review invoices and profit reports",
    icon: LineChart
  }
];

export function WorkflowSection() {
  return (
    <section id="workflow" className="py-24 bg-[#0e1116] text-white overflow-hidden relative dark-section">
      <div className="absolute inset-0 bg-gradient-to-b from-[#1a2330] to-transparent opacity-50 pointer-events-none" />
      
      <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
        <div className="mx-auto max-w-2xl text-center mb-20 reveal">
          <h2 className="text-[32px] leading-[1.2] sm:text-[40px] font-[700] tracking-tight text-white mb-6">
            From shipment entry to profit visibility.
          </h2>
        </div>

        <div className="max-w-4xl mx-auto">
          <div className="relative">
            {/* Connecting Line (Desktop) */}
            <div className="hidden md:block absolute top-[28px] left-[40px] right-[40px] h-[2px] bg-[#2a3040] reveal origin-left" />
            
            {/* Connecting Line (Mobile) */}
            <div className="md:hidden absolute left-[28px] top-[40px] bottom-[40px] w-[2px] bg-[#2a3040] reveal origin-top" />

            <div className="grid grid-cols-1 md:grid-cols-5 gap-10 md:gap-4 relative z-10">
              {workflowSteps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <div 
                    key={index} 
                    className="flex md:flex-col items-center md:text-center gap-6 md:gap-5 reveal"
                    style={{ transitionDelay: `${index * 150}ms` }}
                  >
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#0e1116] border-2 border-[#4d5663] text-[#a3c0dd] shadow-lg relative group transition-colors duration-300 hover:border-[#7fa0c4] hover:bg-[#1a2330]">
                      <Icon size={22} strokeWidth={1.5} className="group-hover:text-white transition-colors" />
                      <div className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#6886a8] text-[11px] font-[700] text-white border-2 border-[#0e1116]">
                        {step.number}
                      </div>
                    </div>
                    <div>
                      <h3 className="text-[15px] font-[600] leading-snug text-[#e3e8ef] md:px-2 font-['Inter_Tight']">
                        {step.title}
                      </h3>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

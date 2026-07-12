import { FileStack, Coins, Receipt, FileWarning, PieChart, Calculator } from "lucide-react";

const problems = [
  {
    title: "Shipment records are scattered",
    description: "Important details get lost across different sheets and chat messages.",
    icon: FileStack,
  },
  {
    title: "Driver advances are hard to track",
    description: "Manual calculations lead to disputes over what was paid or owed.",
    icon: Coins,
  },
  {
    title: "Client invoices are delayed",
    description: "Waiting to collect proof of delivery slows down your cash flow.",
    icon: Receipt,
  },
  {
    title: "Expense bills get lost",
    description: "Gate pass, NAQL, and fuel receipts vanish before they can be billed.",
    icon: FileWarning,
  },
  {
    title: "Profit is unclear",
    description: "You don't know the real margin on a trip until weeks after delivery.",
    icon: PieChart,
  },
  {
    title: "Reports take too much manual work",
    description: "End-of-month reconciliation requires hours of copying and pasting.",
    icon: Calculator,
  },
];

export function ProblemSection() {
  return (
    <section id="problems" className="py-24 bg-white relative">
      <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
        <div className="mx-auto max-w-2xl text-center mb-16 reveal">
          <h2 className="text-[32px] leading-[1.2] sm:text-[40px] font-[700] tracking-tight text-[#0e1116] mb-6">
            Spreadsheets work at first. Then shipments, payments, and expenses become hard to control.
          </h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {problems.map((problem, index) => {
            const Icon = problem.icon;
            return (
              <div
                key={index}
                className="reveal"
                style={{ transitionDelay: `${index * 150}ms` }}
              >
                <div className="group relative p-7 bg-white border border-[#e3e8ef] rounded-[16px] hover:border-[#cfd6e0] hover:shadow-[0_16px_42px_rgba(15,23,42,0.06)] hover:-translate-y-1 transition-all duration-300 text-left h-full">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#ecf1f7] text-[#486688] mb-6 group-hover:bg-[#6886a8] group-hover:text-white transition-colors duration-300">
                    <Icon size={24} strokeWidth={1.5} />
                  </div>
                  <h3 className="text-[17px] font-[600] text-[#0e1116] mb-2.5 font-['Inter_Tight']">
                    {problem.title}
                  </h3>
                  <p className="text-[14.5px] leading-[1.6] text-[#4d5663]">
                    {problem.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

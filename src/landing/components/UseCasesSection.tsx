import { Check } from "lucide-react";

export function UseCasesSection() {
  const useCases = [
    "Small transport companies replacing Excel",
    "Fleet operators tracking driver payments",
    "Logistics teams managing shipment expenses",
    "Companies needing client invoice visibility",
    "Owners who want profit reports without manual calculations"
  ];

  return (
    <section className="py-24 bg-[#f5f7fa]">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center max-w-5xl mx-auto bg-white rounded-2xl border border-[#e3e8ef] overflow-hidden shadow-sm reveal">
          
          <div className="p-8 lg:p-12">
            <h2 className="text-[28px] leading-[1.2] sm:text-[32px] font-[700] tracking-tight text-[#0e1116] mb-6">
              Made for transport companies that need better control.
            </h2>
            <ul className="space-y-4">
              {useCases.map((useCase, index) => (
                <li key={index} className="flex items-start gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#ecf1f7] text-[#486688] mt-0.5">
                    <Check size={14} strokeWidth={2.5} />
                  </div>
                  <span className="text-[15.5px] text-[#4d5663]">{useCase}</span>
                </li>
              ))}
            </ul>
          </div>
          
          <div className="bg-[#1a2330] p-8 lg:p-12 h-full flex flex-col justify-center text-white">
            <h3 className="text-[20px] font-[600] font-['Inter_Tight'] mb-5">Built for your daily operations</h3>
            <p className="text-[#a3c0dd] leading-relaxed mb-8">
              Whether you're looking for logistics management software to replace messy spreadsheets, or a better way to handle transport invoice tracking and fleet expenses, TransportFlow gives you the tools you need in one place.
            </p>
            <a href="https://wa.me/923144630279?text=I%20want%20to%20inquire%20about%20TransportFlow" target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#6886a8] px-6 py-3.5 text-[14px] font-[600] text-white hover:bg-[#7fa0c4] transition-colors self-start shadow-sm">
              See if it fits your company
            </a>
          </div>

        </div>
      </div>
    </section>
  );
}

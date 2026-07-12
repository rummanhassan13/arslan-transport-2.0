import { useState } from "react";
import { ChevronDown } from "lucide-react";

const faqs = [
  {
    question: "What is TransportFlow?",
    answer: "TransportFlow is logistics management software designed for small and mid-size transport companies to replace spreadsheets with a structured workspace."
  },
  {
    question: "Who is TransportFlow built for?",
    answer: "It is built specifically for transport companies, fleet operators, and logistics teams managing shipments, drivers, and expenses."
  },
  {
    question: "Can TransportFlow replace Excel for transport companies?",
    answer: "Yes, TransportFlow replaces messy spreadsheets with organized workflows for shipments, expenses, invoices, payments, and profit reporting."
  },
  {
    question: "Can I track driver advances and pending balances?",
    answer: "Yes, you can track driver payables, advances, settlements, and pending balances directly within the software."
  },
  {
    question: "Can I manage client invoices and payments?",
    answer: "Yes, TransportFlow allows you to track client invoices, monitor pending balances, and record payments."
  },
  {
    question: "Does TransportFlow support shipment expenses like Gate Pass, Fashah, and NAQL?",
    answer: "Yes, you can record all operational expenses including Gate Pass, Fashah, NAQL, fuel, tolls, and repairs."
  },
  {
    question: "Is TransportFlow a SaaS product?",
    answer: "Yes, TransportFlow is a cloud-based SaaS product accessible from any web browser."
  },
  {
    question: "Can multiple companies use TransportFlow?",
    answer: "Yes, TransportFlow uses organization-based access and tenant-separated business records so each transport company works inside its own secure workspace."
  }
];

export function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="py-24 bg-white">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center mb-16 reveal">
          <h2 className="text-[32px] leading-[1.2] sm:text-[40px] font-[700] tracking-tight text-[#0e1116] mb-6">
            Frequently asked questions
          </h2>
        </div>

        <div className="mx-auto max-w-3xl">
          <div className="space-y-4">
            {faqs.map((faq, index) => {
              const isOpen = openIndex === index;
              return (
                <div 
                  key={index} 
                  className={`rounded-xl border transition-colors reveal ${isOpen ? "border-[#cfd6e0] bg-[#f5f7fa]" : "border-[#e3e8ef] bg-white hover:border-[#cfd6e0]"}`}
                  style={{ transitionDelay: `${index * 50}ms` }}
                >
                  <button
                    onClick={() => setOpenIndex(isOpen ? null : index)}
                    className="flex w-full items-center justify-between p-6 text-left outline-none focus-visible:ring-2 focus-visible:ring-[#6886a8] rounded-xl"
                  >
                    <span className="text-[16px] font-[600] font-['Inter_Tight'] text-[#0e1116] pr-8">
                      {faq.question}
                    </span>
                    <ChevronDown 
                      size={20} 
                      className={`shrink-0 text-[#8993a3] transition-transform duration-200 ${isOpen ? "rotate-180 text-[#6886a8]" : ""}`} 
                    />
                  </button>
                  <div 
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? "max-h-40 opacity-100" : "max-h-0 opacity-0"}`}
                  >
                    <div className="p-6 pt-0 text-[15px] leading-relaxed text-[#4d5663]">
                      {faq.answer}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

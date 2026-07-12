import { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Wallet } from "lucide-react";

function Counter({ end, duration = 2000, isVisible }: { end: number; duration?: number; isVisible: boolean }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isVisible) return;
    
    let startTimestamp: number | null = null;
    let animationFrame: number;
    
    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      // ease out cubic
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(easeProgress * end));
      
      if (progress < 1) {
        animationFrame = window.requestAnimationFrame(step);
      } else {
        setCount(end);
      }
    };
    
    animationFrame = window.requestAnimationFrame(step);
    
    return () => window.cancelAnimationFrame(animationFrame);
  }, [end, duration, isVisible]);

  return <>{count.toLocaleString()}</>;
}

export function FinanceClaritySection() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    const element = document.getElementById("finance-counters");
    if (element) observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="py-24 bg-[#f5f7fa]">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center mb-16 reveal">
          <h2 className="text-[32px] leading-[1.2] sm:text-[40px] font-[700] tracking-tight text-[#0e1116] mb-6">
            Know what is paid, pending, and profitable.
          </h2>
          <p className="text-[16.5px] leading-relaxed text-[#4d5663]">
            TransportFlow is designed around payment ledgers, not just manual status labels. Client payment status comes from invoice totals minus actual payments, and driver balances reflect payable amounts, expenses, advances, and settlements.
          </p>
        </div>

        <div id="finance-counters" className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {/* Client Receivables */}
          <div className="rounded-[16px] border border-[#e3e8ef] bg-white p-7 shadow-[0_8px_24px_rgba(14,17,22,0.04)] reveal delay-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#ecf1f7] text-[#486688]">
                <ArrowDownLeft size={20} strokeWidth={2} />
              </div>
              <h3 className="text-[13.5px] font-[700] uppercase tracking-wider text-[#8993a3]">Client Receivables</h3>
            </div>
            <div className="text-[36px] font-[700] font-['Inter_Tight'] tracking-tight text-[#0e1116] mb-1">
              <Counter end={145200} isVisible={isVisible} /> <span className="text-[16px] text-[#8993a3] font-[600] ml-1">SAR</span>
            </div>
            <p className="text-[13.5px] font-[500] text-[#4d5663]">Total outstanding from 14 invoices</p>
          </div>

          {/* Driver Payables */}
          <div className="rounded-[16px] border border-[#e3e8ef] bg-white p-7 shadow-[0_8px_24px_rgba(14,17,22,0.04)] reveal delay-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#fdf2f8] text-[#b06a72]">
                <ArrowUpRight size={20} strokeWidth={2} />
              </div>
              <h3 className="text-[13.5px] font-[700] uppercase tracking-wider text-[#8993a3]">Driver Payables</h3>
            </div>
            <div className="text-[36px] font-[700] font-['Inter_Tight'] tracking-tight text-[#0e1116] mb-1">
              <Counter end={32450} isVisible={isVisible} /> <span className="text-[16px] text-[#8993a3] font-[600] ml-1">SAR</span>
            </div>
            <p className="text-[13.5px] font-[500] text-[#4d5663]">Pending settlements across fleet</p>
          </div>

          {/* Shipment Profit */}
          <div className="rounded-[16px] border border-[#e3e8ef] bg-white p-7 shadow-[0_8px_24px_rgba(14,17,22,0.04)] reveal delay-300">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f0fdf4] text-[#5b8c8a]">
                <Wallet size={20} strokeWidth={2} />
              </div>
              <h3 className="text-[13.5px] font-[700] uppercase tracking-wider text-[#8993a3]">Shipment Profit</h3>
            </div>
            <div className="text-[36px] font-[700] font-['Inter_Tight'] tracking-tight text-[#0e1116] mb-1">
              <Counter end={48120} isVisible={isVisible} /> <span className="text-[16px] text-[#8993a3] font-[600] ml-1">SAR</span>
            </div>
            <p className="text-[13.5px] font-[500] text-[#4d5663]">Estimated margin this month</p>
          </div>
        </div>
      </div>
    </section>
  );
}
